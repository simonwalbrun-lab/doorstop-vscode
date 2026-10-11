# Quickstart: validating Server Connection & Lifecycle

Prerequisites: `npm ci`; `pip install -e server` plus pytest.

- Server side (FR-008..011): `pytest server/tests`
- Extension side (FR-001..007): `npm test` (includes `src/test/serverLifecycle.test.ts` once added)
- Manual: open the fixture workspace and confirm the "Doorstop server is ready." toast; run "Doorstop: Restart Server"; close the window and confirm port 7867 is free.
