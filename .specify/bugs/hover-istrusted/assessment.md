# Bug Assessment: hover renders item text as fully trusted Markdown (command links)

- **Slug**: hover-istrusted
- **Created**: 2026-11-01
- **Source**: pasted text
- **Verdict**: valid
- **Severity**: high

## Report (verbatim or summarized)

> hover isTrusted

## Symptom

Hovering a UID shows the item's `header`, `text`, and `ref` inside a `MarkdownString` that has `isTrusted = true`. Trusted Markdown runs every `command:` link. Any item in a cloned repository can therefore embed a link such as `[details](command:workbench.action.terminal.sendSequence?<encoded args>)` that runs an arbitrary VS Code command when the user clicks it in the hover. Expected behavior: only the extension's own `vscode.open` links are clickable.

## Reproduction

1. In a Doorstop item, set `text:` to a Markdown link targeting `command:workbench.action.terminal.sendSequence?<encoded JSON args>`.
2. Hover a reference to that item's UID in another item.
3. Click the link in the hover. The command runs.

## Suspected Code Paths

- `src/hoverProvider.ts:42` (`renderReverseLinks`) and `src/hoverProvider.ts:62` (`renderItemPreview`) set `markdown.isTrusted = true`.
- `src/hoverProvider.ts:63-77` append `item.header`, `item.text`, and `item.ref` raw. This content comes from repository files through `GET /tree`.
- `src/hoverProvider.ts:26-33` (`makeClickableLink`) builds the only command link the extension needs, `command:vscode.open`.

## Root Cause Hypothesis

`isTrusted = true` was set to make the extension's own `vscode.open` links clickable. It also trusts untrusted item content. Confidence: high.

## Proposed Remediation

**Preferred**: Replace both assignments with `markdown.isTrusted = { enabledCommands: ['vscode.open'] };`. The generated UID links keep working, and every other command link becomes inert. This needs VS Code ≥ 1.73. Check `engines.vscode` in `package.json`.

**Alternatives**:

- Insert item text with `appendText` instead of `appendMarkdown`. This also closes the hole, but the Markdown formatting in requirement text no longer renders.

**Files likely to change**:

- `src/hoverProvider.ts`
- a hover test under `src/test/`

**Tests to add or update**:

- Hover over an item whose text contains a `command:workbench…` link. Assert that `isTrusted` is `{ enabledCommands: ['vscode.open'] }`, not `true`.

## Risks & Considerations

- `vscode.open` can still open any URI an attacker builds into a `command:vscode.open?…` link, including external `http` URLs. That matches what a plain Markdown link already allows.
- `src/completionProvider.ts:109` builds a `MarkdownString` without `isTrusted`, so it is fine. Webviews are out of scope here.

## Open Questions

- None.
