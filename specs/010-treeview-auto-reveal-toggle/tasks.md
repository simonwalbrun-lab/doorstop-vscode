---

description: "Task list template for feature implementation"
---

# Tasks: Treeview Auto-Reveal Toggle

**Input**: Design documents from `/specs/010-treeview-auto-reveal-toggle/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/commands.md, quickstart.md

**Tests**: One automated test is included (see `[US1]` below), matching `plan.md`'s recommendation — not a hard TDD request from spec.md, but a concrete, already-decided verification for the one behavior that's easy to silently regress (the guard clauses). Everything else is verified manually via `quickstart.md`.

**Organization**: Tasks are grouped by the four user stories in `spec.md` (US1-US4). Note that US2/US3/US4 turn out to need very little *new* code of their own — most of the real implementation is either in Foundational (shared plumbing) or US1 (the guard clauses); US2-US4 each still contribute one genuinely distinct piece (US2's "on" command handler) or are otherwise verification-only, which is called out explicitly per phase below rather than padded with invented work.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1-US4)
- Paths are exact and relative to the repository root

## Phase 1: Setup

None needed beyond what's listed in Foundational below — no new dependency
to install (see `plan.md` Technical Context: "None new").

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Declarative wiring and activation-time state that every user
story depends on.

- [X] T001 [P] In `package.json`, add two entries to `contributes.commands` — `doorstop.toggleAutoReveal` (title "Doorstop: Disable Auto-Reveal", icon `$(sync)`) and `doorstop.enableAutoReveal` (title "Doorstop: Enable Auto-Reveal", icon `$(sync-ignored)`) — and two entries to `contributes.menus['view/title']` with `group: "navigation"`, `when: "view == doorstop.treeView && doorstop.autoRevealEnabled"` for the first and `when: "view == doorstop.treeView && !doorstop.autoRevealEnabled"` for the second (`contracts/commands.md`).
- [X] T002 [P] In `src/extension.ts`'s `activate()`, read the persisted preference via `context.globalState.get<boolean>('doorstop.autoRevealEnabled', true)` into a local variable (default `true` per `data-model.md` — must resolve to `true` if the stored value is missing or unreadable, never `false`), and mirror it once via `vscode.commands.executeCommand('setContext', 'doorstop.autoRevealEnabled', value)` (research.md Decisions 2 & 4).

**Checkpoint**: the two title-bar buttons are declared and one is visible by
default; the preference is readable at startup. No behavior changes yet
until US1/US2 add the command handlers and guards.

---

## Phase 3: User Story 1 - Turn off auto-reveal to stop the tree from jumping (Priority: P1) 🎯 MVP

**Goal**: Clicking the title-bar toggle stops the Explorer tree from
automatically revealing/selecting in response to the active editor
changing, a hover-link click, or a diagram-node click.

**Independent Test**: `quickstart.md` Scenario 2 — toggle off, then try all
three triggers and confirm none of them move the tree; then confirm a
manual tree click still opens a file.

### Implementation for User Story 1

- [X] T003 [US1] In `src/extension.ts`, register the `doorstop.toggleAutoReveal` command (depends on T002, same file): set the local cached variable to `false`, call `context.globalState.update('doorstop.autoRevealEnabled', false)`, and mirror it via the same `setContext` call as T002.
- [X] T004 [US1] In `src/extension.ts`'s `syncActiveRequirement` function (depends on T002), add a guard at the top: `if (!autoRevealEnabled) { return; }`, before any of the existing `treeProvider.setActiveResource`/`treeView.reveal` calls.
- [X] T005 [US1] In `src/extension.ts`'s `doorstop.activateRequirement` command handler (depends on T002; same file as T004, sequential), add the identical guard before its existing reveal logic.
- [X] T006 [P] [US1] In `src/test/extension.test.ts`, replace/extend the placeholder `Sample test` with a real test that sets the preference to `false` and asserts `treeView.reveal` is not invoked when `syncActiveRequirement` and the `doorstop.activateRequirement` handler are triggered (different file from T003-T005, so parallelizable with them, though it's most useful once they exist).

**Checkpoint**: run `quickstart.md` Scenario 2 by hand — this is the MVP;
the feature already delivers its primary value at this point.

---

## Phase 4: User Story 2 - Turn auto-reveal back on (Priority: P1)

**Goal**: The toggle is genuinely reversible — clicking it again restores
today's existing reveal behavior.

**Independent Test**: `quickstart.md` Scenario 3 — with the toggle off,
click it again and confirm reveal-on-navigate works again exactly as it did
before this feature existed.

### Implementation for User Story 2

- [X] T007 [US2] In `src/extension.ts` (depends on T002; same file as T003-T005, sequential), register the `doorstop.enableAutoReveal` command: set the local cached variable to `true`, call `context.globalState.update('doorstop.autoRevealEnabled', true)`, and mirror it via `setContext`. This is the only new code US2 needs — the guards added in US1 (T004/T005) already check this same variable, so flipping it back to `true` restores reveal behavior with no further changes.
- [ ] T008 [US2] Manually run `quickstart.md` Scenario 3 and confirm reveal-on-navigate is restored after toggling back on.

**Checkpoint**: both directions of the toggle now work end-to-end.

---

## Phase 5: User Story 3 - See the current toggle state at a glance (Priority: P2)

**Goal**: The button's icon alone (no tooltip needed) makes the current
on/off state obvious.

**Independent Test**: `quickstart.md` Scenario 4 — toggle a few times,
glancing only at the icon.

### Implementation for User Story 3

This story needs no new code: the two distinct icons and their
complementary `when` clauses were already declared in T001, and only one of
the two commands is ever visible at a time by construction (VS Code's menu
`when`-clause filtering). The only remaining work is confirming it:

- [ ] T009 [US3] Manually run `quickstart.md` Scenario 4 (and re-check Scenario 1's baseline icon) and confirm the icon swap is immediate and unambiguous on every toggle.

**Checkpoint**: visual feedback confirmed with no code changes needed beyond Foundational.

---

## Phase 6: User Story 4 - Preference persists across sessions (Priority: P3)

**Goal**: The on/off choice survives a VS Code restart or window reload.

**Independent Test**: `quickstart.md` Scenario 5 — turn the toggle off,
reload the window, confirm it's still off.

### Implementation for User Story 4

This story also needs no new code: T003/T007 already persist the
preference via `context.globalState.update`, and T002 already reads it back
at activation. The only remaining work is confirming the round trip:

- [ ] T010 [US4] Manually run `quickstart.md` Scenario 5: toggle off, run **Developer: Reload Window**, and confirm the preference and the button's icon are both still showing "off" afterward.

**Checkpoint**: all four user stories now verified end-to-end.

---

## Final Phase: Polish & Cross-Cutting Concerns

- [X] T011 Run `npm run compile` (check-types + lint + build) and confirm it passes with no new errors/warnings — required by Constitution Principle V before this change ships.
- [ ] T012 [P] Manually run `quickstart.md` Scenario 6 (toggling works even before the tree/server has finished loading — FR-007) — a cross-cutting robustness check that doesn't belong to any single story.
- [ ] T013 [P] Manually run `quickstart.md` Scenario 1 as a final regression check: on a fresh run with no prior toggle use, confirm auto-reveal is on by default and behavior is unchanged from before this feature existed.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup**: skipped — nothing to do.
- **Foundational (T001-T002)**: no dependencies; T001 and T002 can run in parallel (different files).
- **User Story 1 (T003-T006)**: depends on Foundational (T002 specifically, for the cached variable).
- **User Story 2 (T007-T008)**: depends on Foundational (T002); independent of User Story 1's guard tasks (T004/T005) but shares the same file, so sequence T007 after T003-T005 to avoid concurrent edits to `src/extension.ts`.
- **User Story 3 (T009)**: depends on T001 (icons/menus) and T003+T007 (both commands actually working) — verification only.
- **User Story 4 (T010)**: depends on T003+T007 (the `globalState.update` calls) — verification only.
- **Polish (T011-T013)**: depends on all of the above.

### Parallel Opportunities

- T001 (`package.json`) and T002 (`src/extension.ts`) can run in parallel.
- T006 (`src/test/extension.test.ts`) can run in parallel with T003-T005/T007 (different file), though it's most meaningful once they exist.
- T012 and T013 (both manual, no file changes) can be done in parallel with each other.

---

## Parallel Example: Foundational + User Story 1

```bash
# T001 and T002 touch different files and can proceed in parallel:
Task: "Add doorstop.toggleAutoReveal / doorstop.enableAutoReveal commands and menu entries in package.json"
Task: "Read and mirror the autoRevealEnabled preference at activation in src/extension.ts"

# Once T002 lands, T006 can be written in parallel with T003-T005 (different file):
Task: "Add reveal-suppressed-when-off test in src/test/extension.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. T001 + T002 (Foundational).
2. T003 + T004 + T005 + T006 (User Story 1) — the toggle can now turn
   auto-reveal off.
3. **STOP and VALIDATE**: `quickstart.md` Scenario 2. This alone already
   delivers the feature's primary motivation.

### Incremental Delivery

1. Foundational → User Story 1 (MVP: can turn it off).
2. + User Story 2 (T007-T008): can turn it back on.
3. + User Story 3 (T009): confirmed visually unambiguous (no new code).
4. + User Story 4 (T010): confirmed persistent (no new code).
5. Polish (T011-T013): compile gate + remaining cross-cutting quickstart
   scenarios.

## Notes

- Commit after T006 (Foundational + US1 complete and tested) and again
  after T007 (US2's command handler), so the "off" and "on" halves are each
  reviewable on their own.
- US3 and US4 having no dedicated implementation tasks is expected, not a
  gap — see the Organization note at the top of this file.
