# Phase 0 Research: Doorstop Validation Problems In-Item

All findings below were verified against the Doorstop version this repo actually
pins — **doorstop 3.2**, installed in `.venv` (`pip show doorstop`). Empirical
runs used a *copy* of `testdata/regression` and a synthetic project built in the
session scratchpad; the real fixture was never mutated.

---

## §1. Doorstop's validation writes to disk by default — the endpoint must be scoped read-only

**Decision**: `GET /validate` runs inside a context manager that forces
`settings.REFORMAT = False`, `settings.REORDER = False`,
`settings.REVIEW_NEW_ITEMS = False`, `settings.STAMP_NEW_LINKS = False`, and
restores the previous values in a `finally` block.

**Rationale**: Doorstop 3.2 ships these defaults
([settings.py:31-46](../../.venv/Lib/site-packages/doorstop/settings.py)):

```python
REFORMAT = True           # reformat item files during validation
REORDER = False           # reorder document levels during validation
REVIEW_NEW_ITEMS = True   # automatically review new items during validation
STAMP_NEW_LINKS = True    # automatically stamp links upon creation
```

`ItemValidator.get_issues()` acts on them mid-validation
([item_validator.py:100-113, 176-189](../../.venv/Lib/site-packages/doorstop/core/validators/item_validator.py)):
it calls `item.review()` on unreviewed items, assigns `uid.stamp = parent.stamp()`
on unstamped links, and finishes with `item.save()`.

**Verified.** Running a plain `document.get_issues()` over a copy of
`testdata/regression`:

- **7 of 9 item files were modified.** `reviewed: null` became a stamp on every
  unreviewed item; `REQ-007`'s link entry `- REQ-001: null` became
  `- REQ-001: eturK1qVdbL6ht9C3KMy5yP2o2gi-Vt9k-y2b7NQGf4=`.
- **The suspect link was destroyed rather than reported.** `REQ-007` is the
  fixture's designated suspect-link case, yet no `suspect link` warning appeared —
  `STAMP_NEW_LINKS` stamped it first. Silently repairing the exact defect the
  feature exists to display is a worse failure than not reporting it.

Re-running the identical pass with the four settings disabled: **zero files
changed** (verified by md5 over every item file, before and after) and
`REQ|WARN|REQ-007: suspect link: REQ-001` was reported as expected.

This is what makes FR-017 ("problem reporting MUST be read-only") a load-bearing
implementation constraint rather than a restatement of intent.

**Alternatives considered**:

- *Set the four settings once at server startup.* Rejected: `doorstop.settings` is
  process-global module state, and `STAMP_NEW_LINKS` also influences link
  creation elsewhere. Scoping to the validation call keeps every other endpoint's
  behaviour untouched.
- *Validate against a temporary copy of the tree.* Rejected: expensive, and it
  would report problems about paths that do not exist in the user's workspace.
- *Trust `@auto_save` being off.* Rejected: `item.save()` at
  item_validator.py:113 is an explicit save, not an auto-save.

**Consequence for tests**: `server/tests/test_validation.py` must hash every item
file before and after `GET /validate` and assert equality. This is the regression
test for the defect above and is required by Constitution Principle V.

---

## §2. What Doorstop 3.2 actually reports — the empirical catalogue

**Decision**: report exactly what Doorstop reports. Eleven of the spec's fifteen
checks map cleanly; three do not exist in Doorstop 3.2 and are not implemented;
one arrives under a different message but at the severity the spec wants.

**Method**: a synthetic project was built exercising every listed condition
(duplicate level, empty text, non-normative-with-links, link to an inactive item,
link to a non-normative item, unresolvable external ref, malformed UID in links,
a self-link written directly to bypass `link_items`, a child item with no links,
and a markdown-format document), then validated with the §1 settings.

### 2a. Checks that exist and map cleanly (11)

