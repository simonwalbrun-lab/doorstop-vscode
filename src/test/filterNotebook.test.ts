import * as assert from 'assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';

import { DoorstopCommandsProvider } from '../commandsProvider';
import { FilterItem } from '../doorstopTypes';
import { FilterNotebookSerializer, NEW_NOTEBOOK_CELLS, openFilterItem, resultOutput } from '../filterNotebook';

// Filter-notebook tests (spec 022): no workspace, no server. Filter evaluation
// and column values are covered by server/tests/test_filter.py. Expected output
// follows specs/022-filter-notebooks/contracts/notebook-file.md.

const ROOT = path.resolve('/ws dir');
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RESULTS_MIME = 'application/vnd.doorstop.filter-results+json';

function item(uid: string, extra: Partial<FilterItem> = {}): FilterItem {
  return {
    uid,
    documentPrefix: 'REQ',
    level: '1.1',
    header: `Header of ${uid}`,
    text: null,
    path: path.join(ROOT, 'reqs', `${uid}.yml`),
    values: ['approved', `Header of ${uid}`],
    ...extra,
  };
}

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);
const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

suite('Filter notebook results (022 US1/US2/US6)', () => {
  test('matches go to the results renderer as { columns, items }', () => {
    const response = { columns: ['status', 'header'], items: [item('REQ-001'), item('REQ-002')] };

    const output = resultOutput(response);

    assert.strictEqual(output.items.length, 1);
    assert.strictEqual(output.items[0].mime, RESULTS_MIME);
    assert.deepStrictEqual(JSON.parse(decode(output.items[0].data)), response);
  });

  test('says so when nothing matched', () => {
    const output = resultOutput({ columns: ['document', 'level', 'header'], items: [] });

    assert.strictEqual(output.items[0].mime, 'text/markdown');
    assert.strictEqual(decode(output.items[0].data), 'No items matched.');
  });

  test('the renderer is declared for that mime and ships with the extension', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
    const renderer = manifest.contributes.notebookRenderer.find((r: { id: string }) => r.id === 'doorstop-filter-results');

    assert.deepStrictEqual(renderer.mimeTypes, [RESULTS_MIME]);
    assert.strictEqual(renderer.requiresMessaging, 'always');
    assert.strictEqual(renderer.entrypoint, './dist/webview/filterResults/renderer.js');
    assert.ok(fs.existsSync(path.join(REPO_ROOT, 'src', 'webview', 'filterResults', 'renderer.js')));
  });

  test('a clicked UID opens its item file', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'filter-')), 'REQ-001.yml');
    fs.writeFileSync(file, 'text: hello\n');

    await openFilterItem(file);

    assert.strictEqual(vscode.window.activeTextEditor?.document.uri.fsPath.toLowerCase(), vscode.Uri.file(file).fsPath.toLowerCase());
  });

  test('a deleted item gives a message instead of failing', async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    const missing = path.join(os.tmpdir(), 'no-such-dir-022', 'REQ-404.yml');

    await openFilterItem(missing);

    assert.strictEqual(vscode.window.activeTextEditor, undefined);
  });
});

suite('Commands panel (022 FR-002)', () => {
  test('offers New Filter Notebook', () => {
    const commands = new DoorstopCommandsProvider().getChildren().map(node => node.command?.command);

    assert.ok(commands.includes('doorstop.newFilterNotebook'));
  });
});

suite('New filter notebook template (022 US1)', () => {
  test('is one help text cell followed by a simple and a complex example', () => {
    assert.deepStrictEqual(NEW_NOTEBOOK_CELLS.map(cell => cell.kind), ['markdown', 'filter', 'filter']);
    assert.ok(NEW_NOTEBOOK_CELLS[1].value.includes('# Simple'));
    for (const part of ['filters:', 'or:', 'not:', 'hasChild:', 'isEmpty()', 'order:']) {
      assert.ok(NEW_NOTEBOOK_CELLS[2].value.includes(part), `complex example shows ${part}`);
    }
  });

  test('the help text covers groups, relations and methods', () => {
    const help = NEW_NOTEBOOK_CELLS[0].value;
    for (const word of ['and:', 'or:', 'not:', 'hasChild', 'hasParent', 'contains', 'startsWith', 'isEmpty', 'isNotEmpty', 'filters:', 'order:']) {
      assert.ok(help.includes(word), `help mentions ${word}`);
    }
  });
});

suite('Filter notebook file (022 US5)', () => {
  const serializer = new FilterNotebookSerializer();

  test('round-trips text and filter cells', () => {
    const data = new vscode.NotebookData([
      new vscode.NotebookCellData(vscode.NotebookCellKind.Markup, '# Notes', 'markdown'),
      new vscode.NotebookCellData(vscode.NotebookCellKind.Code, 'document == "REQ"', 'yaml'),
    ]);

    const reopened = serializer.deserializeNotebook(serializer.serializeNotebook(data));

    assert.deepStrictEqual(
      reopened.cells.map(cell => [cell.kind, cell.value, cell.languageId]),
      [
        [vscode.NotebookCellKind.Markup, '# Notes', 'markdown'],
        [vscode.NotebookCellKind.Code, 'document == "REQ"', 'yaml'],
      ]
    );
  });

  test('never stores outputs', () => {
    const cell = new vscode.NotebookCellData(vscode.NotebookCellKind.Code, 'uid == "X"', 'yaml');
    cell.outputs = [new vscode.NotebookCellOutput([vscode.NotebookCellOutputItem.text('stale', 'text/markdown')])];

    const json = decode(serializer.serializeNotebook(new vscode.NotebookData([cell])));

    assert.deepStrictEqual(JSON.parse(json), { cells: [{ kind: 'filter', value: 'uid == "X"' }] });
    assert.ok(json.endsWith('\n'));
  });

  test('an empty file opens with no cells', () => {
    assert.strictEqual(serializer.deserializeNotebook(new Uint8Array()).cells.length, 0);
  });

  test('refuses files it cannot read instead of opening them empty', () => {
    assert.throws(() => serializer.deserializeNotebook(encode('{not json')), /Not a Doorstop filter notebook/);
    assert.throws(() => serializer.deserializeNotebook(encode('{}')), /missing "cells"/);
  });
});
