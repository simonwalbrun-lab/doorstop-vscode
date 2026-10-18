---

description: "Task list for 034 YAML Header Folding"
---

# Tasks: YAML Header Folding

**Input**: Design documents from `/specs/034-yaml-header-folding/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/contributions.md](contracts/contributions.md), [quickstart.md](quickstart.md)

**Tests**: Included. Constitution VI and VIII require a CI-run test per FR with a trace comment `// Spec 034 FR-NNN` directly above the test. All tests go in `src/test/headerFolding.test.ts`, run with no workspace folder and no server. Fixture: the suite creates a temp dir under `os.tmpdir()` in `suiteSetup` and removes it in `suiteTeardown`:

- `DOC/.doorstop.yml` (content `settings:\n  prefix: DOC\n`)
- `DOC/DOC-001.md`: `---\nactive: true\nlevel: 1.0\n---\n\nText.\n` (valid header, closing fence on line 3)
- `DOC/sub/DOC-002.md`: same content (item in a subfolder)
- `DOC/DOC-003.md`: `---\nactive: true\n\nText.\n` (no closing fence)
- `DOC/DOC-004.md`: `---\n---\nText.\n` (empty header)
- `DOC/DOC-005.md`: `\n---\nactive: true\n---\n` (fence not on line 1)
- `NOTES/NOTE.md`: valid header, no `.doorstop.yml` above it

Settings are written with `ConfigurationTarget.Global` and reset to `undefined` in `teardown`. Activate the extension with `vscode.extensions.getExtension('SimonWalbrun.doorstop')?.activate()` in `suiteSetup`. "Our range" means the range from `vscode.executeFoldingRangeProvider` with `start === 0`.

**Organization**: Grouped by user story. Paths are relative to the repo root.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 [P] Add label `headerFolding` to `.vscode-test.mjs` with `files: 'out/test/headerFolding.test.js'` and no `workspaceFolder`, with a one-line comment "Spec 034: folding provider and button, temp fixture, no workspace, no server."
- [X] T002 [P] Create `src/test/headerFolding.test.ts` with `suite('YAML Header Folding (034)')`, the fixture from the header of this file in `suiteSetup`/`suiteTeardown`, the settings reset in `teardown`, and helpers `rangesFor(file): Promise<vscode.FoldingRange[]>` (opens the doc, calls `vscode.executeFoldingRangeProvider`) and `waitFor(predicate, timeoutMs = 5000)` (polls every 50 ms, throws on timeout)

---

## Phase 2: Foundational

- [X] T003 [P] In `src/reviewLensProvider.ts` export `getMetadataLineRange` (no other change)
- [X] T004 [P] In `package.json` add the setting `doorstop.foldYamlHeaderOnOpen` (`"type": "boolean"`, `"default": false`, description from [contracts/contributions.md](contracts/contributions.md)) in a new configuration section titled `Editor` (after `Timing`), and add top-level `contributes.configurationDefaults` `{ "[markdown]": { "editor.foldingImportsByDefault": true } }`
- [X] T005 Create `src/headerFolding.ts` exporting `registerHeaderFolding(context: vscode.ExtensionContext): void` (empty body for now), and call it in `src/extension.ts` right after `context.subscriptions.push(watchProblemReportingMode(...))`, outside the `if (workspaceFolder)` block so it runs without a folder or server

**Checkpoint**: compiles; setting visible in Settings UI.

---

## Phase 3: User Story 1 - Fold the YAML header (Priority: P1) MVP

**Goal**: Markdown Doorstop items get one fold covering the header.

**Independent Test**: open `DOC-001.md`, fold and unfold the header.

### Tests

