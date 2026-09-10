# Quickstart: Validate Go to Definition & Usage Navigation

Manual end-to-end validation for the feature described in `plan.md` /
`research.md`. No automated test is required to follow this guide, though
one is recommended (see `plan.md` Testing / `research.md` Decision 3's
sibling recommendation in spec 008's plan for the same harness).

## Prerequisites

- The extension built and running in an Extension Development Host
  (`F5` / `npm run compile` then launch), against a workspace with a
  Doorstop project containing at least two linked requirements — e.g. a
  parent `REQ-001` and a child `REQ-002` with `links: [REQ-001]`.
- The Doorstop server running (per spec 001) — `GET /tree` must be reachable
  for any of these scenarios to resolve.

## Scenario 1 — Jump to a dependency via F12 (US1)

1. Open `REQ-002`'s file. Place the cursor on `REQ-001` under its `links:`
   entry.
2. Press **F12** (or right-click → "Go to Definition").

**Expected**: `REQ-001`'s file opens directly — no hover popup, no
intermediate click — with the cursor landing on `REQ-001`'s header line
(its `header:` field for a `.yml` item, or its first `#` heading for a
`.md` item), not the top of the file.

## Scenario 2 — F12 on `derived:` shows every usage (US2)

1. Open `REQ-001`'s file (the one `REQ-002` links to). Place the cursor on
   the `derived:` field key line.
2. Press **F12** (or **Shift+F12** for "Find All References").

**Expected**: an in-editor Peek/Locations view opens listing `REQ-002` (and
any other item linking to `REQ-001`), each with the correct file and the
line containing the link. Selecting an entry opens that file at that line.

## Scenario 3 — No usages reports cleanly (FR-004)

1. Open a requirement's file that nothing else links to. Place the cursor on
   its `derived:` line.
2. Press **F12** / **Shift+F12**.

**Expected**: no error dialog; VS Code reports no results (empty
Peek/Locations view or a "no definition found" status message).

## Scenario 4 — Go Back returns you to where you jumped from (US3)

1. Repeat Scenario 1 to jump from `REQ-002`'s `links:` entry to `REQ-001`.
2. Trigger **Go Back** (Alt+Left, or the editor back-navigation arrow).

**Expected**: `REQ-002`'s file re-opens with the cursor back at the
`REQ-001` link entry (not at `REQ-001`'s header, which is where Scenario 1
left the cursor before "Go Back" was triggered).

## Scenario 5 — Unrecognized token is a no-op (US1 edge case)

1. Open any requirement file. Place the cursor on plain prose text that is
   not a UID-shaped token.
2. Press **F12**.

**Expected**: standard editor behavior — no requirement-specific navigation,
no error.

## Out of scope for this quickstart

- Re-verifying hover preview behavior (spec 006) — unchanged by this
  feature, `hoverProvider.ts` is untouched.
- Any server-side behavior — this feature adds no server endpoint and makes
  no server changes; `GET /tree` is used exactly as `DoorstopTreeProvider`
  already uses it.
