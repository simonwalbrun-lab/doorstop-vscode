# Research: Treeview Auto-Reveal Toggle

No `[NEEDS CLARIFICATION]` markers exist in the Technical Context. This
document records the decisions made from reading the existing code
(`src/extension.ts`, `package.json`) and VS Code's extension API, and the
alternatives rejected.

## Decision 1: Gate exactly two existing call sites, not three

**Decision**: Add the on/off check at the top of two functions in
`src/extension.ts`: `syncActiveRequirement` and the `doorstop.activateRequirement`
command handler. Both already call `treeView.reveal(...)` with near-identical
logic (including a retry-after-refresh fallback).

**Rationale**: Tracing the three triggers named in spec.md's Edge Cases:
- Active editor changes → `vscode.window.onDidChangeActiveTextEditor` →
  `syncActiveRequirement`.
- Hover-popup link clicked → the hover provider opens the target via a
  `command:vscode.open` markdown URI, which itself changes the active editor
  → also routes through `syncActiveRequirement`, not a separate path.
- Diagram node clicked (or "Add Linked Item..." created) →
  `diagrammPanel.ts` explicitly calls
  `vscode.commands.executeCommand('doorstop.activateRequirement', ...)`.

So all three user-facing triggers already collapse into exactly two code
locations. Gating those two covers all three without a third gate anywhere.

**Alternatives considered**:
- **Gate `vscode.window.onDidChangeActiveTextEditor` and
  `doorstop.activateRequirement` at the listener/command-registration level
  (skip calling the handler at all when off)** — considered equivalent to
  gating inside the functions; kept the gate inside instead so the console
  logging already in both functions (`[Doorstop][...]`) still reports what
  happened for debugging, rather than going silent.
- **Add a third, separate gate for "hover-triggered" reveals specifically**
  — rejected: there is no such separate code path to gate; it would be
  gating something that doesn't exist.

## Decision 2: Persist via `context.globalState`, mirror into a `setContext` key

**Decision**: Store the preference as a single boolean in
`context.globalState` under key `doorstop.autoRevealEnabled` (default
`true` when unset). On activation and on every toggle, mirror that value
into a VS Code "when-clause context" key of the same name via
`vscode.commands.executeCommand('setContext', 'doorstop.autoRevealEnabled', value)`,
so `package.json`'s `view/title` menu `when` clauses can react to it
immediately.

**Rationale**: This is the standard, dependency-free VS Code idiom for a
persisted boolean preference with a reactive title-bar toggle (the same
pattern VS Code's own built-in toggles use) — no new package, no
configuration schema needed (spec.md frames this as a personal habit, not
project config, so a `contributes.configuration` setting would be a heavier,
more "official" mechanism than this calls for). `globalState` is per-user
(not per-workspace), matching spec.md's Assumption that this isn't project
configuration.

**Alternatives considered**:
- **`context.workspaceState`** — rejected per spec.md's explicit assumption
  that this is a personal habit, not workspace configuration; a user
  working across multiple Doorstop workspaces would otherwise have to
  re-disable it in each one.
- **A `contributes.configuration` settings-schema entry** (`doorstop.autoReveal`
  in Settings UI) — considered, and not wrong, but heavier than needed for a
  single boolean whose primary interface is explicitly the title-bar button
  per spec.md FR-001; nothing in the spec asks for it to also be reachable
  via the Settings UI. Left as a natural, low-risk future addition rather
  than in scope now (Constitution Development Workflow: prefer the smallest
  change that satisfies the requirements).

## Decision 3: Two commands with complementary `when` clauses, not one command with a stateful icon

**Decision**: Register two commands — `doorstop.toggleAutoReveal` (shown
when the preference is on; icon `$(sync)`) and `doorstop.enableAutoReveal`
(shown when it's off; icon `$(sync-ignored)`) — as two `view/title` menu
entries with opposite `when` clauses
(`view == doorstop.treeView && doorstop.autoRevealEnabled` /
`view == doorstop.treeView && !doorstop.autoRevealEnabled`). Both commands
flip the same underlying preference; only one is ever visible at a time.

**Rationale**: VS Code's `contributes.menus` API has no native "toggle
button with two icon states" primitive for view-title items — the
two-commands-with-opposite-`when` pattern is the standard workaround (used
by VS Code's own built-in toggle buttons elsewhere in the product) and
satisfies FR-005 (visual on/off indication) without any custom webview or
UI.

**Alternatives considered**:
- **One command, and update its icon at runtime** — not supported by the
  `contributes.menus` static-icon model; `package.json`-declared menu items
  don't support runtime icon swapping outside the two-commands idiom.
- **A `QuickPick`/status-bar item instead of a title-bar button** — rejected:
  spec.md FR-001 explicitly asks for a title-bar toggle button, matching the
  existing Refresh/Open Diagram/New Diagram controls already there.

## Decision 4: Fail-safe default is "on", read once at activation

**Decision**: If `globalState.get('doorstop.autoRevealEnabled')` is
`undefined` (first run) or reading it ever throws, treat the preference as
`true` (auto-reveal on) — never `false`. Read once during `activate()` and
keep it in a local variable updated on toggle, rather than re-reading
`globalState` on every reveal call.

**Rationale**: Constitution Principle III requires an explicit, safe
fallback; "silently disable an existing, working behavior" is the wrong
failure mode for a `Memento` read that in practice never fails — matches
spec.md's Key Entities note that the preference "defaults to on (matching
today's existing behavior, so nothing changes for users who never touch the
new toggle)." Reading once and caching in memory avoids a synchronous
`Memento.get` call inside two hot paths that also do async tree-reveal work.
