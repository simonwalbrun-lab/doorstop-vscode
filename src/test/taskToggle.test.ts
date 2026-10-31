import * as assert from 'assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import * as vscode from 'vscode';

import { render } from '../documentViewModel';
import { ItemNode } from '../doorstopTypes';
import { handleSelectionChange, taskBoxAt, toggleTargetAt } from '../taskToggle';

// One-click task checkboxes (spec 035 US1). No workspace folder and no server:
// item files live in a temp folder, and selection events are built by hand
// because vscode-test cannot produce a real mouse click.

const ITEM = [
  'active: true',
  'links: []',
  '- [ ] not text',
  'text: |',
  '  - [ ] one',
  '  * [x] two',
  '    + [X] nested',
  '  1. [ ] numbered',
  '  ```',
  '  - [ ] fenced',
  '  ```',
  'level: 1.0',
  ''
].join('\n');

let root: string;
let counter = 0;

async function openItem(content = ITEM): Promise<vscode.TextEditor> {
  const file = path.join(root, `TR-${String(++counter).padStart(3, '0')}.yml`);
  fs.writeFileSync(file, content);
  return vscode.window.showTextDocument(await vscode.workspace.openTextDocument(file));
}

function click(
  editor: vscode.TextEditor,
  line: number,
  character: number,
  kind = vscode.TextEditorSelectionChangeKind.Mouse,
  selections = [new vscode.Selection(line, character, line, character)]
): Promise<void> {
  return handleSelectionChange({ textEditor: editor, selections, kind });
}

const lineOf = (editor: vscode.TextEditor, line: number) => editor.document.lineAt(line).text;

suite('Task toggle (035)', function () {
  this.timeout(20000);

  suiteSetup(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'doorstop-035-toggle-'));
    fs.writeFileSync(path.join(root, '.doorstop.yml'), 'settings:\n  prefix: TR\n');
  });

  teardown(async () => {
    await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
  });

  // Spec 035 FR-001
  test('taskBoxAt finds the box for every list marker and nothing else', () => {
    assert.strictEqual(taskBoxAt('- [ ] a'), 2);
    assert.strictEqual(taskBoxAt('* [x] a'), 2);
    assert.strictEqual(taskBoxAt('+ [X] a'), 2);
    assert.strictEqual(taskBoxAt('1. [ ] a'), 3);
    assert.strictEqual(taskBoxAt('2) [ ] a'), 3);
    assert.strictEqual(taskBoxAt('    - [ ]'), 6);
    assert.strictEqual(taskBoxAt('- [y] a'), undefined);
    assert.strictEqual(taskBoxAt('-[ ] a'), undefined);
    assert.strictEqual(taskBoxAt('plain text'), undefined);
  });

  // Spec 035 FR-001, FR-002
  test('a mouse click inside the brackets flips exactly the box character', async () => {
    const editor = await openItem();
    await click(editor, 4, 5);
    assert.strictEqual(editor.document.getText(), ITEM.replace('  - [ ] one', '  - [x] one'));
    await click(editor, 4, 6);
    assert.strictEqual(editor.document.getText(), ITEM);
    await click(editor, 6, 8);
    assert.strictEqual(lineOf(editor, 6), '    + [ ] nested', '[X] unchecks');
    await click(editor, 5, 5);
    assert.strictEqual(lineOf(editor, 5), '  * [ ] two');
    await click(editor, 7, 7);
    assert.strictEqual(lineOf(editor, 7), '  1. [x] numbered');
    assert.strictEqual(lineOf(editor, 6), '    + [ ] nested', 'siblings and parents untouched');
  });

  // Spec 035 FR-001
  test('clicks outside the brackets, keyboard moves and drag selections do not toggle', async () => {
    const editor = await openItem();
    await click(editor, 4, 4);
    await click(editor, 4, 7);
    await click(editor, 4, 10);
    await click(editor, 4, 5, vscode.TextEditorSelectionChangeKind.Keyboard);
    await click(editor, 4, 5, vscode.TextEditorSelectionChangeKind.Command);
    await handleSelectionChange({ textEditor: editor, selections: [new vscode.Selection(4, 5, 4, 5)], kind: undefined });
    await click(editor, 4, 5, vscode.TextEditorSelectionChangeKind.Mouse, [new vscode.Selection(4, 4, 4, 6)]);
    await click(editor, 4, 5, vscode.TextEditorSelectionChangeKind.Mouse, [new vscode.Selection(4, 5, 4, 5), new vscode.Selection(5, 5, 5, 5)]);
    assert.strictEqual(editor.document.getText(), ITEM);
  });

  // Spec 035 FR-003
  test('a toggle is an unsaved, undoable edit', async () => {
    const editor = await openItem();
    await click(editor, 4, 5);
    assert.ok(editor.document.isDirty);
    assert.strictEqual(fs.readFileSync(editor.document.fileName, 'utf8'), ITEM, 'not written to disk');
    await vscode.commands.executeCommand('undo');
    assert.strictEqual(editor.document.getText(), ITEM);
  });

  // Spec 035 FR-004
  test('Document View body tasks toggle; managed, header and fields lines do not', () => {
    const item: ItemNode = {
      uid: 'TR-001', level: '1.0', path: '/r/TR-001.yml', active: true, normative: true, derived: false,
      reviewed: true, cleared: false, links: [], text: '- [ ] step', fields: { status: '- [ ] field' }
    };
    const lines = render({ prefix: 'TR', markerPath: '/r/.doorstop.yml', items: [item] }, ['status']).text.split('\n');
    const step = lines.indexOf('- [ ] step');
    assert.deepStrictEqual(toggleTargetAt(lines, step, 3, 'view'), new vscode.Range(step, 3, step, 4));
    assert.strictEqual(toggleTargetAt(lines, lines.indexOf('status: - [ ] field'), 11, 'view'), undefined);
    assert.strictEqual(toggleTargetAt(lines, step - 1, 3, 'view'), undefined, 'fence close line');
  });

  // Spec 035 FR-001
  test('a markdown file outside any Doorstop document does not toggle', async () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'doorstop-035-notes-'));
    const notes = path.join(folder, 'notes.md');
    const content = '---\ntitle: Notes\n---\n- [ ] todo\n';
    fs.writeFileSync(notes, content);
    const editor = await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(notes));
    await click(editor, 3, 3);
    assert.strictEqual(editor.document.getText(), content);
  });

  // Spec 035 FR-005
  test('tasks in fenced code and outside the text block do not toggle', async () => {
    const editor = await openItem();
    await click(editor, 9, 5);
    await click(editor, 2, 3);
    assert.strictEqual(editor.document.getText(), ITEM);
    assert.strictEqual(toggleTargetAt(['---', 'a: 1', '---', '- [ ] x'], 3, 3, 'markdown')?.start.line, 3);
    assert.strictEqual(toggleTargetAt(['---', '- [ ] x', '---'], 1, 3, 'markdown'), undefined);
  });
});
