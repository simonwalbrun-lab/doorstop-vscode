import * as vscode from 'vscode';

import { DoorstopApiError, DoorstopServer } from './doorstopServer';
import { registerFilterCompletion } from './filterCompletion';
import { withDelayedProgress } from './progress';
import { measure, registerCommand } from './timing';
import { BatchItemResult, BatchResponse, FilterResponse } from './doorstopTypes';

/**
 * Filter notebooks (spec 022): every code cell is one YAML filter shaped like
 * an Obsidian Bases `filters:` block. Running a cell hands its text to the
 * server's `POST /filter`, which parses and evaluates it against the Doorstop
 * tree (constitution principle I) - this module only stores cells and hands
 * the returned rows to the results renderer. File format and outputs:
 * specs/022-filter-notebooks/contracts/notebook-file.md.
 */

const NOTEBOOK_TYPE = 'doorstop-filter';

interface StoredCell {
  kind: 'markdown' | 'filter';
  value: string;
}

const HELP = [
  '# Doorstop filter',
  '',
  'Each code cell below is **one filter**. Run it with ▶ (or Ctrl+Enter) to list every',
  'Doorstop item that matches it; click a UID to open the item. Filters are YAML, shaped',
  'like Obsidian Bases filters.',
  '',
  '**Conditions**: `attribute <op> value` with `==` `!=` `<` `<=` `>` `>=`, or',
  '`attribute.contains("…")`, `attribute.startsWith("…")`, `attribute.isEmpty()`,',
  '`attribute.isNotEmpty()`.',
  '',
  '**Attributes**: `uid`, `document`, `level`, `header`, `text`, `ref`, `active`,',
  '`normative`, `derived`, `reviewed`, `links` - plus any custom attribute of your items',
  '(e.g. `status`, `invented-by`). Write levels as strings: `level >= "1.2"`.',
  '',
  '**Groups**: `and:` (all match), `or:` (any matches), `not:` (none matches) - each takes',
  'a list and nests freely. `hasChild:` / `hasParent:` take one filter and match when a',
  'direct child (an item linking here) or parent (an item linked to) matches it.',
  '',
  '**Columns**: wrap the filter in `filters:` and list the columns under `order:`',
  '(UID always comes first). Without `order:` the table shows document, level and header.',
  '',
  '**Autocomplete**: press Ctrl+Space for keys, attribute names, operators and values',
  '(document prefixes, UIDs, existing values of custom attributes).',
  '',
  '**Batch edit**: next to `filters:` add an `edit:` list of `set`, `add`, `remove`,',
  '`appendEntry`, `removeEntry` or `generateChildren`, e.g. `edit: [{set: {testrun: "TR-1"}}]`.',
  'Text values go in double quotes like in filters; numbers, `true`/`false` and dates do not.',
  'The result then has a checkbox per row; tick the items and press **Apply to selected**.',
  '',
  'The two cells below are a **simple** and a **complex** example - run them, then edit',
  'them or add your own cells. `#` starts a comment.',
].join('\n');

const SIMPLE_EXAMPLE = [
  '# Simple: every item that has not been reviewed yet',
  'reviewed == false',
  '',
].join('\n');

const COMPLEX_EXAMPLE = [
  '# Complex: active, normative items that still need work - not reviewed yet',
  '# or without a ref - leaving out change-log entries, and only those that',
  '# something links to (they have a child). The table shows chosen columns.',
  'filters:',
  '  and:',
  '    - active == true',
  '    - normative == true',
  '    - or:',
  '        - reviewed == false',
  '        - ref.isEmpty()',
  '    - not:',
  '        - header.startsWith("Change log")',
  '    - hasChild: active == true',
  'order: [level, header, reviewed, links]',
  '',
].join('\n');

// Keep the examples in sync with NEW_NOTEBOOK_EXAMPLES in server/tests/test_filter.py.
export const NEW_NOTEBOOK_CELLS: StoredCell[] = [
  { kind: 'markdown', value: HELP },
  { kind: 'filter', value: SIMPLE_EXAMPLE },
  { kind: 'filter', value: COMPLEX_EXAMPLE },
];

