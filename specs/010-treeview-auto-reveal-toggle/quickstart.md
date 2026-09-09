# Quickstart: Validate Treeview Auto-Reveal Toggle

Manual end-to-end validation for the feature described in `plan.md` /
`contracts/commands.md`. Covers spec.md's four user stories in order.

## Prerequisites

- Extension built and running in an Extension Development Host
  (`npm run compile` then `F5`), against a workspace with at least two
  Doorstop documents/items, and at least one item with an incoming link (so
  a hover-popup "derived" reverse-link exists) and one diagram containing a
  node.
- Doorstop server running (per spec 001) — needed for the tree/hover/diagram
  features generally, unrelated to this feature's own logic.

## Scenario 1 — Default behavior is unchanged (US1/US2 baseline)

1. On first run (no prior toggle use), open a requirement file directly (not
   via the tree).

**Expected**: the Explorer tree reveals and selects that item — identical to
today's behavior before this feature existed. The title bar shows the "on"
icon (`$(sync)`, "Doorstop: Disable Auto-Reveal").

## Scenario 2 — Turning it off stops all three triggers (US1)

1. Click the toggle button in the Explorer tree's title bar.

**Expected**: the icon changes to `$(sync-ignored)` ("Doorstop: Enable
Auto-Reveal").

2. Open a different requirement file directly in the editor (e.g. via the
   file explorer or Quick Open).
3. Hover over a requirement UID link in a file and click the link inside the
   hover popup.
4. Open a diagram containing a node and single-click that node.

**Expected** after each of steps 2-4: the Explorer tree's selection and
scroll position do not change.

5. Manually click a tree item in the Explorer.

**Expected**: its file still opens (FR-004 — manual tree interaction is
unaffected by the toggle).

## Scenario 3 — Turning it back on restores behavior (US2)

1. Click the toggle button again (now showing `$(sync-ignored)`).

**Expected**: the icon changes back to `$(sync)`.

2. Open a different requirement file directly.

**Expected**: the Explorer tree reveals and selects it again, exactly like
Scenario 1.

## Scenario 4 — Visual state is unambiguous (US3)

1. Toggle on and off a few times, glancing at the title bar each time
   without hovering for a tooltip.

**Expected**: the icon alone (not its tooltip) makes the current state
obvious — `$(sync)` = on, `$(sync-ignored)` = off.

## Scenario 5 — Preference persists (US4)

1. Turn the toggle off.
2. Run **Developer: Reload Window**.
3. Reopen the workspace / wait for activation to complete, then open a
   requirement file directly.

**Expected**: the tree does NOT reveal it (still off), and the title bar
still shows `$(sync-ignored)` — the preference survived the reload.

## Scenario 6 — Toggling works before the tree has finished loading (FR-007)

1. Immediately after a window reload, before the Explorer tree has finished
   populating (or with the Doorstop server briefly stopped), click the
   toggle button.

**Expected**: the icon changes and the underlying preference updates
immediately, with no error, regardless of server/tree readiness — this is
local UI state only.

## Out of scope for this quickstart

- Re-verifying the reveal behavior's own correctness (which requirement
  gets revealed, retry-on-failure, etc.) — that's already covered by specs
  002 and 006's own acceptance scenarios and is unchanged by this feature.
