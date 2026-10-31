import * as assert from 'assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';

import { DoorstopCommandsProvider } from '../commandsProvider';
import { DoorstopApiError, DoorstopServer } from '../doorstopServer';
import { FilterItem } from '../doorstopTypes';
import { FilterCompletionProvider } from '../filterCompletion';
import { FilterNotebookSerializer, NEW_NOTEBOOK_CELLS, openFilterItem, resultOutput, runFilter } from '../filterNotebook';

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
  // Spec 022 FR-004
  test('matches go to the results renderer as { columns, items }', () => {
    const response = { columns: ['status', 'header'], items: [item('REQ-001'), item('REQ-002')] };

    const output = resultOutput(response);

    assert.strictEqual(output.items.length, 1);
    assert.strictEqual(output.items[0].mime, RESULTS_MIME);
    assert.deepStrictEqual(JSON.parse(decode(output.items[0].data)), response);
  });

  // Spec 022 FR-004
  test('says so when nothing matched', () => {
    const output = resultOutput({ columns: ['document', 'level', 'header'], items: [] });

    assert.strictEqual(output.items[0].mime, 'text/markdown');
    assert.strictEqual(decode(output.items[0].data), 'No items matched.');
  });

  // Spec 022 FR-005
  test('the renderer is declared for that mime and ships with the extension', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
    const renderer = manifest.contributes.notebookRenderer.find((r: { id: string }) => r.id === 'doorstop-filter-results');

    assert.deepStrictEqual(renderer.mimeTypes, [RESULTS_MIME]);
    assert.strictEqual(renderer.requiresMessaging, 'always');
    assert.strictEqual(renderer.entrypoint, './dist/webview/filterResults/renderer.js');
    assert.ok(fs.existsSync(path.join(REPO_ROOT, 'src', 'webview', 'filterResults', 'renderer.js')));
  });

  // Spec 022 FR-005
  test('a clicked UID opens its item file', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'filter-')), 'REQ-001.yml');
    fs.writeFileSync(file, 'text: hello\n');

    await openFilterItem(file);

    assert.strictEqual(vscode.window.activeTextEditor?.document.uri.fsPath.toLowerCase(), vscode.Uri.file(file).fsPath.toLowerCase());
  });

  // Spec 022 FR-005
  test('a deleted item gives a message instead of failing', async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    const missing = path.join(os.tmpdir(), 'no-such-dir-022', 'REQ-404.yml');

    await openFilterItem(missing);

    assert.strictEqual(vscode.window.activeTextEditor, undefined);
  });
});

suite('Commands panel (022 FR-002)', () => {
  // Spec 022 FR-002
  test('offers New Filter Notebook', () => {
    const commands = new DoorstopCommandsProvider().getChildren().map(node => node.command?.command);

    assert.ok(commands.includes('doorstop.newFilterNotebook'));
  });
});

suite('New filter notebook template (022 US1)', () => {
  // Spec 022 FR-002
  test('is one help text cell followed by a simple and a complex example', () => {
    assert.deepStrictEqual(NEW_NOTEBOOK_CELLS.map(cell => cell.kind), ['markdown', 'filter', 'filter']);
    assert.ok(NEW_NOTEBOOK_CELLS[1].value.includes('# Simple'));
    for (const part of ['filters:', 'or:', 'not:', 'hasChild:', 'isEmpty()', 'order:']) {
      assert.ok(NEW_NOTEBOOK_CELLS[2].value.includes(part), `complex example shows ${part}`);
    }
  });

  // Spec 022 FR-002
  test('the help text covers groups, relations and methods', () => {
    const help = NEW_NOTEBOOK_CELLS[0].value;
    for (const word of ['and:', 'or:', 'not:', 'hasChild', 'hasParent', 'contains', 'startsWith', 'isEmpty', 'isNotEmpty', 'filters:', 'order:']) {
      assert.ok(help.includes(word), `help mentions ${word}`);
    }
  });
});

