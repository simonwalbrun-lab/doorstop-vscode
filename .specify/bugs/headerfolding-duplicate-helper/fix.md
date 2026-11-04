# Bug Fix: headerFolding.ts duplicates inDoorstopDocument

- **Slug**: headerfolding-duplicate-helper
- **Fixed**: 2026-11-01
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

`isDoorstopItem` in `src/headerFolding.ts` now reuses `inDoorstopDocument` from `src/itemFile.ts` instead of its own copy of the upward `.doorstop.yml` search. Behavior is unchanged.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/headerFolding.ts` | modified | `isDoorstopItem` is one line: `.md` check `&& inDoorstopDocument(fsPath)`; `node:fs` import dropped; `ponytail:` note kept |

## Diff Highlights (optional)

```ts
function isDoorstopItem(fsPath: string): boolean {
  return path.extname(fsPath).toLowerCase() === '.md' && inDoorstopDocument(fsPath);
}
```

## Tests Added or Updated

- None. The assessment asked for none, since behavior is the same. The existing spec 034 tests (`src/test/headerFolding.test.ts`) cover it.

## Local Verification

- Commands run: `npm run compile` → ok (type check, lint, build); `npm run compile-tests` → ok
- `npx vscode-test --label headerFolding` → 8 passing, 0 failing
- `npx vscode-test --label unit` → 28 passing, 0 failing
- Import cycle: `src/itemFile.ts` imports only `node:fs` and `node:path`, so there is no cycle.
- `testdata/` unchanged after the test runs.

## Deviations from Assessment

None.

## Follow-ups

- None.
