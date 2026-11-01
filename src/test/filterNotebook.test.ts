import * as assert from 'assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';

import { DoorstopCommandsProvider } from '../commandsProvider';
import { DoorstopApiError, DoorstopServer } from '../doorstopServer';
import { BatchItemResult, FilterItem } from '../doorstopTypes';
import { FilterCompletionProvider } from '../filterCompletion';
import { applyBatch, BatchUi, FilterNotebookSerializer, NEW_NOTEBOOK_CELLS, openFilterItem, resultOutput, runFilter } from '../filterNotebook';

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

// --- Spec 036: batch edit -------------------------------------------------------

interface StubElement {
  tag: string;
  type: string;
  checked: boolean;
  textContent: string;
  listeners: Record<string, () => void>;
}

suite('Batch edit renderer (036)', () => {
  const QUERY = 'filters: document == "REQ"\nedit: [{set: {status: "done"}}]\n';

  /** Renders a result with a DOM stub; returns the checkboxes (header first), buttons by label and posted messages. */
  function render(payload: Record<string, unknown>) {
    const source = fs.readFileSync(path.join(REPO_ROOT, 'src', 'webview', 'filterResults', 'renderer.js'), 'utf8')
      .replace('export const activate', 'const activate') + '\nreturn activate;';
    const created: StubElement[] = [];
    const make = (tag: string): unknown => {
      const element = {
        tag, type: '', checked: false, textContent: '', className: '', title: '', listeners: {} as Record<string, () => void>,
        append() { /* structure is not under test */ },
        replaceChildren() { /* ditto */ },
        appendChild: (child: unknown) => child,
        addEventListener(type: string, handler: () => void) { element.listeners[type] = handler; },
        createTHead: () => ({ insertRow: () => make('tr') }),
        createTBody: () => ({ insertRow: () => make('tr') }),
        insertCell: () => make('td'),
      };
      created.push(element);
      return element;
    };
    const posted: unknown[] = [];
    const activate = new Function('document', source)({ createElement: make }) as (context: unknown) => { renderOutputItem(output: unknown, element: unknown): void };
    activate({ postMessage: (message: unknown) => posted.push(message) })
      .renderOutputItem({ json: () => ({ columns: [], ...payload }) }, make('div'));
    const boxes = created.filter(e => e.tag === 'input');
    const button = (label: string) => created.find(e => e.tag === 'button' && e.textContent === label);
    return { boxes, button, posted };
  }

  const rows = [item('REQ-001'), item('REQ-002'), item('REQ-003')];

  // Spec 036 FR-001
  test('a result without an edit section has no checkboxes and no apply button', () => {
    const { boxes, button } = render({ items: rows, editable: false });
    assert.strictEqual(boxes.length, 0);
    assert.strictEqual(button('Apply to selected'), undefined);
    assert.ok(button('Open as document'));
  });

  // Spec 036 FR-001
  test('an editable result ticks every row; the header box ticks and unticks all', () => {
    const { boxes } = render({ items: rows, editable: true, query: QUERY });
    assert.strictEqual(boxes.length, 4);
    assert.ok(boxes.every(box => box.type === 'checkbox' && box.checked));

    const [all, ...rowBoxes] = boxes;
    all.checked = false;
    all.listeners.change();
    assert.ok(rowBoxes.every(box => !box.checked));
    all.checked = true;
    all.listeners.change();
    assert.ok(rowBoxes.every(box => box.checked));
  });

  // Spec 036 FR-002
  test('"Apply to selected" posts the ticked UIDs in table order with the cell text', () => {
    const { boxes, button, posted } = render({ items: rows, editable: true, query: QUERY });
    boxes[2].checked = false;
    button('Apply to selected')!.listeners.click();
    assert.deepStrictEqual(posted, [{ type: 'apply', query: QUERY, uids: ['REQ-001', 'REQ-003'] }]);
  });

  // Spec 036 FR-002
  test('the payload carries the cell text only for an editable result', () => {
    const payload = (editable: boolean) => JSON.parse(decode(resultOutput({ columns: [], items: rows, editable }, QUERY).items[0].data));
    assert.strictEqual(payload(true).query, QUERY);
    assert.strictEqual(payload(true).editable, true);
    assert.strictEqual(payload(false).query, undefined);
  });
});

