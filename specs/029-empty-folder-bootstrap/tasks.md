---

description: "Task list for 029 Empty-Folder Bootstrap & Create Document in Commands Panel"
---

# Tasks: Empty-Folder Bootstrap & Create Document in Commands Panel

**Input**: Design documents from `/specs/029-empty-folder-bootstrap/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/ui-contract.md](contracts/ui-contract.md), [quickstart.md](quickstart.md)

**Tests**: Included. Constitution VI and VIII require a CI-run test per FR, each with a trace comment `// Spec 029 FR-NNN` directly above the test, listing every FR it verifies. Tests go in `src/test/emptyFolderBootstrap.test.ts` (static `package.json` checks follow the style of `src/test/packageMenus.test.ts`).

**Organization**: Grouped by user story. Paths are relative to the repo root.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [x] T001 Create `src/test/emptyFolderBootstrap.test.ts` with the suite skeleton and imports, modelled on `src/test/packageMenus.test.ts` and the temp-workspace helpers in `src/test/regressionFixture.test.ts`

---

## Phase 2: Foundational

- [x] T002 In `src/doorstopCommands.ts`, add an exported helper `isUnderGit(folderPath: string): boolean` that walks up from `folderPath` looking for a `.git` entry (directory or file) using `node:fs`; no new dependency

**Checkpoint**: helper available to both stories.

---

## Phase 3: User Story 1 - Start a Doorstop project in an empty folder (Priority: P1) 🎯 MVP

**Goal**: From an empty git folder, create the first document via the commands panel without reload; refuse clearly outside git.

**Independent Test**: quickstart steps 1, 2, 3, 5.

### Tests for User Story 1

- [x] T003 [P] [US1] In `src/test/emptyFolderBootstrap.test.ts`, test `isUnderGit` true for a folder with `.git` and for a subfolder of one, false for a bare temp folder (`// Spec 029 FR-004`)
- [x] T004 [P] [US1] In `src/test/emptyFolderBootstrap.test.ts`, test `package.json` `activationEvents` contains `onView:doorstop.commandsView` and `onCommand:doorstop.createDoc` (`// Spec 029 FR-001`)
- [x] T005 [US1] In `src/test/emptyFolderBootstrap.test.ts`, test that in an empty `git init` workspace `doorstop.createDoc` (input box, folder dialog and parent pick stubbed) creates the document and the tree shows it without a reload (`// Spec 029 FR-001 FR-002 FR-003`)
- [x] T006 [US1] In `src/test/emptyFolderBootstrap.test.ts`, test that in a workspace without git `doorstop.createDoc` shows an error containing "git version control", never opens the input box or dialog, and creates no files (`// Spec 029 FR-004 FR-009`)
- [x] T007 [P] [US1] In `src/test/emptyFolderBootstrap.test.ts`, test that cancelling the prefix prompt, the folder dialog, or the parent pick leaves the workspace folder unchanged (`// Spec 029 FR-009`)

### Implementation for User Story 1

- [x] T008 [US1] In `package.json`, add `"onView:doorstop.commandsView"` and `"onCommand:doorstop.createDoc"` to `activationEvents`, keeping `workspaceContains:**/.doorstop.yml`
- [x] T009 [US1] In `src/extension.ts` `startDoorstopServer`, remove the `findDoorstopMarker()` gate and its "No .doorstop.yml project was found" warning (keep the `!workspaceFolder` return); delete `findDoorstopMarker` if it becomes unused
- [x] T010 [US1] In `src/doorstopCommands.ts` `createDoc`, call `isUnderGit(options.workspaceFolder.uri.fsPath)` first; if false, `showErrorMessage("Doorstop: this folder is not under git version control. Run `git init` (or open a git repository) and try again.")` and return before any prompt (FR-004)
- [x] T011 [US1] In `src/doorstopCommands.ts` `createDoc`, set the folder dialog `defaultUri` to `options.workspaceFolder.uri` (FR-010)
- [x] T012 [P] [US1] In `src/test/emptyFolderBootstrap.test.ts`, test that the folder dialog is opened with `defaultUri` equal to the workspace folder (`// Spec 029 FR-010`)
- [x] T013 [US1] In `package.json`, add a `viewsWelcome` entry for `doorstop.treeView` with text pointing to the Commands view (e.g. "No Doorstop document yet. Use **Create Document** in the Commands view below.") shown when the tree is empty (FR-008)
- [x] T014 [P] [US1] In `src/test/emptyFolderBootstrap.test.ts`, test `package.json` `viewsWelcome` has an entry for `doorstop.treeView` (`// Spec 029 FR-008`)

