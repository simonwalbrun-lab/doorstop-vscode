# Contract: New Commands, Context Key, and Persisted State

This feature adds two user-facing commands and one internal state key. This
is the interface surface other code, docs, or a future feature could rely on.

## Commands

### `doorstop.toggleAutoReveal`

- **Title**: "Doorstop: Disable Auto-Reveal"
- **Icon**: `$(sync)`
- **Shown when**: `view == doorstop.treeView && doorstop.autoRevealEnabled`
- **Menu**: `view/title`, group `navigation` (alongside `doorstop.createDoc`,
  `doorstop.refresh`, `doorstop.showDiagram`, `doorstop.newDiagram`)
- **Behavior**: sets the `autoRevealEnabled` preference (see State below) to
  `false`.

### `doorstop.enableAutoReveal`

- **Title**: "Doorstop: Enable Auto-Reveal"
- **Icon**: `$(sync-ignored)`
- **Shown when**: `view == doorstop.treeView && !doorstop.autoRevealEnabled`
- **Menu**: `view/title`, group `navigation`
- **Behavior**: sets the `autoRevealEnabled` preference to `true`.

Exactly one of these two is visible at any time — VS Code's `when`-clause
menu filtering handles that; the extension never has to show/hide anything
itself beyond keeping the context key in sync (see below).

## Context key

`doorstop.autoRevealEnabled` (boolean) — set via
`vscode.commands.executeCommand('setContext', 'doorstop.autoRevealEnabled', value)`.
Written once at activation (mirroring the stored preference) and again on
every toggle command. Consumed only by the two `when` clauses above; not
read back by any extension code (the in-memory cached boolean, not the
context key, is what the gated reveal logic checks — see plan.md Technical
Context and research.md Decision 4).

## Persisted state

`context.globalState` key `doorstop.autoRevealEnabled` (boolean, default
`true`). See `data-model.md` for the full field description. This is the
only thing either toggle command writes; everything else (the context key,
the in-memory cache used by the gated reveal functions) is derived from it.

## Non-goals

- No `contributes.configuration` Settings UI entry is added by this
  contract (see research.md Decision 2) — the title-bar button is the only
  supported entry point for now.
- No change to the existing `doorstop.activateRequirement` command's
  signature or the `syncActiveRequirement` function's signature — both keep
  taking the same arguments; only their internal behavior gains a leading
  guard check.