suite('Batch edit flow (036)', () => {
  const QUERY = 'filters: document == "TST"\nedit: [{set: {testrun: "TR-2"}}]\n';
  type Doc = Pick<vscode.TextDocument, 'isDirty' | 'isUntitled' | 'languageId' | 'uri'>;
  const doc = (uri: vscode.Uri, languageId: string, isDirty = true, isUntitled = false): Doc => ({ uri, languageId, isDirty, isUntitled });

  interface Run {
    requests: { dryRun: boolean }[];
    log: string[];
    titles: string[];
    details?: string;
    changed: number;
  }

  /** Runs applyBatch against a fake server answering `dry` / `real` and a recording UI. */
  async function apply(options: {
    uids?: string[];
    documents?: Doc[];
    dry?: BatchItemResult[] | Error;
    real?: BatchItemResult[];
    confirm?: boolean;
    showDetails?: boolean;
  } = {}): Promise<Run> {
    const run: Run = { requests: [], log: [], titles: [], changed: 0 };
    const server = {
      request: async (_method: string, _path: string, body: { dryRun: boolean }) => {
        run.requests.push({ dryRun: body.dryRun });
        const answer = body.dryRun ? options.dry : options.real;
        if (answer instanceof Error) {
          throw answer;
        }
        return { results: answer ?? [], operations: ['set testrun'] };
      },
    } as unknown as Pick<DoorstopServer, 'request'>;
    const answer = async () => options.showDetails ? 'Show details' : undefined;
    const ui: BatchUi = {
      documents: () => (options.documents ?? []) as vscode.TextDocument[],
      info: async message => { run.log.push(`info: ${message}`); return answer(); },
      warning: async message => { run.log.push(`warning: ${message}`); return answer(); },
      error: async message => run.log.push(`error: ${message}`),
      confirm: async message => { run.log.push(`confirm: ${message}`); return options.confirm ?? true; },
      progress: (title, work) => { run.titles.push(title); return work(); },
      showDetails: async markdown => { run.details = markdown; },
    };
    await applyBatch(server, QUERY, options.uids ?? ['TST-001', 'TST-002'], () => run.changed++, ui);
    return run;
  }

  const result = (uid: string, status: BatchItemResult['status'], extra: Partial<BatchItemResult> = {}): BatchItemResult => ({ uid, status, ...extra });

  // Spec 036 FR-002
  test('nothing ticked: says so and sends nothing', async () => {
    const run = await apply({ uids: [] });
    assert.deepStrictEqual(run.log, ['info: Nothing selected.']);
    assert.strictEqual(run.requests.length, 0);
  });

  // Spec 036 FR-020
  test('an unsaved item file or Document View blocks the batch before any request', async () => {
    const run = await apply({
      documents: [
        doc(vscode.Uri.file(path.join(ROOT, 'tst', 'TST-001.yml')), 'yaml'),
        doc(vscode.Uri.from({ scheme: 'doorstop-document', path: '/REQ (document)' }), 'markdown'),
      ],
    });
    assert.strictEqual(run.requests.length, 0);
    assert.deepStrictEqual(run.log, ['error: Save or discard unsaved changes first: TST-001.yml, REQ (document)']);
  });

  // Spec 036 FR-020
  test('notebook cells, untitled editors, other languages and saved files do not block', async () => {
    const run = await apply({
      documents: [
        doc(vscode.Uri.from({ scheme: 'vscode-notebook-cell', path: path.join(ROOT, 'plan.doorstop-filter') }), 'yaml'),
        doc(vscode.Uri.from({ scheme: 'untitled', path: 'Untitled-1' }), 'markdown', true, true),
        doc(vscode.Uri.file(path.join(ROOT, 'notes.txt')), 'plaintext'),
        doc(vscode.Uri.file(path.join(ROOT, 'tst', 'TST-002.yml')), 'yaml', false),
      ],
      dry: [result('TST-001', 'changed')],
    });
    assert.deepStrictEqual(run.requests, [{ dryRun: true }, { dryRun: false }]);
  });

  // Spec 036 FR-010
  test('the confirmation names the operation and the counts; Cancel sends no real run', async () => {
    const run = await apply({ dry: [result('TST-001', 'changed'), result('TST-002', 'skipped')], confirm: false });
    assert.deepStrictEqual(run.log, ['confirm: Apply set testrun to 2 items? 1 will change, 1 will be skipped.']);
    assert.deepStrictEqual(run.requests, [{ dryRun: true }]);
    assert.strictEqual(run.changed, 0);
  });

  // Spec 036 FR-010
  test('the confirmation counts items that will be overwritten', async () => {
    const run = await apply({ dry: [result('TST-001', 'overwritten'), result('TST-002', 'created')], confirm: false });
    assert.ok(run.log[0].endsWith('2 will change, 0 will be skipped, 1 existing item will be overwritten.'), run.log[0]);
  });

  // Spec 036 FR-014, FR-016
  test('after the run: summary, details on request, one refresh', async () => {
    const real = [
      result('TST-001', 'changed'),
      result('TST-002', 'skipped', { reason: 'field missing: testrun' }),
      result('TST-003', 'failed', { reason: 'Permission denied' }),
      result('REQ-001', 'created', { created: 'TST-004' }),
    ];
    const run = await apply({ uids: ['TST-001', 'TST-002', 'TST-003', 'REQ-001'], dry: real, real, showDetails: true });

    assert.strictEqual(run.log[1], 'warning: Batch edit: 2 changed, 1 skipped, 1 failed.');
    assert.strictEqual(run.changed, 1);
    for (const line of ['| TST-002 | skipped | field missing: testrun |  |', '| TST-003 | failed | Permission denied |  |', '| REQ-001 | created |  | TST-004 |']) {
      assert.ok(run.details?.includes(line), line);
    }
  });

  // Spec 036 FR-015
  test('both requests run under the delayed progress notification', async () => {
    const run = await apply({ dry: [result('TST-001', 'changed')], real: [result('TST-001', 'changed')] });
    assert.deepStrictEqual(run.titles, ['Doorstop: Batch edit…', 'Doorstop: Batch edit…']);
    assert.strictEqual(run.log[1], 'info: Batch edit: 1 changed, 0 skipped, 0 failed.');
  });

  // Spec 036 FR-003
  test('a rejected edit shows the server message and writes nothing', async () => {
    const run = await apply({ dry: new DoorstopApiError('INVALID_EDIT', 'Unknown edit operation `apendEntry`.', 400) });
    assert.deepStrictEqual(run.log, ['error: Batch edit failed: Unknown edit operation `apendEntry`.']);
    assert.deepStrictEqual(run.requests, [{ dryRun: true }]);
    assert.strictEqual(run.changed, 0);
  });

  // Spec 036 FR-010, FR-019
  test('a second Apply while a batch waits for its confirmation sends nothing', async () => {
    const requests: boolean[] = [];
    const messages: string[] = [];
    let answer: (apply: boolean) => void = () => undefined;
    const server = {
      request: async (_method: string, _path: string, body: { dryRun: boolean }) => {
        requests.push(body.dryRun);
        return { results: [result('REQ-001', 'created', { created: 'TST-004' })], operations: ['generateChildren (blank)'] };
      },
    } as unknown as Pick<DoorstopServer, 'request'>;
    const ui: BatchUi = {
      documents: () => [],
      info: async message => { messages.push(message); return undefined; },
      warning: async () => undefined,
      error: async () => undefined,
      confirm: () => new Promise<boolean>(resolve => { answer = resolve; }),
      progress: (_title, work) => work(),
      showDetails: async () => undefined,
    };

    const first = applyBatch(server, QUERY, ['REQ-001'], undefined, ui);
    await new Promise(resolve => setTimeout(resolve, 0));  // the first now waits on its confirmation
    await applyBatch(server, QUERY, ['REQ-001'], undefined, ui);
    assert.deepStrictEqual(messages, ['A batch edit is already running.']);
    assert.deepStrictEqual(requests, [true]);

    answer(true);
    await first;
    assert.deepStrictEqual(requests, [true, false]);
    await applyBatch(server, QUERY, [], undefined, ui);
    assert.strictEqual(messages.at(-1), 'Nothing selected.', 'the guard is released afterwards');
  });
});

