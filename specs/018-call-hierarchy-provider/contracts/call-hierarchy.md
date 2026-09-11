# Contract: Call Hierarchy Command & Provider

**Feature**: `018-call-hierarchy-provider` | **Date**: 2026-09-11

This feature exposes no HTTP endpoint and no webview message. Its interfaces
are (1) a VS Code command contributed to the tree view and (2) a language
feature provider whose observable behaviour is defined by the VS Code
`CallHierarchyProvider` API. Both are what the automated tests assert
against (`research.md` §9).

## 1. Command `doorstop.showCallHierarchy`

**Manifest** (`package.json`):

```jsonc
// contributes.commands
{ "command": "doorstop.showCallHierarchy", "title": "Doorstop: Show Call Hierarchy", "icon": "$(type-hierarchy)" }

// contributes.menus["view/item/context"]
{ "command": "doorstop.showCallHierarchy",
  "when": "view == doorstop.treeView && viewItem == doorstop.item",
  "group": "inline@3" }
```

Invariants the `packageMenus` test asserts:

- exactly one `inline*` entry for the command;
- its `when` contains `viewItem == doorstop.item` and does **not** admit
  `doorstop.root` (FR-001, US1 scenario 5);
- `doorstop.add` and `doorstop.link` keep their inline entries (feature 017
  FR-011 still holds).

**Argument**: the `RequirementTreeItem` VS Code passes for the clicked row.
The handler reads `item.itemData.uid` and `item.resourceUri` — the same
contract `doorstop.link` / `doorstop.review` already use. Invoked with no
argument (e.g. from the Command Palette) it falls back to the active
editor's document via `getDocumentUid`; if that is not a requirement it
shows an information message and returns.

**Behaviour** (in order; every step's failure ends the command):

| Step | Action | On failure |
| --- | --- | --- |
| 1 | `loadDoorstopIndex(server)` | `showWarningMessage("Doorstop: call hierarchy is unavailable because the Doorstop server could not be reached.")` → return |
| 2 | `showTextDocument(resourceUri, { selection: headerLine })` | `showErrorMessage("Doorstop: cannot open <path>: <reason>")` → return |
| 3 | `executeCommand('editor.showCallHierarchy')` | logged; return |
| 4 | `executeCommand('editor.showOutgoingCalls')` | no-op if already outgoing (VS Code precondition); logged otherwise |

**Post-condition observable by tests**: `vscode.window.activeTextEditor`
shows `resourceUri` with the selection on the header line.

## 2. Provider registration

```ts
vscode.languages.registerCallHierarchyProvider(
  [{ language: 'yaml' }, { language: 'markdown' }],
  provider
)
```

Registered from `src/extension.ts` inside the existing `if (workspaceFolder)`
block, alongside `registerDefinitionProvider`.

## 3. Provider behaviour (as observable through VS Code's built-in test commands)

| Command | Input | Output |
| --- | --- | --- |
| `vscode.prepareCallHierarchy` | `(uri, position)` | `[item]` where `item.name`/`item.detail` follow `data-model.md`; `[]`/`undefined` when the file is not a known requirement and the word at `position` is not a known UID |
| `vscode.provideOutgoingCalls` | a prepared `item` | one `CallHierarchyOutgoingCall` per entry in that item's `links` (resolved or unresolved), in `links` order; `[]` when none |
| `vscode.provideIncomingCalls` | a prepared `item` | one `CallHierarchyIncomingCall` per item that links to it, in index order; `[]` when none |

Fixture-backed expectations (`testdata/regression`, guaranteed by spec 012
`contracts/fixture-layout.md`):

| Call | Expected |
| --- | --- |
| prepare `REQ-004.yml` @ header line | `name = "REQ-004: Heading Display Coverage"`, `detail = "REQ"` |
| prepare `REQ-001.yml` @ header line | `name = "REQ-001"`, `detail = "REQ"` |
| incoming of `REQ-001` | `from.name` set = every fixture item whose `links` name `REQ-001` (currently `ARCH-001`, `MD-001`, `REQ-007`, `REQ-008`, `REQ-010` — the test derives the set from `GET /tree`); details `ARCH`, `MD`, `REQ` |
| outgoing of `ARCH-001` | `[ to.name = "REQ-001", to.detail = "REQ" ]` |
| outgoing of `REQ-009` | `[ to.name = "REQ-999", to.detail = "unresolved" ]`; outgoing **of that entry** = `[]` |
| prepare `REQ-009.yml` @ the `REQ-999` token | `name = "REQ-009"` — the token is not a known UID, so research §4 rule 2 roots on the file's own item rather than returning nothing |

## 4. Error contract

- Provider methods never reject. Index failure → `undefined` from prepare
  (with one warning message), `[]` from expansion (logged only).
- No modal dialogs. Warnings/errors are non-blocking notifications.
