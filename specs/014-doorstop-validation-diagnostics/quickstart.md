# Quickstart: Validating Doorstop Validation Problems In-Item

How to prove this feature works end to end. Scenarios map to the spec's user
stories and success criteria; each states its expected outcome so a reviewer can
check it without reading the implementation.

## Prerequisites

- Python with `doorstop` 3.2 and this repo's `server/` package installed
  (`pip install -e .[dev]` from `server/`), selected as the workspace's active
  Python interpreter.
- `npm install` at the repo root.
- `testdata/regression` open as the workspace folder for the editor scenarios.
- `git status` clean under `testdata/regression/` before starting — scenario 1
  exists precisely to prove nothing there changes.

## Gates

```bash
npm run check-types && npm run lint      # Constitution Principle V
cd server && python -m pytest tests      # includes tests/test_validation.py
```

---

## Scenario 1 — Validation never writes (FR-017, the research.md §1 regression)

The highest-value check in this feature. Run it first and after any change to the
server's validation path.

```bash
cd server && python -m pytest tests/test_validation.py -k "no_write" -v
```

**Expected**: passes. The test hashes every item file in a real temporary project
containing an unreviewed item and an unstamped link, calls `GET /validate`, and
re-hashes.

To see what this guards against, temporarily remove the read-only settings scope
from `validation_rules.py` and re-run: the test must **fail**, reporting modified
files. Restore the scope afterwards. Without the scope, Doorstop stamps
`reviewed:` and link entries during validation and the `suspect link` warning
disappears entirely.

Manual equivalent against the live fixture:

```bash
git status --short testdata/regression/    # before — expect no output
# start the extension, let problems populate, then:
git status --short testdata/regression/    # after — expect no output
```

---

## Scenario 2 — The three problems already present in the fixture (US1, US2, US4)

`testdata/regression` contains one instance of each severity class with no setup.
Open the workspace, wait for the server to report ready, then open the Problems
panel.

| Fixture element | Expected problem | Anchored at |
|---|---|---|
| `REQ-009.yml` | **Error** `linked to unknown item: REQ-999` | the `- REQ-999` link entry line |
| `REQ-007.yml` | **Warning** `suspect link: REQ-001` | the `- REQ-001` link entry line |
| `children/EMPTY/.doorstop.yml` | **Warning** `no items` | line 1 of the document config file |

**Expected**: all three visible without any action beyond opening the workspace
(SC-002); the error red, the warnings yellow (FR-003); clicking a Problems entry
jumps to the exact field line (SC-006).

Note the fixture also produces `no links from child document: EMPTY` on most `REQ`
items — genuine Doorstop output caused by the empty child document, not a defect
(research.md §2d).

---

## Scenario 3 — One link's problem does not smear onto its siblings (SC-003)

In `testdata/regression`, add a second, valid link to `REQ-009` so it has one
broken and one working link, then re-check.

**Expected**: the error sits on the `REQ-999` entry line only; the valid entry
carries no diagnostic. Revert the fixture afterwards.

---

## Scenario 4 — One problem, several items (FR-005, SC-004)

Give two items in one document the same level — e.g. set `REQ-002.yml`'s `level:`
to `1.0`, matching `REQ-001`.

**Expected**: `duplicate level: 1.0 (REQ-001, REQ-002)` appears **twice** — once on
each item's `level:` line — with identical message and severity. Revert
afterwards.

---

## Scenario 5 — Content warnings and both item formats (US3)

Against a scratch Doorstop project (not the fixture), covering the format split in
FR-007:

| Setup | Expected |
|---|---|
| A `.yml` item with empty `text` | **Warning** `no text` on the `text:` line |
| A markdown-format item with empty body | **Warning** `no text` on the **last line** of the `.md` file |
| An item edited after review | **Warning** `unreviewed changes` on the `reviewed:` line |
| An item whose `ref:` names a missing file | **Error** `external reference not found: …` on the `ref:` line |

---

## Scenario 6 — Problems stay current (US5, SC-005)

1. With scenario 2's error visible, fix `REQ-009`'s link to point at `REQ-001` and
   save. **Expected**: the error disappears within 3 seconds, no restart.
2. Break it again and save. **Expected**: the error returns.
3. Run **Doorstop: Re-check Problems** from the Command Palette. **Expected**: a
   full refresh with no change to a correct list (FR-013).
4. Mark a requirement reviewed through the extension. **Expected**: its
   `unreviewed changes` warning clears without a manual re-check.

Revert the fixture afterwards.

---

## Scenario 7 — Failure is explicit, not silent (FR-014, SC-008)

With problems on screen, stop the server (or run **Doorstop: Restart Server** and
interrupt it) and trigger a re-check.

**Expected**: the problem list **empties** and a message names the failure. Stale
problems must not remain — an out-of-date list presented as current is the
specific failure this rejects.

---

## Scenario 8 — Nothing is discarded (SC-007, FR-011)

```bash
cd server && python -m pytest tests/test_validation.py -k "unknown_check or nothing_dropped" -v
```

**Expected**: passes. An unrecognised message is returned as `check: "unknown"`
with `field: null` and Doorstop's own severity, rather than being filtered out;
the extension anchors it to the item's first line.

---

## Checks this feature does **not** report

Three checks named in the spec do not exist in Doorstop 3.2 and are deliberately
not implemented (research.md §2c, plan.md Complexity Tracking). Do not raise these
as defects:

- an item linked to itself
- a cycle of item links
- an item's **child** link being an inactive item (an inactive **parent** link
  *is* reported, as `linked to unknown item` at error severity)
