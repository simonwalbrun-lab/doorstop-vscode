import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';

import { DoorstopServer } from './doorstopServer';
import { ensurePdfTooling, offerBrowserInstall, runExportScript } from './pdfExport';
import { ProgressReport, withDelayedProgress } from './progress';
import { registerCommand } from './timing';
import { TreeResponse, ValidationResponse } from './doorstopTypes';
import { DoorstopTreeProvider, RequirementTreeItem } from './requirementTree';
import { buildStatusReport, parseGitLog, readGitLog, weeklyVolatility } from './statusReport';

export interface AddedItem {
  uid: string;
  path: string;
  level: string;
}

interface CommandOptions {
  context: vscode.ExtensionContext;
  server: DoorstopServer;
  tree: DoorstopTreeProvider;
  utilities: { refresh(): void };
  workspaceFolder: vscode.WorkspaceFolder;
}

/** True when `folderPath` or an ancestor holds a `.git` entry (directory or worktree/submodule file). */
export function isUnderGit(folderPath: string): boolean {
  let current = path.resolve(folderPath);
  for (;;) {
    if (fsSync.existsSync(path.join(current, '.git'))) {return true;}
    const parent = path.dirname(current);
    if (parent === current) {return false;}
    current = parent;
  }
}

/** Shows the FR-004 error and returns false when `folderPath` is not under git. */
export function requireGit(folderPath: string): boolean {
  if (isUnderGit(folderPath)) {return true;}
  void vscode.window.showErrorMessage(
    'Doorstop: this folder is not under git version control. Run `git init` (or open a git repository) and try again.'
  );
  return false;
}

function itemArgument(value: unknown): RequirementTreeItem | undefined {
  return value instanceof RequirementTreeItem ? value : undefined;
}

function editorUid(): string | undefined {
  const fileName = vscode.window.activeTextEditor?.document.fileName;
  if (!fileName) {return undefined;}
  const extension = path.extname(fileName).toLowerCase();
  return extension === '.md' || extension === '.yml'
    ? path.basename(fileName, extension)
    : undefined;
}

async function documentRoots(tree: DoorstopTreeProvider): Promise<RequirementTreeItem[]> {
  const roots = await tree.getChildren();
  return roots.filter(root => root.itemData.isDoorstopRoot);
}

async function rootForItem(tree: DoorstopTreeProvider, item: RequirementTreeItem): Promise<RequirementTreeItem | undefined> {
  let current: RequirementTreeItem | undefined = item;
  while (current) {
    if (current.itemData.isDoorstopRoot) {return current;}
    current = tree.getParent(current) as RequirementTreeItem | undefined;
  }
  return undefined;
}

export async function choosePrefix(tree: DoorstopTreeProvider): Promise<string | undefined> {
  const roots = await documentRoots(tree);
  const choice = await vscode.window.showQuickPick(
    roots
      .filter(root => typeof root.itemData.prefix === 'string' && root.itemData.prefix.trim())
      .map(root => ({ label: root.itemData.prefix as string, description: root.resourceUri.fsPath })),
    { placeHolder: 'Select a Doorstop document' }
  );
  return choice?.label;
}

/**
 * The parent quick-select shown by "Create Document" (spec 002 FR-009/FR-010).
 * Returns the chosen parent prefix, `null` for the explicit "no parent" entry,
 * and `undefined` when the user dismissed the pick - which cancels the whole
 * command (FR-011), so "dismissed" must stay distinguishable from "chose none".
 */
export async function chooseParentPrefix(
  tree: DoorstopTreeProvider
): Promise<string | null | undefined> {
  const roots = await documentRoots(tree);
  const noParent = { label: 'None (create as root document)', description: 'No parent document' };
  const choices = [
    noParent,
    ...roots
      .filter(root => typeof root.itemData.prefix === 'string' && root.itemData.prefix.trim())
      .map(root => ({ label: root.itemData.prefix as string, description: root.resourceUri.fsPath }))
  ];
  const choice = await vscode.window.showQuickPick(choices, {
    placeHolder: 'Select the parent document for the new document'
  });
  if (!choice) {
    return undefined;
  }
  return choice === noParent || choice.label === noParent.label ? null : choice.label;
}

type PublishTarget =
  | { kind: 'document'; prefix: string }
  | { kind: 'each' }
  | { kind: 'together' };

