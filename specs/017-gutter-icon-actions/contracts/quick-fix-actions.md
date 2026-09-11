# Contract: Review & Suspect-Link Quick Fix Actions

The interface this feature exposes is a `vscode.CodeActionProvider` contributed
by the extension, attaching to diagnostics an existing provider already
publishes, plus the same server routes the retired CodeLenses already called.
**No server contract changes.** **No `doorstop.doReview` / `doorstop.clearAllSuspicions`
/ `doorstop.clearSuspicion` command signature changes** — this feature adds a
second, additional way to invoke them; it does not alter what they do.

---

## 1. Code Action provider contract

New file `src/reviewCodeActionProvider.ts`, registered alongside (replacing the
lens registrations of) `src/reviewLensProvider.ts` in `src/extension.ts`.

- **Registration**: `vscode.languages.registerCodeActionsProvider([{ language: 'yaml' }, { language: 'markdown' }], provider, { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] })` — same document selector the retired CodeLens provider used.
- **Input**: `(document, range, context, token)` per the standard `CodeActionProvider.provideCodeActions` signature. `context.diagnostics` is consulted only to confirm a `doorstop` diagnostic overlaps `range`; `vscode.languages.getDiagnostics(document.uri)` is read separately for the "Clear All" cardinality check (data-model.md).
- **Output**: zero to three `vscode.CodeAction` instances, each `kind: vscode.CodeActionKind.QuickFix`, each with `.command` set to one of the three existing commands and `.diagnostics` set to the diagnostic(s) it resolves.

### 1.1 `Do Review` action

| | |
| --- | --- |
| **Action title** | `Do Review` (optionally `$(check-compact) Do Review` — research.md §5) |
| **Offered when** | a `doorstop` diagnostic with `code` `needs_initial_review` or `unreviewed_changes` overlaps the requested range, on the item's `reviewed:` line |
| **Command** | `doorstop.doReview` (existing handler, unchanged) |
| **Argument** | `ReviewLensContext { uid, documentUri }` (unchanged shape) |
| **Effect** | identical to today's `Do Review` CodeLens (FR-006): marks exactly that one item reviewed |

### 1.2 `Clear Suspect Link` action

| | |
| --- | --- |
| **Action title** | `Clear Suspect Link` (optionally `$(check) Clear Suspect Link`) |
| **Offered when** | a `doorstop` diagnostic with `code: 'suspect_link'` overlaps the requested range, on that link entry's line |
| **Command** | `doorstop.clearSuspicion` (existing handler, unchanged) |
| **Argument** | `ClearOneLensContext { uid, parentUid, documentUri }` (unchanged shape) |
| **Effect** | identical to today's `Clear the Suspicion` CodeLens (FR-006): clears only the named link |

### 1.3 `Clear All Suspect Links` action

| | |
| --- | --- |
| **Action title** | `Clear All Suspect Links` (optionally `$(check-all) Clear All Suspect Links`) |
| **Offered when** | §1.2's condition holds **and** the file has ≥ 2 `suspect_link` diagnostics total (data-model.md) |
| **Command** | `doorstop.clearAllSuspicions` (existing handler, unchanged) |
| **Argument** | `ClearAllLensContext { uid, documentUri }` (unchanged shape) |
| **Effect** | identical to today's `Clear All Suspicions` CodeLens (FR-006): clears every suspect link on the item |

### 1.4 Preconditions applying to all three (unchanged from feature 013)

Evaluated in this order by every handler — **no change to the handlers
themselves**, only to what presents them:

1. **Argument validity** — a missing/unusable context aborts with `The requirement UID could not be determined.` No request is sent.
2. **Dirty document** (FR-006, 013 research.md §3) — if the document identified by `documentUri` is dirty, show a modal warning with `Save and Continue` / Cancel. Cancel → no request. Confirm → `await document.save()`; if the save throws, surface the error and send no request.
3. **Request** — issued via `DoorstopServer.request()`, mapping a non-2xx response to `DoorstopApiError { code, message, status }`.

### 1.5 Failure contract (unchanged from feature 013, Constitution Principle III)

| Condition | Surfaced as |
| --- | --- |
| Server not running / unreachable | error message naming the failure; no state change |
| Unknown target UID | server 400 `DOORSTOP_ERROR` → message quoting the server's text |
| Unknown/dangling `parentUid` | server 400 `DOORSTOP_ERROR`, raised before any link is stamped |
| Save failed in precondition 2 | error message; no request issued |

### 1.6 Provision contract

