# Phase 1 Data Model: Review & Suspect-Link CodeLenses

This feature introduces **no persisted data and no server schema change**. The
"model" here is the short-lived, per-document structure the CodeLens provider
computes on each `provideCodeLenses` call, plus the request bodies it sends.

## Entity map (spec → implementation)

| Spec entity | Implementation | Lifetime |
| --- | --- | --- |
| Review Field | `ReviewAnchor` — a line number | Per `provideCodeLenses` call |
| Links Field | `LinksAnchor` — a line number + whether entries follow | Per `provideCodeLenses` call |
| Link Entry | `LinkEntryAnchor` — line number + parent UID token | Per `provideCodeLenses` call |
| Suspect State | **Not modelled client-side.** Owned by Doorstop; never read, cached, or computed by the extension (research.md §2) | n/a |

That last row is the point of the design: the extension has no representation of
suspect state at all, so it cannot disagree with Doorstop about it.

## Document scan result

```ts
/** Everything one pass over a requirement document yields. Pure function of text. */
interface RequirementLensScan {
  /** UID of the item this document represents (filename basename). */
  uid: string;
  /** Line of the `reviewed:` metadata field, if present. */
  reviewedLine?: number;
  /** Line of the `links:` metadata field, if present. */
  linksLine?: number;
  /** One per `- UID[: stamp]` entry beneath `links:`. Empty when `links: []`. */
  linkEntries: LinkEntryAnchor[];
}

interface LinkEntryAnchor {
  /** Line of this entry, where its lens is anchored. */
  line: number;
  /** Parent UID token read off the line. Untrusted — validated server-side. */
  parentUid: string;
}
```

### Derivation rules

| Field | Rule |
| --- | --- |
| `uid` | `path.basename(fileName, ext)` for `.yml` / `.md`; otherwise the document is skipped entirely (FR-011) |
| `reviewedLine` | First line matching `/^\s*reviewed\s*:/i` at metadata level. Doorstop writes `reviewed: null` or `reviewed: <stamp>` |
| `linksLine` | First line matching `/^\s*links\s*:/i` |
| `linkEntries` | Consecutive lines after `linksLine` matching a `- <UID>` sequence-entry shape, stopping at the first line that is not a sequence entry (i.e. the next metadata key). `links: []` yields none |
| scan region | Whole document for `.yml`; the `---` frontmatter block only for `.md` (research.md §6) |

### Lens emission rules

| Lens | Emitted when | Range |
| --- | --- | --- |
| `Do Review` | `reviewedLine !== undefined` | `(reviewedLine, 0)` |
| `Clear All Suspicions` | `linksLine !== undefined` **and** `linkEntries.length > 0` (FR-003) | `(linksLine, 0)` |
| `Clear the Suspicion` | one per entry in `linkEntries` (FR-005) | `(entry.line, 0)` |

The existing derive lens continues to be emitted by its own provider on
`/^\s*derived\s*:/`; VS Code merges the two providers' output, which is how
FR-012 is satisfied without touching `deriveProvider`'s lens code.

## Command argument payloads

Passed as the single `arguments[0]` of each CodeLens command. Kept
JSON-serializable because VS Code round-trips command arguments.

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
  parentUid: string;     // untrusted; server validates
  documentUri: string;
}
```

`documentUri` is carried so the handler can locate the `TextDocument` for the
dirty-check in research.md §3 without depending on which editor is active when
the click is processed.

## Server request bodies (existing schema, unchanged)

Both map onto `ReviewClearRequest`
([schemas.py:35-38](../../server/src/doorstop_server/schemas.py#L35-L38)):

```jsonc
// Do Review              → POST /review
{ "scope": "item", "target": "REQ-007" }

// Clear All Suspicions   → POST /clear
{ "scope": "item", "target": "REQ-007" }

// Clear the Suspicion    → POST /clear
{ "scope": "item", "target": "REQ-007", "parents": ["REQ-001"] }
```

`scope` is always `"item"` — document- and tree-wide review/clear stay with the
existing `doorstop.review` / `doorstop.clear` commands in the Commands view
(spec Assumptions).

## State transitions

Owned entirely by Doorstop; listed to make the observable file-level effect
explicit, since that is what FR-008 promises the user will see.

| Action | Before (on disk) | After (written by Doorstop `@auto_save`) |
| --- | --- | --- |
| Do Review | `reviewed: null` | `reviewed: <stamp>` |
| Clear All Suspicions | `- REQ-001: null`, `- REQ-002: null` | both entries stamped |
| Clear the Suspicion (`parents: [REQ-001]`) | `- REQ-001: null`, `- REQ-002: null` | `- REQ-001: <stamp>`, `- REQ-002: null` **unchanged** |

The third row is the observable difference that makes FR-006 / SC-003 testable,
and is what the new two-link fixture item exists to exercise.

## Invariants

1. The extension never writes a requirement file. Every transition above is
   produced by the server (Principle I).
2. `RequirementLensScan` is recomputed from text on every call and never cached
   across edits, so it cannot go stale.
3. No lens rendering path performs a network request (SC-005, research.md §2).
4. A `parentUid` read from text is never trusted: an unresolvable one produces a
   server 400 and no mutation.
