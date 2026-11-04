import * as vscode from 'vscode';

import { DOCUMENT_VIEW_SCHEME, FIELDS_FENCE_CLOSE, FIELDS_FENCE_OPEN, PROTECTED_FIELDS } from './documentViewModel';
import { DoorstopServer } from './doorstopServer';
import { loadUsedValues } from './filterCompletion';
import { inDoorstopDocument, metadataRange } from './itemFile';
import { measure } from './timing';

/**
 * Quick entry of header field values (spec 037): configured value lists, the
 * current date and time, and the values a field already has in other items,
 * offered as completions in item files and document views; filter cells apply
 * the value lists through `filterValues`. Used values come from the server
 * (GET /filter/vocabulary, cached in filterCompletion.ts); the rest is settings.
 */

export interface QuickEntrySettings {
  valueLists: Map<string, string[]>;
  dateTimeFields: Set<string>;
  suggestUsedValues: boolean;
  /** Protected field names found in the settings, each once. */
  ignored: string[];
  /** Settings (or `valueLists.<field>`) with the wrong shape. */
  invalid: string[];
}

export interface Suggestion {
  value: string;
  source: 'now' | 'listed' | 'used';
}

export interface FieldAtCursor {
  name: string;
  /** Character where the value starts; the completion replaces from here to the end of the line. */
  valueStart: number;
  /** No space after the colon (or dash) yet: the inserted text starts with one. */
  needsSpace: boolean;
}

const KEY_LINE = /^([A-Za-z_][\w-]*):/;
const SEQUENCE_OWNER = /^([A-Za-z_][\w-]*):\s*$/;
const YAML_WORD = /^(null|true|false|yes|no|on|off|y|n)$/i;

/** Turns the raw `doorstop.quickEntry.*` values into settings, collecting what was ignored or invalid. */
export function normaliseQuickEntry(raw: { valueLists?: unknown; dateTimeFields?: unknown; suggestUsedValues?: unknown }): QuickEntrySettings {
  const ignored = new Set<string>();
  const invalid: string[] = [];
  const usable = (name: string): boolean => {
    if (PROTECTED_FIELDS.has(name)) {
      ignored.add(name);
      return false;
    }
    return name !== '';
  };

  const valueLists = new Map<string, string[]>();
  if (raw.valueLists !== undefined) {
    if (typeof raw.valueLists !== 'object' || raw.valueLists === null || Array.isArray(raw.valueLists)) {
      invalid.push('valueLists');
    } else {
      for (const [key, values] of Object.entries(raw.valueLists)) {
        const name = key.trim();
        if (!usable(name)) {
          continue;
        }
        if (!Array.isArray(values) || !values.every(value => ['string', 'number', 'boolean'].includes(typeof value))) {
          invalid.push(`valueLists.${name}`);
          continue;
        }
        valueLists.set(name, [...new Set(values.map(String).filter(value => value.trim() !== ''))]);
      }
    }
  }

  const dateTimeFields = new Set<string>();
  if (raw.dateTimeFields !== undefined) {
    if (!Array.isArray(raw.dateTimeFields) || !raw.dateTimeFields.every(name => typeof name === 'string')) {
      invalid.push('dateTimeFields');
    } else {
      for (const name of raw.dateTimeFields.map(name => name.trim())) {
        if (usable(name)) {
          dateTimeFields.add(name);
        }
      }
    }
  }

  let suggestUsedValues = true;
  if (typeof raw.suggestUsedValues === 'boolean') {
    suggestUsedValues = raw.suggestUsedValues;
  } else if (raw.suggestUsedValues !== undefined) {
    invalid.push('suggestUsedValues');
  }

  return { valueLists, dateTimeFields, suggestUsedValues, ignored: [...ignored], invalid };
}

/** The current `doorstop.quickEntry.*` settings; read per request so changes apply at once (FR-013). */
export function readQuickEntrySettings(): QuickEntrySettings {
  const config = vscode.workspace.getConfiguration('doorstop.quickEntry');
  return normaliseQuickEntry({
    valueLists: config.get('valueLists'),
    dateTimeFields: config.get('dateTimeFields'),
    suggestUsedValues: config.get('suggestUsedValues'),
  });
}

