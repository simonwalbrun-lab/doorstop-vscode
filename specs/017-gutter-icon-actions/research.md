# Phase 0 Research: Review and Suspect-Link Actions via Problems Quick Fix

## 1. Can a third-party VS Code extension put a custom Codicon in the editor gutter that runs a command on a single click?

**Decision**: No — there is no stable, public API for this today, so the feature is built on VS Code's existing Quick Fix affordance instead (see §2).

**Rationale**: Confirmed via the open GitHub issue [microsoft/vscode#224134](https://github.com/microsoft/vscode/issues/224134) ("OnClick and hover events on gutter icons"), filed 2024-07-28, still unresolved in the Backlog milestone with no linked PR. `vscode.TextEditorDecorationType`'s `gutterIconPath` can *render* a Codicon-derived SVG in the glyph margin, but a plain click there is not surfaced to extensions at all — that is precisely why only core features (breakpoints) can react to it. This was confirmed with the requester directly (see spec.md's Revision note) rather than left as a silent workaround.

**Alternatives considered**:
- **Comment API** (`vscode.comments.createCommentController`) — genuinely clickable gutter glyph, but the glyph is a fixed "+"/comment icon (not swappable per action to `check`/`check-all`/`check-compact`), and a click opens an inline reply-editor widget rather than running a command immediately — a second click would be needed to actually fire "Do Review" etc. Rejected: does not match "one click resolves the action," and re-adds an above-content widget very similar in spirit to what the requester was trying to remove.
- **Testing API** (`vscode.tests.createTestController`) — genuinely clickable, immediate-execution gutter icon (the "run" glyph), but the icon is fixed to test run/pass/fail states (not arbitrary Codicons) and the item would also appear in the Test Explorer view — confusing for a non-test action. Rejected on both counts.
- **Quick Fix on an existing diagnostic** (`vscode.languages.registerCodeActionsProvider`, kind `QuickFix`) — VS Code renders a lightbulb in the editor's left margin, immediately next to any line with an available diagnostic-attached fix; selecting an item in the resulting list runs the fix in one further click, same as selecting a CodeLens link is one click. **Selected**, because two of the three retiring actions ("Do Review", "Clear Suspect Link(s)") map onto problems Doorstop's `/validate` output already reports (see §2), so the lightbulb appears exactly where the problem already is — a real left-of-line entry point, without inventing new validation logic.

## 2. Which existing Doorstop validation checks correspond to "Do Review" and "Clear Suspect Link(s)"?

**Decision**: `needs_initial_review` and `unreviewed_changes` (both anchored to `field: "reviewed"`) back "Do Review"; `suspect_link` (anchored to `field: "link_entry"`, carrying `relatedUid`) backs both "Clear Suspect Link" and, when more than one is present on the same item, "Clear All Suspect Links".

**Rationale**: `server/src/doorstop_server/validation_rules.py` already classifies these three Doorstop messages with exactly those field anchors (lines 119-124, 143, 159), and `src/problemsProvider.ts` already turns them into `vscode.Diagnostic`s anchored to the right line via `resolveAnchor`/`findKeyLine`/`findLinkEntryLine` (feature 014, already shipped and tested). No new check needs to be invented or computed client-side — this feature only attaches an action to a diagnostic that already exists (Constitution Principle II).

**Alternatives considered**: Computing "needs review" / "has a suspect link" independently inside the new Code Action provider (e.g., re-deriving it from `GET /tree`'s `reviewed`/`links[].suspect` flags). Rejected — that would be a second, parallel implementation of information Doorstop's validation already reports and the extension already renders as diagnostics; it risks exactly the kind of client/server disagreement Principle I and II exist to prevent, and the diagnostic pipeline already refreshes on save with the debounce this feature can simply ride on.

## 3. How does the new Code Action provider find the right line and the right command arguments, given a `vscode.Diagnostic` carries no custom fields for `uid` / `parentUid`?

**Decision**: Reuse `scanRequirementDocument()` (already exported from `src/reviewLensProvider.ts`, feature 013) to get the `reviewedLine` and each link entry's `{ line, parentUid }` from the document text — the same trusted, tested scan the current CodeLenses already use — and use the diagnostics only as the *eligibility gate* (is there actually a `doorstop`-sourced diagnostic with the right `code` overlapping this range?), not as the data source for `uid`/`parentUid`.

**Rationale**: `vscode.Diagnostic` is not extensible with arbitrary custom data that survives VS Code's own diagnostic lifecycle reliably; re-parsing the line (which the extension already trusts server-side validation for, per 013 research.md §6) is simpler than trying to smuggle `relatedUid` through `Diagnostic.code`/`relatedInformation`. This also means the new provider does not duplicate the CodeLens's scanning logic — it imports and reuses it, so the two entry points (until the old ones are removed) cannot disagree about which line is which.

**Alternatives considered**: Parsing `diagnostic.message` for the related UID (Doorstop's own wording, e.g. `suspect link: REQ-001`, is preserved verbatim per 014's design). Rejected as strictly worse than reusing the existing, already-tested scan — it would recreate a second regex against Doorstop's message wording instead of the document's own YAML shape.

## 4. Should "Clear All Suspect Links" require the Quick Fix to be invoked exactly on the `links:` line (as the old CodeLens did), or can it appear alongside any individual "Clear Suspect Link"?

**Decision**: Offer "Clear All Suspect Links" alongside "Clear Suspect Link" wherever the latter is offered, whenever the item has **two or more** `suspect_link` diagnostics in that file — not anchored to a separate `links:`-line diagnostic (Doorstop's validation does not emit one).

**Rationale**: `vscode.CodeActionContext.diagnostics` only contains diagnostics overlapping the *requested* range (the specific line under the cursor/lightbulb), but eligibility for the bulk fix needs to know about every `suspect_link` diagnostic in the file, since one file is exactly one item. The provider reads the *whole file's* current diagnostics via `vscode.languages.getDiagnostics(document.uri)`, filters to `code === 'suspect_link'`, and offers "Clear All Suspect Links" whenever that count is ≥ 2, regardless of which single suspect-link line the Quick Fix was invoked on. This matches spec.md's User Story 1 acceptance scenario 3 and keeps `POST /clear` behaviour (omit `parents` to clear everything) identical to what the old `Clear All Suspicions` CodeLens already sent.

**Alternatives considered**: Reporting a synthetic "N suspect links" diagnostic on the `links:` line so the bulk fix has its own anchor, matching the old CodeLens's placement exactly. Rejected — this would be new, client-invented diagnostic content Doorstop itself never reports, in tension with Principle II and FR-007's "must not invent new validation checks."

## 5. Should Quick Fix action titles carry a Codicon glyph (e.g., `$(check)`) to echo the icons originally requested?

**Decision**: Prefix each Quick Fix title with the closest matching Codicon syntax (`$(check-compact) Do Review`, `$(check) Clear Suspect Link`, `$(check-all) Clear All Suspect Links`) as a best-effort visual echo of the original request, verified against the actual rendering in the VS Code version this extension targets during implementation; fall back to a plain text title with no functional difference if the running VS Code build does not render `$(icon)` syntax inside the Quick Fix widget.

**Rationale**: VS Code's own icon-reference documentation describes `$(iconIdentifier)` syntax as usable in "labels" generally, and it is honoured in several list-like UI surfaces (Quick Pick, status bar, tree item descriptions); whether the Quick Fix widget specifically renders it was not confirmed with certainty from documentation alone. Since this is purely cosmetic and spec.md's FR-012 already states it as a "SHOULD" with an explicit plain-text fallback, resolving it definitively is deferred to implementation-time verification rather than blocking the plan on it.

**Alternatives considered**: Treating this as a hard requirement and blocking the plan until confirmed. Rejected as disproportionate — spec.md already scopes this as a best-effort presentation detail, not a functional one (SC-001 through SC-005 do not depend on the glyph rendering).

## 6. TreeView inline icon removal — any technical unknowns?

**Decision**: None. This is a pure `package.json` change: remove the two `view/item/context` entries for `doorstop.review` and `doorstop.clear` whose `group` is `inline@2` / `inline@3` (leaving their `1_requirement@3` / `1_requirement@4` context-menu entries, and the `inline@1` `doorstop.add` / `inline@4` `doorstop.link` entries, untouched). No change to `src/requirementTree.ts` (its `iconPath`/`setTreeIcon` logic governs the row's own folder/file icon, not these action buttons) and no change to `src/doorstopCommands.ts` (the `doorstop.review` / `doorstop.clear` command handlers keep working exactly as today for the context-menu path).

**Rationale**: Confirmed by reading `package.json`'s `contributes.menus["view/item/context"]` directly — the inline vs. context-menu placement of a command in a VS Code TreeView is entirely a `menus` contribution concern, decoupled from the command's implementation.