suite('Filter notebook file (022 US5)', () => {
  const serializer = new FilterNotebookSerializer();

  // Spec 022 FR-001, FR-013
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

  // Spec 022 FR-014
  test('never stores outputs', () => {
    const cell = new vscode.NotebookCellData(vscode.NotebookCellKind.Code, 'uid == "X"', 'yaml');
    cell.outputs = [new vscode.NotebookCellOutput([vscode.NotebookCellOutputItem.text('stale', 'text/markdown')])];

    const json = decode(serializer.serializeNotebook(new vscode.NotebookData([cell])));

    assert.deepStrictEqual(JSON.parse(json), { cells: [{ kind: 'filter', value: 'uid == "X"' }] });
    assert.ok(json.endsWith('\n'));
  });

  // Spec 022 FR-013
  test('an empty file opens with no cells', () => {
    assert.strictEqual(serializer.deserializeNotebook(new Uint8Array()).cells.length, 0);
  });

  // Spec 022 FR-013
  test('refuses files it cannot read instead of opening them empty', () => {
    assert.throws(() => serializer.deserializeNotebook(encode('{not json')), /Not a Doorstop filter notebook/);
    assert.throws(() => serializer.deserializeNotebook(encode('{}')), /missing "cells"/);
  });
});

suite('Filter result "Open as document" (030)', () => {
  /** Runs the renderer's `renderOutputItem` against a minimal DOM stub; returns what it drew and posted. */
  function render(items: FilterItem[]): { buttons: { text: string; click: () => void }[]; posted: unknown[] } {
    const source = fs.readFileSync(path.join(REPO_ROOT, 'src', 'webview', 'filterResults', 'renderer.js'), 'utf8')
      .replace('export const activate', 'const activate') + '\nreturn activate;';
    const buttons: { text: string; click: () => void }[] = [];
    const makeElement = (tag: string): Record<string, unknown> => {
      const element: Record<string, unknown> = {
        tag, className: '', textContent: '', children: [],
        append() { /* DOM structure is not under test */ },
        replaceChildren() { /* ditto */ },
        appendChild() { /* ditto */ },
        addEventListener(type: string, handler: () => void) {
          if (tag === 'button' && type === 'click') {
            buttons.push({ get text() { return element.textContent as string; }, click: handler });
          }
        },
        createTHead: () => ({ insertRow: () => ({ appendChild() { /* ditto */ } }) }),
        createTBody: () => ({ insertRow: () => ({ insertCell: () => ({ appendChild() { /* ditto */ } }) }) })
      };
      return element;
    };
    const documentStub = { createElement: makeElement };
    const posted: unknown[] = [];
    const activate = new Function('document', source)(documentStub) as (context: unknown) => { renderOutputItem(output: unknown, element: unknown): void };
    activate({ postMessage: (message: unknown) => posted.push(message) })
      .renderOutputItem({ json: () => ({ columns: [], items }) }, makeElement('div'));
    return { buttons, posted };
  }

  // Spec 030 FR-009
  test('a non-empty result draws a button that posts every row UID', () => {
    const { buttons, posted } = render([item('REQ-001'), item('REQ-002')]);
    const open = buttons.find(button => button.text === 'Open as document');
    assert.ok(open, 'button drawn');
    open.click();
    assert.deepStrictEqual(posted, [{ type: 'openDocument', uids: ['REQ-001', 'REQ-002'] }]);
  });

  // Spec 030 FR-011
  test('an empty result is plain text without any document button', () => {
    const output = resultOutput({ columns: [], items: [] });
    assert.strictEqual(output.items[0].mime, 'text/markdown');
    assert.strictEqual(decode(output.items[0].data), 'No items matched.');
  });
});

