# Publish as PDF

*Publish* → a document or *All documents* → **PDF** writes one A4 PDF per document, plus `traceability.pdf` (landscape, scaled to fit) when publishing all documents. Page 1 has no header; later pages show the document name and a logo, and every page shows `Page N of M` (plus `Rev X` when the template's title block has an issue).

The PDF is printed from Doorstop's HTML by a headless browser. That HTML comes from the configured publish template, or from Doorstop's default HTML when none is set, so fonts and page breaks come from the template. The extension ships no template.

## Setup

The first PDF publish asks to add a `doorstop-pdf/` folder to the workspace with the export script, then installs its packages and a headless Chromium into it. This needs **Node.js ≥ 18 and npm** on PATH, in addition to Python with Doorstop. Commit `doorstop-pdf/`; its `node_modules` is git-ignored. Replace `doorstop-pdf/logo.svg` (or add a `logo.png`) to use your own logo, or delete it to show none. The extension never overwrites files that already exist in that folder.

## CI

CI runs the same script, so a pipeline produces the same PDFs. Page breaks only match exactly between your machine and the runner when the template brings its own fonts. With system fonts, such as Doorstop's default HTML, line and page breaks can differ between operating systems.

CI publishes with `python -m doorstop_server.publish` from the server package instead of `doorstop publish`, so the traceability matrix and child links include cross-document links exactly as in the extension. It takes the same arguments as `doorstop publish`, plus `--traceability doorstop` for Doorstop's own matrix; add `--template <name>` if your project uses one and `--no-child-links` to match that setting.

GitHub Actions:

```yaml
- uses: actions/setup-python@v5
  with:
    python-version: "3.12"
- run: pip install doorstop-vscode-server
- uses: actions/setup-node@v4
  with:
    node-version: 24
- name: Install PDF tooling
  working-directory: doorstop-pdf
  run: |
    npm ci
    npx playwright install --with-deps chromium
- run: python -m doorstop_server.publish all out --html
- run: node doorstop-pdf/export-pdf.mjs out out/pdf
- uses: actions/upload-artifact@v4
  with:
    name: pdf
    path: out/pdf
```

GitLab CI:

```yaml
publish-pdf:
  image: mcr.microsoft.com/playwright:v1.64.0-noble  # same version as doorstop-pdf/package.json
  script:
    - apt-get update && apt-get install -y python3-pip git
    - pip install --break-system-packages doorstop-vscode-server
    - (cd doorstop-pdf && npm ci)
    - python3 -m doorstop_server.publish all out --html
    - node doorstop-pdf/export-pdf.mjs out out/pdf
  artifacts:
    paths:
      - out/pdf
```
