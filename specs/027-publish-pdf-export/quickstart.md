# Quickstart: Validate PDF Export

Prerequisites: Node ≥ 18 + npm on PATH, Python with `doorstop` (or the server
package) installed, network access for the first install.

## 1. Extension, single document, default HTML (US1)

1. Open a copy of `testdata/regression` as workspace; leave
   `doorstop.publish.template` empty.
2. Run **Doorstop: Publish** → `REQ` → `PDF`.
3. Confirm **Set up**, then **Install**.
   - Expect: `doorstop-pdf/` with `.gitignore`; no `template/` folder created
     anywhere.
4. Save as `REQ.pdf`.
   - Expect: one A4 file; page 1 has no header; pages 2+ show the document
     name + logo; footer `Page N of M` on every page; side margins present.

## 2. Extension, all documents (US2)

1. **Publish** → `All documents - combined run` → `PDF` → empty folder.
   - Expect: `REQ.pdf`, `ARCH.pdf`, `EMPTY.pdf`, `MD.pdf`, … and
     `traceability.pdf` in landscape with all columns visible; nothing else.
2. Re-run with a document's PDF open in a viewer that locks it (Windows).
   - Expect: error naming that file; the other PDFs written.

## 3. Custom template (A4-style)

1. Copy `doc/a4-template` parts into `testdata/regression/template/`, set
   `doorstop.publish.template` to `a4`, publish REQ as PDF.
   - Expect: header `Doc — Title`, footer starts with `Rev X`, no doubled side
     margin.

## 4. No overwrite / logo

1. Replace `doorstop-pdf/logo.svg`, publish again → new logo, file kept.
2. Delete `doorstop-pdf/logo.svg`, publish again → header without logo.

## 5. CI (US3)

From the workspace of step 1, after committing `doorstop-pdf/`:

```bash
pip install doorstop
cd doorstop-pdf && npm ci && npx playwright install --with-deps chromium && cd ..
doorstop publish all out --html
node doorstop-pdf/export-pdf.mjs out out/pdf
```

- Expect: same file set as step 2; exit code 0.
- SC-004: repeat with the template from step 3 (it brings its own web fonts)
  and compare with the local PDFs. Expect the same page count and per-page
  text. With default HTML, only the file set has to match.
- Repo CI: job `pdf-export` in `.github/workflows/ci.yml` is green
  (`node --test src/test/pdf/exportPdf.test.mjs`).
