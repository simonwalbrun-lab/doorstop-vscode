# Research: Requirement Call Hierarchy

**Feature**: `018-call-hierarchy-provider` | **Date**: 2026-09-11

The Technical Context in `plan.md` had no `NEEDS CLARIFICATION` markers — the
stack is fixed by the repository. The items below are the design decisions
whose answer was not obvious from the spec alone, each verified against the
VS Code API / source or the existing extension code rather than assumed.

## 1. Which VS Code surface provides "the hierarchy view"

**Decision**: Implement `vscode.CallHierarchyProvider` and register it with
`vscode.languages.registerCallHierarchyProvider` for the same selector the
definition provider uses (`[{ language: 'yaml' }, { language: 'markdown' }]`).
Present it through the editor's built-in peek widget
(`editor.showCallHierarchy`), exactly as the
`microsoft/vscode-extension-samples/call-hierarchy-sample` does.

**Rationale**: The spec (FR-003a, clarification Q3) explicitly asks for the
sample's behaviour. The built-in widget already gives: lazy per-node
expansion to any depth (US2), double-click/Enter opening `item.uri` at
`item.selectionRange` with a normal editor-history entry so "Go Back" works
(US3, FR-006), a title-bar direction icon (FR-003a), "No results" and
"Failed to show call hierarchy" states, and the `name` / `detail` / location
columns the label format needs (FR-004). Building any of that as a custom
TreeView or webview would violate the constitution's smallest-change rule
and the spec.

**Alternatives considered**:
- Custom `TreeView` in the Doorstop side bar with two toggle buttons — gives
  "both directions at once", but Q3 chose the built-in view; rejected.
- The References view's "Call Hierarchy" side panel
  (`references-view.showCallHierarchy`) — same provider, but it is a side
  panel, not "opens the editor"; the sample uses peek. Not used for launch,
  though it will work for free once the provider exists.

## 2. Direction mapping and how the peek's title-bar icons actually behave

**Decision**: `provideCallHierarchyOutgoingCalls` returns the item's
**upstream** items (each UID under `item.links`); `provideCallHierarchyIncomingCalls`
returns its **downstream** items (`index.getLinkers(uid)`). This is the
mapping fixed by clarification Q2.

**Verified behaviour of the built-in widget** (read from
`src/vs/workbench/contrib/callHierarchy/browser/callHierarchy.contribution.ts`
on VS Code `main`):

- `editor.showCallHierarchy` (Shift+Alt+H, precondition: a provider is
  registered for the document and not already inside a peek) opens the peek
  at the cursor position. The initial direction is read from profile storage
  key `callHierarchy/defaultDirection`, defaulting to `CallsTo` (**incoming**)
  the first time; when the user closes the peek, the direction they were on
  is stored and becomes the next default.
- The title bar shows **one** icon at a time: `editor.showOutgoingCalls`
  (codicon `call-outgoing`) while the peek is in incoming mode, and
  `editor.showIncomingCalls` (codicon `call-incoming`) while in outgoing
  mode. Pressing it calls `widget.updateDirection(...)`, which re-roots the
  tree on the same root item in the other direction — exactly US2 scenario 4.
- Both switch commands have the precondition "peek visible AND currently in
  the other direction"; `EditorAction2` checks the precondition and silently
  returns when it does not hold, so calling `editor.showOutgoingCalls` when
  the peek is already outgoing is a harmless no-op.

So "two icons for filtering" in the user's words is, in the sample, a single
icon whose glyph and command flip with the current direction. That is what
Q3 accepted; `quickstart.md` states it plainly so manual checks are not
confused by seeing one icon.

**Alternatives considered**: swapping the mapping (outgoing = downstream) —
rejected by Q2; a link is written in the item and points out to its parent.

## 3. Forcing "outgoing first" when launched from the tree icon (FR-003b)

**Decision**: The `doorstop.showCallHierarchy` command does, in order:

1. `await vscode.window.showTextDocument(uri, { selection: headerRange })`
   where `headerRange` comes from the existing `findHeaderLocation` — this
   puts the cursor on the item's header line so `prepareCallHierarchy`
   roots on the file's own item (see §4).
2. `await vscode.commands.executeCommand('editor.showCallHierarchy')`.
3. `await vscode.commands.executeCommand('editor.showOutgoingCalls')`.

