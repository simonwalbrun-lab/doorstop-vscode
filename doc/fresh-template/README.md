# Fresh

A drop-in replacement for Doorstop's built-in HTML publish template. Same data,
no new generator features — just a `fresh.tpl` + `fresh.css` that render
Doorstop's existing output as one continuous, A4-width page with no reviewed /
unreviewed state (Doorstop's default template doesn't carry one either).

Need a paginated PDF with a running header/footer (e.g. from a CI pipeline)
instead of one continuous page? Use [`../a4-template`](../a4-template) — same
HTML/CSS, plus a Playwright export script.

Design background: `doc/requirements-publishing-templates.html`, template #10
("Native Publish").

## What it changes vs. the built-in template

- One continuous page sized to 210mm (A4), not a responsive Bootstrap site.
- No page breaks, no cover sheet, no simulated pagination.
- Headings, "Parent links:" / "Child links:" lines, and the custom-attribute
  table render exactly as Doorstop already generates them — this package only
  replaces the CSS and the page chrome (header block, nav, table of contents),
  never the content.
- No Bootstrap, jQuery, or logo image. MathJax is kept (and bundled locally)
  since item text can contain `$...$` / `$$...$$` math.

## Install

Doorstop looks for a folder literally named `template` next to a document's
`.doorstop.yml`. Copy this whole folder there, keeping the internal layout:

```text
reqs/SYS/
├── .doorstop.yml
├── SYS-0001.yml
├── ...
└── template/          <- the contents of fresh-template/, copied in as-is
    ├── fresh.css
    ├── tex-mml-chtml.js
    ├── output/
    │   ├── chtml.js
    │   └── svg.js
    └── views/
        ├── base.tpl
        └── fresh.tpl
```

For a tree, only **one** document in the tree may have a `template/` folder —
Doorstop errors if more than one does.

## Publish

```bash
doorstop publish SYS path/to/output --html --template fresh
```

`--template fresh` is required — it must match the `.tpl` filename
(`fresh.tpl`) in `views/`. Without `--template`, Doorstop ignores the custom
folder and regenerates its own built-in template/assets instead.

To publish the whole tree (enables the Index / Traceability matrix nav links
and cross-document linkification):

```bash
doorstop publish all path/to/output --html --template fresh
```

## Images

Markdown images in item text (`![alt](assets/diagram.png)`) render as a plain
`<img>` with no inline size — Doorstop writes the image itself into
`documents/assets/` next to the document on publish, and `fresh.css` scales it
to fit the page (`max-width: 100%; height: auto;`), with a thin border so it
reads as a figure and `break-inside: avoid` so it doesn't split across a
printed page. An oversized source image is simply shrunk to the content width;
nothing needs to change in the item's markdown.

## The traceability matrix (`traceability.html`)

Doorstop's own matrix (`lines_matrix()` in `html.py`) gives one column per
document in the tree — with several components it runs wider than the page.
There's no wrapper `<div>` to add around it (it's Doorstop's generated HTML),
so this is solved in two layers:

- **On screen:** no scrollbar at all — `.native-page:has(table.table)` widens
  the page itself (up to 1600px; there's no paper to match on screen, so no
  reason to stay at 210mm), and the same `table-layout: fixed` +
  `text-overflow: ellipsis` described below for print apply on screen too, so
  the table is always bounded by that wider container. `.native-body` keeps
  `overflow-x: auto` as a fallback for anything unexpectedly wide, but it no
  longer triggers for the matrix. Verified with a 9-document tree at a
  1400px viewport: the page widened to 1368px, and `.native-body`'s
  `scrollWidth` equalled its `clientWidth` exactly (1247 = 1247) — zero
  overflow, every column visible at once, nothing to scroll to. A normal
  document page (no `table.table`) in the same tree measured 793.7px — i.e.
  unchanged, still exactly 210mm.
