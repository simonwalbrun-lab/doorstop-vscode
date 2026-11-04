# Quickstart: Batch Edit Items

## Automated checks

```powershell
cd server; ..\.venv\Scripts\python.exe -m pytest tests/test_batch.py tests/test_filter.py; cd ..
npm run compile
npm run pretest; npx vscode-test --label filterNotebook
```

All must pass. Every FR of [spec.md](spec.md) appears in a
`Spec 036 FR-…` trace comment (`git grep "Spec 036"`).

## Manual walkthrough (Extension Development Host)

Project: document `REQ` (items `REQ-001`..`REQ-003`) with child document
`TST`; `TST-001` has `testruns: [TR-1]`.

1. **Set field (US1)**. New filter notebook, cell:

   ```yaml
   filters: document == "TST"
   edit:
     - appendEntry: {testruns: "TR-2"}
   ```

   Run it. Table shows checkboxes, all ticked, and "Apply to selected".
   Untick nothing, apply. Confirm modal shows counts; Apply. Summary shows
   changed items; `TST-001` now has `testruns: [TR-1, TR-2]`.

2. **Unsaved files (FR-020)**. Type in `TST-001.yml` without saving, apply
   again. An error names `TST-001.yml`; nothing is written. Save it and apply
   works again. The unsaved filter cell itself never blocks.

3. **Invalid edit (FR-003)**. Change `appendEntry` to `apendEntry`, run. The cell shows
   an error naming the unknown operation; no table.

4. **Generate children (US4)**. Cell:

   ```yaml
   filters: document == "REQ"
   edit:
     - generateChildren:
   ```

   Run, apply. `TST-002`, `TST-003` are created and linked; `TST-001` is
   skipped (`UID exists`). Add `{force: true}`: confirm modal says 1 item
   will be overwritten. With `{blank: true}` the new items get the next free
   numbers.

5. **Autocomplete (US5)**. In a new line under `edit:` press Ctrl+Space:
   the six operations appear. Inside `appendEntry: {` the field `testruns` is
   offered; after `testruns:` and a space the values `TR-1`, `TR-2`.

Cell contract: [contracts/batch-edit.md](contracts/batch-edit.md).
