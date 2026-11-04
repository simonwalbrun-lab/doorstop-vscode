# Research: Batch Edit Items

All decisions below were taken from reading the existing code; no open
NEEDS CLARIFICATION remained in Technical Context.

## R1 - Where the `edit:` section is parsed

**Decision**: The server parses it. `compile_filter` in
`server/src/doorstop_server/routers/filters.py` accepts `edit` as a third
top-level key next to `filters` and `order`, and validates it with a new
`compile_edit()` when the cell runs. `POST /filter` reports
`editable: true` when the cell has a valid `edit:` section.

**Rationale**: Principle I. The server already parses the cell's YAML; a
second parser in the extension could disagree with it. Validating at run time
reports an invalid edit as a cell error before the user ticks anything
(FR-003).

**Alternatives**: parse in the extension (duplicates YAML handling, breaks
Principle I); validate only on "Apply" (late feedback).

## R2 - Which edit is applied

**Decision**: The result payload carries the cell text (`query`) as it was
when the cell ran. The renderer posts `{ type: 'apply', query, uids }`; the
server re-parses that text in `POST /batch`.

**Rationale**: Edge case "edit changed after the run": the user confirms what
was run, not what is in the editor now. No cell lookup or state needed.

## R3 - Confirmation counts (FR-010) and dry run

**Decision**: `POST /batch` takes `dryRun`. The extension first sends a dry
run, shows the planned counts (change / skip / overwrite) in a modal, and
sends the same request with `dryRun: false` after "Apply". Both runs go
through one pure function `plan_item(data, operations)` that returns the new
values and per-operation outcomes; only the real run saves.

**Rationale**: The overwrite count (FR-010 with `force`) and "how many will
change" need Doorstop's view of the items. One code path for preview and
write keeps them from disagreeing. Doorstop items are never mutated in memory
during a dry run, so the shared tree stays in sync with disk.

**Alternatives**: count client-side from the filter result (cannot know which
child UIDs exist); no preview (violates FR-010 for `force`).

## R4 - Writing fields through Doorstop

**Decision**: Per item, `item.auto = False`, apply all changes, one
`item.save()` (same as `apply_prose` in `routers/items.py`).

- set / add / appendEntry / removeEntry: `item.set(name, value)`; for `level`,
  `text`, `ref`, `active`, `normative`, `derived` this goes through Doorstop's
  own property setters.
- remove field: Doorstop 3.2 has no public "unset". Use
  `item._data.pop(name)` (private, like `_iter`/`_item_cache` already used in
  `doorstop_tree.py`), marked `ponytail:` with the upgrade condition.

**Formatting**: `save()` writes the whole file in Doorstop's format. A file
Doorstop wrote before stays identical except for the change; a hand-formatted
file may be normalized. Spec FR-011/SC-003 were reworded to "values unchanged"
for that reason (the Document View's field edits behave the same).

**Allowed names** (FR-012): custom fields (`[A-Za-z_][\w-]*`, not an
attribute or method of `Item`), plus `active`, `normative`, `derived`,
`level`, `text`, `ref` for `set` only. `uid`, `links`, `header`, `reviewed`
and every other `Item` attribute are rejected with `PROTECTED_FIELD`.

## R5 - Generating children with an exact number

**Decision**: `document.add_item(name=str(number))`. `add_item(number=...)`
is unusable: Doorstop takes `max(number, next_number)`, so it can never
create `TST-001` once `TST-005` exists. `name=` builds
`UID(prefix, sep, int(name), digits)` with the child document's own
separator and digits (spec assumption). Link with `tree.link_items(child,
parent)`, as `POST /items/{uid}/links` does.

- Existing target and no `force`: skipped, `UID exists`.
- Existing target and `force`: `document.remove_item(uid, reorder=False)`,
  then `add_item(name=...)`.
- `blank`: `document.add_item()` per parent in request order (table order);
  Doorstop's `next_number` counts up. `force` is ignored.
- Several child documents and no `document:` given, no child document, a
  named document that is not a child, or ticked items from more than one
  document: rejected before anything is written.

## R6 - Failures and the shared tree

**Decision**: The batch handler catches errors per item (`failed`, message)
and continues (FR-013). If any item failed, it sets
`request.app.state.tree_fingerprint = None` so the next request rebuilds the
tree (an item may have changed in memory but not on disk). A batch-level
rejection (invalid edit, mixed documents) raises before the first write.

**Rationale**: `get_tree` only resets the cache on an exception; a batch
that reports per-item failures returns normally, so it must reset it itself.

## R7 - Unsaved files (FR-020)

**Decision** (revised 2026-11-01): Before the dry run the extension asks VS
Code: `workspace.textDocuments.filter(d => d.isDirty && !d.isUntitled &&
d.uri.scheme !== 'vscode-notebook-cell' && (d.languageId === 'markdown' ||
d.languageId === 'yaml'))`. If any: error message naming up to three of them
("Save or discard unsaved changes first: …") and stop; no request is sent.

- `languageId` covers item files (`.yml`, `.md`) and Document Views (forced
  to `markdown`, scheme `doorstop-document`).
- Notebook cells are excluded: the filter cell itself is usually unsaved.
- Untitled documents are excluded: the summary details (R8) open as an
  untitled markdown document and must not block the next batch.

**Alternatives**: "Save all" prompt and skipping still-dirty items (first
draft) - more code and a per-item path mapping, for no gain.

## R8 - Summary (FR-014)

**Decision**: An information message ("10 changed, 2 skipped, 1 failed") with
a "Show details" button that opens an untitled markdown document listing every
item, its outcome and reason, and created UIDs. Warning message instead of
information when something failed.

**Alternatives**: drawing the summary in the renderer (needs a reply channel
and per-output ids); output channel (less visible). Both more code.

## R9 - Refresh after a batch (FR-016)

**Decision**: Call the existing `onChanged` (tree refresh + problems
re-check) from `extension.ts`. Open Document Views already reload through
their file watcher (`documentViewProvider.ts`), and the completion cache
through its watcher. `registerFilterNotebook` gets `onChanged` as a new
parameter.

## R10 - Autocomplete (FR-017)

**Decision**: Extend `FilterCompletionProvider` in `src/filterCompletion.ts`:

- `edit:` joins `KEY_SNIPPETS` (`edit:\n  - $0`).
- A line inside the `edit:` block (nearest column-0 key above is `edit:`)
  gets the six operation snippets.
- Inside an operation mapping: field names (custom names from the
  vocabulary; plus the six settable standard names only under `set`), values
  of that field, and for `generateChildren` the keys `document`, `force`,
  `blank` and document prefixes as values.
- `GET /filter/vocabulary` also collects string entries of list-valued
  attributes, so list entries are suggested (US5 scenario 4). Same cache and
  invalidation as today (SC-006).

## R11 - Progress (FR-015, Principle VII)

**Decision**: `withDelayedProgress('Doorstop: Batch edit…', …)` around each
`POST /batch`. Not cancellable: a mutation must not be cancelled once it
writes (Principle I). No cancellation points.
