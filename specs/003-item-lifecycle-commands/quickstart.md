# Quickstart (validation)

1. `pip install -e "./server[dev]" && pytest server/tests/test_documents.py server/tests/test_items.py server/tests/test_review.py`
2. `npm ci && npm test` (xvfb on Linux) - runs `regressionFixture.test.ts` lifecycle cases.
3. Manual: right-click a document -> Add Item (file opens); select an item, Link Items; Review / Clear Suspect via context menu and palette.