| Doorstop 3.2 message template | Class | Spec anchor |
|---|---|---|
| `no items` | Warning | document config file |
| `duplicate level: {level} ({uidA}, {uidB})` | Warning | `level` field of **both** named items |
| `no text` | Warning | `text` field / last line (markdown) |
| `unreviewed changes` | Warning | `reviewed` field |
| `linked to non-normative item: {uid}` | Warning | that link entry |
| `suspect link: {uid}` | Warning | that link entry |
| `non-normative, but has links` | Warning | `links` field |
| `no links from child document: {prefix}` | Warning | `derived` field |
| `no links to parent document: {prefix}` | Warning | `derived` field |
| `invalid UID in links: {uid}` | **Error** | that link entry |
| `linked to unknown item: {uid}` | **Error** | that link entry |
| `external reference not found: {ref}` | **Error** | `ref` / `references` field |

(That is twelve rows for eleven spec checks: the spec's "link is an invalid or
unknown UID" is two distinct Doorstop errors, raised at the document layer and the
tree layer respectively. A single malformed link produces both.)

### 2b. The spec's "parent link is an inactive item" — satisfied, different message

`ItemValidator._get_issues_tree` contains a `DoorstopInfo("linked to inactive
item: …")` branch ([item_validator.py:169-171](../../.venv/Lib/site-packages/doorstop/core/validators/item_validator.py)),
which at first reading contradicts the spec's ERROR requirement. **It is
unreachable.** `Tree.find_item()` skips inactive items and raises instead
([tree.py:455-463](../../.venv/Lib/site-packages/doorstop/core/tree.py)), so
validation takes the `except` path. Confirmed: linking `ARCH-001` to an
inactive `REQ-005` produced

```
ARCH|ERROR|ARCH-001: linked to unknown item: REQ-005
```

So the spec's intent (inactive parent link ⇒ **error**, anchored to the link
entry) is met exactly, via the `linked to unknown item` check. **No severity
override is needed**, and none is introduced — the extension reports Doorstop's
own class in every case.

### 2c. Checks that do not exist in Doorstop 3.2 (3) — not implemented

| Spec check | Reality |
|---|---|
| An item is linked to itself | No validation check. `Tree.link_items()` refuses to *create* one ("link would be self reference", [tree.py:326-327](../../.venv/Lib/site-packages/doorstop/core/tree.py)), but a self-link written directly is never re-checked. Confirmed: `ARCH-005` linked to itself yielded only `parent is 'REQ', but linked to: ARCH-005` (Info) and `suspect link: ARCH-005` (Warning) — no self-link issue. |
| There is a cycle of item links | `Tree.check_for_cycle()` ([tree.py:288-305](../../.venv/Lib/site-packages/doorstop/core/tree.py)) is called **only** from `link_items()` at creation time. It is not reachable from any `get_issues()` path. |
| An item's **child** link is an inactive item | No such check. Only the item's own (upward) links are examined, and that path is 2b above. |

