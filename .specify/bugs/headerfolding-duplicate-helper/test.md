# Bug Verification: headerFolding.ts duplicates inDoorstopDocument

- **Slug**: headerfolding-duplicate-helper
- **Tested**: 2026-11-04
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

`isDoorstopItem` now delegates to `inDoorstopDocument`; the duplicate loop and `node:fs` import are gone. The old loop and the helper are line-for-line equivalent, and all builds and tests pass.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Source inspection | read `src/headerFolding.ts` | pass | `isDoorstopItem` = `path.extname(fsPath).toLowerCase() === '.md' && inDoorstopDocument(fsPath)`; imported from `./itemFile`; no `node:fs` import |
| Duplicate-loop grep | grep `doorstop.yml` / `dirname` in `src/` | pass | only remaining `existsSync(.doorstop.yml)` loop is `inDoorstopDocument` in `src/itemFile.ts`; other `dirname` users are unrelated |
| Import cycle | `src/itemFile.ts` imports | pass | only `node:fs`, `node:path` |
| Behaviour equivalence | `git show 1ed8ee7~:src/headerFolding.ts` vs `inDoorstopDocument` | pass | see below |
| Build / types / lint | `npm run compile` | pass | exit 0 |
| Test compile | `npm run compile-tests` | pass | exit 0 |
| Spec 034 | `npx vscode-test --label headerFolding` | pass | 8 passing, 0 failing |
| Unit | `npx vscode-test --label unit` | pass | 28 passing, 0 failing |

## Equivalence (old loop vs `inDoorstopDocument`)

- Old: `.md` extension check (lowercased) returning false otherwise. New: same check kept in `isDoorstopItem`, short-circuiting before the helper.
- Old: `for (dir = path.dirname(fsPath); ; dir = path.dirname(dir))`. Helper: identical, variable named `folder`.
- Old: `fs.existsSync(path.join(dir, '.doorstop.yml'))` then return true. Helper: identical.
- Old: `if (path.dirname(dir) === dir) return false`. Helper: identical.

## Output Excerpts

- `8 passing (4s)` (headerFolding), `28 passing (929ms)` (unit)
- `git status testdata` clean after runs.

## Residual Risks

- No new test pins the equivalence; relies on spec 034 tests (they cover in-document and outside-document markdown).
- `src/callHierarchyProvider.ts` has an unrelated uncommitted change in the working tree; it did not affect results.

## Recommendation

Close the bug; verified. The fix was committed in 1ed8ee7.
