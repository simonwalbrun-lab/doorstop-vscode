# Contract: Review & Suspect-Link CodeLens Actions

The interfaces this feature exposes are (a) three VS Code commands contributed
by the extension and (b) the existing server routes they call. **No server
contract changes.**

---

## 1. Extension command contract

Registered in `src/reviewLensProvider.ts`, declared in `package.json` under
`contributes.commands`.

### 1.1 `doorstop.doReview`

| | |
| --- | --- |
| **Lens title** | `Do Review` |
| **Anchor** | the `reviewed:` line (FR-001) |
| **Argument** | `ReviewLensContext { uid, documentUri }` |
| **Effect** | marks exactly that one item reviewed (FR-002) |
| **Server call** | `POST /review` `{"scope":"item","target":uid}` |
| **Success** | 204; information message naming the item; `onChanged()` fired |

### 1.2 `doorstop.clearAllSuspicions`

| | |
| --- | --- |
| **Lens title** | `Clear All Suspicions` |
| **Anchor** | the `links:` line, **only when ≥1 link entry follows** (FR-003) |
| **Argument** | `ClearAllLensContext { uid, documentUri }` |
| **Effect** | clears suspect state on all of that item's links (FR-004) |
| **Server call** | `POST /clear` `{"scope":"item","target":uid}` |
| **Success** | 204; information message; `onChanged()` fired |

### 1.3 `doorstop.clearSuspicion`

| | |
| --- | --- |
| **Lens title** | `Clear the Suspicion` |
| **Anchor** | each `- <UID>` entry under `links:` (FR-005) |
| **Argument** | `ClearOneLensContext { uid, parentUid, documentUri }` |
| **Effect** | clears **only** the named link; siblings untouched (FR-006) |
| **Server call** | `POST /clear` `{"scope":"item","target":uid,"parents":[parentUid]}` |
| **Success** | 204; information message naming both UIDs; `onChanged()` fired |

### 1.4 Preconditions applying to all three

Evaluated in this order by every handler:

1. **Argument validity** — a missing/unusable context aborts with
   `The requirement UID could not be determined.` (mirrors the existing derive
   command's guard). No request is sent.
2. **Dirty document** (FR-010, research.md §3) — if the document identified by
   `documentUri` is dirty, show a **modal** warning with `Save and Continue` /
   Cancel. Cancel → no request. Confirm → `await document.save()`; if the save
   throws, surface the error and send no request.
3. **Request** — issued via `DoorstopServer.request()`, which already maps a
   non-2xx response to `DoorstopApiError { code, message, status }`.

### 1.5 Failure contract (FR-009, Principle III)

| Condition | Surfaced as |
| --- | --- |
| Server not running / unreachable | `fetch` rejects → error message naming the failure; no state change |
| Unknown target UID | server 400 `DOORSTOP_ERROR` → message quoting the server's text |
| Unknown/dangling `parentUid` | server 400 `DOORSTOP_ERROR`, raised **before** any link is stamped (see §2.2) |
| Save failed in precondition 2 | error message; no request issued |

In all cases the requirement's stored state is unchanged and no success message
is shown. Errors use `vscode.window.showErrorMessage`, consistent with
`registerDoorstopCommands.run()`.

### 1.6 Lens provision contract

- Provider registered for `[{ language: 'yaml' }, { language: 'markdown' }]`,
  matching the derive provider's registration.
- `provideCodeLenses` performs **no** async work and **no** network call
  (SC-005).
- Returns `[]` for any document that is not a recognizable requirement file
  (FR-011).
- Does not suppress or replace lenses from other providers; the derive lens
  continues to appear on the same file (FR-012).

---

## 2. Server contract consumed (existing — no change)

### 2.1 `POST /review`

```jsonc
// Request — ReviewClearRequest
{ "scope": "item", "target": "REQ-007" }
// Response: 204 No Content
```

Route: [review.py:29-32](../../../server/src/doorstop_server/routers/review.py#L29-L32).
Calls Doorstop's `Item.review()`, which `@auto_save`s the file.

### 2.2 `POST /clear`

```jsonc
// Clear all links of an item
{ "scope": "item", "target": "REQ-007" }

// Clear one specific link
{ "scope": "item", "target": "REQ-007", "parents": ["REQ-001"] }
// Response: 204 No Content
```

Route: [review.py:35-41](../../../server/src/doorstop_server/routers/review.py#L35-L41).

Two behaviours this feature depends on:

1. **Pre-validation.** Every UID in `parents` is resolved with
   `tree.find_item()` *before* any item is cleared, so an unresolvable parent
   aborts with 400 and leaves nothing partially stamped.
2. **Selective clearing.** `Item.clear(parents=[...])` stamps only links whose
   UID is in the list; with `parents` omitted or empty it stamps all of them.

### 2.3 Error response shape (existing)

```jsonc
{ "error": { "code": "DOORSTOP_ERROR", "message": "<doorstop's own text>" } }
```

Codes reachable from these calls: `DOORSTOP_ERROR` (400, unknown item or
parent), `TARGET_REQUIRED` (422 — unreachable here, since `target` is always
sent). `DoorstopServer.request()` already unwraps this into `DoorstopApiError`.

---

## 3. Contract tests owed

| Test | Location | Asserts |
| --- | --- | --- |
| Selective clear leaves siblings suspect | `server/tests/test_review.py` | `parents: [A]` on an item linked to A and B → A cleared, B still suspect (currently untested; research.md §1) |
| Do Review through the real server | `src/test/regressionFixture.test.ts` | after the command, `GET /tree` reports `reviewed: true` for that item only |
| Clear All through the real server | `src/test/regressionFixture.test.ts` | after the command, `cleared: true` for the item |
| Clear one through the real server | `src/test/regressionFixture.test.ts` | on the new two-link fixture item, exactly one link's suspect flag flips |
| Lens set matches document shape | `src/test/regressionFixture.test.ts` | `REQ-001` (`links: []`) → no link lenses; `REQ-007` (one link) → Clear All + one Clear-one; a non-requirement `.yml` → none |

Per Constitution Principle V these run against a real Doorstop project; Doorstop
itself is never mocked.

---

## 4. Contract impact of the derive remediation (research.md §5)

No public contract changes. `doorstop.deriveRequirement` keeps its command ID,
its two accepted argument shapes (CodeLens context and tree item), and its
user-visible behaviour. What changes is internal: the candidate-document list is
sourced from `GET /tree` instead of a client-side `.doorstop.yml` glob, so a
tree-fetch failure now produces an explicit error message where an unreadable
marker previously caused a silently shortened document list.
