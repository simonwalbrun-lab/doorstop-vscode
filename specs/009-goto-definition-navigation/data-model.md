# Data Model: Go to Definition & Usage Navigation

This feature introduces no new persisted entity, no server-side schema
change, and no new storage. Everything below is resolved fresh from the
existing `GET /tree` response on every F12/Shift+F12 invocation and
discarded immediately after — nothing is cached or written to disk.

## Requirement UID Token (ephemeral, from spec's Key Entities)

The token under the cursor when a navigation command fires.

| Field | Type | Description |
|---|---|---|
| `uid` | `string` | The recognized UID text (e.g. `REQ-001`), matched with the same `\b[A-Z0-9_-]+-\d+\b` pattern `hoverProvider.ts` already uses |
| `range` | `vscode.Range` | Where in the current document the token was found, from `document.getWordRangeAtPosition` |
| `isDerivedLine` | `boolean` | `true` when the cursor's line matches `/^\s*derived\s*:/i` — selects the usages path (multi-Location) instead of the single-UID path |

## Doorstop Item Index (ephemeral, built once per request from `GET /tree`)

An in-memory projection of the server's `TreeResponse`, built fresh for each
navigation request (no caching — see `research.md` Decision 1 for why a
fresh fetch is preferred over reusing `DoorstopTreeProvider`'s cache).

| Field | Type | Description |
|---|---|---|
| `pathByUid` | `Map<string, string>` | Every item's `uid` → its `path`, taken directly from `TreeResponse.documents[].items[]` |
| `linkersByUid` | `Map<string, string[]>` | Reverse index: target `uid` → list of `uid`s whose own `links` array contains it. Built by iterating every item's `LinkInfo[]` once |

**Construction rule**: for each `document` in `TreeResponse.documents`, for
each `item` in `document.items`: set `pathByUid[item.uid] = item.path`; for
each `link` in `item.links`, append `item.uid` to `linkersByUid[link.uid]`.

## Usage Location (ephemeral, the result shape returned to VS Code)

One entry in the list returned by `provideDefinition`/`provideReferences`
for a `derived:` line.

| Field | Type | Description |
|---|---|---|
| `referencingUid` | `string` | The `uid` of the item that links to the current requirement |
| `uri` | `vscode.Uri` | `Uri.file(pathByUid[referencingUid])` |
| `range` | `vscode.Range` | The line/column where the target UID token was found in that file's text (see `research.md` Decision 2); `Range(0, 0, 0, 0)` if the scan fails to find it |

**Resolution rule** (for the `derived:` case):

1. Determine the current file's own `uid` (from its filename, same
   convention `hoverProvider.ts`/`deriveProvider.ts` already use).
2. Look up `linkersByUid[currentUid]` → list of referencing `uid`s (`[]` if
   none).
3. For each referencing `uid`, resolve its `path` via `pathByUid`, read that
   file, scan for the current `uid` token to get a line/column, and emit one
   `Usage Location`.
4. Return the full list. Empty list → VS Code shows "no results" (FR-004).

**Resolution rule** (for the single-UID case, US1/US3):

1. Look up `pathByUid[hoveredUid]`.
2. Not found → return `undefined` (FR-004's "no results", not an error).
3. Found → read the target file and locate its header line (see `research.md`
   Decision 3): for a `.yml` path, the first line matching `^\s*header\s*:`;
   for a `.md` path, the first line matching `^#{1,6}\s+`. Return one
   `vscode.Location` at `Uri.file(path)`, `Range` positioned on that line.
4. If no header line is found (item has no `header:` field / the Markdown
   file has no heading), fall back to `Range(0, 0, 0, 0)`.

No validation rules beyond what `GET /tree` already enforces apply here —
this feature only reads and re-shapes data the server has already computed
and validated.

No lifecycle/state-transition model applies — every value here is resolved
once per keypress and has no existence beyond that single provider call.