**Rationale**: `startCallHierarchyFromEditor` sets the `callHierarchyVisible`
and direction context keys synchronously inside `_showCallHierarchyWidget`
before the model promise resolves, so by the time step 2's promise settles
the peek exists and step 3's precondition (visible ∧ direction == incoming)
is evaluable. If the stored direction was already outgoing, step 3 no-ops
(§2). There is no public API to set the initial direction directly, and the
storage key is VS Code-internal, so this two-command sequence is the only
supported way to satisfy FR-003b.

**Failure handling**: if step 1 throws (file deleted while the tree still
lists it — spec edge case), show `vscode.window.showErrorMessage` with the
path and stop; never run steps 2–3 against whatever editor happened to be
active. If the index cannot be loaded before step 1, show the FR-011
warning and stop (§5).

**Alternatives considered**:
- `references-view.showOutgoingCalls` — opens the side panel already in
  outgoing mode, but it is not the peek the spec asks for. Rejected.
- Skipping step 3 and accepting the editor default — violates Q4/FR-003b.

## 4. What `prepareCallHierarchy` roots on (US4, FR-007)

**Decision**: Mirror `resolveDefinitionAt`'s token logic:

1. If the word at the cursor matches `UID_REGEX` **and** the index knows that
   UID → root on the referenced item (US4 scenario 2).
