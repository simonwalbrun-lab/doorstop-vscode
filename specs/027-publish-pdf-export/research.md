# Research: Publish PDF Export

## R1 — Rendering engine

- **Decision**: Keep the approach from the research script in
  `doc/pdf_template/pdf-export`. Playwright Chromium's `page.pdf` adds the
  running header and footer (`displayHeaderFooter`, `headerTemplate`,
  `footerTemplate`). Each document is rendered twice and the two results are
  combined with `pdf-lib`, so that page 1 has no header.
- **Rationale**: This was already verified live, including header, footer and
  page numbers. It uses the same engine as the HTML view and runs headless on
  Linux CI.
- **Alternatives**:
  - WeasyPrint (Python): needs the native Pango/Cairo libraries on Windows and
    lays pages out differently from the HTML view.
  - Paged.js: still needs a headless browser.
  - CSS `@page` margin boxes in Chromium: not supported when printing natively.

## R2 — Where the script lives and who runs it

- **Decision**: Copy the tooling into `<workspaceFolder>/doorstop-pdf/` once,
  after the user confirms, and always run that in-repo copy with `node` from
  PATH. Files that already exist are never overwritten (FR-009b).
- **Rationale**: This was clarification Q2 = B. With exactly one copy, local
  and CI output cannot drift apart, and users can change the logo or the
  script and commit the change.
- **Alternatives**:
  - Run a copy bundled with the extension and copy it out only for CI. That
    gives two copies that can drift apart.
  - Run the script with VS Code's own Node (Electron with
    `ELECTRON_RUN_AS_NODE`). Installing the dependencies still needs npm, so
    Node has to be installed anyway.

## R3 — Installing dependencies

- **Decision**:
  - The tooling counts as "installed" when
    `doorstop-pdf/node_modules/playwright` exists.
  - If it is missing, offer "Install", which runs `npm ci` and then
    `npx playwright install chromium` in `doorstop-pdf/`. The progress toast
    shows immediately.
  - If `npm` is not found, show an error with a link to nodejs.org.
  - The lockfile makes local and CI install the same Playwright version, and
    therefore the same Chromium build.
- **Rationale**: Only one cheap check is needed. If Chromium itself is
  missing, Playwright's own error ("Executable doesn't exist … run
  `npx playwright install`") already says what to do, and it is passed through
  unchanged. That also covers FR-011 in CI.
- **Alternatives**: Run `playwright install` on every publish. That adds a
  network call to every run. Locally on Linux, `--with-deps` is left out
  because it needs sudo; the CI examples use it.

## R4 — Which HTML run feeds the PDFs

