# Quickstart: validate Diagram Core

1. `npm run compile` then `npm test` (fixture workspace + server via `@vscode/test-cli`).
2. Manual: run "Doorstop: New Diagram", save, confirm empty canvas; drag an item in, Ctrl+S, reopen; stop the server and reopen to see the one-time warning with the saved layout intact.
3. Traceability check: `grep -rn "Spec 007 FR-" src/test` must list FR-001..FR-007.