2. Otherwise → root on the file's own item via `getDocumentUid(document,
   index)` (US4 scenario 1; also the path the tree command uses, since it
   places the cursor on the header line, which contains no UID token).
3. If neither resolves (not a requirement file, or unknown) → `undefined`,
   so VS Code shows nothing requirement-specific (US4 scenario 3).

The returned `CallHierarchyItem` has `uri` = the item's file, `range` =
`selectionRange` = the header line (from `findHeaderLocation`), `kind` =
`SymbolKind.Object` (neutral glyph; nothing in the spec asks for a specific
icon), `name` and `detail` per §6.

**Rationale**: Reuses the exact same UID recognition as F12 so the two
features agree (FR-008); no new regex.

## 5. Error and empty states (constitution III, FR-009/FR-010/FR-011)

**Decision**:

| Situation | Provider behaviour | User sees |
| --- | --- | --- |
| `GET /tree` fails in `prepareCallHierarchy` | return `undefined`; call `reportUnavailable(...)` once per prepare (a `showWarningMessage`, injectable for tests like `reportBrokenReference` in 009) | Warning: "Doorstop: call hierarchy is unavailable because the Doorstop server could not be reached." Peek is not opened (from the editor, VS Code shows "No results"). |
| `GET /tree` fails during incoming/outgoing expansion | return `[]`, log via `console.error` | The node shows no children. No second warning (the first prepare already reported it). |
| Item has no links / no linkers | return `[]` | Empty direction — "No results" on the root, no children on a node. |
| `links:` names a UID not in the index (fixture: `REQ-009 → REQ-999`) | outgoing call whose `to` item is an **unresolved entry**: `name` = the UID alone, `detail` = `"unresolved"`, `uri` = the referencing file, `range` = the `links:` line that names it. Expanding it returns `[]` (it is not in the index, so both directions are empty by construction). | Entry listed with its UID; expansion yields nothing; the remaining entries are unaffected (FR-010). |
| Tree command: file missing on disk | catch from `showTextDocument`, `showErrorMessage` | Error naming the path; no peek. |
| Cyclic links (A → B → A) | nothing special — each expansion is one lazy lookup; the widget never auto-expands | Works level by level (spec edge case). |

**Note on "cannot be opened" for unresolved entries (FR-010)**: the peek
widget always opens `item.uri` on select and offers no per-item way to make a
row inert. Pointing the unresolved entry's `uri`/`range` at the *referencing
file's own `links:` line* means selecting it navigates to the dangling link
itself (where the user would fix it) and never to a non-existent target. This
is the closest the built-in widget allows; it is recorded in the spec's
edge-case wording as "opens no target item" and should be read that way in
acceptance.

**Alternatives considered**: throwing from the provider — VS Code would show
"Failed to show call hierarchy" but constitution III forbids raw failures
and the message is not actionable; rejected.

## 6. Label composition (FR-004, clarification Q1)

**Decision**:
- `name` = `${uid}: ${header.trim()}` when `header` is non-empty, else
  `uid` alone (no trailing colon).
- `detail` = the owning document's `prefix` (from `IndexedItem.documentPrefix`).
- Unresolved entries: `name` = uid, `detail` = `"unresolved"`.

**Rationale**: Exactly what Q1 chose. Deliberately **not** using
`getItemTitle()` (which falls back to the first line of `text` when `header`
is empty, as the tree view does): the spec's FR-004 says "when no header
exists, the main label MUST be the UID alone". Documented here so the
difference from the tree label is understood as intentional, not an
oversight. If the user later prefers the tree's fallback, it is a one-line
change and a spec amendment.

## 7. Link-line ranges (`fromRanges`) and helper reuse

**Decision**: Export `findHeaderLocation(uri)` and
`findReferenceLocation(uri, uid)` from `src/definitionProvider.ts` (they are
currently module-private) and reuse them:

- Outgoing call `fromRanges` = `[findReferenceLocation(rootUri, linkedUid).range]`
  — where in the root's own file the link is written.
- Incoming call `fromRanges` = `[findReferenceLocation(linkerUri, rootUid).range]`
  — where in the linker's file it names the root.

`findLineMatching` currently returns a zero-length range at column 0 of the
matching line; that is sufficient for the widget (it uses `fromRanges` only
for the "N references" count and for revealing the line) and keeps the
change minimal. Tightening it to the UID's column span is optional polish,
not required by any FR.

**Alternatives considered**: duplicating the two helpers into the new file —
rejected (constitution "smallest change", and two copies of the header
regexes would drift).

## 8. Tree-row icon and command wiring

**Decision**:
- `contributes.commands` += `{ "command": "doorstop.showCallHierarchy",
  "title": "Doorstop: Show Call Hierarchy", "icon": "$(type-hierarchy)" }`.
- `view/item/context` += `{ "command": "doorstop.showCallHierarchy", "when":
  "view == doorstop.treeView && viewItem == doorstop.item", "group":
  "inline@3" }` — between the existing Add (`inline@1`) and Link (`inline@4`)
  icons, and never on `doorstop.root` (US1 scenario 5, FR-001).
- The command handler receives the `RequirementTreeItem` and uses
  `itemData.uid` + `resourceUri`, the same contract `doorstop.link` and
  `doorstop.review` already rely on.

**Rationale**: `$(type-hierarchy)` is the codicon VS Code itself uses for
hierarchy views and reads as "hierarchy" at tree-row size; `call-outgoing`
would wrongly suggest one direction only.

## 9. Test strategy (constitution VI)

**Decision**: Two additions to suites CI already runs:

1. `src/test/regressionFixture.test.ts` — new `suite('Call Hierarchy (018)')`
   inside the existing fixture suite (real server, real fixture):
   - `vscode.prepareCallHierarchy` on `REQ-004.yml` (has a header) → one
     item, `name === 'REQ-004: Heading Display Coverage'`, `detail === 'REQ'`
     (SC-004).
   - `vscode.prepareCallHierarchy` on `REQ-001.yml` (empty header) → `name
     === 'REQ-001'` (UID-only fallback).
   - `vscode.provideIncomingCalls` on the REQ-001 item → `from` names are
     exactly `{ 'ARCH-001', 'MD-001' }` (fixture contract: both link to
     REQ-001), with `detail` `ARCH` / `MD`.
   - `vscode.provideOutgoingCalls` on the ARCH-001 item → one call to
     `REQ-001` (`detail === 'REQ'`), proving US2's second-level expansion.
   - `vscode.provideOutgoingCalls` on REQ-009's item → one call whose `to.name
     === 'REQ-999'` and `detail === 'unresolved'`; expanding that item returns
     `[]` (FR-010).
   - `doorstop.showCallHierarchy` executed with the REQ-001 tree item → the
     active editor's document is `REQ-001.yml` and the selection is on its
     `header:` line. (The peek widget itself is not observable through the
     API, same limitation `packageMenus.test.ts` documents for inline
     actions; the built-in commands it chains are VS Code's own.)
2. `src/test/packageMenus.test.ts` — the inline entry for
   `doorstop.showCallHierarchy` exists exactly once, its `when` restricts it
   to `viewItem == doorstop.item`, and no entry offers it on `doorstop.root`.

**Rationale**: `vscode.prepareCallHierarchy` / `provideIncomingCalls` /
`provideOutgoingCalls` are the built-in command wrappers VS Code ships
precisely so extensions can test providers headlessly; they run in the
extension host with no UI dependency, which keeps the test deterministic
under `xvfb-run`. All assertions are on link facts the fixture contract
(spec 012 `contracts/fixture-layout.md`) guarantees.
