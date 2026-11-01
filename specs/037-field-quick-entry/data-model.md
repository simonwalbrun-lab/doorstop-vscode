# Data Model: Field Quick Entry

All data is settings plus the server's existing vocabulary; nothing new is
stored.

## QuickEntrySettings (from `doorstop.quickEntry.*`)

| Field | Type | From | Rule |
| --- | --- | --- | --- |
| `valueLists` | `Map<string, string[]>` | `doorstop.quickEntry.valueLists` | Field names trimmed; protected names dropped (→ `ignored`); entries that are numbers or booleans become text; empty entries skipped; duplicates kept once, first position wins. A value that is not an array, or holds anything else (object, null), drops that field (→ `invalid`, as `valueLists.<field>`). A non-object setting → `invalid: valueLists`. |
| `dateTimeFields` | `Set<string>` | `doorstop.quickEntry.dateTimeFields` | Trimmed, empty skipped, protected dropped (→ `ignored`). Not an array of strings → `invalid: dateTimeFields`, treated as empty. |
| `suggestUsedValues` | `boolean` | `doorstop.quickEntry.suggestUsedValues` | Default `true`. Not a boolean → `invalid`, treated as `true`. |
| `ignored` | `string[]` | — | Protected names found, each once. |
| `invalid` | `string[]` | — | Setting names (or `valueLists.<field>`) with the wrong shape. |

Protected names: `PROTECTED_FIELDS` in `src/documentViewModel.ts` (`uid`,
`level`, `active`, `normative`, `derived`, `reviewed`, `cleared`, `links`,
`header`, `text`), the same list the server's `PROTECTED_FIELDS` holds.

## UsedValues

`Record<string, string[]>` — `attributes` of `GET /filter/vocabulary`
(unchanged server contract): per custom field the sorted distinct values,
at most 50. Absent (`undefined`) when the server cannot answer.

## Suggestion

| Field | Type | Meaning |
| --- | --- | --- |
| `value` | `string` | The value as the user sees it. |
| `source` | `'now' \| 'listed' \| 'used'` | Date/time, value list, or used in other items. |

### Suggestion rules for a field `name` (item files and document view)

1. `name` is protected → none.
2. `name` in `dateTimeFields` → `now` first (`formatNow(new Date())`).
3. `name` in `valueLists` → its values as `listed`, in order.
4. Else, if not a date/time field and `suggestUsedValues` → `usedValues[name]`
   as `used` (already sorted, ≤ 50).
5. Nothing matched → no suggestions (FR-018).

### Filter notebook values for `name` (mode `write` or `find`)

| Has value list | `write` (`set`, `add`, `appendEntry`) | `find` (conditions, `removeEntry`) |
| --- | --- | --- |
| yes | listed values only | listed, then used values not listed (marked) |
| no | used values (as today) | used values (as today) |

## FieldAtCursor

| Field | Type | Meaning |
| --- | --- | --- |
| `name` | `string` | The field whose value is being entered. |
| `valueStart` | `number` | Character where the replacement range starts. |
| `needsSpace` | `boolean` | No space after the colon yet; the insert starts with one. |

Item file: column-0 `name:` line within `metadataRange()`, or a `-` entry
whose nearest column-0 key above is `name:`. Document view: a line in a
`doorstop-fields` fence. Anything else → no field.
