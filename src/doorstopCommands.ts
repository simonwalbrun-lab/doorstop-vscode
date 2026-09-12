import * as path from 'node:path';
import * as vscode from 'vscode';

import { DoorstopServer } from './doorstopServer';
import { DoorstopTreeProvider, RequirementTreeItem } from './requirementTree';

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
async function reportWrittenPath(action: string, requestedPath: string, writtenPath: string): Promise<void> {
  const differs = path.normalize(requestedPath) !== path.normalize(writtenPath);
  const message = differs
    ? `${action} complete. Doorstop wrote to ${writtenPath} (instead of the requested ${requestedPath}).`
    : `${action} complete: ${writtenPath}`;
  const reveal = 'Reveal in Explorer';
  const choice = await vscode.window.showInformationMessage(message, reveal);
  if (choice === reveal) {
    await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(writtenPath));
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
    vscode.commands.registerCommand(id, handler);

  const run = async <T>(op: () => Promise<T>): Promise<T | undefined> => {
    try {
      const result = await op();
      options.tree.refresh();
      options.utilities.refresh();
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(`Doorstop command failed: ${message}`);
      return undefined;
    }
  };

  const createDoc = register('doorstop.createDoc', async () => {
    const prefix = await vscode.window.showInputBox({ prompt: 'Enter the new document prefix' });
    if (!prefix) {return;}
    const folders = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Select Document Folder',
      defaultUri: vscode.Uri.file(path.join(options.workspaceFolder.uri.fsPath, prefix))
    });
    if (!folders?.[0]) {return;}
    // `undefined` means the pick was dismissed - cancel and create nothing (FR-011);
    // `null` is the deliberate "root document" choice, which sends no parentPrefix.
    const parentPrefix = await chooseParentPrefix(options.tree);
    if (parentPrefix === undefined) {return;}
    await run(() => options.server.request('POST', '/documents', {
      prefix,
      path: folders[0].fsPath,
      ...(parentPrefix === null ? {} : { parentPrefix })
    }));
  });

  const refresh = register('doorstop.refresh', () => {
    options.tree.refresh();
    options.utilities.refresh();
  });

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
    const created = await run(() => options.server.request<AddedItem>('POST', `/documents/${encodeURIComponent(prefix)}/items`, level ? { level } : {}));
    if (created) {
      await vscode.window.showTextDocument(vscode.Uri.file(created.path));
    }
  });

  const review = register('doorstop.review', async (value?: unknown) => {
    const item = itemArgument(value);
    const choice = item ? undefined : await chooseDocumentOrAll(options.tree);
    const body = reviewClearTarget(item, choice);
    if (body) {await run(() => options.server.request('POST', '/review', body));}
  });

  const clear = register('doorstop.clear', async (value?: unknown) => {
    const item = itemArgument(value);
    const choice = item ? undefined : await chooseDocumentOrAll(options.tree);
    const body = reviewClearTarget(item, choice);
    if (body) {await run(() => options.server.request('POST', '/clear', body));}
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
      await run(() => options.server.request('POST', `/items/${encodeURIComponent(childUid)}/links`, { parentUid: String(parentUid) }));
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
      await run(() => options.server.request('POST', `/documents/${encodeURIComponent(prefix)}/reorder`, { mode: 'auto' }));
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
      const result = await run(() =>
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
          const discarded = await run(() =>
            options.server.request('DELETE', `/documents/${encodeURIComponent(prefix)}/reorder/index`).then(() => true)
          );
          if (!discarded) {return;}
        }
      }
    }

    const indexResult = await run(() =>
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
      await run(() => options.server.request('POST', `/documents/${encodeURIComponent(target)}/import`, { sourcePath: files[0].fsPath }));
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
      const result = await run(() => options.server.request<{ path: string }>(
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
    const prefix = await choosePrefix(options.tree);
    if (!prefix) {return;}
    const format = await vscode.window.showQuickPick([
      { label: 'Markdown', value: 'markdown' as const },
      { label: 'HTML', value: 'html' as const },
      { label: 'LaTeX', value: 'latex' as const }
    ], { placeHolder: 'Select publish format' });
    if (!format) {return;}
    const destination = await vscode.window.showSaveDialog({ saveLabel: 'Publish' });
    if (destination) {
      const result = await run(() => options.server.request<{ path: string }>(
        'POST', `/documents/${encodeURIComponent(prefix)}/publish`, {
          format: format.value,
          destinationPath: destination.fsPath
        }
      ));
      if (result?.path) {
        await reportWrittenPath('Publish', destination.fsPath, result.path);
      }
    }
  });

  return [createDoc, refresh, add, review, clear, link, reorder, importCommand, exportCommand, publish];
}
