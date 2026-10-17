import * as assert from 'assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import * as vscode from 'vscode';

// YAML header folding (spec 034). No workspace folder and no server: the fixture
// is a temp Doorstop document, and settings go to the user (Global) scope.

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
const HEADER = '---\nactive: true\nlevel: 1.0\n---\n\nText.\n';

let root: string;
const file = (relative: string): string => path.join(root, relative);

async function setFoldOnOpen(value: boolean | undefined): Promise<void> {
  await vscode.workspace.getConfiguration('doorstop').update('foldYamlHeaderOnOpen', value, vscode.ConfigurationTarget.Global);
}

async function rangesFor(relative: string): Promise<vscode.FoldingRange[]> {
  const document = await vscode.workspace.openTextDocument(file(relative));
  return (await vscode.commands.executeCommand<vscode.FoldingRange[]>('vscode.executeFoldingRangeProvider', document.uri)) ?? [];
}

const headerRange = (ranges: vscode.FoldingRange[]) => ranges.find(range => range.start === 0 && range.end === 3);
const hasImports = (ranges: vscode.FoldingRange[]) => ranges.some(range => range.kind === vscode.FoldingRangeKind.Imports);

async function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error('timed out');
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

const lineVisible = (editor: vscode.TextEditor, line: number) =>
  editor.visibleRanges.some(range => range.start.line <= line && line <= range.end.line);

async function open(relative: string): Promise<vscode.TextEditor> {
  return vscode.window.showTextDocument(await vscode.workspace.openTextDocument(file(relative)));
}

