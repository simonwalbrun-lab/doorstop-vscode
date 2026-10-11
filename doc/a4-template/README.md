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

The PDF export now ships with the extension: *Publish* → **PDF** adds
`doorstop-pdf/export-pdf.mjs` to your workspace and runs it (source:
[`media/pdf-export/`](../../media/pdf-export/)). It works with any template and
recognizes this one's title block: the header reads `Doc — Title`, the footer
starts with `Rev <Issue>`, and no extra side margin is added because
`.native-page` already sizes the page. Publish with `--template a4` (or set
`doorstop.publish.template` to `a4`) to use it. For setup, logo replacement and
GitHub/GitLab pipeline examples see the main README's "Publish as PDF" section.

The "no header on page 1" trick (render twice, splice page 1 with `pdf-lib`)
is documented in the script itself.

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
