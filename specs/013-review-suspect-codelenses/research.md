# Phase 0 Research: Review & Suspect-Link CodeLenses

All decisions below are resolved. No NEEDS CLARIFICATION markers remain.

---

## §1 — Do the three actions need new server endpoints?

**Decision**: **No.** All three reuse the existing `POST /review` and
`POST /clear` routes with no server code change.

| Lens | Request |
| --- | --- |
| Do Review | `POST /review` `{"scope": "item", "target": "<uid>"}` |
| Clear All Suspicions | `POST /clear` `{"scope": "item", "target": "<uid>"}` |
| Clear the Suspicion | `POST /clear` `{"scope": "item", "target": "<uid>", "parents": ["<parentUid>"]}` |

**Rationale**: The per-link case was the only one in doubt. `ReviewClearRequest`
already carries an optional `parents: List[str]`
([schemas.py:35-38](../../server/src/doorstop_server/schemas.py#L35-L38)), the
route forwards it to `item.clear(parents=body.parents)`
([review.py:35-41](../../server/src/doorstop_server/routers/review.py#L35-L41)),
and Doorstop's own implementation filters on exactly that list:

```python
@auto_save
def clear(self, parents=None):
    """Clear suspect links."""
    for uid, item in self._get_parent_uid_and_item():
        if not parents or uid in parents:
            uid.stamp = item.stamp()
```
(`.venv/Lib/site-packages/doorstop/core/item.py:878-884`)

So `parents=[X]` re-stamps only link X and leaves the item's other links at
their old stamps — precisely FR-006 — and omitting `parents` clears them all,
precisely FR-004. `@auto_save` means the file is rewritten by Doorstop itself.

Two useful properties fall out of the existing route for free:

- The route **pre-validates** every UID in `parents` with `tree.find_item()`
  *before* clearing anything, so a dangling parent (like the fixture's
  `REQ-009 → REQ-999`) fails with a structured 400 `DOORSTOP_ERROR` and no
  partial mutation. That is US3 acceptance scenario 3 satisfied by existing
  behaviour.
- `POST /review` with an unknown target likewise returns 400 `DOORSTOP_ERROR`
  (covered today by `test_review_unknown_target_returns_400`).

**Alternatives considered**: Adding a dedicated
`POST /items/{uid}/links/{parentUid}/clear` route. Rejected — it would add a
second way to express something the existing endpoint already expresses, for no
gain, and Principle II's "one implementation of any given Doorstop behaviour"
argues against it.

**Test gap this creates**: `server/tests/test_review.py` covers item-scope clear
and the unknown-parent 400, but has **no positive test that `parents` clears
selectively**. This feature makes that behaviour load-bearing, so a test is owed
(Principle V) even though no server source changes.

---

## §2 — How are lenses anchored, and does text scanning violate Principle I?

**Decision**: `provideCodeLenses` is a **pure text scan of the open document
with no network call**. It finds:

- the first `reviewed:` line at metadata indentation → "Do Review" anchor;
- the `links:` line → "Clear All Suspicions" anchor, emitted **only if** at
  least one link entry follows;
- each `- <UID>:` / `- <UID>` entry under `links:` → "Clear the Suspicion"
  anchor, carrying that UID as the command argument.

**Rationale**: This is the decisive design call, so it is worth stating plainly
why it is not a Principle I violation.

What the scan produces is **editor geometry** — which line to hang a clickable
label on. It does not decide what a link *is*, whether it is suspect, or what
clearing it does; all of that stays in Doorstop behind the server. The UID
lifted off a link line is treated as **untrusted input that the server
validates**, exactly like a UID a user types into the existing
`doorstop.link` input box. If the text is stale, malformed, or names a
nonexistent item, the server rejects it with a structured error and nothing
changes.

The repo already sets this precedent in both directions: `deriveProvider`
anchors on `/^\s*derived\s*:/` and `definitionProvider.findLineMatching()`
scans lines to place a `Location` — both accepted — while
`definitionProvider.buildItemIndex()` carries an explicit comment that item
*data* is "Sourced from `GET /tree` (the server's own computed truth) rather
than re-parsing YAML client-side". This feature respects the same split.

**Alternatives considered**:

- *Fetch `GET /tree` inside `provideCodeLenses` and drive lenses from
  server-reported link data.* Rejected on three counts: it makes opening any
  requirement file depend on server availability and latency (SC-005 regression,
  and no lenses at all while the server boots); it still cannot supply line
  numbers, so a text scan would be needed anyway to anchor; and VS Code calls
  `provideCodeLenses` frequently (every edit, every scroll into view), turning a
  local scan into a network storm.
- *Show the clear lenses only on links the server reports as suspect.* Rejected
  — this is the spec's explicit assumption ("offered whenever links are
  present"), it would reintroduce the per-render network dependency above, and
  it makes the lens set flicker as stamps change. Clearing an already-clear link
  is a harmless no-op in Doorstop (`uid.stamp = item.stamp()` is idempotent).

**Known limitation to record**: the scan assumes Doorstop's own block-style
output (`links:` followed by `- UID: stamp` entries), which is what Doorstop
writes and what every `testdata/regression` fixture contains. A hand-edited flow
sequence (`links: [REQ-001]`) will not produce per-link lenses. Acceptable: the
file is server-owned and normalized on every write.

---

## §3 — What happens when the open file has unsaved edits?

**Decision**: **Modal confirmation, then save, then act.** If
`document.isDirty`, show a modal warning naming the consequence ("This
requirement has unsaved changes. They must be saved before <action>, because the
Doorstop server rewrites the file.") with a **Save and Continue** action and
Cancel. On confirm, `await document.save()`; if the save fails, abort with an
error and issue no request. On cancel, do nothing.

**Rationale**: The server writes the requirement file from its own in-memory
tree. If the extension fires a request while the editor holds unsaved edits, one
of two bad things happens: the server's write lands and VS Code then shows a
dirty buffer diverging from disk, or the user later saves and silently reverts
the server's stamp. FR-010 forbids silently discarding the edits, and
Constitution Principle III demands the failure path be designed in, not
retrofitted.

Confirming rather than auto-saving matters because saving is itself a mutation
the user did not ask for — a lens click is not consent to persist an unrelated
half-finished edit.

**Alternatives considered**:

- *Silently `await document.save()` first.* Rejected — persists edits the user
  may not have intended to commit, with no signal.
- *Refuse outright ("save the file first").* Rejected as needlessly hostile: it
  makes the user do manually what one extra click can do, and the modal already
  conveys the same information.
- *Ignore dirty state.* Rejected — this is the data-loss path FR-010 exists to
  prevent.

---

## §4 — How does the editor reflect the new state afterwards?

**Decision**: Rely on VS Code's built-in reload of **clean** documents whose
file changed on disk, and additionally invoke the existing `onChanged` refresh
callback so the tree view (and any open diagram) re-reads server state. No
manual `WorkspaceEdit`, no forced reload.

**Rationale**: §3 guarantees the document is clean at the moment the request
fires, and VS Code silently reloads an unmodified open document when its file
changes underneath. Doorstop's `@auto_save` writes the file as part of
`review()` / `clear()`, so `reviewed: null` becomes a stamp and each cleared
link's `null` becomes a stamp value — visible without user action, satisfying
FR-008.

A useful consequence: because the file text changes, VS Code re-requests code
lenses for that document automatically. The provider needs **no**
`onDidChangeCodeLenses` event of its own, since the lens set is a pure function
of document text (§2).

`registerDeriveProvider` already receives an `onChanged: () => treeProvider.refresh()`
callback from `extension.ts`; the new provider takes the same option and calls
it on success, matching how `registerDoorstopCommands.run()` refreshes today.

**Alternatives considered**: applying the new stamp to the editor buffer
client-side. Rejected outright — that is the extension writing requirement data,
a direct Principle I violation, and it would need a client-side stamp
computation (Principle II) to know what to write.

---

## §5 — Audit: does the existing "Derive Requirement" CodeLens stick to the server?

*(This section answers the additional instruction given on this planning run.)*

**Finding**: **Partly — its writes do, its reads do not.** The derive lens is in
violation of Constitution Principles I and II today.

**What is correct.** The two mutations go through the server exactly as they
should ([deriveProvider.ts:212-219](../../src/deriveProvider.ts#L212-L219)):

```ts
const addResult = await options.server.request<{ uid: string; path: string }>(
  'POST', `/documents/${encodeURIComponent(target)}/items`, {});
await options.server.request(
  'POST', `/items/${encodeURIComponent(childUid)}/links`, { parentUid: deriveContext.sourceUid });
```

Errors are caught and surfaced with a message, and the tree is refreshed via
`onChanged`. No complaint there.

**What is in violation.** Everything the command reads to decide *where* an item
may be derived to is computed client-side, duplicating server responsibilities:

| Location | What it does | Principle breached |
| --- | --- | --- |
| [deriveProvider.ts:89-109](../../src/deriveProvider.ts#L89-L109) `getDocuments()` | Globs the workspace for `**/.doorstop.yml` and parses each marker with `js-yaml` | I — document *discovery* and config *parsing* outside the server |
| [deriveProvider.ts:37-87](../../src/deriveProvider.ts#L37-L87) `findPrefix()` / `findParent()` | Hand-rolled recursive search for `prefix` / `parent` keys in the parsed marker | I, II — re-implements reading Doorstop document config |
| [deriveProvider.ts:111-119](../../src/deriveProvider.ts#L111-L119) `getSourceDocumentPrefix()` | Infers which document a file belongs to by longest-matching directory path | I — Doorstop already knows which document owns an item |
| [deriveProvider.ts:121-148](../../src/deriveProvider.ts#L121-L148) `getSameLevelAndBelowPrefixes()` | Rebuilds the parent/child graph and walks depth in TypeScript | I, II — hierarchy computation is explicitly named in Principle I |

This is precisely the failure mode Principle I's rationale describes: "an earlier
design had the extension re-parse files itself, which could disagree with
Doorstop's own generated index." Two concrete ways it can disagree today: the
glob's hardcoded exclude list (`node_modules,.git,out,dist`) differs from the one
`extension.ts` uses for the same marker search (which also excludes `.venv,venv`),
so a document inside a virtualenv-shaped directory is visible to one and not the
other; and `findPrefix()`'s recursive descent will happily pick up a `prefix` key
from anywhere in the YAML, not just `settings.prefix`.

**Remediation decision**: Replace all four helpers with a single `GET /tree`
call. `TreeResponse.documents` already provides every field needed —
`prefix`, `markerPath`, `parentPrefix`
([schemas.py:105-112](../../server/src/doorstop_server/schemas.py#L105-L112)) —
and `items[].path` lets the source document be identified by **UID or path match
instead of directory-prefix guessing**. `definitionProvider.buildItemIndex()` is
the in-repo template to copy, comment and all.

Scope of the change:

- Delete `findPrefix`, `findParent`, `getDocuments`, and the `js-yaml` import
  from `deriveProvider.ts`.
- Replace `getSourceDocumentPrefix()` with a lookup of the source UID in the
  `GET /tree` payload (the document whose `items[]` contains it).
- Keep `getSameLevelAndBelowPrefixes()`'s depth walk **but feed it
  server-reported `parentPrefix` values** rather than client-parsed ones. The
  depth ordering ("same level and below") is this extension's own UX policy for
  which targets to offer, not a Doorstop concept, so computing it client-side
  from server-supplied edges is legitimate — it is a filter over server truth,
  the same standing as the ghost-adjacency filter accepted in feature 011.
- On tree-fetch failure, show an explicit error (Principle III) instead of
  today's behaviour, where an unreadable marker is swallowed by a bare `catch {}`
  and silently shrinks the target list.
- `workspaceFolder` becomes unused by the provider once the glob is gone; keep
  or drop the option as the implementation dictates.

**Why fix it here rather than defer**: this feature adds three more lenses to
the same files, and the remediation is small and mechanical while the pattern is
fresh. Deferring leaves the codebase with two contradictory precedents for how a
CodeLens provider should get its data — the exact ambiguity Principle I exists to
remove.

**Note (out of scope, recorded for a future spec)**: the same client-side-parsing
pattern also exists in `hoverProvider.ts` (globs `**/*.{yml,md}` and `yaml.load`s
matches), `completionProvider.ts` (same, for UID completion), and
`diagrammPanel.ts:621-660`. Those are untouched by this feature. Feature 014
(validation diagnostics) will need server-sourced item data too and is the
natural place to address the hover/completion pair.

---

## §6 — Item identity and which files get lenses

**Decision**: The item's UID is the **filename basename** (`REQ-007.yml` →
`REQ-007`), and lenses are offered on `.yml` and `.md` documents only — matching
`deriveProvider.getSourceUid()` and `definitionProvider.getCurrentUid()`
verbatim. Non-requirement `.yml` files simply produce no lenses, because a file
without a `reviewed:` or `links:` line yields no anchors, and an invented UID is
rejected by the server if somehow invoked (FR-011).

**Rationale**: Doorstop names item files after their UID; both existing
providers already rely on this and it needs no server round trip. Reusing the
identical rule avoids a third notion of "is this a requirement file" in the
codebase.

**Markdown caveat**: for `itemformat: markdown` documents, metadata sits in YAML
frontmatter. The scan must therefore restrict itself to the frontmatter block in
`.md` files (the `---` fenced region `hoverProvider.ts:14-25` already handles)
so a `links:` line in prose body text does not sprout lenses. **No markdown-format
item exists in `testdata/regression`** — every fixture item is `itemformat: yaml`
— so this path is unverified by the current fixture. Recorded as a known risk;
adding a markdown-format document to the fixture is the natural mitigation and
belongs in tasks.
