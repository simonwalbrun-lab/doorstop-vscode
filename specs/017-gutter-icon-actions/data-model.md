# Phase 1 Data Model: Review and Suspect-Link Actions via Problems Quick Fix

This feature introduces **no persisted data and no server schema change**. The
"model" is the short-lived, per-document structure the new Code Action provider
reads on each `provideCodeActions` call — reusing feature 013's existing
`RequirementLensScan` for line/UID data, and feature 014's existing
`vscode.Diagnostic`s (via `vscode.languages.getDiagnostics`) as the eligibility
gate.

## Entity map (spec → implementation)

| Spec entity | Implementation | Source | Lifetime |
| --- | --- | --- | --- |
| "Needs review" problem | `vscode.Diagnostic` with `source: 'doorstop'`, `code: 'needs_initial_review' \| 'unreviewed_changes'` | `problemsProvider.ts` (unchanged, feature 014) | Until the next validation refresh |
| "Suspect link" problem | `vscode.Diagnostic` with `source: 'doorstop'`, `code: 'suspect_link'` | `problemsProvider.ts` (unchanged, feature 014) | Until the next validation refresh |
| Review Field anchor | `RequirementLensScan.reviewedLine` | `reviewLensProvider.ts`'s `scanRequirementDocument()` (unchanged, feature 013) | Per `provideCodeActions` call |
| Link Entry anchor | `RequirementLensScan.linkEntries[]` (`{ line, parentUid }`) | `reviewLensProvider.ts`'s `scanRequirementDocument()` (unchanged, feature 013) | Per `provideCodeActions` call |
| Quick Fix offer | `vscode.CodeAction` | **New**: `reviewCodeActionProvider.ts` | Per `provideCodeActions` call |

The extension still has no representation of suspect/review *state* of its own —
it only reads the diagnostic VS Code is already holding (itself sourced from
Doorstop) and the document's own text; it never computes "is this suspect" or
"is this reviewed" independently (research.md §2).

## Code Action computation

```ts
/** What one provideCodeActions() call needs to decide what to offer. */
interface QuickFixInputs {
  scan: RequirementLensScan;               // from scanRequirementDocument() (013)
  fileDiagnostics: vscode.Diagnostic[];     // vscode.languages.getDiagnostics(document.uri)
  requestedRange: vscode.Range;             // the range VS Code passed to provideCodeActions
}
```

### Eligibility rules

| Quick Fix | Offered when | Command reused |
| --- | --- | --- |
| `Do Review` | `scan.reviewedLine` overlaps `requestedRange`, **and** `fileDiagnostics` contains a `doorstop` diagnostic with `code` in `{needs_initial_review, unreviewed_changes}` whose range overlaps `scan.reviewedLine` | `doorstop.doReview` (existing handler, feature 013) |
| `Clear Suspect Link` | some `entry` in `scan.linkEntries` has `entry.line` overlapping `requestedRange`, **and** `fileDiagnostics` contains a `doorstop` diagnostic with `code === 'suspect_link'` whose range overlaps `entry.line` | `doorstop.clearSuspicion` (existing handler, feature 013) |
| `Clear All Suspect Links` | `Clear Suspect Link` is offered (above), **and** `fileDiagnostics.filter(d => d.code === 'suspect_link').length >= 2` | `doorstop.clearAllSuspicions` (existing handler, feature 013) |

`requestedRange` overlap, not exact line equality, is used because VS Code may
pass a single-line range, a selection, or a zero-width position depending on
how Quick Fix was invoked (lightbulb on a line vs. `Ctrl+.` with a selection);
the existing lens code already only ever anchors at column 0, so a simple
`range.intersection(lineRange) !== undefined` check is sufficient.

### Command argument payloads (unchanged from feature 013)

```ts
interface ReviewLensContext {
  uid: string;
  documentUri: string;   // vscode.Uri.toString()
}

interface ClearAllLensContext {
  uid: string;
  documentUri: string;
}

interface ClearOneLensContext {
  uid: string;
  parentUid: string;     // read from scan.linkEntries; untrusted, server validates
  documentUri: string;
}
```

`uid` continues to come from `scan.uid` (the document's own filename basename);
`parentUid` continues to come from `scan.linkEntries[i].parentUid` (the line's
own YAML token, not the diagnostic). Both interfaces and both the review/clear
commands themselves are **unchanged** — only what constructs and presents the
`vscode.CodeLens` vs. `vscode.CodeAction` around them differs.

## `vscode.CodeAction` shape emitted

```ts
const action = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
action.command = { command: 'doorstop.doReview', title, arguments: [context] };
action.diagnostics = [theMatchingDiagnostic];   // ties the fix to the problem in the UI
action.isPreferred = true;                       // the only fix offered for its diagnostic
```

Setting `action.diagnostics` is what makes VS Code list the fix under that
specific Problem (both in the lightbulb menu and in the Problems panel's own
"Quick Fix" affordance), rather than as an unattached, always-offered action.

## State transitions (unchanged from feature 013 — owned entirely by Doorstop)

| Action | Before (on disk) | After (written by Doorstop `@auto_save`) |
| --- | --- | --- |
| Do Review | `reviewed: null` (or a stale stamp under `unreviewed_changes`) | `reviewed: <stamp>` |
| Clear All Suspect Links | every link entry unstamped/suspect | every entry stamped |
| Clear Suspect Link (`parents: [X]`) | `- X: null`, `- Y: null` | `- X: <stamp>`, `- Y: null` **unchanged** |

## Invariants

1. The extension never writes a requirement file directly; every transition
   above is produced by the server (Constitution Principle I).
2. `provideCodeActions` performs no network call — it reads text (via the scan)
   and already-published diagnostics only, matching the existing CodeLens
   provider's synchronous discipline (research.md §1's performance rationale).
3. A Quick Fix is offered **only** when a matching `doorstop`-sourced diagnostic
   already exists for that line (FR-007) — the provider is never the source of
   truth for "is this a problem," only for "here is a fix for that problem."
4. A `parentUid` read from text is never trusted before use: an unresolvable one
   still produces a server 400 and no mutation, exactly as today (013 §1.5).
