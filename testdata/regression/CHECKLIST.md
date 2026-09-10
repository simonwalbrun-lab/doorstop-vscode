# Doorstop Extension Regression Checklist

Run this checklist before every release to confirm no shipped feature has
regressed. It uses only the fixture in this folder (`testdata/regression`) —
no other setup, network access, or external service is required beyond a
local Doorstop server.

## Prerequisites

- [ ] Python with the `doorstop` package and this repo's `server/` package
      installed (`pip install -e .[dev]` from `server/`), and its interpreter
      selected as the active Python environment for this workspace (via the
      Python extension) — the extension starts the Doorstop server using it.
      If the server fails to start, check this first.
- [ ] Open this folder (`testdata/regression`) as your VS Code workspace (or
      workspace folder). The Explorer view's Doorstop panel should populate
      with three documents: `REQ`, `ARCH`, and `EMPTY`.
- [ ] No prior run left uncommitted changes under this folder (`git status`
      should show nothing here before you start; restore anything left over
      from a previous pass first).

## Baseline feature coverage (User Story 1)

| # | Feature area | Fixture element | Action | Expected outcome | Automated coverage |
|---|---|---|---|---|---|
| 1 | Server connection & lifecycle | this workspace | Open the workspace | The Doorstop server starts automatically and the Explorer tree populates within a few seconds, with no error notification | Exercised implicitly — every automated test in `regressionFixture.test.ts` requires a live server against this fixture to pass |
| 2 | Explorer & commands panel | `REQ`, `ARCH`, `EMPTY` documents | Open the Doorstop Explorer view | All three documents are listed, expandable, and show their items | Yes — `regressionFixture.test.ts`: "Explorer tree loads all three fixture documents" |
| 3 | Item lifecycle commands | `REQ-001` | Use the tree's "Add Item" action on `REQ` | A new item is created under `REQ`; delete it afterward to leave the fixture unchanged | Partially — `regressionFixture.test.ts`: "Item lifecycle: the review command marks REQ-001 as reviewed" covers the review command specifically, not add/link |
| 4 | Document utilities | `REQ` document | Run Doorstop: Publish on `REQ` | A published rendering of `REQ`'s items (including `REQ-001`–`REQ-009`) is produced without error | Not yet automated |
| 5 | CodeLens & autocompletion | `ARCH-001.yml` | Open `ARCH-001.yml`; place the cursor after `links:` and start typing `REQ-` | Autocompletion suggests fixture item UIDs (e.g. `REQ-001`); the `derived:` field shows a CodeLens offering to derive a new requirement | Not yet automated |
| 6 | Hover & navigation | `REQ-004` | Hover the `REQ-004` UID from a file that references it (or hover it in the tree) | A hover preview shows `REQ-004`'s heading ("Heading Display Coverage") and text | Not yet automated |
| 7 | Diagram core | `diagram.doorstop.json` | Open `diagram.doorstop.json` (Doorstop Diagram editor) | The diagram opens showing `REQ-001`, `REQ-004`, and `ARCH-001` as nodes, with an edge from `ARCH-001` to `REQ-001` | Not yet automated |
| 8 | Diagram interaction | `diagram.doorstop.json` | Drag the `REQ-001` node to a new position, then save (Ctrl+S) and reopen | The node's new position persists after reopening | Not yet automated |
| 9 | Go-to-definition & usage navigation | `ARCH-001.yml` | Open `ARCH-001.yml`, place the cursor on the `REQ-001` link, press F12 | The editor jumps to `REQ-001.yml` | Yes (via `REQ-009`, not `ARCH-001`) — `regressionFixture.test.ts`: "Go to Definition reports REQ-009's dangling link as broken" |
| 10 | Treeview auto-reveal toggle | Explorer view toolbar | Click the auto-reveal toggle, then open `REQ-002.yml` directly | With auto-reveal off, the tree does not jump to `REQ-002`; toggling it back on and reopening the file reveals it | Not automated against this fixture, but already covered elsewhere — `src/test/extension.test.ts`: "Auto-reveal toggle suppresses reveal on both gated paths" |

## Edge-case coverage (User Story 2)

| # | Edge case | Fixture element | Action | Expected outcome | Automated coverage |
|---|---|---|---|---|---|
| 11 | Empty document | `EMPTY` document | Expand `EMPTY` in the Explorer tree, and open it in a new diagram | It renders as a valid document with zero items — no error, no missing/hidden document | Partially — `regressionFixture.test.ts`: "Explorer tree loads all three fixture documents" asserts `EMPTY` has zero items via the tree API; the diagram-rendering half is not yet automated |
| 12 | Suspect link | `REQ-007` | Hover `REQ-007`, or view it in a diagram with `REQ-001` added | Its link to `REQ-001` is shown as suspect; run Doorstop: Clear Suspect on `REQ-007` and confirm the suspect indicator clears (then re-run `doorstop link REQ-007 REQ-001` locally to restore the fixture, or discard the change) | Yes (clear-suspect only, not hover/diagram) — `regressionFixture.test.ts`: "Item lifecycle: the clear-suspect command resolves REQ-007's suspect link" (restores the fixture file automatically afterward) |
| 13 | Dangling link | `REQ-009` | Hover `REQ-009`'s link to `REQ-999`, or press F12 on it | The broken reference is reported clearly (e.g. "not found") — no crash, no silent no-op | Yes (F12 only, not hover) — `regressionFixture.test.ts`: "Go to Definition reports REQ-009's dangling link as broken" |

## After the pass

- [ ] `git status` shows no unintended changes under `testdata/regression/`
      (revert anything left over from step 3 or step 12 above).