/** Publish picker: every document, then the two "all" modes (spec 024). */
async function choosePublishTarget(tree: DoorstopTreeProvider): Promise<PublishTarget | undefined> {
  const roots = await documentRoots(tree);
  const choices: Array<vscode.QuickPickItem & { target: PublishTarget }> = roots
    .filter(root => typeof root.itemData.prefix === 'string' && root.itemData.prefix.trim())
    .map(root => ({
      label: root.itemData.prefix as string,
      description: root.resourceUri.fsPath,
      target: { kind: 'document', prefix: root.itemData.prefix as string }
    }));
  choices.push(
    {
      label: 'All documents - one file each',
      description: 'Publish every document separately; a shared template is supplied to documents without one',
      target: { kind: 'each' }
    },
    {
      label: 'All documents - combined run',
      description: 'Publish all documents together with index and traceability matrix',
      target: { kind: 'together' }
    }
  );
  const choice = await vscode.window.showQuickPick(choices, {
    placeHolder: 'Select a Doorstop document or how to publish all documents'
  });
  return choice?.target;
}

async function chooseDocumentOrAll(tree: DoorstopTreeProvider): Promise<string | undefined> {
  const roots = await documentRoots(tree);
  const choices = roots
    .filter(root => typeof root.itemData.prefix === 'string' && root.itemData.prefix.trim())
    .map(root => ({
      label: root.itemData.prefix as string,
      description: root.resourceUri.fsPath
    }));
  choices.push({ label: 'all', description: 'All Doorstop documents' });
  const choice = await vscode.window.showQuickPick(choices, {
    placeHolder: 'Select a Doorstop document or all documents'
  });
  return choice?.label;
}

async function rootForPrefix(tree: DoorstopTreeProvider, prefix: string): Promise<RequirementTreeItem | undefined> {
  const roots = await documentRoots(tree);
  return roots.find(root => root.itemData.prefix === prefix);
}

function nextLevel(level: unknown): string | undefined {
  const value = String(level || '').trim();
  if (!value) {return undefined;}
  const parts = value.split('.');
  const last = Number(parts[parts.length - 1]);
  if (!Number.isFinite(last)) {return undefined;}
  parts[parts.length - 1] = String(last + 1);
  return parts.join('.');
}

/**
 * Tells the user where the output actually landed (spec 004 FR-008). The server
 * echoes the path its renderer really wrote, which is not always the requested
 * one - Doorstop's HTML publisher, for instance, nests the output in a directory
 * of its own - so the reported path is the server's, never the requested one.
 */
async function reportWrittenPath(action: string, requestedPath: string, writtenPath: string, summary?: string): Promise<void> {
  const differs = path.normalize(requestedPath) !== path.normalize(writtenPath);
  const message = summary ?? (differs
    ? `${action} complete. Doorstop wrote to ${writtenPath} (instead of the requested ${requestedPath}).`
    : `${action} complete: ${writtenPath}`);
  const uri = vscode.Uri.file(writtenPath);
  const isFile = (await vscode.workspace.fs.stat(uri).then(stat => stat.type === vscode.FileType.File, () => false));
  const open = 'Open';
  const reveal = 'Reveal in Explorer';
  const choice = await vscode.window.showInformationMessage(message, ...(isFile ? [open, reveal] : [reveal]));
  if (choice === open) {
    // Published HTML and PDF are meant to be viewed rendered, everything else read as text.
    await (['.html', '.pdf'].includes(path.extname(writtenPath)) ? vscode.env.openExternal(uri) : vscode.commands.executeCommand('vscode.open', uri));
  } else if (choice === reveal) {
    await vscode.commands.executeCommand('revealFileInOS', uri);
  }
}

/** Builds a `{scope, target}` body matching the server's review/clear disambiguation. */
function reviewClearTarget(item: RequirementTreeItem | undefined, choice: string | undefined): { scope: 'item' | 'document' | 'all'; target?: string } | undefined {
  if (item?.itemData.isDoorstopRoot) {
    return { scope: 'document', target: item.itemData.prefix };
  }
  if (item) {
    return { scope: 'item', target: item.itemData.uid };
  }
  if (choice === 'all') {
    return { scope: 'all' };
  }
  if (choice) {
    return { scope: 'document', target: choice };
  }
  return undefined;
}

