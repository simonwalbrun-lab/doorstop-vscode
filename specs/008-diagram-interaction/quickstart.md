# Quickstart: Validate Diagram Hot-Exit Backup Recovery

Manual end-to-end validation for the fix described in `plan.md` /
`research.md`. No automated test is required to follow this guide, though one
is recommended (see `research.md` Decision 3).

## Prerequisites

- The extension built and running in an Extension Development Host
  (`F5` / `npm run compile` then launch), against a workspace with an existing
  `*.doorstop.json` diagram containing at least one node.
- The Doorstop server running (per spec 001) — needed for the diagram to load
  normally at all, unrelated to this fix.

## Scenario 1 — Backup recovers an unsaved position change

1. Open the diagram file.
2. Drag one node to a visibly different position. Do **not** press Ctrl+S.
   (This triggers `backupCustomDocument` in the background — VS Code writes a
   hot-exit backup automatically once the document is dirty.)
3. Run **Developer: Reload Window** from the Command Palette.
4. Reopen the same diagram file.

**Expected (after the fix)**: the node is still at the position you dragged it
to in step 2 — the unsaved change survived the reload.

**Today, before the fix**: the node reverts to its last-*saved* position —
the dragged change is lost.

## Scenario 2 — No backup exists (default path unchanged)

1. Open a diagram, make no changes.
2. Run **Developer: Reload Window**.
3. Reopen the same diagram file.

**Expected**: identical behavior to before this fix — the diagram opens
showing exactly what's on disk. This proves the fix doesn't alter the common
case where there's nothing to recover.

## Scenario 3 — Corrupt/unreadable backup falls back safely

1. Repeat Scenario 1 steps 1-2 to produce a pending backup.
2. Before reloading, locate and truncate or corrupt the backup file content
   (its path is VS Code-internal storage, not the workspace — findable via
   the `context.destination` value if you add a temporary log line, or by
   inspecting the workspace storage folder VS Code reports for this
   extension).
3. Run **Developer: Reload Window** and reopen the diagram.

**Expected**: the diagram still opens (no error dialog, no blank canvas) and
shows the last **saved** state — i.e. the fallback to the original file
engaged cleanly. This is the Constitution Principle III requirement in
practice: a bad backup must never be worse than no backup.

## Out of scope for this quickstart

- Re-verifying FR-001 through FR-016 (already-shipped behavior, unaffected by
  this fix, already covered by spec 008's own acceptance scenarios).
- Any server-side behavior — this fix has no server component.
