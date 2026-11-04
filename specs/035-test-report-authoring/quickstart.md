# Quickstart: Test Report Authoring

Validation guide. Automated tests cover every FR (see plan.md → Test
coverage); this is the manual end-to-end check.

## Prerequisites

- Extension built: `npm run compile`, then F5 (Extension Development Host)
  on `testdata/regression`.
- For Story 3 only: a MinIO instance, for example
  `docker run -p 9000:9000 -p 9001:9001 minio/minio server /data --console-address :9001`,
  with a bucket `reports` that allows anonymous read.

## 1. Toggle (Story 1)

1. In `REQ-001.yml`, change `text: |` content to include
   `  - [ ] step one` and `  - [x] step two`.
2. Click between the brackets of `step one` → becomes `[x]`. Click again →
   `[ ]`. Ctrl+Z → previous state. File is dirty, not saved.
3. Click on the word `step` → nothing toggles. Drag-select across the box →
   nothing toggles.
4. Open the document as Document View, click a task's brackets there, save →
   `REQ-001.yml` holds the new state.

## 2. Attach into repo (Story 2)

1. Drag a `.png` and a `.log` from Windows Explorer into the `text:` block
   while holding **Shift** (VS Code otherwise opens the file).
2. Expect `testdata/regression/assets/<name>.png` and `.log`, and two lines
   in the text: `![x.png](assets/x.png)` and `[y.log](assets/y.log)`,
   indented like the block.
3. Copy a file in Explorer, Ctrl+V into the text → same result at the cursor.
4. Win+Shift+S a screenshot, Ctrl+V → `assets/paste-<timestamp>.png`.
5. Drop the same `.png` again → no new file, same link. Drop a different file
   with the same name → `x-1.png`.
6. Ctrl+V plain text, or drop onto the `links:` line → default behavior,
   nothing stored.

## 3. Object storage (Story 3)

1. Settings: `doorstop.attachments.storage = objectStorage`,
   `endpoint = http://localhost:9000`, `bucket = reports`,
   `thresholdMB = 1`.
2. Run **Doorstop: Set Object Storage Credentials** (minioadmin /
   minioadmin).
3. Drop a 100 KB file → lands in `assets/`. Drop a 5 MB file → link
   `http://localhost:9000/reports/REQ-001/<timestamp>-<name>`; opens in a
   browser; not in `assets/`.
4. Stop MinIO, drop a 5 MB file → error names the file, no link, nothing in
   `assets/`.
5. Clear the bucket setting, drop a 5 MB file → error points to
   `doorstop.attachments.objectStorage.bucket`.

## 4. Garage (Story 3, second reference target)

1. Garage running with `garage.toml` like: `[s3_api] api_bind_addr = "[::]:3900"`,
   `s3_region = "garage"`, `[s3_web] bind_addr = "[::]:3902"`,
   `root_domain = ".web.garage.localhost"`.
2. Create bucket and key, allow access and the website:
   `garage bucket create reports`, `garage key create doorstop`,
   `garage bucket allow --read --write reports --key doorstop`,
   `garage bucket website --allow reports`.
3. Settings: `storage = objectStorage`, `endpoint = http://localhost:3900`,
   `region = garage`, `bucket = reports`, `thresholdMB = 0`,
   `publicUrl = http://reports.web.garage.localhost:3902`.
4. **Doorstop: Set Object Storage Credentials** with the key ID and secret key
   printed by `garage key create`.
5. Drop a file → link `http://reports.web.garage.localhost:3902/TR-001/<timestamp>-<name>`
   opens in a browser without a login (`*.localhost` resolves to 127.0.0.1).
6. Clear `publicUrl`, drop again → link `http://localhost:3900/reports/…`;
   it gives `AccessDenied` in a browser, which is why `publicUrl` exists.
7. Set `region` back to `us-east-1` → error names the file and Garage's
   region complaint.

## Automated

```powershell
npm run compile
npx vscode-test --label taskToggle
npx vscode-test --label attachments
```
