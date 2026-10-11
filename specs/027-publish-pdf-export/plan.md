# Implementation Plan: Publish PDF Export

**Branch**: `027-publish-pdf-export` | **Date**: 2026-10-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/027-publish-pdf-export/spec.md`

## Summary

Add "PDF" to the publish format picker. PDF is a two-step pipeline that is
identical in VS Code and CI:

1. **HTML** via the existing server publish endpoints (Doorstop's own HTML
   publisher, unchanged, with whatever template the user configured — or none)
   into a temporary folder.
2. **PDF** via a standalone Node script (`export-pdf.mjs`, the research script
   from `doc/pdf_template`, made template-agnostic and extended to take a whole
   publish folder) that lives **in the user's repository** under
   `doorstop-pdf/`. The extension runs that same in-repo copy; CI runs it after
   `doorstop publish all … --html`.

On first PDF publish the extension, after one confirmation, copies only the
export tooling (script, `package.json`, lockfile, placeholder logo,
`.gitignore`) into `doorstop-pdf/` and runs `npm ci` + `npx playwright install
chromium` there. No HTML template ships or is installed. No server change, no
new extension dependency.

## Technical Context

**Language/Version**: TypeScript 5 (extension, VS Code API); Node ≥ 18 ESM for
the export script (runs on the user's/runner's Node, not the extension host).

**Primary Dependencies**: Existing extension stack unchanged. Export script:
`playwright` (headless Chromium, `page.pdf` header/footer, `landscape`,
`scale`) and `pdf-lib` (page-1 splice) — declared only in the copied
`doorstop-pdf/package.json` + lockfile.

**Storage**: Files only — tooling in `<workspace>/doorstop-pdf/`, temporary
HTML in an OS temp dir.

**Testing**: vscode-test (`src/test`) for the extension-side copy/no-overwrite
logic; new `pdf-export` GitHub Actions job running `node --test` end to end
(Doorstop default-HTML publish → script → PDFs) on `testdata/regression`.

**Target Platform**: VS Code desktop on Windows/macOS/Linux; CI on Linux
(GitHub Actions `ubuntu-latest`, GitLab shared runners with a Node+Python image).

**Project Type**: VS Code extension + bundled standalone CLI script.

**Performance Goals**: 100-item document → PDF in < 30 s (SC-005); Chromium is
launched once per run, not once per document.

**Constraints**: Doorstop unmodified; no template shipped (FR-007a); script
adds only the page frame, never content styling (FR-007); extension
`package.json` gains no runtime dependency; local and CI output must match
(same lockfile → same Chromium build).

**Scale/Scope**: Projects up to ~10 documents / a few hundred items per document.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
| --------- | ------ | ----- |
| I. Server is single source of truth | PASS | HTML publish still goes through `/publish` and `/documents/{prefix}/publish`. The PDF step only post-processes the written HTML files; it reads no Doorstop data. |
| II. No reinvention of Doorstop | PASS | Doorstop has no PDF output; its HTML (incl. traceability matrix) is reused as-is, with its own template lookup. |
| III. Error handling | PASS | Missing Node/npm, missing tooling, missing Chromium, per-file write failures, over-wide matrix warning, cancelled dialogs all mapped to messages (see contracts). Temp HTML removed in `finally`. |
| IV. No dependency without justification | PASS (justified) | `playwright` + `pdf-lib` — see Complexity Tracking. Installed only in the user's `doorstop-pdf/`, never in the extension or server. |
| V. Typed, linted, tested | PASS | Extension code goes through `check-types`/`lint`; server untouched so no pytest change required. |
| VI. CI-runnable test | PASS | New `pdf-export` CI job runs the real pipeline headless on `testdata/regression`; it also proves US3 (same files in CI). |
| VII. Long-running visible | PASS | Publish uses the existing `run()` progress helper; tooling install shows its toast immediately (always > 1 s). |

**Post-design re-check**: unchanged — all PASS.

## Project Structure

### Documentation (this feature)

```text
specs/027-publish-pdf-export/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── export-pdf-cli.md      # script CLI: args, outputs, exit codes
│   └── publish-command.md     # VS Code picker/dialog/message contract
└── tasks.md                   # /speckit-tasks
```

### Source Code (repository root)

```text
media/pdf-export/              # copied verbatim into <workspace>/doorstop-pdf/
├── export-pdf.mjs             # from doc/pdf_template: + folder mode, generic header,
│                              #   margins, landscape+scale for traceability
├── package.json               # playwright + pdf-lib, pinned
├── package-lock.json
├── logo.svg                   # placeholder, user replaces or deletes
└── gitignore                  # → .gitignore (node_modules/); renamed on copy

src/
├── pdfExport.ts               # ensureTooling(), exportPdf() — copy, install, run script
├── doorstopCommands.ts        # publish: "PDF" format branch
└── test/
    ├── pdfExport.test.ts      # vscode-test: copy/no-overwrite logic
    └── pdf/exportPdf.test.mjs # node --test: end-to-end, run by CI job pdf-export

.github/workflows/ci.yml       # + pdf-export job
README.md                      # PDF section + GitHub & GitLab pipeline examples
```

`doc/pdf_template/` is superseded by `media/pdf-export/`. `doc/a4-template/`
stays as research/example material and is not shipped; its README's PDF
section points to `media/pdf-export/`.

**Structure Decision**: Single extension project. Tooling lives under `media/`
because `.vscodeignore` excludes `doc/**` but packages `media/**` (except
`media/promotion`). One new TS module keeps the publish command readable.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --------- | ---------- | ----------------------------------- |
| New deps `playwright`, `pdf-lib` (in user repo only) | Per-page running header/footer + page numbers need a real print engine; no mainstream browser supports CSS `@page` margin boxes, Playwright's `page.pdf` header/footer does. `pdf-lib` splices page 1 without header (proven necessary in research). | Server-side Python PDF (WeasyPrint): native deps (Pango/Cairo) on Windows, different layout engine than the HTML view, and user chose a standalone repo script (Q2). Paged.js: still needs a headless browser. Hand-written PDF merge: far more code than `pdf-lib`. |