/** `YYYY-MM-DDThh:mm` in local time (ISO 8601 to the minute, no zone). */
export function formatNow(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** `value` as a YAML scalar that loads back as exactly this text. */
export function yamlValue(value: string): string {
  // An allow-list: YAML 1.1 (PyYAML on the server) reads numbers, dates and these words as non-text.
  const plain = /^[A-Za-z]/.test(value) && !YAML_WORD.test(value) && !/:(\s|$)|\s#|[\r\n]|\s$/.test(value);
  return plain ? value : `'${value.replace(/'/g, "''")}'`;
}

function valueAt(name: string, afterMarker: number, text: string, character: number): FieldAtCursor | undefined {
  if (PROTECTED_FIELDS.has(name)) {
    return undefined;
  }
  const spaces = /^[ \t]*/.exec(text.slice(afterMarker))![0].length;
  const start = afterMarker + spaces;
  return start <= character
    ? { name, valueStart: start, needsSpace: spaces === 0 }
    : { name, valueStart: character, needsSpace: true };
}

/** The header field whose value the cursor is in, in a `.yml` item or a `.md` item's frontmatter. */
export function itemFieldAt(lines: string[], line: number, character: number, isMarkdown: boolean): FieldAtCursor | undefined {
  const metadata = metadataRange(lines, isMarkdown);
  if (!metadata || line < metadata.start || line >= metadata.end) {
    return undefined;
  }
  const text = lines[line];
  const key = KEY_LINE.exec(text);
  if (key) {
    return character >= key[0].length ? valueAt(key[1], key[0].length, text, character) : undefined;
  }
  const entry = /^\s*-/.exec(text);
  if (!entry || character < entry[0].length) {
    return undefined;
  }
  // The entry belongs to the nearest top-level key above, past other entries and blank lines.
  for (let above = line - 1; above >= metadata.start; above--) {
    const owner = lines[above];
    if (/^\s*-/.test(owner) || owner.trim() === '') {
      continue;
    }
    const match = SEQUENCE_OWNER.exec(owner);
    return match ? valueAt(match[1], entry[0].length, text, character) : undefined;
  }
  return undefined;
}

/** The field whose value the cursor is in, on a `name: value` line of a document view's field block. */
export function viewFieldAt(lines: string[], line: number, character: number): FieldAtCursor | undefined {
  const text = lines[line];
  if (text === FIELDS_FENCE_OPEN || text === FIELDS_FENCE_CLOSE) {
    return undefined;
  }
  for (let above = line - 1; above >= 0; above--) {
    if (lines[above] === FIELDS_FENCE_CLOSE) {
      return undefined;
    }
    if (lines[above] === FIELDS_FENCE_OPEN) {
      // The shape `parseFields` in documentViewModel.ts reads.
      const key = /^([^:\s]+):/.exec(text);
      return key && character >= key[0].length ? valueAt(key[1], key[0].length, text, character) : undefined;
    }
  }
  return undefined;
}

/** What a field offers in item files and document views (data-model.md, "Suggestion rules"). */
export function fieldSuggestions(
  name: string,
  settings: QuickEntrySettings,
  used: Record<string, string[]> | undefined,
  now: Date
): Suggestion[] {
  if (PROTECTED_FIELDS.has(name)) {
    return [];
  }
  const suggestions: Suggestion[] = [];
  const isDateTime = settings.dateTimeFields.has(name);
  if (isDateTime) {
    suggestions.push({ value: formatNow(now), source: 'now' });
  }
  const listed = settings.valueLists.get(name);
  if (listed) {
    suggestions.push(...listed.map(value => ({ value, source: 'listed' as const })));
  } else if (!isDateTime && settings.suggestUsedValues) {
    // A multi-line value cannot be entered on one header line.
    const values = (used?.[name] ?? []).filter(value => !/[\r\n]/.test(value));
    suggestions.push(...values.map(value => ({ value, source: 'used' as const })));
  }
  return suggestions;
}

/** Values for a field in a filter cell: `write` for set/add/appendEntry, `find` for conditions and removeEntry. */
export function filterValues(
  name: string,
  mode: 'write' | 'find',
  settings: QuickEntrySettings,
  used: Record<string, string[]>
): Suggestion[] {
  const usedValues = used[name] ?? [];
  const listed = settings.valueLists.get(name);
  if (!listed) {
    return usedValues.map(value => ({ value, source: 'used' }));
  }
  const suggestions: Suggestion[] = listed.map(value => ({ value, source: 'listed' }));
  if (mode === 'find') {
    // Wrong values stay findable so they can be fixed.
    suggestions.push(...usedValues.filter(value => !listed.includes(value)).map(value => ({ value, source: 'used' as const })));
  }
  return suggestions;
}

const KIND: Record<Suggestion['source'], vscode.CompletionItemKind> = {
  now: vscode.CompletionItemKind.Event,
  listed: vscode.CompletionItemKind.EnumMember,
  used: vscode.CompletionItemKind.Value,
};

export class QuickEntryProvider implements vscode.CompletionItemProvider {
  constructor(private readonly server: DoorstopServer, private readonly mode: 'item' | 'view') { }

  provideCompletionItems(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.CompletionItem[] | undefined> {
    return measure('quickEntry.completion', () => this.complete(document, position));
  }

  private async complete(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.CompletionItem[] | undefined> {
    const text = document.lineAt(position.line).text;
    // Most space triggers are in prose: rule the line out before splitting the whole document.
    if (!(this.mode === 'item' ? KEY_LINE.test(text) || /^\s*-/.test(text) : /^[^:\s]+:/.test(text))) {
      return undefined;
    }
    const lines = document.getText().split(/\r?\n/);
    const field = this.mode === 'item'
      ? itemFieldAt(lines, position.line, position.character, document.languageId === 'markdown')
      : viewFieldAt(lines, position.line, position.character);
    // The text check first: the space trigger fires often, the folder check touches the disk.
    if (!field || (this.mode === 'item' && !inDoorstopDocument(document.uri.fsPath))) {
      return undefined;
    }
    const settings = readQuickEntrySettings();
    const wantsUsed = settings.suggestUsedValues && !settings.valueLists.has(field.name) && !settings.dateTimeFields.has(field.name);
    const used = wantsUsed ? await loadUsedValues(this.server) : undefined;
    const suggestions = fieldSuggestions(field.name, settings, used, new Date());
    if (suggestions.length === 0) {
      return undefined;
    }
    const range = new vscode.Range(position.line, field.valueStart, position.line, lines[position.line].length);
    return suggestions.map((suggestion, index) => {
      const item = new vscode.CompletionItem(suggestion.source === 'now' ? 'Current date and time' : suggestion.value, KIND[suggestion.source]);
      item.detail = suggestion.source === 'now' ? suggestion.value
        : suggestion.source === 'listed' ? 'value list' : 'used in other items';
      item.range = range;
      item.filterText = suggestion.value;
      item.sortText = String(index).padStart(5, '0');
      item.preselect = suggestion.source === 'now';
      // The document view saves field text through Item.set; Doorstop quotes it on save.
      const value = this.mode === 'item' ? yamlValue(suggestion.value) : suggestion.value;
      item.insertText = (field.needsSpace ? ' ' : '') + value;
      return item;
    });
  }
}

/** Registers the quick-entry completions and reports ignored or invalid settings (FR-015, FR-016). */
export function registerQuickEntry(
  context: vscode.ExtensionContext,
  server: DoorstopServer,
  warn: (message: string) => void = message => void vscode.window.showWarningMessage(message)
): void {
  const report = (): void => {
    const { ignored, invalid } = readQuickEntrySettings();
    const parts = [
      ...(ignored.length > 0 ? [`ignored protected field(s): ${ignored.join(', ')}`] : []),
      ...(invalid.length > 0 ? [`invalid setting(s): ${invalid.map(name => `doorstop.quickEntry.${name}`).join(', ')}`] : []),
    ];
    if (parts.length > 0) {
      warn(`Doorstop: quick entry ${parts.join('; ')}`);
    }
  };
  report();
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('doorstop.quickEntry')) {
        report();
      }
    }),
    vscode.languages.registerCompletionItemProvider(
      [{ scheme: 'file', language: 'yaml' }, { scheme: 'file', language: 'markdown' }],
      new QuickEntryProvider(server, 'item'),
      ' ', ':'
    ),
    vscode.languages.registerCompletionItemProvider({ scheme: DOCUMENT_VIEW_SCHEME }, new QuickEntryProvider(server, 'view'), ' ', ':')
  );
}
