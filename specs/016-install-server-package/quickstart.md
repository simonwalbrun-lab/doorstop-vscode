# Quickstart & Validation: Prompt to Install Missing Server Package

**Feature**: `016-install-server-package` | **Date**: 2026-09-11

How to build, run, and prove this feature works. See [data-model.md](./data-model.md)
for the function contracts and state machine; not repeated here.

---

## Prerequisites

- Node dependencies installed: `npm install`.
- Two Python environments (or one venv you can uninstall from) to exercise both
  paths:
  - one **without** `doorstop-vscode-server` installed, to see the install prompt;
  - one **with** it installed (e.g. the repo's own `.venv`, via
    `pip install -e server[dev]`), to confirm the unchanged happy path.
- The fixture workspace at `testdata/regression` (already in the repo) as the
  `.doorstop.yml`-marked workspace to open.

---

## Build

```bash
npm run compile          # check-types + lint + esbuild
```

No webview or build-config changes are needed — everything lives in the extension
host (`src/doorstopServer.ts`, `src/extension.ts`).

---

## Automated validation (Constitution VI)

```bash
npm test                 # runs every vscode-test label, including the new suite
```

The new `src/test/serverPackageInstall.test.ts` suite (registered in
`.vscode-test.mjs`) substitutes a fake spawn function (per
[data-model.md](./data-model.md) §1–2) and must cover at minimum:

| Assertion | Proves |
| --- | --- |
| `isServerPackageInstalled` resolves `true` when the fake process exits `0` | FR-001, FR-003 |
| `isServerPackageInstalled` resolves `false` (not a rejection) when the fake process exits non-zero | FR-001 |
| `isServerPackageInstalled` resolves `false` when the fake spawn itself errors (bad interpreter path) | FR-001 error handling |
| `installServerPackage` resolves `{ success: true, ... }` when the fake process exits `0` | FR-004, FR-006 |
| `installServerPackage` resolves `{ success: false, output }` (not a rejection) with the captured output when the fake process exits non-zero | FR-007 |
| Two concurrent `installServerPackage` calls for the same `pythonPath` share one underlying spawn | FR-008 |
| Two concurrent calls for **different** `pythonPath` values spawn independently | FR-008 (scoped per interpreter) |
| A call after a prior call's promise has settled spawns again rather than reusing the settled result | FR-007 "retryable" |

The suite must be non-interactive, deterministic, and require no real Python
interpreter, network access, or fixed port — the same bar `diagramLayout.test.ts`
(spec 015) and `server/tests` already meet, achieved here by never invoking a real
`spawn` in the test.

---

## Manual acceptance walk-through

Launch the extension host (`F5`, or the "Run Extension" launch config) against
`testdata/regression`.

### US1 — Notification appears when the package is missing

1. In VS Code, select a Python interpreter (via the Python extension) that does
   **not** have `doorstop-vscode-server` installed (e.g. a fresh venv:
   `python -m venv /tmp/no-server && ` select it via "Python: Select Interpreter").
2. Reload the extension host window. ✅ Instead of the generic "Doorstop server
   unavailable: ..." warning, a notification appears naming the missing package with
   an **Install** action.
3. Click away / dismiss it. ✅ No install runs; the server stays stopped, same as
   today's failure state.
4. Switch the selected interpreter to one that already has the package installed,
   then run **Doorstop: Restart Server**. ✅ No install prompt — the server starts
   normally (existing behavior, unchanged).

### US2 — Installing from the notification starts the server

1. With the no-package interpreter selected again, trigger the notification (reload
   or **Doorstop: Restart Server**) and click **Install**.
2. ✅ A progress notification appears while the install runs.
3. ✅ On completion, a success message appears and the server becomes reachable
   without any further action — verify by opening the Explorer tree view and
   confirming it populates from `testdata/regression`.

### US3 — Install failure is actionable and retryable

1. Disconnect network access (or point `pip` at an unreachable index via
   `PIP_INDEX_URL`), then repeat the Install flow from US2.
2. ✅ An error notification appears with relevant captured output (not a silent
   failure), and the server is not started.
3. Restore network access and click **Install** again (or **Doorstop: Restart
   Server**). ✅ The extension attempts the install again — it is not remembered as
   permanently failed.

---

## Regression checks (things this feature must not break)

- With the package already installed, activation and **Doorstop: Restart Server**
  behave exactly as before this feature (no extra prompt, no added delay beyond a
  fast presence check).
- The existing "no workspace folder open" / "no `.doorstop.yml` marker" / "no Python
  interpreter selected" warnings (spec 001, FR-004) still appear unchanged — this
  feature's check only runs once an interpreter has actually been resolved.
- A genuine server-startup failure unrelated to the package being missing (e.g. the
  fixed port already in use) still surfaces via the existing
  `portInUseHint`/`outputSuffix` error path, not the new install flow.
