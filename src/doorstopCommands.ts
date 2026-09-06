import * as path from 'node:path';
import * as vscode from 'vscode';

import { DoorstopServer, DOORSTOP_SERVER_HOST, DOORSTOP_SERVER_PORT } from './doorstopServer';
import { DoorstopTreeProvider, RequirementTreeItem } from './requirementTree';

interface CommandOptions {
  context: vscode.ExtensionContext;
  server: DoorstopServer;
  tree: DoorstopTreeProvider;
  utilities: { refresh(): void };
  workspaceFolder: vscode.WorkspaceFolder;
  getPythonPath: () => Promise<string>;
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

async function choosePrefix(tree: DoorstopTreeProvider): Promise<string | undefined> {
  const roots = await documentRoots(tree);
  const choice = await vscode.window.showQuickPick(
    roots
      .filter(root => typeof root.itemData.prefix === 'string' && root.itemData.prefix.trim())
      .map(root => ({ label: root.itemData.prefix as string, description: root.resourceUri.fsPath })),
    { placeHolder: 'Select a Doorstop document' }
  );
  return choice?.label;
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

function commonArgs(projectPath: string): string[] {
  return ['--project', projectPath, '--server', DOORSTOP_SERVER_HOST, '--port', String(DOORSTOP_SERVER_PORT)];
}

export function registerDoorstopCommands(options: CommandOptions): vscode.Disposable[] {
  const register = (id: string, handler: (...args: any[]) => Promise<void> | void): vscode.Disposable =>
    vscode.commands.registerCommand(id, handler);

  const run = async (args: string[], input?: string): Promise<boolean> => {
    try {
      const result = await options.server.runCommand(
        options.workspaceFolder.uri.fsPath,
        await options.getPythonPath(),
        args.concat(commonArgs(options.workspaceFolder.uri.fsPath)),
        input
      );
      if (result.exitCode !== 0) {
        throw new Error(result.stderr.trim() || result.stdout.trim() || `doorstop ${args[0]} failed.`);
      }
      options.tree.refresh();
      options.utilities.refresh();
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(`Doorstop command failed: ${message}`);
      return false;
    }
  };

  const createDoc = register('doorstop.createDoc', async () => {
    const prefix = await vscode.window.showInputBox({ prompt: 'Enter the new document prefix' });
    if (prefix) {await run(['create', prefix]);}
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
    await run(level ? ['add', prefix, '-l', level] : ['add', prefix]);
  });

  const review = register('doorstop.review', async (value?: unknown) => {
    const item = itemArgument(value);
    const root = item?.itemData.isDoorstopRoot ? item : undefined;
    const target = root?.itemData.prefix
      || item?.itemData.uid
      || await chooseDocumentOrAll(options.tree);
    if (target) {await run(['review', String(target)]);}
  });

  const clear = register('doorstop.clear', async (value?: unknown) => {
    const item = itemArgument(value);
    const root = item?.itemData.isDoorstopRoot ? item : undefined;
    const target = root?.itemData.prefix
      || item?.itemData.uid
      || await chooseDocumentOrAll(options.tree);
    if (target) {await run(['clear', String(target)]);}
  });

  const link = register('doorstop.link', async (value?: unknown) => {
    const item = itemArgument(value);
    const parentUid = item?.itemData.uid || await vscode.window.showInputBox({ prompt: 'Enter parent item UID' });
    const childUid = editorUid() || await vscode.window.showInputBox({ prompt: 'Enter child item UID' });
    if (childUid && parentUid) {await run(['link', childUid, String(parentUid)]);}
  });

  const reorder = register('doorstop.reorder', async () => {
    const prefix = await choosePrefix(options.tree);
    if (!prefix) {return;}
    const mode = await vscode.window.showQuickPick([
      { label: 'Automatic', value: '-a' },
      { label: 'Manual', value: '-m' }
    ], { placeHolder: 'Select reorder mode' });
    if (!mode) {return;}

    let indexInput: string | undefined;
    if (mode.value === '-m') {
      const root = await rootForPrefix(options.tree, prefix);
      if (root) {
        const indexUri = vscode.Uri.file(path.join(path.dirname(root.resourceUri.fsPath), 'index.yml'));
        try {
          await vscode.workspace.fs.stat(indexUri);
          const loadIndex = await vscode.window.showQuickPick(
            [
              { label: 'Yes', value: 'y\n', description: 'Load the existing index.yml file' },
              { label: 'No', value: 'n\n', description: 'Do not load the existing index.yml file' }
            ],
            { placeHolder: `Load existing index.yml for ${prefix}?` }
          );
          if (!loadIndex) {return;}
          indexInput = loadIndex.value;
        } catch {
          // No generated index exists; Doorstop will not ask this question.
        }
      }
    }

    await run(['reorder', prefix, mode.value], indexInput);
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
    if (files?.[0]) {await run(['import', files[0].fsPath, target]);}
  });

  const exportCommand = register('doorstop.export', async () => {
    const prefix = await choosePrefix(options.tree);
    if (!prefix) {return;}
    const format = await vscode.window.showQuickPick([
      { label: 'YAML', value: '-y', extension: 'yaml' },
      { label: 'CSV', value: '-c', extension: 'csv' },
      { label: 'TSV', value: '-t', extension: 'tsv' },
      { label: 'XLSX', value: '-x', extension: 'xlsx' }
    ], { placeHolder: 'Select export format' });
    if (!format) {return;}
    const destination = await vscode.window.showSaveDialog({
      saveLabel: 'Export Document',
      defaultUri: vscode.Uri.file(path.join(options.workspaceFolder.uri.fsPath, `${prefix}.${format.extension}`)),
      filters: {
        [`${format.label} Documents`]: [format.extension]
      }
    });
    if (destination) {await run(['export', format.value, prefix, destination.fsPath]);}
  });

  const publish = register('doorstop.publish', async () => {
    const prefix = await choosePrefix(options.tree);
    if (!prefix) {return;}
    const format = await vscode.window.showQuickPick([
      { label: 'Markdown', value: '-m' }, { label: 'HTML', value: '-H' }, { label: 'LaTeX', value: '-l' }
    ], { placeHolder: 'Select publish format' });
    if (!format) {return;}
    const destination = await vscode.window.showSaveDialog({ saveLabel: 'Publish' });
    if (destination) {await run(['publish', format.value, prefix, destination.fsPath]);}
  });

  return [createDoc, refresh, add, review, clear, link, reorder, importCommand, exportCommand, publish];
}
