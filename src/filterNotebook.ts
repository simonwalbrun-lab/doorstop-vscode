import * as vscode from 'vscode';

import { DoorstopApiError, DoorstopServer } from './doorstopServer';
import { FilterResponse } from './doorstopTypes';

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
export function resultOutput(response: FilterResponse): vscode.NotebookCellOutput {
  if (response.items.length === 0) {
    return markdownOutput('No items matched.');
  }
  return new vscode.NotebookCellOutput([
    vscode.NotebookCellOutputItem.json({ columns: response.columns, items: response.items }, RESULTS_MIME)
  ]);
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

export function registerFilterNotebook(context: vscode.ExtensionContext, server: DoorstopServer): void {
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
    const query = cell.document.getText();
    if (!query.trim()) {
      await execution.replaceOutput(markdownOutput(EMPTY_CELL_HINT));
      execution.end(true, Date.now());
      return;
    }
    try {
      const response = await server.request<FilterResponse>('POST', '/filter', { query });
      await execution.replaceOutput(resultOutput(response));
      execution.end(true, Date.now());
    } catch (error) {
      // Never a table on failure - an empty or stale table would read as "no matches".
      const message = error instanceof DoorstopApiError
        ? error.message
        : `Doorstop server is not available: ${error instanceof Error ? error.message : String(error)}`;
      await execution.replaceOutput(new vscode.NotebookCellOutput([vscode.NotebookCellOutputItem.error(
        Object.assign(new Error(message), { name: 'Filter failed', stack: undefined })
      )]));
      execution.end(false, Date.now());
    }
  };
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
      }
    }),
    vscode.commands.registerCommand('doorstop.newFilterNotebook', async () => {
      const document = await vscode.workspace.openNotebookDocument(
        NOTEBOOK_TYPE,
        new vscode.NotebookData(NEW_NOTEBOOK_CELLS.map(toCellData))
      );
      await vscode.window.showNotebookDocument(document);
    })
  );
}
