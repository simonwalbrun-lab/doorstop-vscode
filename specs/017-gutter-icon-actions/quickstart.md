# Quickstart: Validating Review & Suspect-Link Quick Fixes

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

No server (Python) code changes in this feature, so `server/tests` is not
expected to change — run it anyway as a regression check:

```bash
# from server/
python -m pytest tests
```

Extension integration suite (drives the real server against the fixture):

```bash
npm test
```

---

## Fixture state to rely on

`testdata/regression` already provides everything this feature needs — no new
fixture items required:

| Item | Shape | Useful for |
| --- | --- | --- |
| `REQ-005` | `reviewed: null`, `links: []`, built specifically "to exercise the unreviewed state" | `needs_initial_review` diagnostic → `Do Review` quick fix |
| `REQ-006` | `reviewed: <stamp>`, no links | no `Do Review` fix offered (already reviewed) |
| `REQ-007` | one link, `- REQ-001: null` (suspect) | `suspect_link` diagnostic → `Clear Suspect Link` only (no `Clear All`) |
| `REQ-008` | one link, stamped (cleared) | no `Clear Suspect Link` fix offered (nothing suspect) |
| `REQ-009` | `- REQ-999: null` (dangling, unrelated `linked_to_unknown_item` error) | confirms this feature doesn't offer a fix for an unrelated diagnostic code |
| `REQ-010` | two suspect links, to `REQ-001` and `REQ-002` | both `Clear Suspect Link` and `Clear All Suspect Links` offered |

---

## Scenario 1 — Do Review via Quick Fix (User Story 1, P1)

1. Launch the Extension Development Host (F5) with `testdata/regression` open
   as the workspace folder. Wait for "Doorstop server is ready."
2. Open `REQ-005.yml`.
3. **Expect**: a Problem (Info) on the `reviewed:` line, and **no** "Do Review"
   text link above it (FR-004).
4. Put the cursor on the `reviewed:` line and invoke Quick Fix (`Ctrl+.`, or
   click the lightbulb that appears in the left margin next to the line).
5. **Expect**: exactly one fix offered, `Do Review` (FR-001).
6. Select it.
7. **Expect**: `reviewed: null` becomes `reviewed: <stamp>` in the open editor
   without reopening the file, and a success message names the item (FR-006).
8. **Expect**: on the next Problems refresh, the diagnostic and its Quick Fix
   are gone for `REQ-005` (FR-008).

**Negative check**: open `REQ-006.yml` (already reviewed). Invoke Quick Fix on
its `reviewed:` line. **Expect** no `Do Review` fix offered (acceptance
scenario 6).

**Unsaved-edits check**: open `REQ-005.yml`, edit its `text:` block, do not
save, then invoke `Do Review` via Quick Fix. **Expect** the same modal
"save and continue" warning today's CodeLens shows (acceptance scenario 4);
Cancel leaves the file unsaved and unreviewed, `Save and Continue` saves the
edit and then marks it reviewed.

---

## Scenario 2 — Clear Suspect Link, single (User Story 1, P1)

1. Open `REQ-007.yml`.
2. **Expect**: a Problem (Warning) on the link entry line for `REQ-001`, and
   **no** "Clear the Suspicion" text link above it.
3. Invoke Quick Fix on that line.
4. **Expect**: exactly `Clear Suspect Link` is offered — **not** `Clear All
   Suspect Links` (only one suspect link exists on this item; acceptance
   scenario 2 vs. 3).
5. Select it.
6. **Expect**: the same success message and cleared stamp today's `Clear the
   Suspicion` CodeLens produces.

---

## Scenario 3 — Clear All Suspect Links (User Story 1, P1)

1. Open `REQ-010.yml` (two suspect links).
2. Invoke Quick Fix on **either** suspect link's entry line.
3. **Expect**: both `Clear Suspect Link` (for that one entry) and `Clear All
   Suspect Links` are offered (acceptance scenario 3).
4. Select `Clear All Suspect Links`.
5. **Expect**: both `- REQ-001: null` and `- REQ-002: null` become stamped;
   the Doorstop tree view reflects the item as cleared after its refresh.

**Selective-clear regression check**: repeat from a fresh copy, this time
selecting `Clear Suspect Link` on only the `REQ-001` entry. **Expect** `REQ-001`
gains a stamp and `REQ-002` still reads `null` — the same distinction feature
013's quickstart proved for the CodeLens version.

---

## Scenario 4 — Derive Requirement is unaffected (edge case check)

1. Open any item with a `derived:` field (e.g. `ARCH-001.yml`).
2. **Expect**: the "+ Derive Requirement" CodeLens still appears above the
   `derived:` line, completely unchanged by this feature (FR-005).

---

## Scenario 5 — TreeView inline icons (User Story 2, P2)

1. Open the Doorstop view container and expand a document in the tree.
2. Hover a requirement item row.
3. **Expect**: only two inline icon buttons are visible — "Add Item" and
   "Link Items". No "Review" or "Clear Suspect" icon button appears on the
   row (SC-004).
4. Hover a document (root) row.
5. **Expect**: only "Add Item" remains inline; "Review" no longer appears
   inline on the root row either.
6. Right-click a requirement item row.
7. **Expect**: "Review" and "Clear Suspect" still appear in the context menu,
   in the same position and with the same behavior as before this change
   (acceptance scenario 3).

---

## Definition of done

- All five scenarios behave as described in the Extension Development Host.
- `npm run compile` passes; `python -m pytest tests` (from `server/`) passes
  unchanged (no server code touched).
- `npm test` passes, including the new assertions listed in
  [contracts/quick-fix-actions.md §5](contracts/quick-fix-actions.md#5-contract-tests-owed).
- `src/reviewLensProvider.ts` no longer emits the three retired CodeLenses;
  its `+ Derive Requirement` sibling in `src/deriveProvider.ts` is untouched.
- `package.json`'s `view/item/context` no longer lists `doorstop.review` /
  `doorstop.clear` under an `inline@*` group; their `1_requirement@*` entries
  are still present, unchanged.
