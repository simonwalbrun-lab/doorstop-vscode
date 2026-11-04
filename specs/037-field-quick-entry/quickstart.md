# Quickstart: Field Quick Entry

## Automated

```powershell
npm run compile                       # type-check + lint + build
npm test -- --label quickEntry        # settings, rules, quoting, item files, document view
npm test -- --label filterNotebook    # value lists in filter cells and batch edits
pytest server/tests/test_quick_entry_quoting.py   # quoting fixture loads as the same text in PyYAML
```

## Manual check (Extension Development Host, a Doorstop project open)

1. Put the example from [contracts/quick-entry.md](contracts/quick-entry.md)
   into `.vscode/settings.json`. Add `status` and `tested_on` to
   `doorstop.documentView.fields`.
2. Item file: open any item, write `status: ` → `Draft`, `Approved`,
   `Obsolete` in that order; pick one, it replaces the old value. Place the
   cursor in an existing value and press Ctrl+Space → the same list (typing
   alone does not open it inside a YAML value). Under a
   `tester:` list, write `- ` → `Mister A`, `Madame B`.
3. Write `tester: ` on a single line and pick a value list entry containing
   `: ` (add `"Mister A: lead"` to the list first) → it is written in single
   quotes; `doorstop` (or the Problems panel) reports no error.
4. Write `tested_on: ` → the first entry is *Current date and time* showing
   e.g. `2026-11-01T09:05`; accept → `tested_on: '2026-11-01T09:05'`.
5. Give two items `component: UI` / `component: Server`, save, then write
   `component: ` in a third → `Server`, `UI`. Set
   `doorstop.quickEntry.suggestUsedValues` to `false` → nothing offered.
6. Give an item `status: Aproved` and save; `status: ` elsewhere still offers
   only the three listed values.
7. Document view: open one, place the cursor after `status: ` in a field
   block → the same three values; accept and save → only that field changes.
   In item text nothing is offered.
8. Filter notebook: `edit: - set: {status: "` → only listed values;
   `filters: status == "` → listed values, then `Aproved` marked *not in
   value list*.
9. Add `links` to `dateTimeFields` → one warning names `links` as ignored.
   Set `valueLists` to `"x"` → one warning names it invalid; the other
   settings still work.