suite('YAML Header Folding (034)', function () {
  // Editor tests wait for VS Code's async folding; each waitFor allows 5 s.
  this.timeout(20000);

  suiteSetup(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'doorstop-034-'));
    const files: Record<string, string> = {
      'DOC/.doorstop.yml': 'settings:\n  prefix: DOC\n',
      'DOC/DOC-001.md': HEADER,
      'DOC/sub/DOC-002.md': HEADER,
      'DOC/DOC-003.md': '---\nactive: true\n\nText.\n',
      'DOC/DOC-004.md': '---\n---\nText.\n',
      'DOC/DOC-005.md': '\n---\nactive: true\n---\n',
      // One fresh file per editor test: VS Code restores the fold state of a file
      // that was open before, which would hide what the test looks for.
      'DOC/DOC-010.md': HEADER,
      'DOC/DOC-011.md': HEADER,
      'DOC/DOC-012.md': HEADER,
      'DOC/DOC-013.md': HEADER,
      'NOTES/NOTE.md': HEADER
    };
    for (const [relative, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(file(relative)), { recursive: true });
      fs.writeFileSync(file(relative), content);
    }
    await vscode.extensions.getExtension(`${manifest.publisher}.${manifest.name}`)?.activate();
  });

  suiteTeardown(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  teardown(async () => {
    await setFoldOnOpen(undefined);
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  // Spec 034 FR-001, FR-009
  test('a valid header gets one fold; malformed headers get none; no server needed', async () => {
    // No server is started in this suite, so passing here is the FR-009 check.
    assert.ok(headerRange(await rangesFor('DOC/DOC-001.md')), 'item in the document folder');
    assert.ok(headerRange(await rangesFor('DOC/sub/DOC-002.md')), 'item in a subfolder');
    // The Imports kind marks our range, so built-in Markdown ranges cannot mask the result.
    await setFoldOnOpen(true);
    for (const name of ['DOC-003.md', 'DOC-004.md', 'DOC-005.md']) {
      assert.ok(!hasImports(await rangesFor(`DOC/${name}`)), `${name} has no header fold`);
    }
  });

  // Spec 034 FR-007
  test('Markdown outside a Doorstop document is not folded', async () => {
    await setFoldOnOpen(true);
    assert.ok(!hasImports(await rangesFor('NOTES/NOTE.md')));
  });

  // Spec 034 FR-008
  test('folding and unfolding leave the file unchanged', async () => {
    const editor = await open('DOC/DOC-001.md');
    const before = editor.document.getText();
    await vscode.commands.executeCommand('editor.fold', { selectionLines: [0] });
    await vscode.commands.executeCommand('editor.unfold', { selectionLines: [0] });
    assert.strictEqual(editor.document.isDirty, false);
    assert.strictEqual(editor.document.getText(), before);
  });

  // Spec 034 FR-002
  test('with the switch on the header is folded on open, with it off it is not', async () => {
    await setFoldOnOpen(true);
    assert.strictEqual(headerRange(await rangesFor('DOC/DOC-010.md'))?.kind, vscode.FoldingRangeKind.Imports);
    const folded = await open('DOC/DOC-010.md');
    await waitFor(() => lineVisible(folded, 0) && !lineVisible(folded, 1) && lineVisible(folded, 4));

    await setFoldOnOpen(false);
    assert.strictEqual(headerRange(await rangesFor('DOC/DOC-011.md'))?.kind, undefined);
    const unfolded = await open('DOC/DOC-011.md');
    await new Promise(resolve => setTimeout(resolve, 1000));
    assert.ok(lineVisible(unfolded, 1), 'header stays unfolded');
  });

  // Spec 034 FR-003
  test('an unfolded header is not folded again while the file stays open', async () => {
    await setFoldOnOpen(true);
    const editor = await open('DOC/DOC-012.md');
    await waitFor(() => !lineVisible(editor, 1));
    await vscode.commands.executeCommand('editor.unfold', { selectionLines: [0] });
    await waitFor(() => lineVisible(editor, 1));
    await open('DOC/DOC-013.md');
    const back = await open('DOC/DOC-012.md');
    await new Promise(resolve => setTimeout(resolve, 500));
    assert.ok(lineVisible(back, 1), 'header stays unfolded');
  });

  // Spec 034 FR-004
  test('the title bar shows one of two buttons, by setting', () => {
    const titles = manifest.contributes.menus['view/title'] as { command: string; when?: string; group?: string }[];
    const commands = manifest.contributes.commands as { command: string; title: string; icon: string }[];
    const expected: Record<string, string> = {
      'doorstop.foldYamlHeaderOnOpen.on': 'view == doorstop.treeView && !config.doorstop.foldYamlHeaderOnOpen',
      'doorstop.foldYamlHeaderOnOpen.off': 'view == doorstop.treeView && config.doorstop.foldYamlHeaderOnOpen'
    };
    for (const [command, when] of Object.entries(expected)) {
      const entries = titles.filter(entry => entry.command === command);
      assert.strictEqual(entries.length, 1, `${command} has one title bar entry`);
      assert.strictEqual(entries[0].when, when);
      assert.strictEqual(entries[0].group, 'navigation');
    }
    const [on, off] = Object.keys(expected).map(id => commands.find(command => command.command === id)!);
    assert.notStrictEqual(on.icon, off.icon);
    assert.notStrictEqual(on.title, off.title);
  });

  // Spec 034 FR-005
  test('the buttons flip the setting, which defaults to off', async () => {
    assert.strictEqual(manifest.contributes.configuration
      .find((section: { properties: Record<string, { default?: unknown }> }) => section.properties['doorstop.foldYamlHeaderOnOpen'])
      .properties['doorstop.foldYamlHeaderOnOpen'].default, false);
    const value = () => vscode.workspace.getConfiguration('doorstop').get<boolean>('foldYamlHeaderOnOpen');
    assert.strictEqual(value(), false);
    // No folder is open, so this also covers the user-settings fallback.
    await vscode.commands.executeCommand('doorstop.foldYamlHeaderOnOpen.on');
    assert.strictEqual(value(), true);
    await vscode.commands.executeCommand('doorstop.foldYamlHeaderOnOpen.off');
    assert.strictEqual(value(), false);
  });

  // Spec 034 FR-006
  test('Markdown editors fold Imports ranges on open', () => {
    // Peek editors are not reachable from the test API. They use the same setting
    // and range kind as the editor checked by the FR-002 test.
    assert.strictEqual(manifest.contributes.configurationDefaults['[markdown]']['editor.foldingImportsByDefault'], true);
    assert.strictEqual(vscode.workspace.getConfiguration('editor', { languageId: 'markdown' }).get('foldingImportsByDefault'), true);
  });
});
