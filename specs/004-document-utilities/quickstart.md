# Quickstart: Validate Document Utilities

Prerequisites: `pip install -e "./server[dev]"`, `npm ci`.

1. Server behaviour: `pytest server/tests/test_documents.py -k "reorder or export or import or publish"` - expect all pass.
2. Command wiring: `npm test` (xvfb on Linux) - `regressionFixture` covers manual reorder, Export and Publish path reporting.
3. Manual check: run "Reorder Document" > Manual, edit `index.yml`, run the command again and choose Apply; levels follow the index and `index.yml` is gone. Run "Publish Document" > HTML and confirm the reported file opens.
4. Traceability: `grep -rn "Spec 004 FR-" server/tests src/test` lists a test for each of FR-001..FR-008.
