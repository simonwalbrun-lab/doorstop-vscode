---

description: "Task list for 027 Publish PDF Export"
---

# Tasks: Publish PDF Export

**Input**: Design documents from `/specs/027-publish-pdf-export/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/export-pdf-cli.md](contracts/export-pdf-cli.md), [contracts/publish-command.md](contracts/publish-command.md), [quickstart.md](quickstart.md)

**Tests**: Included. Constitution VI requires a CI-runnable test per feature: a vscode-test suite for the copy logic and a `node --test` end-to-end suite run by a new CI job.

**Organization**: Grouped by user story. Paths are relative to the repo root. The server (`server/` submodule) is **not** changed. No HTML template is shipped or installed (FR-007a).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1-US3 from spec.md

---

## Phase 1: Setup

**Purpose**: The export tooling that is copied into user repositories.

- [X] T001 Create `media/pdf-export/` from `doc/pdf_template/pdf-export/`: copy `export-pdf.mjs`, `logo.svg`, `package.json` verbatim. In `media/pdf-export/package.json` move `playwright` from `devDependencies` to `dependencies`, pin both `playwright` and `pdf-lib` to exact versions (no `^`), and keep the `install-browser` and `export` scripts. Then run `npm install --package-lock-only` inside `media/pdf-export/` to create `media/pdf-export/package-lock.json`.
- [X] T002 [P] Create `media/pdf-export/gitignore` (no leading dot, so vsce packages it; it is renamed to `.gitignore` on copy) containing the single line `node_modules/`.
- [X] T003 [P] In `.vscodeignore` add `media/pdf-export/node_modules/**` and the negation `!media/pdf-export/package-lock.json` (the existing `package-lock.json` exclude must not drop it). Verify with `npx --yes @vscode/vsce ls` that `media/pdf-export/{export-pdf.mjs,package.json,package-lock.json,logo.svg,gitignore}` are listed and nothing from `media/pdf-export/node_modules`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Copy / install / run the in-repo script. Every story needs it.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 Create `src/pdfExport.ts` with `export const PDF_TOOLING_DIR = 'doorstop-pdf'` and `export async function copyTooling(sourceDir: string, targetDir: string): Promise<string[]>`: create `targetDir` if missing; for each top-level file in `sourceDir` (skip `node_modules`), target name is `.gitignore` for `gitignore`, else the same name; copy **only if the target file does not exist** (FR-009b: "MUST NOT overwrite user changes"); return the list of target names actually copied. Use `node:fs/promises` only.
- [X] T005 In `src/pdfExport.ts` add `isToolingInstalled(toolingDir)` (true ⇔ `<toolingDir>/node_modules/playwright` exists) and `installTooling(toolingDir): Promise<void>` that runs `npm ci` and then `npx playwright install chromium` with `cwd: toolingDir` via `node:child_process` `execFile` (pass `shell: process.platform === 'win32'` because npm/npx are `.cmd` shims there). On `ENOENT` reject with `new Error('PDF export needs Node.js and npm on PATH.')`; on any other failure reject with the command's trimmed stderr (pattern: `readGitLog` in `src/statusReport.ts`).
- [X] T006 In `src/pdfExport.ts` add `runExportScript(toolingDir, input, output, cwd): Promise<{ written: string[]; warnings: string[] }>`: `execFile('node', [path.join(toolingDir, 'export-pdf.mjs'), input, output], { cwd, maxBuffer: 16 MiB })`; `written` = paths from stdout lines `PDF written to <path>`; `warnings` = stderr lines starting with `Warning:`. Non-zero exit → reject `new Error('PDF export failed: ' + stderr.trim())`. `ENOENT` → the Node.js/npm message from T005.
- [X] T007 In `src/pdfExport.ts` add `ensurePdfTooling(extensionPath: string, workspaceFolder: string): Promise<string | undefined>` implementing step 3 of [contracts/publish-command.md](contracts/publish-command.md): if `<workspaceFolder>/doorstop-pdf/export-pdf.mjs` is missing show the modal `Set up PDF export in this workspace? This adds the folder doorstop-pdf/ with the export script.` with button `Set up` (cancel → return `undefined`, nothing written), then `copyTooling(path.join(extensionPath, 'media', 'pdf-export'), toolingDir)`; if not `isToolingInstalled` show `PDF tooling is not installed.` with `Install` (cancel → `undefined`), then run `installTooling` inside `vscode.window.withProgress({ location: Notification, title: 'Doorstop: Installing PDF tooling…' })` (shown immediately — always > 1 s, Constitution VII). If the error is the Node.js/npm message, show it with button `Get Node.js` that opens `https://nodejs.org` via `vscode.env.openExternal`; return `undefined` on any failure. Return the tooling dir on success.
- [X] T008 [P] Create `src/test/pdfExport.test.ts` (mocha `suite`/`test`, no workspace, no server): (a) `copyTooling` from `media/pdf-export` into a fresh `fs.mkdtemp` dir copies `export-pdf.mjs`, `package.json`, `package-lock.json`, `logo.svg` and `.gitignore` (not `gitignore`); (b) after overwriting the target `export-pdf.mjs` and `logo.svg` with marker text, a second `copyTooling` returns `[]` and both markers are unchanged; (c) deleting `logo.svg` in the target and copying again restores only `logo.svg`; (d) a `node_modules` folder in the source is not copied. Clean up temp dirs in `teardown`.
- [X] T009 Add a labeled config `{ label: 'pdfExport', files: 'out/test/pdfExport.test.js' }` with a comment ("PDF tooling copy / no-overwrite (spec 027). No fixture workspace, no server, no Chromium.") to `.vscode-test.mjs`. Depends on T008.

**Checkpoint**: `npm test` runs the `pdfExport` suite green.

---

## Phase 3: User Story 1 - Publish one document as a PDF (Priority: P1) 🎯 MVP

**Goal**: Publish → document → PDF writes exactly one A4 PDF, from any template's HTML.

**Independent Test**: Quickstart step 1 — `testdata/regression` copy, empty template setting, publish REQ as PDF: one file, no header on page 1, header + `Page N of M` afterwards, side margins present, no `template/` folder created.

- [X] T010 [US1] In `media/pdf-export/export-pdf.mjs` make the single-file page frame template-agnostic (research R5): extract `async function exportFile(browser, inputPath, outputPath)` from `main`; header text = `[meta.Doc, .doctitle].filter(Boolean).join(' — ')` when the A4-style block yields any value, else `document.title.trim()`, else `basename(inputPath, '.html')`; footer = `Rev <Issue>` (only when `meta.Issue`) and `Page <pageNumber> of <totalPages>`; delete `TEMPLATE_ID` and its footer span; side margin = `0mm` when `await page.locator('.native-page').count() > 0`, else `16mm`, used for both `margin.left/right` and the header/footer `padding` inset (keep `16mm` padding when margin is 0, `0` padding when margin is 16 mm); logo stays optional (`loadLogoHtml()` returns `''` when neither `logo.svg` nor `logo.png` exists). Keep the page-1 splice, link removal and `emulateMedia('print')` unchanged; inject no other CSS (FR-007). `main` keeps today's single-file usage working.
- [X] T011 [US1] In `src/doorstopCommands.ts` (`doorstop.publish`) add `{ label: 'PDF', value: 'pdf' as const, extension: '.pdf' }` after LaTeX in the format picker. For PDF: template = the configured setting (no Markdown rule needed); call `ensurePdfTooling(options.context.extensionPath, options.workspaceFolder.uri.fsPath)` **before** any destination dialog and return if it yields `undefined`; `publishOne` must send `format: 'html'` to the server when PDF is chosen.
- [X] T012 [US1] In `src/doorstopCommands.ts` single-document PDF branch: `showSaveDialog({ saveLabel: 'Publish', filters: { PDF: ['pdf'] }, defaultUri: <workspace>/<PREFIX>.pdf })`; inside `run('Publish', …)`: `const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'doorstop-pdf-'))`, `publishOne(prefix, path.join(tmp, prefix + '.html'))` (server returns the real `documents/PREFIX.html` path), `runExportScript(toolingDir, result.path, destination.fsPath, workspaceFolder)`, and `fs.rm(tmp, { recursive: true, force: true })` in `finally` (FR-012). Then `reportWrittenPath('Publish', destination, destination)` and one `showWarningMessage` per returned warning.
- [X] T013 [US1] In `reportWrittenPath` (`src/doorstopCommands.ts`) open `.pdf` like `.html` (`vscode.env.openExternal`, i.e. the OS viewer) instead of `vscode.open`.

**Checkpoint**: Quickstart steps 1, 3 and 4 pass manually.

---

## Phase 4: User Story 2 - Publish all documents plus the traceability matrix as PDFs (Priority: P2)

**Goal**: One action writes `PREFIX.pdf` × N plus `traceability.pdf` (landscape, scaled to fit) and nothing else.

**Independent Test**: Quickstart step 2 — combined run into an empty folder yields exactly one PDF per document plus `traceability.pdf`; a locked PDF is named in the error and the others are written.

### Tests for User Story 2

- [X] T014 [P] [US2] Create `src/test/pdf/exportPdf.test.mjs` (`node:test` + `node:assert`, ESM; imports `pdf-lib` via `createRequire(<repo>/media/pdf-export/package.json)`): copy `testdata/regression` into `fs.mkdtemp`, run `python -m doorstop publish all <tmp>/out --html` (cwd = the copy; use `execFileSync`, fail with stderr), then `node media/pdf-export/export-pdf.mjs <tmp>/out <tmp>/pdf`. Assert: exit 0; the set of files in `<tmp>/pdf` equals `{<each documents/*.html basename>.pdf} ∪ {traceability.pdf}` exactly; every file starts with `%PDF` and `PDFDocument.load` reports ≥ 1 page; first page of `traceability.pdf` has width > height. Second test: an empty input folder → exit 1, no `pdf/` output written. Remove temp dirs in `after`.

### Implementation for User Story 2

- [X] T015 [US2] In `media/pdf-export/export-pdf.mjs` add folder mode per [contracts/export-pdf-cli.md](contracts/export-pdf-cli.md): if `<input>` is a directory, jobs = every `<input>/documents/*.html` → `<output>/<basename>.pdf` plus `<input>/traceability.html` → `<output>/traceability.pdf` if present; default output `<input>/pdf`; `mkdirSync(output, { recursive: true })` only when there is at least one job; zero jobs → `console.error('Failed: no published HTML found in <input>')` and exit 1. Launch Chromium **once** for all jobs. On a job error keep going, print `Failed: <input> → <output>: <message>` to stderr, and exit 1 after all jobs if any failed (successful PDFs stay written). Update the usage line and header comment.
- [X] T016 [US2] In `media/pdf-export/export-pdf.mjs` add the traceability frame (research R6, FR-006): for `traceability.html` use `landscape: true`, the side-margin rule from T010, header `Traceability` (+ logo) on **every** page (no page-1 splice), footer `Page N of M`; before printing set the viewport width to the printable width `Math.floor((297 - 2 * marginMm) * 96 / 25.4)` px, `emulateMedia('print')`, read `document.documentElement.scrollWidth`, `scale = Math.min(1, printable / scrollWidth)`; if `scale < 0.1` use `0.1` and write `Warning: traceability.html is wider than the page even at 10 % — columns may be clipped` to stderr (exit code stays 0).
- [X] T017 [US2] In `src/doorstopCommands.ts` route PDF with target `each` or `together` to one combined HTML run (research R4): folder dialog as today; inside `run('Publish', …)`: `mkdtemp`, `POST /publish` with `format: 'html'`, `destinationPath: tmp` and the template if set, then `runExportScript(toolingDir, tmp, folder, workspaceFolder)`, `fs.rm(tmp, …)` in `finally`. Report `Published ${n} document(s) and the traceability matrix as PDF to ${folder}.` with `n` = `written` entries not ending in `traceability.pdf`; show each warning via `showWarningMessage`.
- [X] T018 [US2] Name the current document in the progress toast (spec edge case): in `src/progress.ts` let `withDelayedProgress` pass a `report(message: string)` callback to `work` that stores the latest message and forwards it to the notification's `progress.report({ message })` once shown (and on show, reports the latest stored one); in `src/doorstopCommands.ts` let `run`'s `op` accept that callback, and in `runExportScript` (`src/pdfExport.ts`) accept an optional `onWritten(path)` that is called per `PDF written to` stdout line as it streams (switch from `execFile` buffer to `spawn` + line reading only if needed). Feed `onWritten` into `report`. Existing callers keep compiling unchanged; extend `src/test/progress.test.ts` with one case: a reported message reaches the fake `progress.report` after the 1 s threshold.

**Checkpoint**: `node --test src/test/pdf/exportPdf.test.mjs` green locally; quickstart step 2 passes.

---

## Phase 5: User Story 3 - Produce the same PDFs in a GitLab or GitHub CI pipeline (Priority: P3)

**Goal**: Documented, working CI recipes; the repo's own CI runs the end-to-end test.

**Independent Test**: The new `pdf-export` job is green on a PR; the README examples run unchanged on a clean runner (quickstart step 5).

- [X] T019 [US3] In `.github/workflows/ci.yml` add job `pdf-export` (`runs-on: ubuntu-latest`): `actions/checkout@v4`; `actions/setup-node@v4` (node 24); `actions/setup-python@v5` (3.12); `pip install doorstop`; `npm ci` with `working-directory: media/pdf-export`; `npx playwright install --with-deps chromium` with the same working directory; `node --test src/test/pdf/exportPdf.test.mjs`.
- [X] T020 [US3] In `README.md` add a "Publish as PDF" section: prerequisites (Node.js ≥ 18 + npm, Python + Doorstop); what the first PDF publish does (adds `doorstop-pdf/`, commit it, `node_modules` is git-ignored); replacing/removing the logo (`doorstop-pdf/logo.svg` or `logo.png`); that the PDF uses the HTML from the configured publish template or Doorstop's default; that identical local/CI page breaks need a template that brings its own fonts (FR-010); a **GitHub Actions** example (checkout, setup-python, `pip install doorstop`, setup-node, `npm ci` + `npx playwright install --with-deps chromium` in `doorstop-pdf`, `doorstop publish all out --html [--template X]`, `node doorstop-pdf/export-pdf.mjs out out/pdf`, `actions/upload-artifact@v4` with `out/pdf`); and a **GitLab CI** example (`image: mcr.microsoft.com/playwright:v<version pinned in media/pdf-export/package.json>-noble`, `apt-get update && apt-get install -y python3-pip && pip install --break-system-packages doorstop`, `cd doorstop-pdf && npm ci && cd ..`, same publish + export commands, `artifacts: paths: [out/pdf]`).

**Checkpoint**: CI green including `pdf-export`; README examples copy-paste runnable.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T021 [P] Remove the superseded research copies `doc/pdf_template/` and `doc/a4-template/{export-pdf.mjs,package.json,logo.svg}`; in `doc/a4-template/README.md` replace the "Export to PDF", "Header: logo…" and "CI pipeline" install/run instructions with a pointer to `media/pdf-export/` and the README "Publish as PDF" section (the template files themselves stay as example material). **Status:** `doc/a4-template` copies removed and README updated; `doc/pdf_template/` not deleted — it is not tracked by git, so removal is left to the owner.
- [X] T022 [P] Add an "Unreleased" entry to `CHANGELOG.md`: "Publish as PDF (single document, or all documents + traceability matrix) via an in-repository headless-browser export script; CI-ready."
- [ ] T023 Run `npm run compile`, `npm test` and `node --test src/test/pdf/exportPdf.test.mjs` (after `npm ci` + `npx playwright install chromium` in `media/pdf-export`); then walk through [quickstart.md](quickstart.md) steps 1-5 and record results. **Status:** compile, all 10 vscode-test suites and the `node --test` suite pass; the script was run on `testdata/regression` (5 PDFs, layout checked visually). Quickstart steps 1-5 inside VS Code and on a real GitLab runner are still to be done by hand.

---

## Dependencies & Execution Order

- **Setup (T001-T003)** → **Foundational (T004-T009)** → user stories.
- **US1 (T010-T013)**: needs Foundational. T010 (script) and T011-T013 (extension) are different files and can proceed in parallel; T012 depends on T011; T013 independent.
- **US2 (T014-T018)**: T015/T016 build on T010's `exportFile` refactor (same file, sequential T010 → T015 → T016). T017 depends on T011 (PDF format branch). T014 can be written in parallel with T015-T017 and passes once T015/T016 are done. T018 depends on T006 and T017.
- **US3 (T019-T020)**: T019 needs T014; T020 needs final CLI shape (T015).
- **Polish (T021-T023)**: after all stories.

## Parallel Examples

```text
# Setup
T002 media/pdf-export/gitignore  ||  T003 .vscodeignore

# Foundational (after T004-T007)
T008 src/test/pdfExport.test.ts  (then T009)

# US1
T010 media/pdf-export/export-pdf.mjs  ||  T011 → T012 src/doorstopCommands.ts  ||  T013

# US2
T014 src/test/pdf/exportPdf.test.mjs  ||  T015 → T016 export-pdf.mjs  ||  T017 doorstopCommands.ts

# Polish
T021 doc/  ||  T022 CHANGELOG.md
```

## Implementation Strategy

1. **MVP = Setup + Foundational + US1**: single-document PDF from VS Code, tooling copied into the repo. Stop and validate with quickstart step 1.
2. **+ US2**: all documents + `traceability.pdf`; the end-to-end `node --test` suite lands here.
3. **+ US3**: CI job and README recipes — this is where Constitution VI's CI gate is satisfied for the feature, so do not merge before US3.
4. **Polish**: remove superseded research copies, changelog, full validation.

---

## Phase 7: Convergence

- [X] T024 When `runExportScript` in `src/pdfExport.ts` fails with Playwright's missing-browser error (stderr contains `Executable doesn't exist`), show `PDF tooling is not installed.` with `Install` (as in `ensurePdfTooling`), run `npx playwright install chromium` in `doorstop-pdf/` under the immediate install toast, and ask the user to publish again; wire it into the PDF branches of `doorstop.publish` in `src/doorstopCommands.ts` per FR-011 (partial)
- [X] T025 In `media/pdf-export/export-pdf.mjs` print `Exporting <input file name>` to stdout before each job, and in `src/pdfExport.ts` report that file name to the progress toast (keep `written` parsed from `PDF written to`), so the toast names the document currently being exported per spec Edge Cases (partial)
- [X] T026 Remove the single-file `traceability: basename(inputPath) === "traceability.html"` detection from `media/pdf-export/export-pdf.mjs` (a lone `*.html` input is always portrait) per contracts/export-pdf-cli.md (unrequested)