suite('Edit section autocomplete (036)', () => {
  const tree = {
    documents: [
      { prefix: 'REQ', markerPath: '', items: [] },
      { prefix: 'TST', markerPath: '', items: [] },
    ],
  };
  let requests: string[];
  let provider: FilterCompletionProvider;

  setup(() => {
    requests = [];
    provider = new FilterCompletionProvider({
      request: async (_method: string, pathName: string) => {
        requests.push(pathName);
        return pathName === '/tree' ? tree : { attributes: { status: ['done', 'open'], testruns: ['TR-1'] } };
      },
    } as unknown as DoorstopServer);
  });

  async function labels(content: string): Promise<string[]> {
    const document = await vscode.workspace.openTextDocument({ language: 'yaml', content });
    const last = document.lineCount - 1;
    const items = await provider.provideCompletionItems(document, new vscode.Position(last, document.lineAt(last).text.length));
    return (items ?? []).map(i => String(i.label));
  }

  const CELL = 'filters: document == "TST"\nedit:\n';

  // Spec 036 FR-017
  test('a top-level line offers edit: next to filters:', async () => {
    const offered = await labels('');
    assert.ok(offered.includes('edit:') && offered.includes('filters:'));
  });

  // Spec 036 FR-017
  test('edit: is not offered again once the cell has it', async () => {
    const offered = await labels(`${CELL}  - set: {status: done}\n`);
    assert.ok(offered.includes('order:'), 'other top-level keys still offered after the section');
    assert.ok(!offered.includes('edit:'));
  });

  // Spec 036 FR-017
  test('a list entry under edit: offers the six operations, not comparison operators', async () => {
    assert.deepStrictEqual(await labels(`${CELL}  - `), ['set', 'add', 'remove', 'appendEntry', 'removeEntry', 'generateChildren']);
    assert.deepStrictEqual(await labels(`${CELL}  - set `), []);
  });

  // Spec 036 FR-017
  test('field names: custom fields, plus settable standard ones only for set, never forbidden ones', async () => {
    const forSet = await labels(`${CELL}  - set: {`);
    for (const name of ['status', 'testruns', 'active', 'normative', 'derived', 'level', 'text', 'ref']) {
      assert.ok(forSet.includes(name), name);
    }
    for (const name of ['uid', 'links', 'header', 'reviewed']) {
      assert.ok(!forSet.includes(name), name);
    }
    assert.deepStrictEqual(await labels(`${CELL}  - appendEntry: {`), ['status', 'testruns']);
    assert.deepStrictEqual(await labels(`${CELL}  - add:\n      `), ['status', 'testruns']);
  });

  // Spec 036 FR-017
  test('values: the existing values or list entries of the field', async () => {
    assert.deepStrictEqual(await labels(`${CELL}  - appendEntry: {testruns: `), ['TR-1']);
    assert.deepStrictEqual(await labels(`${CELL}  - set: {status: "done", testruns: `), ['TR-1']);
    assert.deepStrictEqual(await labels(`${CELL}  - set:\n      status: `), ['done', 'open']);
  });

  // Spec 036 FR-017
  test('generateChildren offers its options and document prefixes', async () => {
    assert.deepStrictEqual(await labels(`${CELL}  - generateChildren: {`), ['document', 'force', 'blank']);
    assert.deepStrictEqual(await labels(`${CELL}  - generateChildren: {document: `), ['REQ', 'TST']);
    assert.deepStrictEqual(await labels(`${CELL}  - generateChildren: {document: "TST", force: `), ['true', 'false']);
  });

  // Spec 036 FR-017, FR-021
  test('text values are inserted in double quotes, true/false and field names are not', async () => {
    /** insertText of each suggestion at the end of `content`, and the text the first one replaces. */
    async function inserted(content: string): Promise<{ texts: string[]; replaces: string }> {
      const document = await vscode.workspace.openTextDocument({ language: 'yaml', content });
      const last = document.lineCount - 1;
      const items = await provider.provideCompletionItems(document, new vscode.Position(last, document.lineAt(last).text.length)) ?? [];
      const texts = items.map(i => typeof i.insertText === 'string' ? i.insertText : i.insertText?.value ?? String(i.label));
      return { texts, replaces: document.getText(items[0]?.range as vscode.Range) };
    }

    assert.deepStrictEqual((await inserted(`${CELL}  - appendEntry: {testruns: TR`)), { texts: ['"TR-1"'], replaces: 'TR' });
    assert.deepStrictEqual((await inserted(`${CELL}  - appendEntry: {testruns: "TR`)), { texts: ['TR-1'], replaces: 'TR' });
    assert.deepStrictEqual((await inserted(`${CELL}  - generateChildren: {document: `)).texts, ['"REQ"', '"TST"']);
    assert.deepStrictEqual((await inserted(`${CELL}  - generateChildren: {force: `)).texts, ['true', 'false']);
    assert.deepStrictEqual((await inserted(`${CELL}  - remove: `)).texts, ['status', 'testruns']);
    const set = (await inserted(`${CELL}  - `)).texts[0];
    assert.strictEqual(set, 'set: {${1:field}: "${2:value}"}');

    // Existing numbers and true/false keep their type: unquoted.
    provider = new FilterCompletionProvider({
      request: async (_method: string, pathName: string) =>
        pathName === '/tree' ? tree : { attributes: { priority: ['3'], flag: ['True'], testruns: ['TR-1'] } },
    } as unknown as DoorstopServer);
    assert.deepStrictEqual((await inserted(`${CELL}  - set: {priority: `)).texts, ['3']);
    assert.deepStrictEqual((await inserted(`${CELL}  - set: {flag: `)).texts, ['True']);
    assert.deepStrictEqual((await inserted(`${CELL}  - set: {testruns: `)).texts, ['"TR-1"']);
  });

  // Spec 036 FR-017, SC-006
  test('edit suggestions use the same cached item data', async () => {
    await labels(`${CELL}  - set: {`);
    await labels(`${CELL}  - appendEntry: {testruns: `);
    await labels(`${CELL}  - generateChildren: {document: `);
    assert.deepStrictEqual(requests.sort(), ['/filter/vocabulary', '/tree']);
  });
});
