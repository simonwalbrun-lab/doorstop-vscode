# Contract: View scopes, commands, menus

## Identity

| Scope | URI path | Tab title | Line 1 |
|---|---|---|---|
| document | `/SYS (document)` | `SYS (document)` | `<!-- doorstop document SYS · keep this line -->` |
| section | `/SYS-0012 (section)` | `SYS-0012 (section)` | `<!-- doorstop document SYS-0012 section · keep this line -->` |
| filter | `/Filter 2 (filter)` | `Filter 2 (filter)` | `<!-- doorstop document Filter 2 · keep this line -->` |

Scheme stays `doorstop-document`. Same URI ⇒ same view ⇒ existing tab revealed
(FR-005). Everything else in the text (separators, headings, placeholders,
save plan) is exactly as in `specs/019-document-view/contracts/document-view-format.md`.

## Commands

| Command | Where | Behaviour |
|---|---|---|
| `doorstop.openSectionAsDocument` | tree item that has children: inline `$(book)` @2 and context menu | Opens `sec:<uid>`; arg is the `RequirementTreeItem`; other args → info message |
| `doorstop.openFilterAsDocument` | internal (renderer message), hidden from the palette | Opens `flt:<n>` from `uids` |
| `doorstop.openAsDocument` / `doorstop.openDocumentView` | unchanged | document scope |

Menu `when`: `view == doorstop.treeView && viewItem == doorstop.item.parent`.
Tree items with children get `contextValue = 'doorstop.item.parent'`, others
keep `doorstop.item`; existing `when` clauses on `viewItem == doorstop.item`
are rewritten to `viewItem =~ /^doorstop[.]item/` so no other menu is lost
(guarded by `packageMenus.test.ts`).

## Renderer → extension message

```json
{ "type": "openDocument", "uids": ["SYS-0001", "SYS-0004"] }
```

Sent by the "Open as document" button on a non-empty result (FR-009). The
existing `{ "type": "open", "path": … }` message is unchanged.

## Errors / messages (all via `prompts.reportError` / info)

| Situation | Message |
|---|---|
| Section root no longer exists | `Doorstop: cannot open <UID> as section: item no longer exists` |
| Filter UID list empty, or none exist any more | `Doorstop: the filter result is empty - nothing to open` (FR-011) |
| Server unavailable | `Doorstop: cannot open <label>: <server error>` (as in 019) |

There is no "already open elsewhere" error: views may overlap (spec
clarification 2026-10-11).

## Multi-view reconciliation

A successful save regenerates every other open view that contains a saved UID;
a dirty one is left alone and shows the 019 "changed on disk" prompt via its
watcher.