- **When printed/exported:** scrolling doesn't exist on paper. Verified live
  that without further changes, Chromium just **clips** anything past the
  container's on-screen width — columns were silently gone from the PDF, not
  merely hard to reach. Fixed with three things together: the matrix page
  switches to **landscape** via a CSS named page
  (`@page matrix { size: A4 landscape }` + `body:has(table.table){ page: matrix }`,
  scoped so normal document pages — which never contain `table.table` — stay
  portrait), a smaller print-only font, and `table-layout: fixed` with
  `text-overflow: ellipsis` on every cell. Fixed layout plus the table's own
  `width: 100%` means it **mathematically cannot** exceed the page width no
  matter how many documents exist — columns just get proportionally narrower
  and content that doesn't fit is visibly truncated with `…`, never silently
  cut off. Verified on the same 9-document tree: all 12 columns fit on one
  landscape page, with truncation exactly where content didn't fit (e.g. a
  long item header became `Hea…`).
- **If it still doesn't fit:** at some component count, columns can shrink to
  the point the truncated UID itself is barely readable — there's a real
  physical limit to how much fits on one page width, print or not. Doorstop
  already generates `traceability.csv` next to `traceability.html` for this
  case — a wide grid belongs in a spreadsheet past a certain size, not on a
  fixed page.

## Document header fields (Ref / By / Issue / Reviewer / Approver)

Two ways to fill the header bar — pick one.

**Option A — `.doorstop.yml` (simple, but leaks into new items).**
`attributes: defaults: doc: {...}` is dual-purpose in Doorstop: the same dict
is used for the publish header *and* as default attribute values stamped onto
every item `doorstop add` creates. Verified live: configuring `doc:` this way
makes every new item pick up a stray top-level `doc:` block. Harmless to
validation, but clutter in every item file, and there's no field for
Reviewer/Approver at all (Doorstop only recognizes `name`/`title`/`ref`/`by`/
`major`/`minor`/`copyright` here).

**Option B — a cover item (recommended, no leak, supports any field).**
`fresh.tpl` reads `document.items[0]` — the document's first active item —
and pulls `doc_title` / `doc_ref` / `doc_by` / `doc_major` / `doc_minor` /
`doc_reviewer` / `doc_approver` from its custom attributes, falling back to
`.doorstop.yml`'s `doc_attributes` (or Doorstop's own defaults) for any field
not set. Put these on your first item instead:

```yaml
# SYS-0001.yml — first item in the document, doubles as its "Document Control" entry
header: Document Control
heading: true
doc_title: Sensor Subsystem Requirements
doc_ref: ICD-014
doc_by: J. Berger
doc_major: '1'
doc_minor: '.2'
doc_reviewer: M. Keller
doc_approver: S. Walbrun
```

Verified live: with no `attributes:` block at all in `.doorstop.yml`, a new
`doorstop add` item comes out completely clean, and the published header still
shows Ref/By/Issue/Reviewer/Approver pulled from this item.

Name these fields `doc_*`, never bare `ref`/`title` etc. — `ref` on an item is
a real, validated field (an external file reference via `CHECK_REF`), not a
free label; reusing it would collide with that behavior.

Since the cover item is a real, active item, it also appears in the body and
table of contents like any other item (typically as a short "Document
Control" heading) — that's expected, not a bug.

## Verified against

Ran against this repo's `testdata/regression` tree (`REQ` → `ARCH`/`EMPTY`/`MD`,
mixed YAML and Markdown item formats) via a real `doorstop publish`, both as a
single document and as a full tree — confirmed: headings, omitted links lines
on items with none, the custom-attribute table (via a document's
`attributes: {publish: [...]}` list), Index/Traceability nav, and
cross-document linkification all render correctly. Also confirmed both header
options above with real `doorstop add` / `doorstop publish` runs, including
that Option A's `attributes: defaults: doc:` leak and Option B's clean
`doorstop add` output are exactly as described.

## Known upstream quirks (not this template's doing)

- When an item has no header, its table-of-contents entry shows the item's
  **full text** as the label (Doorstop's own `table_of_contents()` behavior) —
  give normative items a `header` for a cleaner contents list.
- `lines_index()` emits `<pre><code>...</pre></code>` (closing tags swapped)
  for the tree-structure block on `index.html`. Browsers recover fine; it's a
  pre-existing bug in `doorstop/core/publishers/html.py`, not in this CSS.

## Offline use

Google Fonts (Libre Franklin / IBM Plex) are loaded from
`fonts.googleapis.com` in `views/base.tpl`. Without internet access at view
time, the page falls back to system fonts (Georgia / Segoe UI / Consolas) —
layout and content are unaffected. Remove that `<link>` if the published
output must have zero external dependencies.