- **Decision**:
  - **Single document**: `POST /documents/{prefix}/publish` (HTML) into a temp
    folder, then `export-pdf.mjs <documents/PREFIX.html> <dest.pdf>`.
  - **All documents** (both "all" picker entries): `POST /publish` (HTML,
    combined run) into a temp folder, then
    `export-pdf.mjs <tempDir> <destDir>`. The script writes `PREFIX.pdf` for
    each `documents/*.html`, plus `traceability.pdf`.
  - **Template**: the `doorstop.publish.template` setting when set, otherwise
    none (Doorstop's default HTML). This is the same rule as the HTML format.
    The extension never touches `template/` folders (FR-007a).
- **Rationale**: Only Doorstop's combined run writes `traceability.html` and
  the links between documents. It is also exactly what CI runs
  (`doorstop publish all out --html [--template X]`), so the extension and CI
  feed the same HTML into the script (FR-010).
- **Alternatives**: Publish each document separately and then add the matrix.
  This is not possible, because Doorstop has no traceability output for a
  single document.

## R5 — The page frame for HTML from any template

**Header text** (FR-005), first match wins:

1. `.native-meta` "Doc" together with `.doctitle` (the A4-style title block).
2. `document.title`. Doorstop's default HTML sets this to the document name.
3. The prefix, taken from the HTML file name.

**Footer**: "Page N of M" on every page. If the A4-style title block provides
an "Issue", the footer starts with `Rev <issue>`. The `template-A4` label from
the research script is dropped (FR-004 no longer mentions it).

**Logo**: the script uses `logo.svg` (or `logo.png`) next to itself if present,
otherwise no logo.

**Side margins**: 0 mm when the HTML has a `.native-page` element (an A4-style
template sizes and insets its own page), otherwise 16 mm on each side. The
header and footer use the same inset.

- **Rationale**: Without side margins, Doorstop's default HTML would run to the
  paper edge. Using a fixed margin for every template would double the margin
  for A4-style templates. One check covers both cases.

**Content**: The script never injects CSS into the content, apart from
removing links (`href`) so the PDF has no clickable links. Doorstop's default
HTML will therefore print its Bootstrap navbar at the top of page 1. That is
how the template prints, and FR-007 leaves it alone; users who want a clean
print use a template with print rules.

## R6 — Fitting the traceability matrix

- **Decision**: For `traceability.html`:
  - Render with `landscape: true` and no header-less page 1, since the matrix
    has no title block.
  - Set the viewport to the printable landscape width: 297 mm minus the side
    margins, at 96 dpi.
  - Read `document.documentElement.scrollWidth`.
  - Compute `scale = min(1, printableWidthPx / scrollWidth)`.
  - Clamp the scale to Chromium's minimum of 0.1. When it is clamped, write
    `Warning: traceability.html is wider than the page even at 10 % — columns may be clipped`
    to stderr and still exit with 0.
- **Rationale**: This implements FR-006 and the over-wide matrix edge case
  without restyling the content. Playwright's `scale` shrinks the whole page
  evenly.
- **Alternatives**: Inject CSS to shrink the font and truncate cells (what
  `a4.css` did). Rejected because it restyles the content, which FR-007
  forbids.

## R7 — Fonts and identical output on different machines

- **Decision**: Fonts are the template's concern. Doorstop's default HTML uses
  Bootstrap's system font stack, so Windows and Linux render with different
  fonts and line breaks can differ.
- **Resolved in spec (2026-10-10)**: FR-010 and SC-004 now require identical
  output only for templates that bring their own fonts.
- **Consequence**: The README states that identical local/CI output needs a
  template with its own fonts. The CI test does not compare against a local
  run; SC-004 is validated manually per quickstart step 5.
- **Upgrade path**: Document how to self-host web fonts in a user template.
  Nothing in the extension changes.

## R8 — Script changes compared with the research version

- **Input**: accept a folder (R4), using one browser launch for all files.
- **Header and footer**: generic header text, margins and logo (R5).
- **Traceability**: landscape and scale (R6).
- **Failures**: keep going after a failing file, collect the failures, print
  each failing file, and exit with code 1 at the end. This covers a PDF that
  is locked by another program on Windows.
- **Unchanged**: the header and footer markup, the page-1 splice, the logo
  lookup and the link removal.

## R9 — Tests (Constitution VI)

- **Decision**: Add a new CI job, `pdf-export`. It sets up Python and Node,
  runs `pip install doorstop`, then runs `npm ci` and
  `npx playwright install --with-deps chromium` in `media/pdf-export`, and
  then runs `node --test src/test/pdf/exportPdf.test.mjs`.

  The test copies `testdata/regression` into a temp folder, runs
  `doorstop publish all … --html` (default HTML, no template), and runs the
  script. It then checks that:
  - there is one PDF per document plus `traceability.pdf` and nothing else,
    each starting with `%PDF` and having at least 1 page;
  - `traceability.pdf`'s first page is wider than it is tall (landscape);
  - for an empty input folder the script writes no PDF and exits with 1.
- The copy and no-overwrite logic gets a vscode-test in
  `src/test/pdfExport.test.ts`. It needs no Chromium.
- **Rationale**: The end-to-end job also proves US3. Chromium is downloaded
  during job setup (like `npm ci`), not inside the test, so the test stays
  offline and deterministic.
