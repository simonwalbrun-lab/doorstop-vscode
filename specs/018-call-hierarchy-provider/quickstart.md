# Quickstart: Requirement Call Hierarchy

**Feature**: `018-call-hierarchy-provider` | **Date**: 2026-09-11

How to prove the feature works end to end — automated first, then the
manual checks that cover what the API cannot observe (the peek widget's
appearance). Expected values come from `contracts/call-hierarchy.md`; label
rules from `data-model.md`.

## Prerequisites

- Node dependencies installed (`npm install`).
- A Python interpreter with `doorstop_server` installed, either in the repo's
  `.venv` or on `PATH` (`pip install -e .[dev]` from `server/`), exactly as
  the existing regression suite requires.
- No other Doorstop server bound to the default port (the suite refuses to
  run against a foreign project — see `regressionFixture.test.ts`).

## Automated validation (CI-equivalent)

```powershell
npm run compile      # check-types + lint + bundle  (constitution V)
npm test             # all vscode-test configs; CI runs the same under xvfb-run
```

To iterate on just the two suites this feature touches:

```powershell
npm run compile-tests
npx vscode-test --label regressionFixture
npx vscode-test --label packageMenus
```

**Expected**: the new `Call Hierarchy (018)` tests pass alongside the
existing fixture tests, and `packageMenus` reports the inline
`doorstop.showCallHierarchy` entry on `doorstop.item` rows only. Nothing in
the fixture is modified (the tests are read-only).

Success-criteria mapping:

| SC | Proven by |
| --- | --- |
| SC-001 (one click from tree) | `doorstop.showCallHierarchy` test: active editor becomes the item's file at its header line; the peek chain is VS Code's own command |
| SC-002 (multi-level) | outgoing of `ARCH-001` → `REQ-001` after incoming of `REQ-001` → `ARCH-001` (second level resolved from a node the widget would have created) |
| SC-004 (label form) | `REQ-004` → `REQ-004: Heading Display Coverage` / `REQ`; `REQ-001` → `REQ-001` |
| SC-005 (agrees with hover) | both read the same `DoorstopIndex`; the incoming set `{ARCH-001, MD-001}` is the set hover lists as downstream for REQ-001 |
| SC-006 (never crashes) | `REQ-009` → unresolved `REQ-999`, expansion `[]`; index-failure path returns `undefined`/`[]` |

## Manual validation (peek widget appearance)

Open `testdata/regression` as the workspace (or any Doorstop project) with
the extension running (`F5`), then:

1. **Tree icon** — hover a requirement row in the Doorstop tree. Expect a
   hierarchy icon between the Add and Link icons; document root rows show
   none. Click it on `ARCH-001`.
   - Expect: `ARCH-001.yml` opens, cursor on `header:`, and a peek titled
     *Call Hierarchy* appears **already in the outgoing direction**, listing
     `REQ-001` with detail `REQ` (FR-003b, Q4).
2. **Direction icon** — on the peek's top line there is one direction icon.
   In outgoing mode it is *Show Incoming Calls*; press it.
   - Expect: the view re-roots on `ARCH-001` and shows incoming (downstream)
     items — for `ARCH-001` that is empty ("No results"). Press again to go
     back to outgoing. (This single flipping icon is the sample's built-in
     behaviour accepted in clarification Q3.)
3. **Follow the chain** — from `REQ-001.yml` open the hierarchy, switch to
   incoming: expect `ARCH-001` (`ARCH`) and `MD-001` (`MD`). Expand
   `ARCH-001`: its own incoming list is empty; switch to outgoing and expand
   again: `REQ-001` appears beneath it (US2).
4. **Open from the hierarchy** — double-click `MD-001`. Expect `MD-001.md`
   to open at its first heading; press *Go Back* (Alt+Left) and land back in
   the previous file (US3, FR-006).
5. **Dangling link** — open the hierarchy for `REQ-009` (outgoing). Expect
   one entry `REQ-999` with detail `unresolved`; expanding it shows nothing;
   selecting it stays on `REQ-009.yml`'s `links:` line (FR-010 as
   implemented — see research §5).
6. **From the editor** — in any requirement file press Shift+Alt+H (Peek
   Call Hierarchy) with the cursor on prose: roots on that file's item. With
   the cursor on a UID under `links:`: roots on the referenced item (US4).
7. **Server down** — stop the server (kill the process or use the restart
   command mid-way) and click the tree icon: expect a single warning that
   the hierarchy is unavailable, and no peek (FR-011).
8. **Live data** — add a link to a requirement, save, re-open the hierarchy:
   the new entry is present without restarting (FR-012).

## Out of scope reminders

- No suspect-link marker in the hierarchy (Q5).
- No diagram-canvas command.
- The References side panel's *Call Hierarchy* will also work (same
  provider) but is not the launch surface and is not tested.