const EMPTY_CELL_HINT = 'Write a filter, e.g. `document == "REQ"`, then run the cell.';

function toCellData(cell: StoredCell): vscode.NotebookCellData {
  return cell.kind === 'markdown'
    ? new vscode.NotebookCellData(vscode.NotebookCellKind.Markup, cell.value, 'markdown')
    : new vscode.NotebookCellData(vscode.NotebookCellKind.Code, cell.value, 'yaml');
}

export class FilterNotebookSerializer implements vscode.NotebookSerializer {
  deserializeNotebook(content: Uint8Array): vscode.NotebookData {
    const text = new TextDecoder().decode(content);
    if (!text.trim()) {
      return new vscode.NotebookData([]);
    }
    let parsed: { cells?: unknown } | null;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new Error(`Not a Doorstop filter notebook: ${error instanceof Error ? error.message : String(error)}`);
    }
    // Throwing (instead of opening empty) keeps VS Code from ever saving over
    // a file it could not read (constitution principle III).
    if (!Array.isArray(parsed?.cells)) {
      throw new Error('Not a Doorstop filter notebook: missing "cells" array');
    }
    return new vscode.NotebookData((parsed.cells as StoredCell[]).map(cell => toCellData({
      kind: cell.kind === 'markdown' ? 'markdown' : 'filter',
      value: String(cell.value ?? ''),
    })));
  }

  serializeNotebook(data: vscode.NotebookData): Uint8Array {
    // Outputs are never stored: a reopened notebook must not show stale results (FR-014).
    const cells: StoredCell[] = data.cells.map(cell => ({
      kind: cell.kind === vscode.NotebookCellKind.Markup ? 'markdown' : 'filter',
      value: cell.value,
    }));
    return new TextEncoder().encode(JSON.stringify({ cells }, null, 2) + '\n');
  }
}

/** Mime of the result payload drawn by src/webview/filterResults/renderer.js. */
const RESULTS_MIME = 'application/vnd.doorstop.filter-results+json';
const RENDERER_ID = 'doorstop-filter-results';

function markdownOutput(markdown: string): vscode.NotebookCellOutput {
  return new vscode.NotebookCellOutput([vscode.NotebookCellOutputItem.text(markdown, 'text/markdown')]);
}

/**
 * Matches go to the results renderer: VS Code ignores `file:` links in
 * notebook outputs, so a UID click is posted back and handled by openFilterItem.
 */
export function resultOutput(response: FilterResponse, query?: string): vscode.NotebookCellOutput {
  if (response.items.length === 0) {
    return markdownOutput('No items matched.');
  }
  // `query` goes along so "Apply to selected" runs the edit as it was when the table was made (spec 036).
  const payload = { columns: response.columns, items: response.items, editable: response.editable, query: response.editable ? query : undefined };
  return new vscode.NotebookCellOutput([vscode.NotebookCellOutputItem.json(payload, RESULTS_MIME)]);
}

/** One cell's run: its output and whether it succeeded. Cells never share state. */
export async function runFilter(
  server: Pick<DoorstopServer, 'request'>,
  query: string
): Promise<{ success: boolean; output: vscode.NotebookCellOutput }> {
  if (!query.trim()) {
    return { success: true, output: markdownOutput(EMPTY_CELL_HINT) };
  }
  try {
    const response = await measure('filter.execute', () => server.request<FilterResponse>('POST', '/filter', { query }));
    return { success: true, output: resultOutput(response, query) };
  } catch (error) {
    // Never a table on failure - an empty or stale table would read as "no matches".
    const message = error instanceof DoorstopApiError
      ? error.message
      : `Doorstop server is not available: ${error instanceof Error ? error.message : String(error)}`;
    return {
      success: false,
      output: new vscode.NotebookCellOutput([vscode.NotebookCellOutputItem.error(
        Object.assign(new Error(message), { name: 'Filter failed', stack: undefined })
      )]),
    };
  }
}

