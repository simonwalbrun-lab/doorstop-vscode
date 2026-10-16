# Quickstart: Toggle Document Skip

1. `cd server && pytest tests/test_document_skip.py`: skip/enable round trip, tree and validation exclusion.
2. `npm run check-types && npm run lint && npm test`: menu placement and tree-node tests.
3. Manual: open a project with a parent and child document, click the disable icon on the parent in the Doorstop tree view; both turn grey and their items and diagnostics vanish (disabling cascades to child documents; enabling restores only the clicked document). Click the enable icon: it returns. Create or delete `.doorstop.skip` by hand: the view follows within 2 s.
