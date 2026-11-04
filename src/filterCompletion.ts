import * as vscode from 'vscode';

import { DoorstopIndex, getItemTitle, loadDoorstopIndex } from './doorstopIndex';
import { DoorstopServer } from './doorstopServer';
import { FilterVocabulary } from './doorstopTypes';
import { filterValues, readQuickEntrySettings } from './quickEntry';
import { measure } from './timing';

/**
 * Autocomplete inside filter cells (spec 022 FR-016). Item data comes from the
 * server (GET /tree, GET /filter/vocabulary), loaded once and kept until an
 * item file changes, so typing never costs a request per keystroke (SC-007).
 */

const STANDARD_ATTRIBUTES = ['uid', 'document', 'level', 'header', 'text', 'ref', 'active', 'normative', 'derived', 'reviewed', 'links'];
const KEY_SNIPPETS: [string, string][] = [
  ['filters:', 'filters:\n  $0'],
  ['order:', 'order: [$0]'],
  ['edit:', 'edit:\n  - $0'],
  ['and:', 'and:\n  - $0'],
  ['or:', 'or:\n  - $0'],
  ['not:', 'not:\n  - $0'],
  ['hasChild:', 'hasChild: $0'],
  ['hasParent:', 'hasParent: $0'],
];
const OPERATORS = ['==', '!=', '<', '<=', '>', '>='];
const METHOD_SNIPPETS: [string, string][] = [
  ['contains', 'contains("$1")'],
  ['startsWith', 'startsWith("$1")'],
  ['isEmpty', 'isEmpty()'],
  ['isNotEmpty', 'isNotEmpty()'],
];

const NAME = '[A-Za-z_][\\w-]*';
// `status == "dr|` or `links.contains("REQ|`: a value inside quotes.
const VALUE_AFTER_OPERATOR = new RegExp(`(${NAME})\\s*(?:==|!=|<=|>=|<|>)\\s*"([^"]*)$`);
const VALUE_IN_METHOD = new RegExp(`(${NAME})\\.(?:contains|startsWith)\\("([^"]*)$`);
// An expression starts the line (optionally as a list entry) or follows `key: `.
const EXPRESSION_START = '(?:^\\s*(?:-\\s+)?|:\\s+)';
const METHOD = new RegExp(`${EXPRESSION_START}${NAME}\\.(\\w*)$`);
const OPERATOR = new RegExp(`${EXPRESSION_START}${NAME}\\s+([=!<>]*)$`);
const INLINE_ORDER = /^\s*order\s*:\s*\[[^\]]*?([\w-]*)$/;
const LINE_START = new RegExp(`^\\s*(-\\s+)?(${NAME})?$`);
const AFTER_KEY = /:\s+([\w-]*)$/;

// The `edit:` section (spec 036 FR-017); names as in server/.../routers/batch.py.
const EDIT_OPERATIONS: [string, string][] = [
  ['set', 'set: {${1:field}: "${2:value}"}'],
  ['add', 'add: {${1:field}: "${2:value}"}'],
  ['remove', 'remove: ${1:field}'],
  ['appendEntry', 'appendEntry: {${1:field}: "${2:entry}"}'],
  ['removeEntry', 'removeEntry: {${1:field}: "${2:entry}"}'],
  ['generateChildren', 'generateChildren: {document: "$1"}'],
];
// Standard attributes a batch may change, with `set` only (FR-012).
const SETTABLE_STANDARD = ['active', 'normative', 'derived', 'level', 'text', 'ref'];
const GENERATE_KEYS = ['document', 'force', 'blank'];
const EDIT_OPERATION = /\b(set|add|remove|appendEntry|removeEntry|generateChildren)\s*:/g;
const EDIT_LIST_ENTRY = /^\s*-\s+([\w-]*)$/;
const EDIT_VALUE = new RegExp(`(${NAME})\\s*:\\s+([^,{}\\[\\]]*)$`);
const EDIT_FIELD = /(?:[{,]\s*|^\s+)([\w-]*)$/;
/** Values that stay unquoted in an edit, as _PLAIN_LITERAL in the server's routers/batch.py (spec 036 FR-021). */
const PLAIN_LITERAL = /^(?:true|false|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:e[-+]?\d+)?)$/i;

interface Vocabulary {
  index?: DoorstopIndex;
  attributes: FilterVocabulary['attributes'];
}

const usedValues = new WeakMap<DoorstopServer, Promise<FilterVocabulary['attributes'] | undefined>>();

/** Each custom field's values across all items, cached per server until an item file changes (shared with spec 037). */
export function loadUsedValues(server: DoorstopServer): Promise<FilterVocabulary['attributes'] | undefined> {
  let loading = usedValues.get(server);
  if (!loading) {
    const request = server.request<FilterVocabulary>('GET', '/filter/vocabulary').then(r => r.attributes, () => undefined);
    // A failed load is not kept: the next completion retries.
    void request.then(attributes => {
      if (!attributes && usedValues.get(server) === request) {
        usedValues.delete(server);
      }
    });
    usedValues.set(server, request);
    loading = request;
  }
  return loading;
}

