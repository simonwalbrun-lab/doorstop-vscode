import * as vscode from 'vscode';

import { DoorstopIndex, getItemTitle, loadDoorstopIndex } from './doorstopIndex';
import { DoorstopServer } from './doorstopServer';
import { FilterVocabulary } from './doorstopTypes';
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

interface Vocabulary {
  index?: DoorstopIndex;
  attributes: FilterVocabulary['attributes'];
}

export class FilterCompletionProvider implements vscode.CompletionItemProvider {
  private vocabulary?: Promise<Vocabulary>;

  constructor(private readonly server: DoorstopServer) { }

  /** Drops the cached item data; the next completion reloads it. */
  invalidate(): void {
    this.vocabulary = undefined;
  }

  private load(): Promise<Vocabulary> {
    if (!this.vocabulary) {
      const loading = Promise.all([
        loadDoorstopIndex(this.server),
        this.server.request<FilterVocabulary>('GET', '/filter/vocabulary').then(r => r.attributes, () => undefined),
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
      return (attributes[name] ?? []).map(v => item(v, vscode.CompletionItemKind.Value, range));
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
      const keys = KEY_SNIPPETS.map(([label, body]) => item(label, vscode.CompletionItemKind.Keyword, range, body));
      return [...keys, ...await this.attributeItems(range)];
    }
    const afterKey = AFTER_KEY.exec(before);
    return afterKey ? this.attributeItems(replacing(afterKey[1])) : undefined;
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
