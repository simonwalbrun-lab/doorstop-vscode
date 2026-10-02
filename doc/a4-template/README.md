# A4

A copy of the [Fresh](../fresh-template) Doorstop HTML publish template, built
for one job: exporting a paginated, A4-sized **PDF with a running header and
footer** — via `export-pdf.mjs` (Playwright), so it also runs headless in CI.

Use **Fresh** if you want a single continuous page to read in a browser, with
no PDF step. Use **A4** if the end goal is always a printed/PDF document —
the HTML/CSS is otherwise identical.

The running header/footer (logo, accent line, revision, page numbers) only
exist in the exported PDF, injected by `export-pdf.mjs` — the HTML view itself
shows just the one-time title block (`.native-head`) and closing marker
(`.native-end`), same as Fresh. An on-screen sticky header/footer bar was
tried and then deliberately removed; if you want it back, it's a small CSS/tpl
addition mirroring the PDF header's content (see git history for the earlier
version).

## Why a separate copy, and why Playwright

Real per-page running headers/footers (page numbers, revision, doc name on
every page) need the CSS `@page` margin-box spec (`@top-center` etc.) —
**no mainstream browser supports that for native printing.** The only way to
actually get it is to inject the header/footer during PDF generation itself.
Playwright's `page.pdf({ displayHeaderFooter, headerTemplate, footerTemplate })`
does exactly that, using the same Chromium engine you'd see on screen, and
runs headless — which is also exactly what a CI pipeline needs. (An
alternative, Paged.js, polyfills `@page` margin boxes in-browser, but it
re-paginates the page into boxes the moment it loads — changing how the HTML
looks even outside of printing — and still needs a headless browser to turn
that into a PDF in CI. Playwright alone is simpler and has one fewer moving
part.)

`a4.css` itself carries no header/footer styling — see `export-pdf.mjs`.

## Install the template

Doorstop looks for a folder literally named `template` next to a document's
`.doorstop.yml`. Copy the HTML template parts there (the `.mjs`/`package.json`
export tooling does **not** need to go into `.doorstop.yml`'s `template/`
folder — see below):

```text
reqs/SYS/
├── .doorstop.yml
├── SYS-0001.yml
├── ...
└── template/
    ├── a4.css
    ├── tex-mml-chtml.js
    ├── output/
    │   ├── chtml.js
    │   └── svg.js
    └── views/
        ├── base.tpl
        └── a4.tpl
```

For a tree, only **one** document in the tree may have a `template/` folder —
Doorstop errors if more than one does.

## Publish the HTML

```bash
doorstop publish SYS path/to/out --html --template a4
```

`--template a4` must match the `.tpl` filename (`a4.tpl`) in `views/`. For a
whole tree (enables the Index / Traceability matrix nav and cross-document
links):

```bash
doorstop publish all path/to/out --html --template a4
```

## Export to PDF

Run once, wherever you'll export from (locally or in CI):

```bash
cd doc/a4-template
npm install
npm run install-browser   # downloads Chromium for Playwright
```

Then, after `doorstop publish`:

```bash
node export-pdf.mjs path/to/out/documents/SYS.html path/to/out/SYS.pdf
```

The script reads the document's own title block (`.doctitle`, `.native-meta`)
to build the header/footer text, so it works unmodified for any document —
nothing to hardcode per document. **Verified live** against this repo's
`testdata/regression` tree: published `ARCH` with a cover item (see the
Fresh README's "Document header fields" section) and ran the script —
the resulting PDF's header read `doc-ARCH — Architecture Requirements`, the
meta row showed `DOC / REF / BY / ISSUE / REVIEWER / APPROVER / PARENT` all
pulled from that one item, and the footer read `Rev 1.2` / `template-A4` /
`Page 1 of 1`.

### Header: logo, accent line, no header on page 1

The header is a flex row — document name/title on the left, a logo on the
right — with a thin bottom border in `ACCENT_LINE` (the brand red at 35%
opacity, so it reads as "dezent", not a full-saturation rule). The footer
mirrors it with a top border, plus `Rev X.Y` / the fixed `TEMPLATE_ID`
constant (`template-A4`) / `Page N of M`.

**Logo:** drop `logo.svg` (preferred — inlined directly, crisp at any size)
or `logo.png` (base64-embedded) next to `export-pdf.mjs`. Either replaces the
bundled placeholder checkmark mark with no script changes. Both constants
(`TEMPLATE_ID`, `ACCENT_LINE`) sit at the top of `export-pdf.mjs` if you want
to change the label or color.

**No header on page 1:** this took two failed attempts before landing on
something that actually works, worth knowing if you touch this code.
Chromium's header/footer templates share one `.pageNumber` element that gets
filled in during Chromium's own internal print pass — **not** as an observable
DOM mutation. Verified live, twice: neither reading `.pageNumber.textContent`
immediately in an inline `<script>`, nor watching it with a `MutationObserver`,
ever saw a non-empty value — both produced the identical header on every page,
page 1 included. The approach that does work and is what's implemented: render
the document **twice** with identical `margin` (so page breaks land in exactly
the same place both times) — once with the real header, once with
`headerTemplate: '<div></div>'` — then use `pdf-lib` to take page 1 from the
blank-header render and all other pages from the full render. Confirmed on a
5-page export: page 1 has no header (not even the accent line), pages 2–5
have it, and the footer (which isn't suppressed) is correct on every page.

Tunable in `export-pdf.mjs`: `margin.top`/`margin.bottom` (space reserved for
the header/footer — widen if your header text wraps), and the header/footer
template HTML itself. `margin.left`/`right` should stay `0mm`: `a4.css`
already sizes `.native-page` to 210mm with its own 16mm inset, so an added
Playwright margin would double it.

## CI pipeline

Header/footer templates render in an isolated Chromium context without the
page's own stylesheet, so they're styled with system fonts only (no Google
Fonts dependency there) — nothing extra needed for CI beyond the browser
binary:

```yaml
# .github/workflows/publish-pdf.yml (excerpt)
- name: Install PDF export tooling
  working-directory: doc/a4-template
  run: |
    npm install
    npx playwright install --with-deps chromium

- name: Publish HTML
  run: doorstop publish SYS out --html --template a4
  # with reqs/SYS/template/ already populated from doc/a4-template/

- name: Export PDF
  working-directory: doc/a4-template
  run: node export-pdf.mjs ../../out/documents/SYS.html ../../out/SYS.pdf

- uses: actions/upload-artifact@v4
  with:
    name: SYS.pdf
    path: out/SYS.pdf
```

## The traceability matrix prints in landscape

`traceability.html` gets one column per document and can run wider than a
portrait page with several components. `a4.css` switches just that page to
landscape via a CSS named page, shrinks the font, and truncates any cell that
still doesn't fit with `…` instead of cutting it off mid-word — verified on a
9-document tree, all 12 columns fit one landscape page. Same mechanism as
Fresh; see its README's "The traceability matrix" section for the full
before/after (Chromium silently clipping columns from the PDF) and what to do
once even that isn't enough (`traceability.csv`, which Doorstop already
generates alongside it).

## Everything else

Document header fields (Ref/By/Issue/Reviewer/Approver), images, custom
attribute tables, known upstream quirks, and offline-font behavior are
identical to Fresh and documented there: see
[`../fresh-template/README.md`](../fresh-template/README.md).