export function invalidateUsedValues(server: DoorstopServer): void {
  usedValues.delete(server);
}

export class FilterCompletionProvider implements vscode.CompletionItemProvider {
  private vocabulary?: Promise<Vocabulary>;

  constructor(private readonly server: DoorstopServer) { }

  /** Drops the cached item data; the next completion reloads it. */
  invalidate(): void {
    this.vocabulary = undefined;
    invalidateUsedValues(this.server);
  }

  private load(): Promise<Vocabulary> {
    if (!this.vocabulary) {
      const loading = Promise.all([
        loadDoorstopIndex(this.server),
        loadUsedValues(this.server),
      ]).then(([index, attributes]) => {
        // A failed load is not kept: the next completion retries.
        if (!index || !attributes) {
          this.vocabulary = undefined;
        }
        return { index, attributes: attributes ?? {} };
      });
      this.vocabulary = loading;
    }
    return this.vocabulary;
  }

  provideCompletionItems(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.CompletionItem[] | undefined> {
    return measure('filter.completion', () => this.complete(document, position));
  }

  private async complete(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.CompletionItem[] | undefined> {
    const before = document.lineAt(position.line).text.slice(0, position.character);
    const replacing = (typed: string) => new vscode.Range(position.translate(0, -typed.length), position);

    // First: inside `edit:` a `- set ` line is an operation, not a condition awaiting `==`.
    if (inEditSection(document, position.line, before)) {
      return this.completeEdit(document, position.line, before, replacing);
    }

    const value = VALUE_AFTER_OPERATOR.exec(before) ?? VALUE_IN_METHOD.exec(before);
    if (value) {
      const [, name, typed] = value;
      const { index, attributes } = await this.load();
      const range = replacing(typed);
      if (name === 'document') {
        return (index?.documents ?? []).map(d => item(d.prefix, vscode.CompletionItemKind.Folder, range));
      }
      if (name === 'uid' || name === 'links') {
        return (index?.items ?? []).map(i => Object.assign(item(i.uid, vscode.CompletionItemKind.Reference, range), { detail: getItemTitle(i) }));
      }
      return valueItems(name, 'find', attributes, (label, kind) => item(label, kind, range));
    }

    const method = METHOD.exec(before);
    if (method) {
      return METHOD_SNIPPETS.map(([label, body]) => item(label, vscode.CompletionItemKind.Method, replacing(method[1]), body));
    }
    const operator = OPERATOR.exec(before);
    if (operator) {
      return OPERATORS.map(op => item(op, vscode.CompletionItemKind.Operator, replacing(operator[1])));
    }

    const inlineOrder = INLINE_ORDER.exec(before);
    if (inlineOrder) {
      return this.attributeItems(replacing(inlineOrder[1]));
    }
    const lineStart = LINE_START.exec(before);
    if (lineStart) {
      const range = replacing(lineStart[2] ?? '');
      if (lineStart[1] && isOrderEntry(document, position.line)) {
        return this.attributeItems(range);
      }
      // A cell has one `edit:` section (spec 036 US5).
      const hasEdit = /^edit\s*:/m.test(document.getText());
      const keys = KEY_SNIPPETS.filter(([label]) => !(hasEdit && label === 'edit:'))
        .map(([label, body]) => item(label, vscode.CompletionItemKind.Keyword, range, body));
      return [...keys, ...await this.attributeItems(range)];
    }
    const afterKey = AFTER_KEY.exec(before);
    return afterKey ? this.attributeItems(replacing(afterKey[1])) : undefined;
  }

  private async completeEdit(
    document: vscode.TextDocument,
    line: number,
    before: string,
    replacing: (typed: string) => vscode.Range
  ): Promise<vscode.CompletionItem[]> {
    const listEntry = EDIT_LIST_ENTRY.exec(before);
    if (listEntry) {
      return EDIT_OPERATIONS.map(([label, body]) => item(label, vscode.CompletionItemKind.Function, replacing(listEntry[1]), body));
    }
    const operation = editOperationAt(document, line, before);
    const { index, attributes } = await this.load();
    const fields = (op?: string): vscode.CompletionItem[] => {
      const names = op === 'generateChildren' ? GENERATE_KEYS
        : [...Object.keys(attributes), ...(op === 'set' ? SETTABLE_STANDARD : [])];
      return names.map(name => item(name, vscode.CompletionItemKind.Field, replacing(EDIT_FIELD.exec(before)?.[1] ?? '')));
    };
    const value = EDIT_VALUE.exec(before);
    if (value) {
      const [, name, typed] = value;
      const range = replacing(typed);
      // Text values are quoted like in filters (FR-021): inside an open quote only the text
      // is completed, otherwise the whole `"value"` is inserted. Existing numbers and
      // true/false keep their type, so they go in unquoted.
      const inQuotes = typed.startsWith('"');
      const text = (labels: string[], kind: vscode.CompletionItemKind, keepLiterals = false) => labels.map(label => {
        const completion = item(label, kind, replacing(inQuotes ? typed.slice(1) : typed));
        completion.insertText = inQuotes || (keepLiterals && PLAIN_LITERAL.test(label)) ? label : `"${label}"`;
        return completion;
      });
      if (name === 'remove') {
        return Object.keys(attributes).map(n => item(n, vscode.CompletionItemKind.Field, range));
      }
      if (EDIT_OPERATIONS.some(([label]) => label === name)) {
        return [];
      }
      if (operation === 'generateChildren') {
        return name === 'document'
          ? text((index?.documents ?? []).map(d => d.prefix), vscode.CompletionItemKind.Folder)
          : ['true', 'false'].map(v => item(v, vscode.CompletionItemKind.Value, range));
      }
      return valueItems(name, operation === 'removeEntry' ? 'find' : 'write', attributes, (label, kind) => text([label], kind, true)[0]);
    }
    return EDIT_FIELD.test(before) && operation ? fields(operation) : [];
  }

  private async attributeItems(range: vscode.Range): Promise<vscode.CompletionItem[]> {
    const { attributes } = await this.load();
    const names = [...new Set([...STANDARD_ATTRIBUTES, ...Object.keys(attributes)])];
    return names.map(name => item(name, vscode.CompletionItemKind.Field, range));
  }
}

function item(label: string, kind: vscode.CompletionItemKind, range: vscode.Range, snippet?: string): vscode.CompletionItem {
  const completion = new vscode.CompletionItem(label, kind);
  completion.range = range;
  if (snippet) {
    completion.insertText = new vscode.SnippetString(snippet);
  }
  return completion;
}

/**
 * A field's value suggestions with the quick-entry value lists applied (spec 037
 * FR-021 to FR-023): listed values in their order; used values not in the list
 * only when searching, marked so they can be found and fixed.
 */
function valueItems(
  name: string,
  mode: 'write' | 'find',
  attributes: FilterVocabulary['attributes'],
  make: (label: string, kind: vscode.CompletionItemKind) => vscode.CompletionItem
): vscode.CompletionItem[] {
  const settings = readQuickEntrySettings();
  const hasList = settings.valueLists.has(name);
  return filterValues(name, mode, settings, attributes).map((suggestion, index) => {
    const completion = make(suggestion.value, suggestion.source === 'listed' ? vscode.CompletionItemKind.EnumMember : vscode.CompletionItemKind.Value);
    if (hasList) {
      completion.sortText = String(index).padStart(5, '0');
      if (suggestion.source === 'used') {
        completion.detail = 'not in value list';
      }
    }
    return completion;
  });
}

/** True when the cursor is inside the cell's top-level `edit:` section. */
function inEditSection(document: vscode.TextDocument, line: number, before: string): boolean {
  if (!/^\s/.test(before)) {  // column 0: a top-level key, or `edit: [...]` written inline
    return /^edit\s*:/.test(before);
  }
  for (let above = line - 1; above >= 0; above--) {
    const text = document.lineAt(above).text;
    if (/^[^\s#]/.test(text)) {
      return /^edit\s*:/.test(text);
    }
  }
  return false;
}

/** The edit operation the cursor is in: the last one on this line, else on the lines above. */
function editOperationAt(document: vscode.TextDocument, line: number, before: string): string | undefined {
  const last = (text: string) => [...text.matchAll(EDIT_OPERATION)].pop()?.[1];
  const here = last(before);
  if (here || /^\s*-/.test(before)) {
    return here;
  }
  for (let above = line - 1; above >= 0; above--) {
    const found = last(document.lineAt(above).text);
    if (found) {
      return found;
    }
  }
  return undefined;
}

/** True when the `- ` entry on `line` belongs to an `order:` block list. */
function isOrderEntry(document: vscode.TextDocument, line: number): boolean {
  for (let above = line - 1; above >= 0; above--) {
    const text = document.lineAt(above).text;
    if (/^\s*(-\s|$)/.test(text)) {
      continue;
    }
    return /^\s*order\s*:\s*$/.test(text);
  }
  return false;
}

export function registerFilterCompletion(context: vscode.ExtensionContext, server: DoorstopServer): void {
  const provider = new FilterCompletionProvider(server);
  // Item files change through the editor and through server commands alike.
  const watcher = vscode.workspace.createFileSystemWatcher('**/*.{yml,md}');
  const invalidate = () => provider.invalidate();
  context.subscriptions.push(
    watcher,
    watcher.onDidChange(invalidate),
    watcher.onDidCreate(invalidate),
    watcher.onDidDelete(invalidate),
    vscode.languages.registerCompletionItemProvider(
      { notebookType: 'doorstop-filter', language: 'yaml' },
      provider,
      '"', '.', ' ', '-'
    )
  );
}