- `provideCodeActions` performs no async work and no network call (data-model.md invariant 2), reusing `scanRequirementDocument()` and the already-published `vscode.Diagnostic[]` only.
- Returns `[]` for any document that is not a recognizable requirement file, or for a range with no overlapping `doorstop` diagnostic of the relevant `code`.
- Does not touch the `+ Derive Requirement` CodeLens or its provider (FR-005) — `deriveProvider.ts` is unmodified and keeps rendering its own lens on the same file.

---

## 2. CodeLens contract retired

`src/reviewLensProvider.ts`'s `provideCodeLenses` stops emitting the
`Do Review`, `Clear All Suspicions`, and `Clear the Suspicion` lenses (FR-004).
Its three `vscode.commands.registerCommand(...)` registrations for
`doorstop.doReview`, `doorstop.clearAllSuspicions`, and `doorstop.clearSuspicion`
are **kept as-is** — they become the Code Action provider's command targets
instead of being deleted and reimplemented.

`registerReviewLensProvider`'s call to
`vscode.languages.registerCodeLensProvider(...)` is removed from
`src/extension.ts`'s activation path (or the function is renamed/split so only
the command registrations remain); `registerDeriveProvider`'s own
`registerCodeLensProvider` call is untouched.

---

## 3. Server contract consumed (existing — no change)

### 3.1 `POST /review`

```jsonc
{ "scope": "item", "target": "REQ-005" }
// Response: 204 No Content
```

### 3.2 `POST /clear`

```jsonc
// Clear all links of an item
{ "scope": "item", "target": "REQ-010" }

// Clear one specific link
{ "scope": "item", "target": "REQ-010", "parents": ["REQ-001"] }
// Response: 204 No Content
```

### 3.3 `GET /validate` (existing — no change, consumed indirectly via `problemsProvider.ts`)

Already returns `unreviewed_changes` / `needs_initial_review` (field
`reviewed`) and `suspect_link` (field `link_entry`, with `relatedUid`) per
`server/src/doorstop_server/validation_rules.py`. This feature reads the
*diagnostics* `problemsProvider.ts` already renders from this response; it does
not call `/validate` itself.

---

## 4. TreeView menu contract (User Story 2)

`package.json`'s `contributes.menus["view/item/context"]` entries for
`doorstop.review` (`group: "inline@2"`) and `doorstop.clear`
(`group: "inline@3"`) are removed. Their `1_requirement@3` /
`1_requirement@4` entries (the right-click context menu) are **unchanged**, as
are `doorstop.add`'s `inline@1` and `doorstop.link`'s `inline@4` entries. No
change to `contributes.commands` for `doorstop.review` / `doorstop.clear`, and
no change to `src/doorstopCommands.ts`.

---

## 5. Contract tests owed

| Test | Location | Asserts |
| --- | --- | --- |
| Do Review Quick Fix available and effective | `src/test/regressionFixture.test.ts` | `REQ-005.yml` (fixture's dedicated "unreviewed" item) has a `needs_initial_review` diagnostic on its `reviewed:` line; `vscode.languages.getCodeActions`-equivalent invocation there returns a `Do Review` quick fix; invoking it flips `reviewed` to a stamp, matching the existing "Do Review through the real server" assertion from feature 013 |
| Clear Suspect Link Quick Fix, one link | `src/test/regressionFixture.test.ts` | `REQ-007.yml`'s suspect-link diagnostic yields exactly a `Clear Suspect Link` fix (no `Clear All`, since only one suspect link exists); invoking it clears that link |
| Clear All Suspect Links Quick Fix, two links | `src/test/regressionFixture.test.ts` | `REQ-010.yml` (fixture's two-suspect-link item) yields both `Clear Suspect Link` and `Clear All Suspect Links` at either suspect line; invoking `Clear All` clears both, matching the existing "Clear All through the real server" assertion |
| No Quick Fix without a diagnostic | `src/test/regressionFixture.test.ts` | `REQ-006.yml` (already reviewed, no links) and `REQ-008.yml` (cleared link) yield no `Do Review` / `Clear Suspect Link` fixes |
| CodeLenses retired | `src/test/reviewLensScan.test.ts` or `regressionFixture.test.ts` | `REQ-007.yml` / `REQ-010.yml` no longer produce `Do Review` / `Clear All Suspicions` / `Clear the Suspicion` CodeLenses; `+ Derive Requirement` still does |
| TreeView inline icons | `src/test/extension.test.ts` (or new) | the tree item for a requirement row exposes only `doorstop.add` / `doorstop.link` as inline (`group` starting `inline@`) context menu entries in `package.json`'s static contribution (or, if asserted at runtime, the row's resolved context menu) |

Per Constitution Principle V/VI these run against the real Doorstop server and
`testdata/regression`; Doorstop itself is never mocked.