**Checkpoint**: empty git folder bootstraps; non-git folder errors cleanly.

---

## Phase 4: User Story 2 - Create Document lives in the commands panel (Priority: P2)

**Goal**: Move the action from the explorer toolbar to the Commands view.

**Independent Test**: quickstart step 4.

### Tests for User Story 2

- [x] T015 [P] [US2] In `src/test/emptyFolderBootstrap.test.ts`, test `menus.view/title` and `menus.view/item/context` have no `doorstop.createDoc` entry (`// Spec 029 FR-005`)
- [x] T016 [P] [US2] In `src/test/emptyFolderBootstrap.test.ts`, test `DoorstopCommandsProvider.getChildren()` contains a "Create Document" node whose command is `doorstop.createDoc` (`// Spec 029 FR-006`)
- [x] T017 [P] [US2] In `src/test/emptyFolderBootstrap.test.ts`, test `contributes.commands` still declares `doorstop.createDoc` and it is not hidden in `menus.commandPalette` (`// Spec 029 FR-007`)

### Implementation for User Story 2

- [x] T018 [US2] In `package.json`, remove the `doorstop.createDoc` entry from `menus.view/title` (and any other tree menu entry)
- [x] T019 [US2] In `src/commandsProvider.ts`, add `this.createNode('Create Document', 'file-directory-create', 'doorstop.createDoc')` as the first node of `nodes`
- [x] T020 [US2] Update any existing test asserting the old toolbar entry (check `src/test/packageMenus.test.ts` and `src/test/extension.test.ts`)

**Checkpoint**: both stories work.

---

## Phase 5: Polish

- [x] T021 [P] Add a `CHANGELOG.md` entry and update `README.md` where it describes Create Document or getting started
- [x] T022 Run lint, compile and the full extension test suite; fix failures
- [ ] T023 Walk through [quickstart.md](quickstart.md) manually in the Extension Development Host

---

## Dependencies & Order

- T001 → T002 → US1 (T003..T014) → US2 (T015..T020) → Polish.
- US2 is independent of US1 except that both edit `package.json` (T008, T013, T018): do those sequentially.
- Within each story write the tests first and confirm they fail, then implement.

## Parallel Example

T003, T004, T007 (different test cases, same new file but independent blocks), T012, T014, T015, T016, T017 can be written together after T001.

## Implementation Strategy

MVP = Phase 1 + 2 + US1 (empty git folder bootstraps via the command palette and commands panel). Then US2 moves the action. Finish with Polish.

## Phase 6: Convergence

- [x] T024 Make the git guard in `src/doorstopCommands.ts` testable (for example `createDoc` takes the folder from `options.workspaceFolder`, so a test can register the commands against a temp non-git folder via `registerDoorstopCommands`), then add a test in `src/test/emptyFolderBootstrap.test.ts` asserting the error message contains "git version control", no input box or dialog opens, and no files are created per FR-004, FR-009 (partial)
- [x] T025 Add a test in `src/test/emptyFolderBootstrap.test.ts` that starts the server on an empty temp folder with a `.git` directory, runs Create Document with stubbed prompts, and asserts `GET /tree` lists the new document without restarting the server per FR-001, FR-002, FR-003 (missing)
- [ ] T026 Walk through quickstart.md steps 1 to 5 in the Extension Development Host and record the result in this file per FR-002, SC-001, SC-003 (partial)

## Phase 7: Python environment and Restart Extension (FR-011..FR-014, SC-005)

