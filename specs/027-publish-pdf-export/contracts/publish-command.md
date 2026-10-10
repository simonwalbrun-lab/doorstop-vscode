# Contract: `doorstop.publish` with PDF

## Flow

1. Target picker — unchanged (document / "one file each" / "combined run").
2. Format picker — adds `PDF` (`.pdf`) after LaTeX.
3. **Tooling check** (PDF only), before any destination dialog:
   - `doorstop-pdf/export-pdf.mjs` missing →
     modal `Set up PDF export in this workspace? This adds the folder doorstop-pdf/ with the export script.`
     — `Set up` / Cancel. Cancel → nothing written, command ends.
   - `doorstop-pdf/node_modules/playwright` missing →
     `PDF tooling is not installed.` — `Install` / Cancel.
     Install → toast `Installing PDF tooling…` (`npm ci`, `npx playwright install chromium`).
   - `npm` not found → error `PDF export needs Node.js and npm on PATH.` — `Get Node.js` (opens nodejs.org).
4. Destination — single document: save dialog filtered to `*.pdf`; all: folder dialog.
5. Run (progress toast via `run('Publish', …)` after 1 s): HTML publish to temp
   (template = setting value or none) → `node doorstop-pdf/export-pdf.mjs …`
   (cwd = workspace folder) → temp removed.
6. Result — `reportWrittenPath`: single → the PDF (Open opens it in the OS viewer);
   all → `Published N document(s) and the traceability matrix as PDF to <dir>.`
   Any `Warning:` lines from the script → additional `showWarningMessage`.

## Errors

| Situation | Message |
| --------- | ------- |
| HTML publish fails | Server message + existing template hint (unchanged). |
| Script exit ≠ 0 | `PDF export failed: <stderr>` (names failing file). |
| Dialog cancelled | Silent, nothing written. |

The extension never creates, copies or modifies any `template/` folder.
