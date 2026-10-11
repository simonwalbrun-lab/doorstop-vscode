# Quickstart: validating the Explorer & Commands Panel

1. `npm run compile` then `npm test` (runs every label in `.vscode-test.mjs`, including the new explorer suite).
2. `cd server && pytest` (tree and document-creation endpoints).
3. Manual check: open a workspace with Doorstop documents, confirm roots/nesting in the
   Doorstop view, click an item, run "Doorstop: Refresh", open an item file directly
   (tree reveals it), click Commands panel rows, run "Doorstop: Create Document" and try
   a parent, "None", and Escape.
4. Traceability: `grep -rn "Spec 002 FR-" src/test server/tests` must list FR-001..FR-011.
