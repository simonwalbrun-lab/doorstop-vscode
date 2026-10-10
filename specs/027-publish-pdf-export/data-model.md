# Data Model: Publish PDF Export

No persisted data and no server schema changes. Entities are files on disk.

## PDF tooling folder

`<workspaceFolder>/doorstop-pdf/`

| File | Origin | Notes |
| ---- | ------ | ----- |
| `export-pdf.mjs` | `media/pdf-export/` | Never overwritten once present. |
| `package.json`, `package-lock.json` | `media/pdf-export/` | Pin `playwright`, `pdf-lib`. |
| `logo.svg` (or user `logo.png`) | `media/pdf-export/` | Optional; deleted → no logo (FR-008). |
| `.gitignore` | `media/pdf-export/gitignore` | Contains `node_modules/`. |
| `node_modules/` | `npm ci` | "Installed" ⇔ `node_modules/playwright` exists. |

**States**: absent → copied (confirmed by user) → installed (`npm ci` +
Chromium) → used. Each file is copied only if missing.

No HTML template is part of this model; `template/` folders are the user's
and are never read or written by the extension beyond Doorstop's own lookup.

## Publish output

| Mode | Input to script | Output |
| ---- | --------------- | ------ |
| Single document | `<tmp>/documents/PREFIX.html` | chosen `*.pdf` file |
| All documents | `<tmp>/` (combined HTML run) | `<dest>/PREFIX.pdf` × N + `<dest>/traceability.pdf` |

`<tmp>` = `fs.mkdtemp(os.tmpdir()/doorstop-pdf-)`, removed in `finally`.

## Page frame (per PDF)

| Field | Document PDF | Traceability PDF |
| ----- | ------------ | ---------------- |
| Paper | A4 portrait | A4 landscape |
| Side margins | 0 mm if `.native-page` present, else 16 mm | same rule |
| Header | from page 2: title text (R5) + logo | every page: "Traceability" + logo |
| Footer | `[Rev X]` · `Page N of M` | `Page N of M` |
| Scale | 1 | `min(1, printable / scrollWidth)`, ≥ 0.1 |

**Validation**: dest file name = document prefix + `.pdf`; existing PDFs are
overwritten (same as other publish formats).
