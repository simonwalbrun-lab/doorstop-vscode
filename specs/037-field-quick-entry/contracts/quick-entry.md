# Contract: Field Quick Entry

## Settings (`package.json` → `contributes.configuration`, section "Quick Entry")

```jsonc
// .vscode/settings.json
{
  "doorstop.quickEntry.valueLists": {
    "status": ["Draft", "Approved", "Obsolete"],
    "tester": ["Mister A", "Madame B"]
  },
  "doorstop.quickEntry.dateTimeFields": ["tested_on"],
  "doorstop.quickEntry.suggestUsedValues": true
}
```

| Key | Schema | Default |
| --- | --- | --- |
| `doorstop.quickEntry.valueLists` | `object`, `additionalProperties: { type: array, items: string }` | `{}` |
| `doorstop.quickEntry.dateTimeFields` | `array` of `string` | `[]` |
| `doorstop.quickEntry.suggestUsedValues` | `boolean` | `true` |

Each `markdownDescription` has an example and says to set it in the
Workspace tab (`.vscode/settings.json`) so the team shares it. No `scope`
is set, so all three are allowed in workspace settings. Changes apply to the
next suggestion list (settings are read per request).

Warning (once per activation and per change of `doorstop.quickEntry.*`,
only when non-empty):
`Doorstop: quick entry ignored protected field(s): <names>; invalid setting(s): <names>`
(either part left out when empty).

## Completion — item files

- Selector: `{ scheme: 'file', language: 'yaml' }`, `{ scheme: 'file', language: 'markdown' }`.
  Trigger characters: `' '`, `':'`. Also on manual invoke (Ctrl+Space).
  VS Code does not open suggestions while typing inside a YAML plain value
  (it counts as a string), so retyping over an existing value needs
  Ctrl+Space; the extension does not change `editor.quickSuggestions`.
- Applies only when `inDoorstopDocument(fsPath)` and the cursor is at a
  field value position (data-model `FieldAtCursor`); otherwise returns
  `undefined` so other providers (link UIDs) are unaffected.
- Range: `valueStart` → end of line. Insert text: `yamlValue(value)`,
  prefixed with a space when `needsSpace`.
- Items:

| Source | Label | Kind | Detail | Order |
| --- | --- | --- | --- | --- |
| `now` | `Current date and time` | `Event` | the value, e.g. `2026-11-01T09:05` | first, preselected |
| `listed` | value | `EnumMember` | `value list` | configured order |
| `used` | value | `Value` | `used in other items` | alphabetical |

  `filterText` is the value (also for `now`, so typing `2026` keeps it).

## Completion — document view

- Selector: `{ scheme: DOCUMENT_VIEW_SCHEME }`, same triggers.
- Applies only on a `name: value` line inside a `doorstop-fields` fence.
- Same items and order; insert text is the raw value (no YAML quoting).

## Completion — filter notebook (changes to `src/filterCompletion.ts`)

| Position | Field with value list | Field without |
| --- | --- | --- |
| `name == "…`, `name.contains("…` etc. | listed (`EnumMember`), then used not listed (`Value`, detail `not in value list`) | used (unchanged) |
| edit `set` / `add` / `appendEntry` value | listed only | used (unchanged) |
| edit `removeEntry` value | listed, then used not listed (marked) | used (unchanged) |

Quoting stays as today (double quotes, or text only inside an open quote).
No date/time entry here (spec Assumptions).

## Module surface (`src/quickEntry.ts`)

```ts
export function normaliseQuickEntry(raw: { valueLists?: unknown; dateTimeFields?: unknown; suggestUsedValues?: unknown }): QuickEntrySettings;
export function readQuickEntrySettings(): QuickEntrySettings;
export function fieldSuggestions(name: string, settings: QuickEntrySettings, used: Record<string, string[]> | undefined, now: Date): Suggestion[];
export function filterValues(name: string, mode: 'write' | 'find', settings: QuickEntrySettings, used: Record<string, string[]>): Suggestion[];
export function formatNow(date: Date): string;              // YYYY-MM-DDThh:mm, local
export function yamlValue(value: string): string;           // R4 quoting rule
export function itemFieldAt(lines: string[], line: number, character: number, isMarkdown: boolean): FieldAtCursor | undefined;
export function viewFieldAt(lines: string[], line: number, character: number): FieldAtCursor | undefined;
export class QuickEntryProvider implements vscode.CompletionItemProvider { constructor(server: DoorstopServer, mode: 'item' | 'view'); }
export function registerQuickEntry(context: vscode.ExtensionContext, server: DoorstopServer, warn?: (message: string) => void): void;
```

`src/filterCompletion.ts` additionally exports
`loadUsedValues(server): Promise<Record<string, string[]> | undefined>`
(the cached `GET /filter/vocabulary` attributes, one cache entry per server,
cleared by its file watcher) and `invalidateUsedValues(server): void`.
