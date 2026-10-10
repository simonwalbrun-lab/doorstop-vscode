import * as assert from 'assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import * as vscode from 'vscode';

import { DoorstopCommandsProvider } from '../commandsProvider';
import { isUnderGit, requireGit } from '../doorstopCommands';
import { DoorstopServer } from '../doorstopServer';
import { TreeResponse } from '../doorstopTypes';
import { getActiveInterpreter, PythonEnvironmentsApi, sameInterpreter, watchInterpreter } from '../pythonEnvironment';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));

interface MenuEntry { command: string }

// Runs `fn` with the dialogs replaced, recording every call.
async function withStubs<T>(
  stubs: { inputBox?: string },
  fn: (calls: { dialogs: vscode.OpenDialogOptions[] }) => Promise<T>
): Promise<T> {
  const original = { showInputBox: vscode.window.showInputBox, showOpenDialog: vscode.window.showOpenDialog };
  const patched = vscode.window as unknown as Record<string, unknown>;
  const calls = { dialogs: [] as vscode.OpenDialogOptions[] };
  patched.showInputBox = async () => stubs.inputBox;
  patched.showOpenDialog = async (options: vscode.OpenDialogOptions) => {
    calls.dialogs.push(options);
    return undefined; // dismissed: nothing is created
  };
  try {
    return await fn(calls);
  } finally {
    Object.assign(vscode.window, original);
  }
}

