# Quickstart: validating Document View scopes

Prerequisites: `npm install`, `npm run compile`; a workspace with a Doorstop
document `SYS` having items on levels `1.0`, `1.1`, `1.1.1`, `1.2` (a copy of
the regression fixture works). Launch the Extension Development Host (F5).

## 1. Section view (US1)

1. In the Doorstop explorer expand `SYS`; hover the item at `1.1` (it has
   children): an "Open as document" book icon appears. Item `1.2` has none.
2. Click it. Tab `SYS-00xx (section)` opens with only `1.1` and `1.1.1`.
3. Edit the body of `1.1.1`, save: only that item file changes.
4. Click the icon again: the same tab is revealed, no second one.

## 2. Overlap is allowed (clarification)

1. With the section open, run **Doorstop: Open Document View** → `SYS`.
2. Both tabs are open and show `1.1`. Edit and save in the section; the full
   view refreshes (or prompts if it has unsaved edits).

## 3. Filter view (US2)

1. **Doorstop: New Filter Notebook**, run the simple example.
2. Click "Open as document" above the table: tab `Filter 1 (filter)` lists
   exactly the matched items; edit/save behaves as in the section view.
3. A filter matching nothing shows no button.

## 4. Fields setting (US3)

1. Settings → `doorstop.documentView.fields` → add `ref`.
2. Reopen a view: items with a `ref` show a `doorstop-fields` block under the
   heading; edit the value and save; the item file's `ref:` changes.
3. Add `level`: it is ignored and a message names it.

## Automated

```text
npm run check-types && npm run lint && npm test      # extension suites
cd server && pytest tests/test_tree_fields.py tests/test_items_fields.py
```