- [X] T006 [P] [US1] `// Spec 034 FR-001, FR-009` test: `DOC/DOC-001.md` and `DOC/sub/DOC-002.md` each have our range with `start 0, end 3`; with the setting on, `DOC-003.md`, `DOC-004.md`, `DOC-005.md` have no range of kind `Imports` (the kind marks our range, so built-in Markdown ranges cannot mask the result). No server is started in this suite, which is the FR-009 check
- [X] T007 [P] [US1] `// Spec 034 FR-007` test: with the setting on, `NOTES/NOTE.md` has no range of kind `FoldingRangeKind.Imports`
- [X] T008 [P] [US1] `// Spec 034 FR-008` test: open `DOC-001.md` in an editor, run `editor.fold` with `{ selectionLines: [0] }`, then `editor.unfold` with the same args; `document.isDirty` stays `false` and `getText()` is unchanged

### Implementation

- [X] T009 [US1] In `src/headerFolding.ts` add `isDoorstopItem(fsPath: string): boolean`: true when the extension is `.md` and `fs.existsSync(path.join(dir, '.doorstop.yml'))` for the file's folder or any ancestor up to the filesystem root (stop when `path.dirname(dir) === dir`); wrap in try/catch, errors return false. Add a `// ponytail:` comment: "any .md under a document folder counts, also non-item notes; ask the server's item list when it is up if that matters"
- [X] T010 [US1] In `src/headerFolding.ts` register a `FoldingRangeProvider` for `{ language: 'markdown', scheme: 'file' }` (push the disposable to `context.subscriptions`): if `!isDoorstopItem(document.uri.fsPath)` return `[]`; else `getMetadataLineRange(document, document.getText().split(/\r?\n/))`; return `[]` if undefined or `range.end < 2`; else `[new vscode.FoldingRange(0, range.end, kind)]` where `kind` comes from T012 (use `undefined` until then)

**Checkpoint**: header folds by hand in normal editors; T006-T008 pass.

---

## Phase 4: User Story 2 - Header folded on open (Priority: P1)

**Goal**: with the switch on, VS Code folds the header when an editor first shows the file.

**Independent Test**: set `doorstop.foldYamlHeaderOnOpen` to true, open `DOC-001.md`: header folded.

### Tests

- [X] T011 [P] [US2] `// Spec 034 FR-002` test: setting on: our range for `DOC-001.md` has kind `FoldingRangeKind.Imports`; close all editors, `showTextDocument(DOC-001.md)`, `waitFor` until `editor.visibleRanges` has a range ending on line 0 and the next starting on line 4 (header lines 1-3 hidden). Setting off: our range has no kind; close all editors, reopen, `waitFor` 1 s then assert line 1 is inside `visibleRanges`
- [X] T012 [P] [US2] `// Spec 034 FR-003` test: setting on, open `DOC-001.md`, wait until folded, run `editor.unfold` with `{ selectionLines: [0] }`, open `DOC-002.md`, switch back to `DOC-001.md` with `showTextDocument`, assert line 1 is visible

### Implementation

- [X] T013 [US2] In `src/headerFolding.ts` set the range kind to `vscode.FoldingRangeKind.Imports` when `vscode.workspace.getConfiguration('doorstop').get<boolean>('foldYamlHeaderOnOpen', false)` is true, else `undefined`; add an `EventEmitter<void>` exposed as the provider's `onDidChangeFoldingRanges`, fired from `vscode.workspace.onDidChangeConfiguration` when `event.affectsConfiguration('doorstop.foldYamlHeaderOnOpen')`; push emitter and listener to `context.subscriptions`. One comment line pointing to research R1: VS Code's `editor.foldingImportsByDefault` (set for Markdown in `package.json`) does the folding, also in peek editors

**Checkpoint**: switching the setting by hand folds new files; T011-T012 pass.

---

## Phase 5: User Story 3 - Button and setting (Priority: P1)

**Goal**: title-bar button flips the setting; button follows the setting.

**Independent Test**: click the button, setting flips; edit the setting, button icon flips.

### Tests