suite('Empty-Folder Bootstrap (029)', () => {
  // Spec 029 FR-004
  test('isUnderGit detects a .git in the folder or an ancestor, and its absence', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'doorstop-029-'));
    try {
      assert.strictEqual(isUnderGit(root), false, 'bare temp folder');
      fs.mkdirSync(path.join(root, '.git'));
      assert.strictEqual(isUnderGit(root), true, 'folder with .git');
      fs.mkdirSync(path.join(root, 'sub', 'deeper'), { recursive: true });
      assert.strictEqual(isUnderGit(path.join(root, 'sub', 'deeper')), true, 'subfolder of a repo');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  // Spec 029 FR-001
  test('the extension activates from the Doorstop view or Create Document, without a project marker', () => {
    // VS Code derives onView/onCommand activation from these contributions
    // (engines.vscode >= 1.74), so no explicit activationEvents are declared.
    const views: { id: string }[] = Object.values<{ id: string }[]>(manifest.contributes.views).flat();
    const commands: { command: string }[] = manifest.contributes.commands;
    assert.ok(views.some(v => v.id === 'doorstop.commandsView'));
    assert.ok(commands.some(c => c.command === 'doorstop.createDoc'));
  });

  // Spec 029 FR-009
  test('cancelling the prefix prompt opens no dialog and creates nothing', async () => {
    await withStubs({ inputBox: undefined }, async calls => {
      await vscode.commands.executeCommand('doorstop.createDoc');
      assert.strictEqual(calls.dialogs.length, 0);
    });
  });

  // Spec 029 FR-009 FR-010
  test('the folder dialog starts in the workspace folder and cancelling it creates nothing', async () => {
    await withStubs({ inputBox: 'TMP029' }, async calls => {
      await vscode.commands.executeCommand('doorstop.createDoc');
      assert.strictEqual(calls.dialogs.length, 1);
      assert.strictEqual(
        calls.dialogs[0].defaultUri?.fsPath,
        vscode.workspace.workspaceFolders![0].uri.fsPath
      );
    });
  });

  // Spec 029 FR-008
  test('the empty Explorer shows a welcome hint', () => {
    const welcome = manifest.contributes.viewsWelcome as Array<{ view: string; contents: string }>;
    assert.ok(welcome.some(entry => entry.view === 'doorstop.treeView' && /Create Document/.test(entry.contents)));
  });

  // Spec 029 FR-005
  test('the Explorer has no Create Document action', () => {
    for (const menu of ['view/title', 'view/item/context']) {
      const entries = (manifest.contributes.menus[menu] ?? []) as MenuEntry[];
      assert.ok(!entries.some(entry => entry.command === 'doorstop.createDoc'), menu);
    }
  });

  // Spec 029 FR-006
  test('the Commands view lists Create Document', () => {
    const node = new DoorstopCommandsProvider().getChildren().find(item => item.label === 'Create Document');
    assert.strictEqual(node?.command?.command, 'doorstop.createDoc');
  });

  // Spec 029 FR-007
  test('Create Document stays declared and in the command palette', () => {
    const commands = manifest.contributes.commands as MenuEntry[];
    assert.ok(commands.some(entry => entry.command === 'doorstop.createDoc'));
    const hidden = ((manifest.contributes.menus.commandPalette ?? []) as Array<MenuEntry & { when?: string }>)
      .filter(entry => entry.command === 'doorstop.createDoc' && entry.when === 'false');
    assert.deepStrictEqual(hidden, []);
  });

  // Spec 029 FR-004 FR-009
  test('a folder outside git gets the git error and nothing is written', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'doorstop-029-'));
    const original = vscode.window.showErrorMessage;
    const shown: string[] = [];
    (vscode.window as unknown as Record<string, unknown>).showErrorMessage = async (message: string) => {
      shown.push(message);
      return undefined;
    };
    try {
      assert.strictEqual(requireGit(root), false);
      assert.strictEqual(shown.length, 1);
      assert.match(shown[0], /git version control/);
      assert.deepStrictEqual(fs.readdirSync(root), []);
    } finally {
      Object.assign(vscode.window, { showErrorMessage: original });
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  // Spec 029 FR-001 FR-002 FR-003
  test('the server starts on an empty git folder and lists the first document without a restart', async function () {
    this.timeout(30000);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'doorstop-029-'));
    spawnSync('git', ['init', root], { stdio: 'ignore' });
    const python = [
      path.join(REPO_ROOT, '.venv', process.platform === 'win32' ? 'Scripts' : 'bin', process.platform === 'win32' ? 'python.exe' : 'python3'),
      'python3',
      'python'
    ].find(candidate => spawnSync(candidate, ['-c', 'import doorstop_server'], { stdio: 'ignore' }).status === 0);
    assert.ok(python, 'a Python with doorstop_server installed is required (see server/README.md)');
    // Own port: the default one may be held by a developer's running instance.
    const server = new DoorstopServer({ port: 7899 });
    try {
      await server.start(root, python);
      const empty = await server.request<TreeResponse>('GET', '/tree');
      assert.deepStrictEqual(empty.documents, []);
      await server.request('POST', '/documents', { prefix: 'REQ', path: path.join(root, 'reqs') });
      const tree = await server.request<TreeResponse>('GET', '/tree');
      assert.deepStrictEqual(tree.documents.map(document => document.prefix), ['REQ']);
    } finally {
      await server.dispose();
      // Best effort: on Windows the just-stopped server's working directory can stay locked.
      try { fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch { /* left in the OS temp folder */ }
    }
  });

  // Spec 029 FR-011 FR-012
  test('getActiveInterpreter returns only the active environment path, never a fallback', async () => {
    const api = (path?: string): PythonEnvironmentsApi => ({ getActiveEnvironmentPath: async () => (path === undefined ? undefined : { path }) });
    assert.strictEqual(await getActiveInterpreter(api('/env/bin/python')), '/env/bin/python');
    assert.strictEqual(await getActiveInterpreter(api()), undefined);
    assert.strictEqual(await getActiveInterpreter({ getActiveEnvironmentPath: async () => ({}) }), undefined);
  });

  // Spec 029 FR-011 FR-012 SC-005
  test('watchInterpreter waits with one notice, then starts once on activation and again on a switch', async () => {
    const emitter = new vscode.EventEmitter<void>();
    let active: string | undefined;
    const api: PythonEnvironmentsApi = {
      getActiveEnvironmentPath: async () => (active ? { path: active } : undefined),
      onDidChangeActiveEnvironmentPath: emitter.event
    };
    const started: string[] = [];
    let notices = 0;
    const settle = () => new Promise(resolve => setTimeout(resolve, 20));
    const watcher = await watchInterpreter(api, undefined, p => { started.push(p); }, () => { notices++; });
    emitter.fire(); await settle();
    assert.deepStrictEqual(started, [], 'nothing starts while no environment is active');
    assert.strictEqual(notices, 1, 'one notice only');
    active = '/a/python'; emitter.fire(); await settle();
    emitter.fire(); await settle(); // same path again: no restart
    active = '/b/python'; emitter.fire(); await settle();
    assert.deepStrictEqual(started, ['/a/python', '/b/python']);
    watcher.dispose();
    emitter.dispose();
  });

  // Spec 029 FR-013
  test('an install is allowed only while the offered interpreter is still active', () => {
    assert.strictEqual(sameInterpreter('/a/python', '/a/python'), true);
    assert.strictEqual(sameInterpreter('/b/python', '/a/python'), false);
    assert.strictEqual(sameInterpreter(undefined, '/a/python'), false);
  });

  // Spec 029 FR-014
  test('Doorstop: Restart Extension replaces Restart Server and is registered', async () => {
    const commands: Array<{ command: string; title: string }> = manifest.contributes.commands;
    assert.strictEqual(commands.find(c => c.command === 'doorstop.restartExtension')?.title, 'Doorstop: Restart Extension');
    assert.ok(!commands.some(c => c.command === 'doorstop.restartServer'));
    await vscode.extensions.getExtension(`${manifest.publisher}.${manifest.name}`)?.activate();
    assert.ok((await vscode.commands.getCommands(true)).includes('doorstop.restartExtension'));
  });
});
