# Data Model: Treeview Auto-Reveal Toggle

One entity, already named in spec.md's Key Entities: **Auto-Reveal
Preference**. No relationships to other entities; no lifecycle beyond a
simple flip.

## Auto-Reveal Preference

| Field | Type | Constraints | Description |
|---|---|---|---|
| `autoRevealEnabled` | `boolean` | Required; no `null`/`undefined` state observable outside the read path — a missing/unreadable stored value MUST resolve to `true` (research.md Decision 4) | Whether the Explorer tree automatically reveals the active requirement |

**Storage**: `context.globalState`, key `doorstop.autoRevealEnabled`
(per-user, not per-workspace — see research.md Decision 2). Not written to
any file; not sent to the server.

**Runtime mirror**: the same boolean is mirrored into a VS Code when-clause
context key of the same name (`doorstop.autoRevealEnabled`, set via
`setContext`) purely so `package.json`'s two `view/title` menu entries can
react to it. The `globalState` value is the source of truth; the context
key is a derived, non-persisted projection of it, re-set on every toggle and
once at activation.

**State transitions**: exactly two states, `true` ⇄ `false`, flipped only by
user action (clicking `doorstop.toggleAutoReveal` or
`doorstop.enableAutoReveal`). No other code path writes this value. No
intermediate/pending state exists — the write to `globalState` and the
`setContext` mirror happen synchronously together in the same command
handler.

**Default**: `true` (auto-reveal on), both for a first-ever run (no stored
value yet) and as the fallback if reading the stored value ever fails.