suite('Filter cell errors (022 FR-011/FR-012)', () => {
  const ERROR_MIME = 'application/vnd.code.notebook.error';
  const failing = (error: Error) => ({ request: async () => { throw error; } });
  const answering = { request: async () => ({ columns: ['document'], items: [item('REQ-001')] }) } as unknown as Pick<DoorstopServer, 'request'>;

  // Spec 022 FR-012
  test('an unreachable server gives an error output, not a table', async () => {
    const { success, output } = await runFilter(failing(new Error('connect ECONNREFUSED')), 'reviewed == false');

    assert.strictEqual(success, false);
    assert.deepStrictEqual(output.items.map(i => i.mime), [ERROR_MIME]);
    assert.ok(decode(output.items[0].data).includes('Doorstop server is not available'));
  });

  // Spec 022 FR-011
  test('an unparseable filter errors in its own cell only', async () => {
    const bad = await runFilter(failing(new DoorstopApiError('INVALID_FILTER', 'Invalid YAML at line 2', 400)), 'and: [');
    const good = await runFilter(answering, 'document == "REQ"');

    assert.strictEqual(bad.success, false);
    assert.strictEqual(bad.output.items[0].mime, ERROR_MIME);
    assert.ok(decode(bad.output.items[0].data).includes('Invalid YAML at line 2'));
    assert.strictEqual(good.success, true);
    assert.strictEqual(good.output.items[0].mime, RESULTS_MIME);
  });
});

suite('Filter cell autocomplete (022 FR-016)', () => {
  const tree = {
    documents: [
      { prefix: 'REQ', markerPath: '', items: [{ uid: 'REQ-001', path: '', level: '1.1', header: 'Login', links: [] }] },
      { prefix: 'TST', markerPath: '', items: [{ uid: 'TST-001', path: '', level: '1.1', text: 'test', links: [{ uid: 'REQ-001' }] }] },
    ],
  };
  let requests: string[];
  let provider: FilterCompletionProvider;

  setup(() => {
    requests = [];
    provider = new FilterCompletionProvider({
      request: async (_method: string, pathName: string) => {
        requests.push(pathName);
        return pathName === '/tree' ? tree : { attributes: { status: ['approved', 'draft'], 'invented-by': [] } };
      },
    } as unknown as DoorstopServer);
  });

  /** Labels offered at the end of the last line of `content`. */
  async function labels(content: string): Promise<string[]> {
    const document = await vscode.workspace.openTextDocument({ language: 'yaml', content });
    const last = document.lineCount - 1;
    const items = await provider.provideCompletionItems(document, new vscode.Position(last, document.lineAt(last).text.length));
    return (items ?? []).map(i => String(i.label));
  }

  // Spec 022 FR-016
  test('a new line offers structure keys and all attribute names', async () => {
    const offered = await labels('');
    for (const label of ['filters:', 'order:', 'and:', 'or:', 'not:', 'hasChild:', 'hasParent:', 'uid', 'reviewed', 'status', 'invented-by']) {
      assert.ok(offered.includes(label), `offers ${label}`);
    }
  });

  // Spec 022 FR-016
  test('an order: list offers attribute names only', async () => {
    for (const content of ['order: [level, ', 'filters: uid == "x"\norder:\n  - level\n  - ']) {
      const offered = await labels(content);
      assert.ok(offered.includes('status') && offered.includes('header'), content);
      assert.ok(!offered.includes('and:'), content);
    }
  });

  // Spec 022 FR-016
  test('after an attribute come operators and methods', async () => {
    assert.deepStrictEqual(await labels('  - status '), ['==', '!=', '<', '<=', '>', '>=']);
    assert.deepStrictEqual(await labels('hasChild: header.'), ['contains', 'startsWith', 'isEmpty', 'isNotEmpty']);
  });

  // Spec 022 FR-016
  test('values: document prefixes, UIDs and existing custom values', async () => {
    assert.deepStrictEqual(await labels('document == "'), ['REQ', 'TST']);
    assert.deepStrictEqual(await labels('uid != "RE'), ['REQ-001', 'TST-001']);
    assert.deepStrictEqual(await labels('links.contains("'), ['REQ-001', 'TST-001']);
    assert.deepStrictEqual(await labels('  - status == "'), ['approved', 'draft']);
  });

  // Spec 022 FR-016, SC-007
  test('item data is loaded once, not per keystroke, until invalidated', async () => {
    await labels('status == "');
    await labels('status == "d');
    await labels('');
    assert.deepStrictEqual(requests.sort(), ['/filter/vocabulary', '/tree']);

    provider.invalidate();
    await labels('');
    assert.strictEqual(requests.length, 4);
  });
});
