# Research: Traceability Cross-Document Links

All findings verified against doorstop 3.2 in `.venv` on 2026-10-10.

## R1 Where links are lost

- **Decision**: Fix the child lookup and the matrix row builder, not the templates.
- **Rationale**:
  - `Item.parent_links` is `item.links`, so parent links already show every
    declared UID.
  - `Item.find_child_items_and_documents` only scans documents whose
    `parent == item.document.prefix`.
  - `Tree._iter_rows` walks `item.parent_items` / `item.child_items`, so a
    downward walk from REQ002 never reaches TST001. Reproduced: the REQ002
    row has empty SYS and TST cells.
  - The `.tpl` template receives the matrix and item bodies as finished text
    (`typesetTemplate(body=...)`), so it cannot add rows.
- **Alternatives**: Iterate `item.links` in the template (the user's
  suggestion). Rejected because the template never sees the matrix rows.

## R2 How to inject without modifying Doorstop

- **Decision**: A context manager, `publish_options(matrix, child_links)`,
  applies `unittest.mock.patch.object` overrides for one publish only.
- **Rationale**:
  - Every publisher reaches child links through `find_child_items` →
    `find_child_items_and_documents`:
    - markdown.py:305, also used by HTML, which renders the Markdown lines;
    - latex.py:168;
    - text.py, via `find_child_links`.
  - The `child_items` property calls the same method.
  - The overrides are class-level, but they apply inside the server's request
    lock, where requests run one at a time (Principle I).
  - `patch.object` restores the originals on any exit.
- **Alternatives**:
  - Subclass `HtmlPublisher`. Rejected: `publisher.publish()` hard-codes its
    publisher lookup, so this means copying the 80-line orchestration.
  - Post-process the HTML. Rejected: it means parsing HTML.
  - Patch the private `Tree._iter_rows`. Rejected in favour of the public
    `get_traceability`.

## R3 Child lookup semantics (always on, FR-005)

- **Decision**:
  - Build a reverse index `uid → [items whose links contain uid]` once per
    publish, across all documents.
  - Turn inactive linking items into `UnknownItem(uid)`, as Doorstop does.
  - Take the returned `child_documents` from the original method, since no
    publisher uses them.
- **Rationale**: One O(N) pass instead of an O(N²) scan. Doorstop's own
  conventions keep hierarchy-only output identical.
- **Ceiling**: The index is built from the first tree it sees and discarded
  on exit. This holds because each publish uses exactly one tree.

## R4 Matrix rows, "complete" mode

- **Decision**: Copy Doorstop's `get_traceability`/`_iter_rows` (sort key,
  set de-duplication, up/down recursion, boundary flags) and add one guard. A
  normative neighbour whose document column is already filled is skipped. If
  no neighbour is left, that direction counts as a boundary hit.
- **Rationale**:
  - With a tree-wide child lookup, upward, sideways or same-document links
    would otherwise overwrite a column or recurse forever (A1↔B1).
  - In a hierarchy-only project the guard never triggers (FR-003, tested
    against the unpatched method).
  - `UnknownItem.normative` is `False`, so unknown and inactive items stay
    ignored.
- **Alternatives**: Exclude ancestor documents from the child lookup.
  Rejected: it does not stop sibling cycles, and it would hide legitimate
  links.

## R5 Matrix rows, "doorstop" mode (FR-011)

- **Decision**: Override `Tree.get_traceability` with a wrapper that
  temporarily puts the original `find_child_items_and_documents` back, then
  calls the original `get_traceability`.
- **Rationale**:
  - Item pages always use the tree-wide lookup, but Doorstop's `_iter_rows`
    reads `item.child_items`. Without the restore, "doorstop" mode would get
    cross rows, and it could recurse forever on cycles.
  - The restore makes the matrix byte-for-byte Doorstop's own.
- **Alternatives**: Run "complete" logic without the cross rows. Rejected:
  it is not guaranteed to equal Doorstop.

## R6 No-child-links checkbox (FR-012)

- **Decision**: Patch `doorstop.settings.PUBLISH_CHILD_LINKS` to
  `child_links` inside the same context.
- **Rationale**:
  - This is exactly what Doorstop's CLI `--no-child-links` does
    (`cli/utilities.py:118`).
  - It also switches the parent label to "Links:" (markdown.py:295).
  - It never touches the matrix.
- **Alternatives**: Filter child links out of the output. Rejected: that
  reinvents Doorstop's own switch.

## R7 Request and settings shape

- **Decision**:
  - `PublishRequest` gains `traceability: Literal["complete", "doorstop"] = "complete"`
    and `childLinks: bool = True`.
  - The extension adds `doorstop.publish.traceability` (enum, default
    `"complete"`) and `doorstop.publish.noChildLinks` (boolean, default
    `false`), next to `doorstop.publish.template`.
  - The extension reads both settings once per Publish run and adds
    `{ traceability, childLinks: !noChildLinks }` to all three request bodies.
- **Rationale**:
  - The server defaults equal the setting defaults, so an older client still
    gets the default behaviour.
  - The setting is named after the user's mental model of the Doorstop flag
    ("no child links"). The request uses a positive boolean, which matches
    `PUBLISH_CHILD_LINKS`.
- **Alternatives**: Ask in the publish quick pick each time. Rejected: the
  user asked for settings.

## R8 Same output in CI (FR-009)

- **Decision**:
  - The command is `python -m doorstop_server.publish [--traceability {complete,doorstop}] <doorstop publish args>`.
  - `argparse.parse_known_args` takes our flag, and the remaining arguments go
    to `doorstop.cli.main.main(["publish", *rest])` inside
    `publish_options(matrix, child_links=True)`.
  - `--no-child-links` stays in `rest`, and Doorstop's CLI sets
    `PUBLISH_CHILD_LINKS` itself.
  - CI installs the server package (`pip install doorstop-vscode-server`, or
    `./server` in this repo).
- **Rationale**: It reuses Doorstop's argument parsing. The extension and CI
  run identical code.
- **Alternatives**:
  - A new console script. Rejected: it adds a packaging entry for no gain.
  - Plain `doorstop publish`. Rejected: item child links would differ.

## R9 Scope notes

- LaTeX child links and the LaTeX matrix follow the same options at no extra
  cost. They are not separately tested, because the spec puts LaTeX out of
  scope.
- Both PDF and HTML publishing already go through the two server endpoints,
  so the only extension change is forwarding the settings.