export async function openFilterItem(path: string): Promise<void> {
  const uri = vscode.Uri.file(path);
  try {
    await vscode.workspace.fs.stat(uri);
  } catch {
    void vscode.window.showWarningMessage(`Item no longer exists: ${path}`);
    return;
  }
  await vscode.window.showTextDocument(uri, { preview: false });
}

/** What applyBatch shows and asks; tests pass their own (spec 036). */
export interface BatchUi {
  documents(): readonly vscode.TextDocument[];
  info(message: string, ...actions: string[]): Thenable<string | undefined>;
  warning(message: string, ...actions: string[]): Thenable<string | undefined>;
  error(message: string): Thenable<unknown>;
  /** A modal question; true when `action` was chosen. */
  confirm(message: string, action: string): Thenable<boolean>;
  progress<T>(title: string, work: () => Promise<T>): Promise<T>;
  showDetails(markdown: string): Thenable<unknown>;
}

const vscodeBatchUi: BatchUi = {
  documents: () => vscode.workspace.textDocuments,
  info: (message, ...actions) => vscode.window.showInformationMessage(message, ...actions),
  warning: (message, ...actions) => vscode.window.showWarningMessage(message, ...actions),
  error: message => vscode.window.showErrorMessage(message),
  confirm: async (message, action) => await vscode.window.showWarningMessage(message, { modal: true }, action) === action,
  progress: (title, work) => withDelayedProgress(title, () => work()),
  showDetails: async markdown => vscode.window.showTextDocument(await vscode.workspace.openTextDocument({ language: 'markdown', content: markdown })),
};

/**
 * An open item file or Document View with unsaved changes (spec 036 FR-020).
 * Notebook cells - the filter cell itself is usually unsaved - and untitled
 * documents, such as an earlier batch's details, do not count.
 */
function blocksBatch(document: vscode.TextDocument): boolean {
  return document.isDirty && !document.isUntitled && document.uri.scheme !== 'vscode-notebook-cell'
    && (document.languageId === 'markdown' || document.languageId === 'yaml');
}

const WILL_CHANGE = new Set<BatchItemResult['status']>(['changed', 'created', 'overwritten']);

function detailsMarkdown(results: BatchItemResult[]): string {
  const cell = (text?: string | null) => (text ?? '').replace(/\|/g, '\\|');
  return ['# Batch edit', '', '| UID | Status | Reason | Created |', '| --- | --- | --- | --- |',
    ...results.map(r => `| ${r.uid} | ${r.status} | ${cell(r.reason)} | ${cell(r.created)} |`), ''].join('\n');
}

/**
 * "Apply to selected" (spec 036): unsaved-files check, dry run, confirmation,
 * the real run, summary. The server parses and applies the edit (constitution I).
 */
export async function applyBatch(
  server: Pick<DoorstopServer, 'request'>,
  query: string,
  uids: string[],
  onChanged?: () => void,
  ui: BatchUi = vscodeBatchUi
): Promise<void> {
  // A second click while the first batch waits for its confirmation would run
  // it twice; with `blank` that creates every child item twice.
  if (batchRunning) {
    void ui.info('A batch edit is already running.');
    return;
  }
  batchRunning = true;
  try {
    await runBatch(server, query, uids, onChanged, ui);
  } finally {
    batchRunning = false;
  }
}

let batchRunning = false;

