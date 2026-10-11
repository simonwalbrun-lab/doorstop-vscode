# Research: Document View for Sections and Filter Results

## 1. Generalising the view key

- **Decision**: Replace the `prefix` key of `states`, `viewUriFor`/`prefixFromViewUri`
  and `loadSnapshot` by a **scope key**. Keys: `doc:SYS` (URI path
  `/SYS (document)`, unchanged), `sec:SYS-0012` (`/SYS-0012 (section)`),
  `flt:<n>` (`/Filter <n> (filter)`, `n` increments per opened filter view in a
  session). `prefixFromViewUri` becomes `scopeFromViewUri`.
- **Rationale**: Everything below the key (render, parse, planSave, language
  layer, watcher) already works on a `DocumentNode`; a scoped `DocumentNode`
  keeps that code intact (FR-004, SC-003 "indistinguishable").
- **Alternatives**: separate provider per scope type (duplicates ~700 lines);
  one URI scheme per scope type (language layer registers per scheme).

## 2. Scoped snapshot

- **Decision**: `loadSnapshot(scope)` fetches `/tree` once, then builds a
  `DocumentNode`-shaped object: `prefix` = the label shown in line 1, `items` =
  scope items in document order (documents in `/tree` order, items in level
  order), each item carrying its real `documentPrefix`. Section: the UIDs come
  from `RequirementTreeProvider.descendantUids(item)` computed on the *fresh*
  tree (same outline-depth rule as `attachHierarchy`, exported so both use one
  implementation). Filter: the stored UID list intersected with the fresh tree
  (vanished UIDs drop out; snapshot semantics, FR-012).
- **Rationale**: Principle I — membership of a section is defined by the same
  tree the user sees; no second hierarchy algorithm.
- **Alternatives**: new server endpoint for subtrees (server does not know the
  explorer's outline-depth nesting; would create a divergence).

## 3. Marker line 1 for non-document scopes

- **Decision**: Keep `<!-- doorstop document <LABEL> · keep this line -->`; widen
  `DOCUMENT_MARKER_REGEX` label class to `[A-Za-z0-9_. -]+` and use LABEL =
  `SYS`, `SYS-0012 section`, `Filter 2`. Marker text stays static.
- **Rationale**: One marker kind, one regex, existing revert/diagnostic logic
  applies unchanged.

## 4. Heading depth in partial views

- **Decision**: Heading depth keeps following the item's absolute level depth
  (`headingDepth(level)`), even when a section starts at `##`.
- **Rationale**: Level/heading correspondence is how `planSave` detects level
  changes; relative depth would make the same item render differently across
  views that may show it simultaneously.

## 5. Multiple views of one item (clarified: allowed)

- **Decision**: No claim registry. Rely on 019's watcher + `handleDiskChange`:
  the save of view A writes item files → view B's folder watcher fires → clean
  B regenerates, dirty B gets the Reload / Keep-my-edits prompt. After a
  successful save the provider additionally calls `regenerate` on other open
  states that contain a saved UID (faster than waiting for the debounce, and
  independent of watcher reliability). Identical scope → existing tab revealed
  (FR-005) because the key is the same.
- **Alternatives**: lock items per view — rejected by the user.

## 6. Watching several documents (filter views)

- **Decision**: `state.folder: string` becomes `state.folders: Set<string>`
  (directories of the scope's documents); one watcher per folder, all feeding
  the same `watcherUids`.

## 7. Creating items in a multi-document view

- **Decision**: A new item is created in the document of the block above it
  (`afterUid`); before the first block, in the first block's document. Empty
  scope can't occur (empty filter doesn't open; a section always has its root).
  The server endpoint already takes `after`, which determines position.
- **Rationale**: In section/filter views the "document" is no longer implicit.
  This reuses 019's placeholder flow unchanged for single-document scopes.
- **Edge**: placing a placeholder in a filter view between items of different
  documents resolves to the upper block's document — documented in contract.

## 8. "Open as document" on tree nodes

- **Decision**: New command `doorstop.openSectionAsDocument` with `when`
  `viewItem == doorstop.item.parent` — requires the tree item's `contextValue`
  to distinguish items with children (today `doorstop.item` for all; set in
  `RequirementTreeItem` after hierarchy attach). Existing menu `when` clauses
  that test `viewItem == doorstop.item` become a regex
  `viewItem =~ /^doorstop\.item/`. Document roots keep `doorstop.openAsDocument`.
- **Alternative**: always show and message "no sub-elements" — contradicts FR-001.

## 9. Filter-result action

- **Decision**: The renderer draws an "Open as document" button above the table
  and posts `{ type: 'openDocument', uids: [...] }`; `registerFilterNotebook`
  forwards to `documentView.openFilterView(uids, label)`. Empty results are
  already a markdown "No items matched." output without a button (FR-009,
  FR-011) — the guard is repeated in the handler for safety (empty → info
  message).
- **Rationale**: Same mechanism as the existing `open` message; no new API.
- **Alternative**: notebook toolbar command — needs cell/output addressing and
  re-running the filter; the row UIDs are already in the payload.

## 10. Editable header fields

- **Decision**: Setting `doorstop.documentView.fields` (array of strings, default
  `[]`). Today's view edits `header` and `text` only; the setting adds
  **extended attributes and `ref`**. `GET /tree?fields=a,b` returns
  `ItemNode.fields: {a: "…"}` for scalar values present on the item; `PATCH
  /items/{uid}` accepts `fields` and applies them with `Item.set` (single
  `save()`). Protected (never editable here): `uid`, `level`, `active`,
  `normative`, `derived`, `reviewed`, `cleared`, `links`, `header`, `text`.
  A name that no item carries is indistinguishable from "no item has it" and
  is silently omitted; only protected names are reported (once per open, via
  the status bar). Fields are edit-only: a field an item lacks cannot be added
  or removed in the view.
- **Rationale**: Principle I/II. `Item.set` verified in doorstop 3.2.
- **Alternatives**: client-side YAML parse of item files (violates I); allowing
  list/mapping values (needs a YAML editor in markdown — out of scope; such
  values are skipped with the same info line).

## 11. Rendering fields in the text

- **Decision**: See contracts/fields-block.md. Directly under the heading line,
  a fenced block ```` ```doorstop-fields ```` with `name: value` lines (one line
  per configured field the item has). Fence lines are managed lines (static,
  dimmed, reverted on edit like separators); value lines are editable.
- **Rationale**: Plain, visible, markdown-valid; the fence marks a clear
  boundary so item text starting with `key: value` is never mistaken for it.
- **Alternatives**: HTML comment lines per field (unreadable); YAML front
  matter (collides with item text that is itself front-matter-like).

## 12. Setting change while a view is open

- **Decision**: Read the setting at load/regenerate; a changed setting applies
  on the next open (FR-017). A *dirty* open view is never re-rendered for it.
  An already-open clean view picks it up on its next regeneration (acceptable:
  spec says "next time a view is opened").
