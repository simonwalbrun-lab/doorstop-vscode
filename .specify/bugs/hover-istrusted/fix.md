# Bug Fix: hover renders item text as fully trusted Markdown (command links)

- **Slug**: hover-istrusted
- **Fixed**: 2026-11-01
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Both hover `MarkdownString`s now set `isTrusted = { enabledCommands: ['vscode.open'] }` instead of `true`. The extension's own UID links still work. Any other `command:` link in an item's header, text or ref is now inert. This is the assessment's Preferred remediation. `engines.vscode` is `^1.97.0`, which is newer than the 1.73 the API needs.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/hoverProvider.ts` | modified | New `HOVER_TRUST` constant used in both places. `renderReverseLinks` and `renderItemPreview` are now exported so tests can call them. |
| `src/test/extension.test.ts` | added test | New suite "Hover trust (bug hover-istrusted)" in the existing `unit` config. |

## Diff Highlights

```ts
// Item text comes from the repository: only our own vscode.open links may run.
const HOVER_TRUST = { enabledCommands: ['vscode.open'] };
...
markdown.isTrusted = HOVER_TRUST;
```

## Tests Added or Updated

- `src/test/extension.test.ts` › "item preview only enables vscode.open, so command links in item text stay inert": builds a `DoorstopIndex` whose header, text and ref hold a `command:workbench.action.terminal.sendSequence` link. It checks that the hover still contains that link and the generated `vscode.open` link, and that `isTrusted` deep-equals `{ enabledCommands: ['vscode.open'] }`.
- "reverse-link hover only enables vscode.open": the same `isTrusted` check for the `derived:` hover.

## Local Verification

- `npm run compile` (tsc, eslint, esbuild) → pass
- `npx vscode-test --label unit` → 28 passing, including the 2 new tests
- `npx vscode-test --label regressionFixture` → 85 passing, including the existing hover tests

## Deviations from Assessment

- The test is a new suite in `extension.test.ts`, not a new file. A new file would also need a new entry in `.vscode-test.mjs`.

## Follow-ups

- None.
