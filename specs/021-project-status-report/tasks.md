# Tasks: Commands Panel Updates & Project Status Report

**Input**: Design documents from `specs/021-project-status-report/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Required by Constitution Principle VI (at least one CI-runnable test per feature). There is one new vscode-test file, `src/test/statusReport.test.ts`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on unfinished tasks)
- **[Story]**: US1 Publish All, US2 Running indicator, US3 Status report, US4 Commands panel row

---

## Phase 1: Setup

There is nothing to set up. The project, the build and the test runner already exist, and no dependency is added (plan, Principle IV).

---

## Phase 2: Foundational (blocks US1, US2, US3)

- [X] T001 In `src/doorstopCommands.ts`, change `run` inside `registerDoorstopCommands` from `run(op)` to `run<T>(title: string, op: () => Promise<T>)`. No behaviour change yet. Pass a title at every existing call site:
  - `'Create Document'` in createDoc
  - `'Add Item'` in add
  - `'Review'` in review
  - `'Clear Suspect'` in clear
  - `'Link Items'` in link
  - `'Reorder Document'` in all four reorder calls (auto, manual apply, discard index, generate index)
  - `'Import'` in importCommand
  - `'Export'` in exportCommand
  - `'Publish'` in publish

  Then run `npm run check-types`.

**Checkpoint**: `npm run compile` passes and behaviour is unchanged.

---

## Phase 3: User Story 1 - Publish all documents at once (Priority: P1) 🎯 MVP

**Goal**: The Publish picker offers `all`. That publishes every document into one folder, stops at the first failure, and reports the count on success.

**Independent Test**: In a project with 2 or more documents, run Publish, choose `all`, then HTML, then an empty folder. There is one output per document plus a message saying "Published N document(s) to <folder>." (quickstart scenario 1).

- [X] T002 [US1] In `src/doorstopCommands.ts`, inside the `doorstop.publish` handler, extract the existing request plus template handling into a local `publishOne(prefix: string, format: 'markdown' | 'html' | 'latex', destinationPath: string): Promise<{ path: string }>`. It keeps:
  - the rule that Markdown sends no template;
  - the `.catch` that appends `(template "<t>" from setting doorstop.publish.template)`.

  The single-document path then calls `run('Publish', () => publishOne(...))` followed by `reportWrittenPath` exactly as today (FR-005).
- [X] T003 [US1] In the same handler, replace `choosePrefix(options.tree)` with the existing `chooseDocumentOrAll(options.tree)` (research R2; it lists `all` last, as Review and Clear do). For any choice other than `'all'`, keep the save-dialog flow from T002.
- [X] T004 [US1] In the same handler, implement the `'all'` branch (contracts/commands.md, steps 3–5):
  1. Ask for the format with the same quick pick as today.
  2. Ask for a folder: `vscode.window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false, openLabel: 'Publish All' })`. Return if dismissed.
  3. Collect the prefixes with `documentRoots(options.tree)`, filtered to non-empty `itemData.prefix`. If there are none, show `showInformationMessage('No documents to publish.')` and return.
  4. Inside a single `run('Publish', async () => { ... })`, loop over the prefixes **sequentially**. For each, call `publishOne(prefix, format.value, path.join(folder.fsPath, prefix + ext))`, where `ext` = `{ markdown: '.md', html: '.html', latex: '.tex' }[format.value]`. Wrap each call so that a failure throws `new Error(\`Publish of ${prefix} failed: ${message}\`)`. This stops the loop (fail fast, spec FR-003); `run` already shows `Doorstop command failed: …`. Return the count.
  5. If the result is defined, show `showInformationMessage(\`Published ${count} document(s) to ${folder.fsPath}.\`)` (FR-004).

**Checkpoint**: quickstart scenario 1 passes manually. Single-document publish is unchanged.

---

## Phase 4: User Story 2 - See that a command is still running (Priority: P1)

**Goal**: Every command's server work shows a progress notification and cannot run twice in parallel.

**Independent Test**: Run Publish → `all`. A "Doorstop: Publish…" notification stays visible until the summary appears. Running Publish again meanwhile shows "already running". Pressing Escape at Export's first prompt shows no notification (quickstart scenario 2).

- [X] T005 [US2] In `src/doorstopCommands.ts`, extend `run(title, op)` (research R3, data-model "Command run state"):
  1. Before `registerDoorstopCommands` returns, declare `const busy = new Set<string>()` in its scope.
  2. If `busy.has(title)`, call `void vscode.window.showInformationMessage(\`Doorstop: ${title} is already running.\`)` and return `undefined`.
  3. Otherwise `busy.add(title)` and execute `op` inside `vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: \`Doorstop: ${title}…\` }, () => op())`.
  4. Keep the existing refresh-on-success and error-message behaviour.
  5. `busy.delete(title)` in a `finally`.

  Do **not** guard in `register()`: the manual Reorder handler waits on a notification while its second step re-runs Reorder.

**Checkpoint**: quickstart scenario 2 passes manually.

---

## Phase 5: User Story 3 - Generate a project status report (Priority: P2)

**Goal**: `doorstop.statusReport` writes and opens `doorstop-status.md` with the three chart sections in [contracts/status-report-format.md](contracts/status-report-format.md).

**Independent Test**: `npm test` runs `src/test/statusReport.test.ts` green. Manually, quickstart scenario 3.

### Tests for User Story 3

- [X] T006 [P] [US3] Create `src/test/statusReport.test.ts` (mocha `suite`/`test` plus `assert`, in the style of `src/test/documentViewModel.test.ts`). Build `DocumentNode`/`ValidationIssue` fixtures inline. Test:
  1. **Items chart**: two documents (`REQ` with 3 items, `TST` with 0) produce a mermaid block that contains `x-axis ["REQ", "TST"]` and `bar [3, 0]`.
  2. **Problems chart**: `REQ` has 2 issues with `check: 'unreviewed'` and 1 issue with `check: 'suspect-link'` whose `uids` lists 2 UIDs. Expect `x-axis ["unreviewed", "suspect-link"]` and `bar [2, 1]`; one issue counts once.
  3. `TST` without issues gives `### TST` followed by `No problems.`
  4. An empty `documents` array gives `No documents.` in both the items and problems sections, with no `xychart` there.
  5. `volatility: { unavailable: 'not a git repository' }` gives `Version history unavailable: not a git repository.` and no volatility chart.
  6. `parseGitLog` on a fixed string with 2 commits returns their dates and file lists.
  7. `weeklyVolatility`:
     - with `now` = 2026-10-07 (a Wednesday), it returns exactly 26 entries;
     - the last `weekStart` is 2026-10-05 (a Monday);
     - a commit dated 2026-10-06 that changes `reqs/REQ001.yml`, `reqs/REQ002.yml`, `reqs/.doorstop.yml` and `src/a.ts` counts **2** for the last week, given a `REQ` document whose `markerPath` is `<root>/reqs/.doorstop.yml`;
     - weeks without commits are 0.
  8. A label containing `"` has the quote removed.
  9. `package.json` contributes `doorstop.statusReport` with title `Doorstop: Generate Status Report` (read the manifest as `src/test/packageMenus.test.ts` does).

  These tests fail until T007/T008 exist.

### Implementation for User Story 3

- [X] T007 [US3] Create `src/statusReport.ts` with pure, exported functions, typed against `DocumentNode`/`ValidationIssue` from `src/doorstopTypes.ts`:
  - `parseGitLog(output: string): { date: Date; files: string[] }[]`
    - Records are separated by `\0`, as produced by `--format=%x00%aI --name-only`.
    - The first non-empty line of a record is the ISO date; the remaining non-empty lines are files, with `\` normalised to `/`.
  - `weeklyVolatility(commits, documents, workspaceRoot: string, now: Date): { weekStart: Date; changedItemFiles: number }[]`
    - Exactly 26 weeks, oldest first, each starting Monday 00:00 local time; the last one is the current week.
    - A file counts when all of these hold (research R5):
      - its directory equals `path.relative(workspaceRoot, path.dirname(doc.markerPath))` with `/` separators;
      - its basename starts with `doc.prefix` (case-insensitive);
      - its extension is `.yml` or `.md`.
    - Sum per commit, then per week. Commits outside the 26 weeks are ignored.
  - `buildStatusReport(input: { projectName: string; generatedAt: Date; documents: DocumentNode[]; issues: ValidationIssue[]; volatility: { weekStart: Date; changedItemFiles: number }[] | { unavailable: string } }): string`
    - Produces exactly the layout and rules of `contracts/status-report-format.md`.
    - Uses `xychart` blocks with double-quoted labels, `"` stripped.
    - Documents keep input order. Problem types are sorted by count descending, then name ascending. Week labels are `YYYY-MM-DD`.
- [X] T008 [US3] In `src/statusReport.ts`, add `readGitLog(cwd: string): Promise<string>`. It calls `child_process.execFile('git', ['log', '--since=26 weeks ago', '--format=%x00%aI', '--name-only', '--relative'], { cwd, maxBuffer: 64 * 1024 * 1024 })` and rejects with git's stderr or error message. Node stdlib only, with no shell (research R5).
- [X] T009 [US3] In `src/doorstopCommands.ts`, register `doorstop.statusReport` and add it to the returned disposables array:
  1. Run `const uri = await run('Generate Status Report', async () => { ... })`.
  2. Inside it, fetch `GET /tree` (`TreeResponse`) and `GET /validate` (`ValidationResponse`). If either throws, the error propagates, so nothing is written (FR-019).
  3. Get the volatility: `readGitLog(options.workspaceFolder.uri.fsPath)` → `parseGitLog` → `weeklyVolatility(..., new Date())`. Catch errors as `{ unavailable: message }` (FR-017).
  4. Build the report with `buildStatusReport({ projectName: options.workspaceFolder.name, generatedAt: new Date(), ... })`.
  5. Write it with `vscode.workspace.fs.writeFile(vscode.Uri.joinPath(options.workspaceFolder.uri, 'doorstop-status.md'), Buffer.from(markdown, 'utf8'))` and return the URI.
  6. If `uri` is defined, call `vscode.window.showTextDocument(uri)`.
- [X] T010 [US3] In `package.json` `contributes.commands`, add `{ "command": "doorstop.statusReport", "title": "Doorstop: Generate Status Report", "icon": "$(graph)" }` next to `doorstop.publish`.

**Checkpoint**: `npm test` passes with T006 green, and quickstart scenario 3 passes manually.

---

## Phase 6: User Story 4 - Commands panel lists the new command (Priority: P3)

**Goal**: The Commands panel has a "Generate Status Report" row.

**Independent Test**: Open the Commands panel. The row exists, and clicking it runs `doorstop.statusReport`.

- [X] T011 [US4] In `src/commandsProvider.ts`, append `this.createNode('Generate Status Report', 'graph', 'doorstop.statusReport')` after the `Publish Document` node.

---

## Phase 7: Polish & Cross-Cutting

- [X] T012 [P] Add an entry for feature 021 to `CHANGELOG.md` covering Publish All, the running indicator and the status report, and add a line about the status-report command to the Commands panel section of `README.md`.
- [X] T013 (manual — passed by user 2026-10-09) (automated part done 2026-10-04: compile + all 6 vscode-test suites green; manual quickstart scenarios still open) Run `npm run compile` and `npm test`, then work through every scenario in [quickstart.md](quickstart.md). All must pass before the feature is done (Principle VI).

---

## Dependencies & Execution Order

- **T001** blocks T002–T005 and T009, because they all use `run(title, op)`.
- **US1** (T002 → T003 → T004) and **US2** (T005) edit the same file. Run them in sequence, not in parallel.
- **US3**:
  - T006 [P] can be written alongside T007/T008.
  - T009 depends on T007 and T008. T010 is independent.
- **US4**: T011 depends only on T010 (the command must exist), so it can follow US3 directly.
- **Polish** (T012, T013) runs after all stories are done.

Story order: Foundational → US1 → US2 → US3 → US4 → Polish.

## Parallel Examples

- **US3**:
  - T006 (`src/test/statusReport.test.ts`) ‖ T007 + T008 (`src/statusReport.ts`) ‖ T010 (`package.json`)
- **Cross-story**:
  - T007/T008 (new file) can be written while T002–T005 edit `src/doorstopCommands.ts`.
  - T011 (`src/commandsProvider.ts`) can be written at any time after T010.

## Implementation Strategy

1. **MVP**: T001 → US1 (T002–T004). Publish All works and can ship on its own.
2. Add US2 (T005), which is one edit, so every command gets the progress indicator and the busy guard.
3. Add US3 (T006–T010), the report plus its CI test.
4. Add US4 (T011) for the panel row, then the Polish tasks.

## Phase 8: Convergence

- [X] T014 (done by user edit: assertion is now `!markdown.includes('xychart')`) In `src/test/statusReport.test.ts`, change the "no documents" assertion from `!markdown.includes('xychart-beta')` so it fails if an empty project gets a chart, now that `src/statusReport.ts` emits the keyword `xychart`, per US3 edge case "zero documents" / T006 (partial)
- [X] T015 (manual — passed by user 2026-10-09) Generate `doorstop-status.md` for `testdata/regression` and confirm all charts render with the `xychart` keyword on GitHub (e.g. a gist or PR preview) and in VS Code's Mermaid preview; if either rejects it, switch `barChart` in `src/statusReport.ts` back to `xychart-beta`, per SC-006 (partial)
- [X] T016 Add the `config.xyChart.height: 200` Mermaid frontmatter that `barChart` in `src/statusReport.ts` emits to each chart block in `specs/021-project-status-report/contracts/status-report-format.md`, or remove it from the code, per plan: contracts/status-report-format.md (unrequested)
