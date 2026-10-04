# Quickstart: Validating Filter Notebooks

## Automated (CI)

```bash
# Server: filter parsing + evaluation against a real temp Doorstop project
cd server && pytest tests/test_filter.py

# Extension: serializer, table rendering, new-notebook template (no server)
npm run compile-tests && npx vscode-test --label filterNotebook
```

Both suites are part of the existing CI jobs (`server-tests`,
`extension-integration-tests`).

## Manual (F5 Extension Development Host)

Prerequisite: a workspace with a Doorstop project that has at least two
documents (e.g. `REQ` and a child `TST` whose items link to `REQ`), and one
`TST` item with a custom attribute `status: approved`.

1. **New notebook** — Run *Doorstop: New Filter Notebook*. Expect a text cell
   with the explanation and cheat-sheet, then a simple and a complex example.
   Run both unchanged → a table each, or "No items matched." (Story 1,
   scenario 6); the complex one shows the columns level, header, reviewed,
   links.
2. **Simple filter** — Add a cell `document == "REQ"` and run it → only REQ
   items, with "N items matched" above the table (Story 1).
3. **Clickable link** — Click a UID → the item file opens. Delete that item's
   file, click the UID again → warning "Item no longer exists" (Story 2).
4. **Nested groups** — Run the "REQ or SYS, no ref" example from
   [contracts/filter-syntax.md](contracts/filter-syntax.md) and check it
   against the tree by hand (Story 3).
5. **Related items** — Run:

   ```yaml
   and:
     - document == "REQ"
     - hasChild: status == "approved"
   ```

   → only the REQ items whose TST child is approved (Story 4).
6. **Errors** — Run `and: [` → error output with a line number. Run
   `__import__("os")` → `INVALID_FILTER`. Stop the server (*Doorstop: Restart
   Server* while it's broken, or kill the process) and run any cell → error
   output, no table.
7. **Save / reopen** — Save as `checks.doorstop-filter`, close, reopen → the
   same cells, no stale outputs; running them shows current data (Story 5).
