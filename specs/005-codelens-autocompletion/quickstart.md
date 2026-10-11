# Quickstart: validate 005

1. `npm run compile && npm run check-types && npm run lint`
2. `npm test` (real server against `testdata/regression`).
3. Manual: open `testdata/regression/REQ-010.yml`, click `+ Derive Requirement`, pick a target, confirm the new item exists, links to REQ-010, and opens. Then type `- ` under `links:` and confirm `UID - title` suggestions (recently viewed first) and none outside `links:`.