**Goal**: The server starts only with the interpreter of the Python environment VS Code has activated (waiting for it, no PATH fallback), the install re-checks the environment, and "Doorstop: Restart Extension" replaces "Restart Server". Existing FR-001..FR-010 work stays unchanged. Tests go in `src/test/emptyFolderBootstrap.test.ts` (or a new `src/test/pythonEnvironment.test.ts` with a `.vscode-test.mjs` entry) with `// Spec 029 FR-NNN` trace comments.

- [x] T027 [US1] Create `src/pythonEnvironment.ts` with a small VS Code-free-testable helper taking the Python extension `environments` API as a parameter: `getActiveInterpreter(api, uri): Promise<string | undefined>` (undefined when `getActiveEnvironmentPath` yields no `path`) and `onInterpreterChange(api, uri, cb): Disposable` (wraps `onDidChangeActiveEnvironmentPath`, calling `cb` with the new path); no PATH or setting fallback (FR-011, FR-012)
- [x] T028 [P] [US1] In `src/test/emptyFolderBootstrap.test.ts`, test `getActiveInterpreter` with a fake API: returns the path when active, undefined when none, and never consults anything else (`// Spec 029 FR-011 FR-012`)
- [x] T029 [US1] In `src/extension.ts`, replace `getActivePythonPath` with the T027 helper: when no interpreter is active show a one-time "Doorstop: waiting for the Python environment..." notice (no "server unavailable" warning, no PATH fallback), subscribe via `onInterpreterChange`, and start the server when an interpreter appears; when it changes while running, restart the server with the new interpreter. The waiting must not block `activate()` (FR-011, FR-012, SC-005)
- [x] T030 [P] [US1] In `src/test/emptyFolderBootstrap.test.ts`, test the wait/start behaviour of the extension logic against the fake API: no interpreter then an event starts the start callback exactly once, notice shown once, start is invoked with the event path (`// Spec 029 FR-011 FR-012 SC-005`); if the logic stays inline in `extension.ts`, move the wait-and-start loop into `src/pythonEnvironment.ts` so it is testable
- [x] T031 [US1] In `src/extension.ts` `promptToInstallServerPackage`, immediately before `installServerPackage`, re-read the active interpreter; if it differs from `pythonPath`, skip the install and call `startDoorstopServer(restart)` again for the new environment (FR-013)
- [x] T032 [P] [US1] In `src/test/emptyFolderBootstrap.test.ts`, test the re-check decision (extract a pure helper such as `sameInterpreter(current, offered)` in `src/pythonEnvironment.ts`): same path allows install, different or missing path blocks it (`// Spec 029 FR-013`)
- [x] T033 [US1] In `package.json` and `src/extension.ts`, rename command `doorstop.restartServer` to `doorstop.restartExtension` with title "Doorstop: Restart Extension"; the handler re-resolves the environment, re-checks the package, restarts the server (`startDoorstopServer(true)`) and refreshes the Explorer tree, Commands and Problems views (FR-014)
- [x] T034 [P] [US1] Replace user-facing mentions of "Doorstop: Restart Server" with "Doorstop: Restart Extension" in `src/doorstopServer.ts`, `src/diagrammPanel.ts`, `README.md` and `CHANGELOG.md` (add a CHANGELOG entry for FR-011..FR-014), and fix any existing test referencing `doorstop.restartServer` (FR-014)
- [x] T035 [P] [US1] In `src/test/emptyFolderBootstrap.test.ts`, test `package.json` declares `doorstop.restartExtension` titled "Doorstop: Restart Extension" and no `doorstop.restartServer`, and that the command is registered after activation (`// Spec 029 FR-014`)
- [x] T036 Run `npm run compile` and `npm test`; fix failures (port 7867 held by a user VS Code instance is reported, not fixed)
- [ ] T037 Walk through [quickstart.md](quickstart.md) steps 6 to 9 manually in the Extension Development Host (environment wait, switch, install re-check, Restart Extension) per FR-011..FR-014, SC-005

### Phase 7 Dependencies

T027 -> T028, T029 -> T030; T031 depends on T027; T033 independent of T027..T032 (shares `src/extension.ts`, so edit sequentially); T034, T035 after T033; T036 last; T037 is manual and stays open.
