# Research: Diagram Hot-Exit Backup Recovery

No `[NEEDS CLARIFICATION]` markers exist in the Technical Context — the
existing code (`src/extension.ts`, `src/diagrammPanel.ts`) and the VS Code
`CustomEditorProvider` API fully determine the approach. This document
records the decisions made and the alternatives rejected.

## Decision 1: Read from `openContext.backupId` when present, falling back to `uri`

**Decision**: Change `openCustomDocument(uri)` to
`openCustomDocument(uri, openContext)`. When `openContext.backupId` is set,
attempt to read and parse the diagram from
`vscode.Uri.file(openContext.backupId)` (reusing
`DoorstopDiagramPanel.readDiagram`, since the backup file is written by
`backupCustomDocument` using the same `serializeDiagram` format as the main
file). If that succeeds, use it as `document.diagram`. Otherwise (no
`backupId`, or the read/parse fails) fall back to today's behavior: read from
`uri`.

**Rationale**: This is exactly the contract VS Code's `CustomEditorProvider`
defines `backupId` for — `backupCustomDocument` already writes the backup on
every canvas change (drag, add, link, delete); the write half of the contract
is done, only the read half is missing. Reusing `readDiagram` means the backup
and main-file code paths share one parser instead of two, consistent with
this codebase's existing preference for one implementation per behavior.

**Alternatives considered**:
- **Do nothing (leave as a known limitation)** — rejected: this is the exact
  bug the fix targets, and `backupCustomDocument` already does the work of
  writing the backup for no benefit today.
- **Prompt the user "Restore unsaved changes?" instead of silently loading the
  backup** — rejected for this fix: VS Code's own text-editor hot-exit
  recovery is transparent by default (no prompt), so matching that convention
  is more consistent with user expectations. Nothing about this design
  prevents adding a prompt later if desired.
- **Persist canvas state via `ExtensionContext.workspaceState`/`globalState`
  instead of relying on the `CustomDocument` backup contract** — rejected:
  this would duplicate a mechanism the platform already provides for exactly
  this purpose, adding a second state-recovery path to maintain for no
  benefit.

## Decision 2: Fall back to the original file, never throw, on a bad backup

**Decision**: Wrap the backup read in its own try/catch. Any failure (file
missing despite `backupId` being set, unreadable, or fails the existing
"Invalid diagram format" check in `readDiagram`) falls back to reading `uri`
normally — the diagram must still open.

**Rationale**: Matches the constitution's Principle III ("All Features Must
Include Error Handling") and the precedent already set by spec 007's FR-006
(a metadata-fetch failure falls back to rendering exactly what's on disk
rather than breaking the view). A corrupt or partially-written backup must
never be worse than having no backup at all.

**Alternatives considered**:
- **Let the read fail and surface VS Code's generic "Unable to open" error**
  — rejected: strictly worse UX than today's behavior for the one case (a bad
  backup) this fix is not primarily targeting, and inconsistent with the
  fallback-first error handling this codebase already practices elsewhere.

## Decision 3: Add one real extension-host test; don't build new test infra

**Decision**: Add a test to `src/test/extension.test.ts` (via the existing,
currently-unused `@vscode/test-cli` / `@vscode/test-electron` harness) that
opens the diagram custom editor with a synthetic `backupId` pointing at a
temp file with different node positions than the main file, and asserts the
backup's positions win. Recommended, not a hard gate — the constitution's
mandatory-test clause (Principle V) is scoped to server/Python changes.

**Rationale**: This exact code path — "did we actually read the value VS Code
handed us" — is trivial to silently regress (e.g., a future refactor of
`openCustomDocument`'s signature) with no other safety net, since there is
currently no extension-host test coverage at all beyond the placeholder
sample. The harness already exists and is otherwise idle.

**Alternatives considered**:
- **Manual quickstart validation only** — acceptable minimum (see
  `quickstart.md`), and what would happen if the recommended test is skipped
  at implementation time; not the preferred path given how cheap the real
  test is once the harness is already wired up.