export function registerDoorstopCommands(options: CommandOptions): vscode.Disposable[] {
  const register = (id: string, handler: (...args: any[]) => Promise<void> | void): vscode.Disposable =>
    registerCommand(id, handler);

  // Progress and the duplicate-run guard wrap only the server work, never the
  // prompts (spec 021 FR-008). Guarding the whole handler instead would block
  // manual Reorder, whose second step re-runs Reorder while the first handler
  // still waits on its "Apply Reorder" notification.
  const busy = new Set<string>();
  const run = async <T>(title: string, op: (report: ProgressReport) => Promise<T>): Promise<T | undefined> => {
    if (busy.has(title)) {
      void vscode.window.showInformationMessage(`Doorstop: ${title} is already running.`);
      return undefined;
    }
    busy.add(title);
    try {
      const result = await withDelayedProgress(`Doorstop: ${title}…`, op);
      options.tree.refresh();
      options.utilities.refresh();
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(`Doorstop command failed: ${message}`);
      return undefined;
    } finally {
      busy.delete(title);
    }
  };

  const createDoc = register('doorstop.createDoc', async () => {
    if (!requireGit(options.workspaceFolder.uri.fsPath)) {return;}
    const prefix = await vscode.window.showInputBox({ prompt: 'Enter the new document prefix' });
    if (!prefix) {return;}
    const folders = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Select Document Folder',
      defaultUri: options.workspaceFolder.uri
    });
    if (!folders?.[0]) {return;}
    // `undefined` means the pick was dismissed - cancel and create nothing (FR-011);
    // `null` is the deliberate "root document" choice, which sends no parentPrefix.
    const parentPrefix = await chooseParentPrefix(options.tree);
    if (parentPrefix === undefined) {return;}
    const settings = vscode.workspace.getConfiguration('doorstop.newDocument');
    await run('Create Document', () => options.server.request('POST', '/documents', {
      prefix,
      path: folders[0].fsPath,
      itemFormat: settings.get<string>('itemFormat', 'yaml'),
      separator: settings.get<string>('separator', ''),
      digits: settings.get<number>('digits', 3),
      ...(parentPrefix === null ? {} : { parentPrefix })
    }));
  });

  // Awaiting getChildren shares the load VS Code starts for the view, so the
  // notification covers the real reload (spec 026).
  const refresh = register('doorstop.refresh', () => withDelayedProgress('Doorstop: Refresh…', async () => {
    options.tree.refresh();
    options.utilities.refresh();
    await options.tree.getChildren();
  }));

  const add = register('doorstop.add', async (value?: unknown) => {
    const item = itemArgument(value);
    const root = item?.itemData.isDoorstopRoot ? item : item ? await rootForItem(options.tree, item) : undefined;
    const prefix = root?.itemData.prefix || await choosePrefix(options.tree);
    if (!prefix) {return;}

    let level: string | undefined;
    if (item && !item.itemData.isDoorstopRoot) {
      level = nextLevel(item.itemData.level);
    } else if (!item) {
      level = await vscode.window.showInputBox({ prompt: 'Enter level (optional)', placeHolder: '1.2.3' });
    }
    const created = await run('Add Item', () => options.server.request<AddedItem>('POST', `/documents/${encodeURIComponent(prefix)}/items`, level ? { level } : {}));
    if (created) {
      await vscode.window.showTextDocument(vscode.Uri.file(created.path));
    }
  });

  const review = register('doorstop.review', async (value?: unknown) => {
    const item = itemArgument(value);
    const choice = item ? undefined : await chooseDocumentOrAll(options.tree);
    const body = reviewClearTarget(item, choice);
    if (body) {await run('Review', () => options.server.request('POST', '/review', body));}
  });

  const clear = register('doorstop.clear', async (value?: unknown) => {
    const item = itemArgument(value);
    const choice = item ? undefined : await chooseDocumentOrAll(options.tree);
    const body = reviewClearTarget(item, choice);
    if (body) {await run('Clear Suspect', () => options.server.request('POST', '/clear', body));}
  });

  const link = register('doorstop.link', async (value?: unknown) => {
    const item = itemArgument(value);
    // The Document View's "Link..." action names the child (spec 019); the
    // tree row names the parent, and the palette asks for both.
    const childFromView = !item && value && typeof (value as { childUid?: unknown }).childUid === 'string'
      ? (value as { childUid: string }).childUid
      : undefined;
    const parentUid = item?.itemData.uid || await vscode.window.showInputBox({ prompt: 'Enter parent item UID' });
    const childUid = childFromView || editorUid() || await vscode.window.showInputBox({ prompt: 'Enter child item UID' });
    if (childUid && parentUid) {
      await run('Link Items', () => options.server.request('POST', `/items/${encodeURIComponent(childUid)}/links`, { parentUid: String(parentUid) }));
    }
  });

  const reorder = register('doorstop.reorder', async () => {
    const prefix = await choosePrefix(options.tree);
    if (!prefix) {return;}
    const mode = await vscode.window.showQuickPick([
      { label: 'Automatic', value: 'auto' as const },
      { label: 'Manual', value: 'manual' as const }
    ], { placeHolder: 'Select reorder mode' });
    if (!mode) {return;}

    if (mode.value === 'auto') {
      await run('Reorder Document', () => options.server.request('POST', `/documents/${encodeURIComponent(prefix)}/reorder`, { mode: 'auto' }));
      return;
    }

    // Applies the edited scratch index (spec 004 FR-002). The server reads the
    // file from disk, so an index that is still dirty in an editor is saved
    // first - otherwise the user's edits would be silently ignored.
    const applyManualReorder = async (indexUri: vscode.Uri): Promise<void> => {
      const open = vscode.workspace.textDocuments.find(document => document.uri.fsPath === indexUri.fsPath);
      if (open?.isDirty && !(await open.save())) {
        void vscode.window.showErrorMessage(`Doorstop: could not save ${path.basename(indexUri.fsPath)}; the reorder was not applied.`);
        return;
      }
      const result = await run('Reorder Document', () =>
        options.server.request('POST', `/documents/${encodeURIComponent(prefix)}/reorder`, { mode: 'manual' })
      );
      if (!result) {return;}
      // Doorstop deletes the scratch index once applied; drop its now-stale editor too.
      const staleTabs = vscode.window.tabGroups.all
        .flatMap(group => group.tabs)
        .filter(tab => tab.input instanceof vscode.TabInputText && tab.input.uri.fsPath === indexUri.fsPath);
      if (staleTabs.length > 0) {
        await vscode.window.tabGroups.close(staleTabs, true);
      }
      void vscode.window.showInformationMessage(`Doorstop: ${prefix} reordered from ${path.basename(indexUri.fsPath)}.`);
    };

    // A scratch index left over from an earlier attempt is the normal second
    // step of a manual reorder - edit, then run the command again - so applying
    // it must be offered right here, not only on a notification the user may
    // have dismissed long ago (spec 004 FR-003).
    const root = await rootForPrefix(options.tree, prefix);
    if (root) {
      const indexUri = vscode.Uri.file(path.join(path.dirname(root.resourceUri.fsPath), 'index.yml'));
      const exists = await vscode.workspace.fs.stat(indexUri).then(() => true, () => false);
      if (exists) {
        const choice = await vscode.window.showQuickPick(
          [
            { label: 'Apply index.yml', value: 'apply' as const, description: 'Renumber the document from the edited index now' },
            { label: 'Keep editing index.yml', value: 'edit' as const, description: 'Open the existing index again' },
            { label: 'Discard index.yml', value: 'discard' as const, description: 'Delete it and generate a fresh one' }
          ],
          { placeHolder: `An index.yml for ${prefix} already exists` }
        );
        if (!choice) {return;}
        if (choice.value === 'apply') {
          await applyManualReorder(indexUri);
          return;
        }
        if (choice.value === 'discard') {
          // DELETE answers 204 (no body), so map success to `true` to tell it from run()'s failure `undefined`.
          const discarded = await run('Reorder Document', () =>
            options.server.request('DELETE', `/documents/${encodeURIComponent(prefix)}/reorder/index`).then(() => true)
          );
          if (!discarded) {return;}
        }
      }
    }

    const indexResult = await run('Reorder Document', () =>
      options.server.request<{ indexPath: string }>('POST', `/documents/${encodeURIComponent(prefix)}/reorder/index`)
    );
    if (!indexResult) {return;}

    const indexUri = vscode.Uri.file(indexResult.indexPath);
    await vscode.window.showTextDocument(indexUri);
    const apply = await vscode.window.showInformationMessage(
      `Edit ${path.basename(indexResult.indexPath)}, then apply the reorder - here, or by running "Reorder Document" again and choosing "Apply index.yml".`,
      'Apply Reorder'
    );
    if (apply) {
      await applyManualReorder(indexUri);
    }
  });

  const importCommand = register('doorstop.import', async () => {
    const target = await choosePrefix(options.tree);
    if (!target) {return;}
    const files = await vscode.window.showOpenDialog({
      canSelectMany: false,
      openLabel: 'Import Document',
      filters: {
        'Doorstop Documents': ['yaml', 'yml', 'csv', 'tsv', 'xlsx']
      }
    });
    if (files?.[0]) {
      await run('Import', () => options.server.request('POST', `/documents/${encodeURIComponent(target)}/import`, { sourcePath: files[0].fsPath }));
    }
  });

  const exportCommand = register('doorstop.export', async () => {
    const prefix = await choosePrefix(options.tree);
    if (!prefix) {return;}
    const format = await vscode.window.showQuickPick([
      { label: 'YAML', value: 'yaml' as const, extension: 'yaml' },
      { label: 'CSV', value: 'csv' as const, extension: 'csv' },
      { label: 'TSV', value: 'tsv' as const, extension: 'tsv' },
      { label: 'XLSX', value: 'xlsx' as const, extension: 'xlsx' }
    ], { placeHolder: 'Select export format' });
    if (!format) {return;}
    const destination = await vscode.window.showSaveDialog({
      saveLabel: 'Export Document',
      defaultUri: vscode.Uri.file(path.join(options.workspaceFolder.uri.fsPath, `${prefix}.${format.extension}`)),
      filters: {
        [`${format.label} Documents`]: [format.extension]
      }
    });
    if (destination) {
      const result = await run('Export', () => options.server.request<{ path: string }>(
        'POST', `/documents/${encodeURIComponent(prefix)}/export`, {
          format: format.value,
          destinationPath: destination.fsPath
        }
      ));
      if (result?.path) {
        await reportWrittenPath('Export', destination.fsPath, result.path);
      }
    }
  });

  const publish = register('doorstop.publish', async () => {
    const target = await choosePublishTarget(options.tree);
    if (!target) {return;}
    const format = await vscode.window.showQuickPick([
      { label: 'Markdown', value: 'markdown' as const, extension: '.md' },
      { label: 'HTML', value: 'html' as const, extension: '.html' },
      { label: 'LaTeX', value: 'latex' as const, extension: '.tex' },
      { label: 'PDF', value: 'pdf' as const, extension: '.pdf' }
    ], { placeHolder: 'Select publish format' });
    if (!format) {return;}
    // Markdown output takes no template; sending one would fail on any
    // document without a `template` folder (spec 020 research R5).
    const publishSettings = vscode.workspace.getConfiguration('doorstop.publish');
    const configured = publishSettings.get<string>('template', '').trim();
    // Spec 028: matrix mode and Doorstop's --no-child-links, applied server-side.
    const linkOptions = {
      traceability: publishSettings.get<'complete' | 'doorstop'>('traceability', 'complete'),
      childLinks: !publishSettings.get<boolean>('noChildLinks', false)
    };
    const template = format.value === 'markdown' ? '' : configured;
    const withTemplateHint = (error: unknown): never => {
      if (!template) {throw error;}
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${message} (template "${template}" from setting doorstop.publish.template)`);
    };
    const publishOne = (documentPrefix: string, destinationPath: string): Promise<{ path: string }> =>
      options.server.request<{ path: string }>(
        'POST', `/documents/${encodeURIComponent(documentPrefix)}/publish`, {
          format: format.value === 'pdf' ? 'html' : format.value,
          destinationPath,
          ...linkOptions,
          ...(template ? { template } : {}),
          // "One file each": documents without their own template folder borrow
          // another document's, server-side (spec 024).
          ...(template && target.kind === 'each' ? { sharedTemplate: true } : {})
        }
      ).catch(error => withTemplateHint(error));

    // PDF (spec 027): Doorstop HTML into a temp folder, then the workspace's own
    // export script - the same two steps a CI pipeline runs. Set up before any
    // destination dialog, so declining it asks nothing further.
    const workspace = options.workspaceFolder.uri.fsPath;
    const toolingDir = format.value === 'pdf' ? await ensurePdfTooling(options.context.extensionPath, workspace) : undefined;
    if (format.value === 'pdf' && !toolingDir) {return;}
    const exportPdf = async (report: ProgressReport, publishHtml: (tmp: string) => Promise<string>, output: string): Promise<string[]> => {
      const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'doorstop-pdf-'));
      try {
        const { written, warnings } = await runExportScript(
          toolingDir as string, await publishHtml(tmp), output, workspace, report
        ).catch(error => {
          // A missing browser can be fixed on the spot (FR-011); the failure is still reported.
          void offerBrowserInstall(toolingDir as string, error);
          throw error;
        });
        warnings.forEach(warning => void vscode.window.showWarningMessage(`Doorstop: ${warning}`));
        return written;
      } finally {
        await fs.rm(tmp, { recursive: true, force: true });
      }
    };

    if (target.kind === 'document' && toolingDir) {
      const destination = await vscode.window.showSaveDialog({
        saveLabel: 'Publish',
        filters: { PDF: ['pdf'] },
        defaultUri: vscode.Uri.file(path.join(workspace, `${target.prefix}.pdf`))
      });
      if (!destination) {return;}
      // The server answers with the HTML it really wrote (documents/PREFIX.html).
      const written = await run('Publish', report => exportPdf(
        report, async tmp => (await publishOne(target.prefix, path.join(tmp, `${target.prefix}.html`))).path, destination.fsPath
      ));
      if (written) {
        await reportWrittenPath('Publish', destination.fsPath, destination.fsPath);
      }
      return;
    }

    if (target.kind === 'document') {
      const destination = await vscode.window.showSaveDialog({ saveLabel: 'Publish' });
      if (!destination) {return;}
      const result = await run('Publish', () => publishOne(target.prefix, destination.fsPath));
      if (result?.path) {
        await reportWrittenPath('Publish', destination.fsPath, result.path);
      }
      return;
    }

    const folders = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Publish All'
    });
    if (!folders?.[0]) {return;}
    const folder = folders[0].fsPath;
    if (toolingDir) {
      // Both "all" modes: only Doorstop's combined run writes the traceability matrix.
      const written = await run('Publish', report => exportPdf(report, async tmp => {
        await options.server.request('POST', '/publish', {
          format: 'html',
          destinationPath: tmp,
          ...linkOptions,
          ...(template ? { template } : {})
        }).catch(error => withTemplateHint(error));
        return tmp;
      }, folder));
      if (written) {
        const count = written.filter(file => path.basename(file) !== 'traceability.pdf').length;
        await reportWrittenPath('Publish', folder, folder, `Published ${count} document(s) and the traceability matrix as PDF to ${folder}.`);
      }
      return;
    }
    if (target.kind === 'together') {
      const result = await run('Publish', () => options.server.request<{ path: string }>(
        'POST', '/publish', {
          format: format.value,
          destinationPath: folder,
          ...linkOptions,
          ...(template ? { template } : {})
        }
      ).catch(error => withTemplateHint(error)));
      if (result?.path) {
        // The server reports index.html for HTML; that is where it was meant to go.
        await reportWrittenPath('Publish', path.dirname(result.path) === folder ? result.path : folder, result.path);
      }
      return;
    }
    const prefixes = (await documentRoots(options.tree))
      .map(root => root.itemData.prefix)
      .filter((value): value is string => typeof value === 'string' && value.trim() !== '');
    if (prefixes.length === 0) {
      void vscode.window.showInformationMessage('No documents to publish.');
      return;
    }
    // Sequential and fail-fast (spec 021 FR-003): the first failing document
    // ends the run, and run() reports it by name.
    const count = await run('Publish', async () => {
      for (const documentPrefix of prefixes) {
        await publishOne(documentPrefix, path.join(folder, documentPrefix + format.extension)).catch(error => {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(`Publish of ${documentPrefix} failed: ${message}`);
        });
      }
      return prefixes.length;
    });
    if (count !== undefined) {
      await reportWrittenPath('Publish', folder, folder, `Published ${count} document(s) to ${folder}.`);
    }
  });

  const statusReport = register('doorstop.statusReport', async () => {
    const uri = await run('Generate Status Report', async () => {
      // Tree and problems come first: if either fails, nothing is written (FR-019).
      const [tree, validation] = await Promise.all([
        options.server.request<TreeResponse>('GET', '/tree'),
        options.server.request<ValidationResponse>('GET', '/validate')
      ]);
      const root = options.workspaceFolder.uri.fsPath;
      // Missing git or history only blanks its own section (FR-017).
      const volatility = await readGitLog(root).then(
        output => weeklyVolatility(parseGitLog(output), tree.documents, root, new Date()),
        (error: unknown) => ({ unavailable: error instanceof Error ? error.message : String(error) })
      );
      const markdown = buildStatusReport({
        projectName: options.workspaceFolder.name,
        generatedAt: new Date(),
        documents: tree.documents,
        issues: validation.issues,
        volatility
      });
      const target = vscode.Uri.joinPath(options.workspaceFolder.uri, 'doorstop-status.md');
      await vscode.workspace.fs.writeFile(target, Buffer.from(markdown, 'utf8'));
      return target;
    });
    if (uri) {
      await vscode.window.showTextDocument(uri);
    }
  });

  return [createDoc, refresh, add, review, clear, link, reorder, importCommand, exportCommand, publish, statusReport];
}
