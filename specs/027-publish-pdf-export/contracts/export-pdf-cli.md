# Contract: `export-pdf.mjs` CLI

Run from anywhere: `node doorstop-pdf/export-pdf.mjs <input> [output]`

Works with HTML from any Doorstop template (default or custom).

## Arguments

| Input | Output (default) | Behaviour |
| ----- | ---------------- | --------- |
| `*.html` file | `.pdf` beside input | One A4 portrait PDF, page 1 without header. |
| Folder (a Doorstop HTML publish root) | `<input>/pdf/` | One PDF per `documents/*.html` named `PREFIX.pdf`; `traceability.html` → `traceability.pdf` (landscape, scaled to fit) if present. Output folder created if missing. |

## Output per PDF

See [data-model.md — Page frame](../data-model.md#page-frame-per-pdf).

- Header text: A4-style `.native-meta` Doc + `.doctitle` → else `<title>` →
  else file name prefix.
- Logo: `logo.svg` / `logo.png` beside the script, else none.
- Footer: `Rev <Issue>` when the A4-style block has one; `Page N of M` always.
- No link annotations; content CSS untouched.
- stdout: `Exporting <name>.pdf` before and `PDF written to <path>` after each file.

## Exit codes and streams

| Code | Meaning | stderr |
| ---- | ------- | ------ |
| 0 | All PDFs written | Optional `Warning: …` lines (e.g. matrix wider than page at 10 %). |
| 1 | Usage error, input missing/empty, browser launch failed, or ≥ 1 file failed | One line per failure: `Failed: <input> → <output>: <reason>`; Playwright's own "run npx playwright install" message passed through. |

On partial failure the PDFs that succeeded remain written.

## CI usage (normative example)

```bash
doorstop publish all out --html            # add --template X if the project uses one
node doorstop-pdf/export-pdf.mjs out out/pdf
```
