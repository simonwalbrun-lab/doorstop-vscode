# Quickstart: Validating Review & Suspect-Link CodeLenses

How to prove this feature works end to end. Everything runs against the real
Doorstop server and the real `testdata/regression` fixture — no mocks
(Constitution Principle V).

## Prerequisites

- Python environment with the server installed: from `server/`,
  `pip install -e .[dev]` into the repo `.venv`.
- `npm install` at the repo root.
- The `ms-python.python` extension available in the Extension Development Host
  (the extension resolves its interpreter through it).

## Gates that must pass

```bash
npm run check-types
npm run lint
npm run compile          # type-check + lint + bundle
```

```bash
# from server/ — includes the new selective-clear contract test
python -m pytest tests
```

Extension integration suite (drives the real server against the fixture):

```bash
npm test
```

---

## Fixture state to rely on

`testdata/regression` already provides most of what the scenarios below need:

| Item | Shape | Useful for |
| --- | --- | --- |
| `REQ-001` | `links: []`, `reviewed: null` | no link lenses must appear (FR-003) |
| `REQ-006` | `reviewed: <stamp>` | Do Review on an already-reviewed item |
| `REQ-007` | one link, `- REQ-001: null` (suspect) | Clear All / Clear one, happy path |
| `REQ-008` | one link, stamped (cleared) | clearing an already-clear link is a no-op |
| `REQ-009` | `- REQ-999: null` (dangling) | server-side rejection path (US3 scenario 3) |
| `ARCH-001` | child document, one link | lenses in a nested document |

**One fixture addition is required**: an item with **two** links, so "clear one,
leave the other" is observable. Without it, FR-006 / SC-003 cannot be
distinguished from FR-004. Add it as a new item (e.g. `REQ-010.yml` linking to
both `REQ-001` and `REQ-002`) and regenerate its stamps by running the server
against the fixture.

---

## Scenario 1 — Do Review (User Story 1, P1)

1. Launch the Extension Development Host (F5) with `testdata/regression` open as
   the workspace folder. Wait for "Doorstop server is ready."
2. Open `REQ-007.yml`.
3. **Expect**: a `Do Review` lens directly above the `reviewed:` line, and the
   pre-existing `+ Derive Requirement` lens still above `derived:` (FR-012).
4. Click `Do Review`.
5. **Expect**: `reviewed: null` becomes `reviewed: <stamp>` in the open editor
   without reopening the file (FR-008), and a success message names the item.
6. **Expect**: no other item changed — check `REQ-008.yml` is untouched
   (FR-002).

**Negative check**: open any non-requirement `.yml` (e.g. `.doorstop.yml`).
Expect **no** Doorstop lenses (FR-011).

**Failure check**: run `Doorstop: Restart Server`, and while it is down click
`Do Review`. Expect an explicit error message naming the failure and an
unchanged file (FR-009). Note the lens itself still renders while the server is
down — lens provision performs no network call by design (research.md §2).

---

## Scenario 2 — Clear All Suspicions (User Story 2, P2)

1. Open `REQ-007.yml` (one suspect link).
2. **Expect**: a `Clear All Suspicions` lens immediately above the `links:` line.
3. Open `REQ-001.yml` (`links: []`).
4. **Expect**: **no** `Clear All Suspicions` lens and no per-link lenses
   (FR-003, US2 scenario 2).
5. Back in `REQ-007.yml`, click `Clear All Suspicions`.
6. **Expect**: `- REQ-001: null` becomes `- REQ-001: <stamp>`; the Doorstop tree
   view reflects the item as cleared after its refresh.

---

## Scenario 3 — Clear the Suspicion, one link only (User Story 3, P3)

This is the scenario that distinguishes this feature from the bulk action.

1. Open the new two-link fixture item (both links suspect).
2. **Expect**: one `Clear the Suspicion` lens on **each** link entry line
   (FR-005) plus one `Clear All Suspicions` above `links:`.
3. Click `Clear the Suspicion` on the **first** link only.
4. **Expect**: the first entry gains a stamp; **the second entry still reads
   `null`** (FR-006, SC-003).
5. Confirm against the server rather than the file alone:
   `GET http://127.0.0.1:7867/tree` → that item's `links[]` shows
   `suspect: false` for the first and `suspect: true` for the second.

**Dangling-parent check**: open `REQ-009.yml` (links to nonexistent `REQ-999`)
and click its `Clear the Suspicion`. Expect an explicit error carrying the
server's `DOORSTOP_ERROR` message, and no change to the file (US3 scenario 3).

---

## Scenario 4 — Unsaved edits (FR-010)

1. Open `REQ-007.yml` and type a change into its `text:` block. Do **not** save.
2. Click any of the three lenses.
3. **Expect**: a modal warning explaining the file must be saved because the
   server rewrites it, offering `Save and Continue` and Cancel.
4. Choose Cancel → **expect** no request, no file change, edit still unsaved.
5. Click again, choose `Save and Continue` → **expect** the edit is persisted,
   then the action runs, and the resulting file contains both the edit and the
   new stamp.

At no point may an unsaved edit vanish silently.

---

## Scenario 5 — Derive CodeLens remediation (research.md §5)

Confirms the audit fix did not regress the existing feature.

1. Open `ARCH-001.yml` (in the child `ARCH` document).
2. Click `+ Derive Requirement`.
3. **Expect**: the target-document quick pick offers the same prefixes as before
   the change — now sourced from `GET /tree` rather than a workspace glob.
4. Pick a target. **Expect**: a new item is created, linked back to `ARCH-001`,
   and opened — behaviour unchanged (FR of feature 005 preserved).
5. **Regression guard**: with the server stopped, invoke the lens. **Expect** an
   explicit error about the tree fetch, *not* a silently empty or shortened
   document list (this is the Principle III improvement over today's bare
   `catch {}`).
6. **Code check**: `grep -n "js-yaml\|findFiles" src/deriveProvider.ts` returns
   nothing. That is the audit's pass condition.

---

## Definition of done

- All five scenarios behave as described in the Extension Development Host.
- `npm run compile` and `python -m pytest tests` (from `server/`) pass.
- `npm test` passes, including the new integration assertions listed in
  [contracts/codelens-actions.md §3](contracts/codelens-actions.md).
- `src/deriveProvider.ts` no longer parses `.doorstop.yml` client-side.
