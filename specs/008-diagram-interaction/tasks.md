---

description: "Task list template for feature implementation"
---

# Tasks: Diagram Hot-Exit Backup Recovery

**Input**: Design documents from `/specs/008-diagram-interaction/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, quickstart.md

**Scope note**: `plan.md` scopes this feature to only the `openContext.backupId`
fix flagged in spec.md's Follow-up Tasks — FR-001 through FR-016 in spec.md
are already implemented and need no tasks here. Because of that, there is
exactly one user-story-equivalent phase below (labeled `[US1]`), not one per
FR/priority in spec.md.

**Tests**: Included. `research.md` Decision 3 explicitly decided to add
extension-host test coverage for this fix (not a generic TDD request, but a
concrete, already-decided deliverable), so test tasks are listed as part of
the story's implementation, not as an optional add-on.

**Organization**: Single user-story phase (the fix itself), since nothing
else in this feature needs new work.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (`US1` — the only one)
- Paths are exact and relative to the repository root

## Phase 1: Setup

None needed — no new dependency, scaffolding, or project structure is
required (see `plan.md` Technical Context: "None new"). Skipped rather than
padded with busywork tasks.

## Phase 2: Foundational

None needed — this fix touches exactly one existing function and reuses an
existing helper; there is no shared infrastructure to stand up first (see
`plan.md` Scale/Scope).

---

## Phase 3: User Story 1 - Diagram Hot-Exit Backup Recovery (Priority: P1) 🎯 MVP

**Goal**: Unsaved canvas edits (most visibly dragged node positions) survive
a VS Code crash or window reload instead of being silently lost, by making
`openCustomDocument` actually consult the hot-exit backup VS Code already
offers it.

**Independent Test**: `quickstart.md` Scenario 1 (drag a node, reload window
without saving, confirm the position persists) and Scenario 3 (corrupt/delete
the backup, confirm the diagram still opens showing the last saved state).

### Implementation for User Story 1

- [ ] T001 [US1] In `src/extension.ts`, change the `diagramEditorProvider.openCustomDocument` method's signature from `async openCustomDocument(uri)` to `async openCustomDocument(uri, openContext)`, and when `openContext.backupId` is truthy, attempt `await DoorstopDiagramPanel.readDiagram(vscode.Uri.file(openContext.backupId))` and use its result as the returned document's `diagram` field on success (research.md Decision 1).
- [ ] T002 [US1] In the same method (depends on T001, same file/function), wrap the backup read from T001 in try/catch: on any failure (backup missing despite `backupId` being set, unreadable, or fails `readDiagram`'s existing "Invalid diagram format" check) or when `openContext.backupId` is absent, fall back to today's unchanged behavior — `await DoorstopDiagramPanel.readDiagram(uri)` — so the diagram always still opens (research.md Decision 2; Constitution Principle III).
- [ ] T003 [P] [US1] In `src/test/extension.test.ts`, replace the placeholder `Sample test` with a real test that opens the `doorstop.diagram` custom editor for a temp `*.doorstop.json` file while passing a synthetic `openContext.backupId` pointing at a second temp diagram file with different node positions, and assert the opened document's `diagram` reflects the backup's positions, not the main file's (research.md Decision 3; different file from T001/T002 so parallelizable with those).
- [ ] T004 [US1] In `src/test/extension.test.ts` (depends on T003, same file), add a second test case: set `openContext.backupId` to a path that is missing or contains invalid JSON, and assert `openCustomDocument` still resolves successfully with `diagram` read from the original `uri` instead of throwing (research.md Decision 2 / quickstart.md Scenario 3).

**Checkpoint**: Run `quickstart.md` Scenarios 1, 2, and 3 by hand in the
Extension Development Host; all three MUST behave as that document describes
before considering this story done.

---

## Final Phase: Polish & Cross-Cutting Concerns

- [ ] T005 Run `npm run compile` (check-types + lint + build) and confirm it
  passes with no new errors/warnings — required by Constitution Principle V
  before this change ships.
- [ ] T006 [P] Manually execute `quickstart.md` Scenarios 1, 2, and 3
  end-to-end in a real Extension Development Host session (distinct from the
  narrower unit-level assertions in T003/T004) and record the outcome.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup / Foundational**: skipped — nothing to do (see above).
- **User Story 1 (Phase 3)**: no phase dependency; can start immediately.
- **Polish (Final Phase)**: depends on User Story 1 (Phase 3) being complete.

### Within User Story 1

- T001 → T002: same function, same file, strictly sequential.
- T003 → T004: same test file, sequential (T004 is added after T003 exists).
- T003 can run in parallel with T001/T002 (different file: test file vs.
  `src/extension.ts`), even though logically the test is most useful once the
  fix exists — there's no file conflict either order.

### Parallel Opportunities

- T003 (`src/test/extension.test.ts`) can be started in parallel with
  T001/T002 (`src/extension.ts`) since they're different files.
- T006 (manual quickstart run) can be prepared in parallel with T005 (compile
  check), though both are trivial enough that sequencing them is also fine.

---

## Parallel Example: User Story 1

```bash
# T001+T002 and T003 touch different files and can proceed in parallel:
Task: "Extend openCustomDocument to read openContext.backupId with fallback in src/extension.ts"
Task: "Add backup-restore test in src/test/extension.test.ts"
```

---

## Implementation Strategy

### MVP First (and only)

1. T001 + T002: make `openCustomDocument` actually use the backup, with a
   safe fallback.
2. T003 + T004: lock the behavior in with real tests, since this is exactly
   the kind of fix that silently regresses otherwise.
3. T005 + T006: compile gate + manual quickstart validation.
4. **STOP and VALIDATE**: this is the entire feature — there is no second
   increment to add. Once the checkpoint above passes, the Follow-up Task in
   `spec.md` can be marked done.

## Notes

- No `[US2]`/`[US3]`... phases exist because this plan deliberately scoped to
  one fix, not the whole (already-shipped) spec 008. If you want tasks for
  the rest of spec 008 too, that would need a separate `/speckit-plan` run
  scoped that way first — see the earlier plan-scope decision.
- Commit after T002 (the fix itself) and again after T004 (tests), so the
  fix and its test coverage are each reviewable on their own.