- [X] T014 [P] [US3] `// Spec 034 FR-004` test (static manifest check in the style of `src/test/packageMenus.test.ts`): `doorstop.foldYamlHeaderOnOpen.on` and `.off` each have exactly one `view/title` entry with group `navigation` and the `when` clauses from [contracts/contributions.md](contracts/contributions.md); the two commands have different `icon` values and different `title` values
- [X] T015 [P] [US3] `// Spec 034 FR-005` test: default of `doorstop.foldYamlHeaderOnOpen` is `false` (manifest and `getConfiguration`); execute `doorstop.foldYamlHeaderOnOpen.on` → `get` returns `true`; execute `.off` → `false` (no folder open, so this also covers the Global fallback)

### Implementation

- [X] T016 [US3] In `package.json` add the two commands from [contracts/contributions.md](contracts/contributions.md) (titles and icons verbatim) and the two `view/title` entries after the `doorstop.problemReporting.*` entries
- [X] T017 [US3] In `src/headerFolding.ts` register both commands with `registerCommand` from `./timing`: each calls `vscode.workspace.getConfiguration('doorstop').update('foldYamlHeaderOnOpen', value, vscode.workspace.workspaceFolders ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global)`; push to `context.subscriptions`

**Checkpoint**: button works and follows manual setting edits; T014-T015 pass.

---

## Phase 6: User Story 4 - Peek editor (Priority: P2)

**Goal**: same behaviour in the references / call hierarchy peek editor. No code beyond US1-US2: VS Code applies the same folding to peek editors.

**Independent Test**: manual step 4 in [quickstart.md](quickstart.md).

- [X] T018 [P] [US4] `// Spec 034 FR-006` test: `vscode.workspace.getConfiguration('editor', { languageId: 'markdown' }).get('foldingImportsByDefault')` is `true`, and the manifest's `configurationDefaults['[markdown]']['editor.foldingImportsByDefault']` is `true`. Comment above the test: peek editors are not reachable from the test API; they use the same setting and range kind as the editor checked in FR-002
- [ ] T019 [US4] Run the manual peek check (quickstart step 4) in the Extension Development Host with `testdata/regression`; if the header is not folded in the peek editor, stop and report: R1 is wrong and the plan needs a new approach

---

## Phase 7: Polish

- [X] T020 Run `npm run compile` and `npx vscode-test --label headerFolding`; fix lint/type errors
- [ ] T021 Run the full quickstart manual check ([quickstart.md](quickstart.md) steps 1-6)
- [X] T022 [P] Add a `CHANGELOG.md` entry under the unreleased section in the existing style: "Fold the YAML header of Markdown items, optionally folded on open (button in the Doorstop tree view title bar, setting `doorstop.foldYamlHeaderOnOpen`)"
- [X] T023 Check every FR-001..FR-009 appears in a `// Spec 034` trace comment in `src/test/headerFolding.test.ts` (`grep -o "FR-00[0-9]"`)

---

## Dependencies

- Phase 1 and 2 before all stories. T005 depends on T003-T004 only for compiling.
- US1 (T009-T010) before US2 (T013 changes the provider from T010).
- US3 is independent of US1/US2 except for the shared file `src/headerFolding.ts` (do not edit it in parallel with T009/T010/T013).
- US4 needs US1 + US2 (T004 provides its setting default).
- Tests inside a phase are [P] with each other (same file, separate `test` blocks; write them one after another if editing conflicts).

## Parallel Examples

- Setup: T001 ‖ T002
- Foundational: T003 ‖ T004, then T005
- US3: T014 ‖ T016 (test file vs `package.json`)

## Implementation Strategy

1. MVP = Phases 1-3: a fold control on every item header.
2. Add US2 (the actual time saver), then US3 (button), then verify US4 by hand.
3. Total new code target: `src/headerFolding.ts` around 40 lines.

---

## Phase 8: Convergence

- [X] T024 Remove the `export` keyword from `isDoorstopItem` in `src/headerFolding.ts` (no caller outside the module) per plan: Source Code (unrequested)