async function runBatch(
  server: Pick<DoorstopServer, 'request'>,
  query: string,
  uids: string[],
  onChanged: (() => void) | undefined,
  ui: BatchUi
): Promise<void> {
  if (uids.length === 0) {
    void ui.info('Nothing selected.');
    return;
  }
  const unsaved = ui.documents().filter(blocksBatch).map(d => d.uri.path.slice(d.uri.path.lastIndexOf('/') + 1));
  if (unsaved.length > 0) {
    void ui.error(`Save or discard unsaved changes first: ${unsaved.slice(0, 3).join(', ')}${unsaved.length > 3 ? ', …' : ''}`);
    return;
  }
  const send = (dryRun: boolean) => ui.progress('Doorstop: Batch edit…',
    () => server.request<BatchResponse>('POST', '/batch', { query, uids, dryRun }));
  const failed = (error: unknown) => void ui.error(`Batch edit failed: ${error instanceof Error ? error.message : String(error)}`);

  let planned: BatchResponse;
  try {
    planned = await send(true);
  } catch (error) {
    failed(error);
    return;
  }
  const changing = planned.results.filter(r => WILL_CHANGE.has(r.status)).length;
  const overwriting = planned.results.filter(r => r.status === 'overwritten').length;
  const question = `Apply ${planned.operations.join('; ')} to ${uids.length} ${uids.length === 1 ? 'item' : 'items'}? `
    + `${changing} will change, ${uids.length - changing} will be skipped`
    + (overwriting > 0 ? `, ${overwriting} existing ${overwriting === 1 ? 'item' : 'items'} will be overwritten.` : '.');
  if (!await ui.confirm(question, 'Apply')) {
    return;
  }

  let done: BatchResponse;
  try {
    done = await send(false);
  } catch (error) {
    failed(error);
    return;
  } finally {
    // A rejected real run may still have written some items.
    onChanged?.();
  }
  const changed = done.results.filter(r => WILL_CHANGE.has(r.status)).length;
  const failures = done.results.filter(r => r.status === 'failed').length;
  const summary = `Batch edit: ${changed} changed, ${done.results.length - changed - failures} skipped, ${failures} failed.`;
  const show = await (failures > 0 ? ui.warning(summary, 'Show details') : ui.info(summary, 'Show details'));
  if (show === 'Show details') {
    await ui.showDetails(detailsMarkdown(done.results));
  }
}

export function registerFilterNotebook(context: vscode.ExtensionContext, server: DoorstopServer, onChanged?: () => void): void {
  const controller = vscode.notebooks.createNotebookController(
    'doorstop-filter-controller',
    NOTEBOOK_TYPE,
    'Doorstop Filter'
  );
  controller.supportedLanguages = ['yaml'];
  controller.supportsExecutionOrder = true;
  let executionOrder = 0;

  const runCell = async (cell: vscode.NotebookCell): Promise<void> => {
    const execution = controller.createNotebookCellExecution(cell);
    execution.executionOrder = ++executionOrder;
    execution.start(Date.now());
    const { success, output } = await runFilter(server, cell.document.getText());
    await execution.replaceOutput(output);
    execution.end(success, Date.now());
  };
  registerFilterCompletion(context, server);
  controller.executeHandler = async cells => {
    for (const cell of cells) {
      await runCell(cell);
    }
  };

  context.subscriptions.push(
    controller,
    vscode.workspace.registerNotebookSerializer(NOTEBOOK_TYPE, new FilterNotebookSerializer(), { transientOutputs: true }),
    vscode.notebooks.createRendererMessaging(RENDERER_ID).onDidReceiveMessage(event => {
      if (event.message?.type === 'open' && typeof event.message.path === 'string') {
        void openFilterItem(event.message.path);
      } else if (event.message?.type === 'openDocument') {
        void vscode.commands.executeCommand('doorstop.openFilterAsDocument', event.message.uids);
      } else if (event.message?.type === 'apply' && typeof event.message.query === 'string' && Array.isArray(event.message.uids)) {
        void applyBatch(server, event.message.query, event.message.uids.map(String), onChanged);
      }
    }),
    registerCommand('doorstop.newFilterNotebook', async () => {
      const document = await vscode.workspace.openNotebookDocument(
        NOTEBOOK_TYPE,
        new vscode.NotebookData(NEW_NOTEBOOK_CELLS.map(toCellData))
      );
      await vscode.window.showNotebookDocument(document);
    })
  );
}