**Rationale for not implementing them**: each would require writing Doorstop
validation logic in a second place — Constitution Principle II ("If Doorstop
already implements a capability … the project MUST call into Doorstop's own API
rather than reimplementing equivalent logic"), and, for the cycle check
specifically, a whole-tree traversal that duplicates `check_for_cycle`'s
semantics without its guarantees. The anchor mappings are retained in
[contracts/validation-api.md](contracts/validation-api.md) so these checks route
to the correct field if a future Doorstop version emits them.

**Alternatives considered**: calling `tree.check_for_cycle()` ourselves per item
during validation. Rejected — it *raises* on the first cycle rather than yielding
issues, it needs a seed path from a link that already exists, and driving it into
a reporting shape means writing the traversal ourselves anyway. Worth revisiting
as an upstream Doorstop contribution rather than a client-side workaround.

### 2d. Checks Doorstop reports that the spec did not list (5)

`no documents` (Warning, tree level); `skipped level: {lvl} ({uid}), {lvl} ({uid})`
(Info, names two items); `prefix differs from document ({prefix})` (Info);
`parent is '{prefix}', but linked to: {uid}` (Info); `needs initial review` (Info,
and only visible at all because §1 disables `REVIEW_NEW_ITEMS`).

**Decision**: report them. Info-class issues map to
`vscode.DiagnosticSeverity.Information`, which satisfies SC-007 ("no problem …
discarded without being shown somewhere") without adding yellow or red noise the
user did not ask for; VS Code's Problems panel filters by severity natively.

**Noise observation worth flagging at implementation time**: on
`testdata/regression`, the empty `EMPTY` document causes `no links from child
document: EMPTY` on *every* `REQ` item — 8 warnings from one underlying condition.
This is genuine Doorstop behaviour, not a defect in this feature, but it is what
the user will see first. Doorstop's own per-document config can disable
`CHECK_CHILD_LINKS` if that is unwanted; no suppression is built here.

---

## §3. Attributing an issue to an item without parsing prefixes twice

**Decision**: iterate `for document in tree:` and call `document.get_issues()`
per document. Route each issue by splitting the message on the **first** `": "`
and testing whether the left-hand token resolves to an item UID in that document.

**Rationale**: Doorstop prefixes issues as it aggregates them.
`Document.get_issues()` re-wraps every item issue as `"{item.uid}: {message}"`
([document.py:929-931](../../.venv/Lib/site-packages/doorstop/core/document.py)),
and `Tree.get_issues()` wraps *those* again as `"{document.prefix}: {message}"`
([tree.py:484-489](../../.venv/Lib/site-packages/doorstop/core/tree.py)).
Iterating documents ourselves means the document is known from the loop variable —
only one prefix layer ever needs removing, and document-level issues (`no items`,
`duplicate level`, `skipped level`) arrive unprefixed, which is exactly the
discriminator.

Confirmed against the fixture copy — document-level and item-level issues are
distinguishable with no ambiguity:

```
REQ|WARN|duplicate level: 1.0 (REQ-001, REQ-002)   <- document-level, unprefixed
REQ|ERROR|REQ-009: linked to unknown item: REQ-999 <- item-level, prefixed
EMPTY|WARN|no items                                <- document-level, unprefixed
```

Splitting on the *first* `": "` is safe even though messages contain further
colons: `REQ-009: linked to unknown item: REQ-999` splits into `REQ-009` and
`linked to unknown item: REQ-999`, which is the intended pair.

**Alternatives considered**:

- *Call `ItemValidator().get_issues(item)` per item directly.* Gives unprefixed
  issues with perfect attribution and no splitting — genuinely attractive. Rejected
  because the two document-level checks the spec needs (`no items`, `duplicate
  level`) live in `Document.get_issues` / the private `_get_issues_level`, so this
  route either misses them or requires calling a private method. Reaching into a
  private static method is a worse version coupling than splitting a string
  Doorstop itself formatted.
- *Use `Tree.get_issues()`.* Rejected: adds a second prefix layer to strip for no
  benefit, since we want per-document iteration anyway.

---

## §4. Where the message→check classification lives

**Decision**: server-side, in a new `server/src/doorstop_server/validation_rules.py`,
as an ordered table of compiled patterns mapping a message to
`(check_id, field, related_uid_group)`. The router returns `check` **and** a
semantic `field` hint; the extension never inspects `message`.

**Rationale**: Constitution Principle I puts Doorstop knowledge in the server.
The message templates are Doorstop's, so recognising them is Doorstop knowledge;
the *text range* for a field is VS Code knowledge and stays in the extension.
That seam keeps each side testable alone: the table is unit-testable without
HTTP, and the extension's anchoring is testable against fixed records.

Doorstop gives no structured alternative — `get_issues()` yields plain exception
objects whose only payload is the message
([item_validator.py:50-53](../../.venv/Lib/site-packages/doorstop/core/validators/item_validator.py)).
The `document_hook` / `item_hook` parameters are for *adding custom* validation,
not for classifying built-in issues, and `Document.get_issues` asserts
`document_hook is None`.

**Version coupling, stated plainly**: this table is pinned to Doorstop 3.2's
message wording and will need review on a Doorstop upgrade. Two mitigations —
the table lives in one named file, and an unmatched message is never dropped: it
returns `check: "unknown"` with `field: null`, and the extension anchors it to
the item's first line at Doorstop's own severity (FR-011, SC-007). A Doorstop
upgrade therefore degrades placement, never correctness or completeness.

**Alternatives considered**: parsing in the extension (rejected, Principle I);
subclassing Doorstop's exceptions upstream (out of scope for this feature, but
the right long-term fix and worth an upstream issue); regex-free `str.startswith`
matching (rejected — the related UID must be captured for link anchoring anyway).

---

## §5. Anchoring a check to a text range

**Decision**: the extension maps `field` → a line regex, and `relatedUid` → a
specific link entry, reading files from disk via `vscode.workspace.fs` exactly as
[definitionProvider.ts:58-71](../../src/definitionProvider.ts#L58-L71) already
does. Item paths, document config paths and item formats come from `GET /tree`
(`ItemNode.path`, `DocumentNode.markerPath`, `DocumentNode.itemFormat`) — every
field needed is already in the existing response
([doorstopTypes.ts:6-28](../../src/doorstopTypes.ts)), so no `GET /tree` change is
required.

Verified file shapes (note the real YAML key is `reviewed:`, not `review:`):

```yaml
active: true          # a .yml item
derived: false        # <- field "derived"
level: 1.4            # <- field "level"
links:                # <- field "links"
- ARCH-005: null      # <- a link entry; anchor here when relatedUid matches
normative: true
ref: ''               # <- field "ref"
reviewed: null        # <- field "reviewed"
text: |               # <- field "text"
  self link
```

A markdown item carries the same keys in YAML frontmatter between `---` fences,
followed by an optional `# Header` and the body; per FR-007 an empty-text warning
anchors to the file's **last line** in that format. Files are CRLF on Windows, so
splitting must use `/\r?\n/` as the existing provider does.

**Fallbacks** (FR-010, FR-011): field line absent, or `field` null, or
`relatedUid` not found among the link entries → anchor to the item's first line.
Item UID with no known path → anchor to its document's `markerPath`. Nothing is
dropped.

**Alternatives considered**: computing ranges server-side and returning
line/column. Rejected — the server would need to know about the user's unsaved
buffers and VS Code's position model, and it would put editor concerns behind an
HTTP boundary. Using a YAML AST parser for exact ranges was rejected under
Principle IV (a new dependency) and because line-level anchoring is what the spec
asks for.

---

## §6. Refresh strategy

**Decision**: refresh on server-ready, on `onDidSaveTextDocument` for files under
the workspace with a `.yml`/`.md` extension, after any extension-initiated
mutation, and on an explicit `doorstop.recheckProblems` command — debounced at
300 ms, with in-flight refreshes superseded rather than queued.

**Rationale**: FR-012/FR-013 name exactly these triggers, and validation is
whole-tree by nature (§3), so per-file incremental validation is not available
even in principle. One `GET /validate` + one `GET /tree` per refresh, well inside
SC-005's 3-second budget at the stated scale; the server's existing
`SerializeRequestsMiddleware` already prevents a refresh from racing a mutation.

Problems reflect **on-disk** state, matching the spec's assumption that a dirty
buffer may lag until save — consistent with §1, where validation reloads each item
from disk (`item.load()`, item_validator.py:62).

**Alternatives considered**: validating on every keystroke (rejected: whole-tree
cost, and disk state would not match the buffer anyway); watching the filesystem
with a `FileSystemWatcher` (deferred — `onDidSaveTextDocument` covers the
in-editor path the spec describes, and a watcher can be added later without
changing the contract).

---

## §7. Failure handling

**Decision**: on any `GET /validate` failure the extension **clears** the
diagnostic collection and surfaces the error once per failure transition (not on
every retry), naming the failure.

**Rationale**: FR-014 and US5 scenario 4 forbid presenting stale problems as
current, and Constitution Principle III requires an explicit, safe fallback state.
An empty collection plus a visible message is unambiguous; a populated collection
from five minutes ago is not. Repeating the notification on every debounce tick
would be its own defect, hence the transition guard.
