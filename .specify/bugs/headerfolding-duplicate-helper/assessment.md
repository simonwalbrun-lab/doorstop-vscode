# Bug Assessment: headerFolding.ts duplicates inDoorstopDocument

- **Slug**: headerfolding-duplicate-helper
- **Created**: 2026-11-01
- **Source**: pasted text
- **Verdict**: valid (maintenance, not a functional bug)
- **Severity**: low

## Report (verbatim or summarized)

> a duplicate helper in headerFolding.ts:15

## Symptom

`isDoorstopItem()` in `src/headerFolding.ts:15-27` repeats the upward `.doorstop.yml` search that `inDoorstopDocument()` in `src/itemFile.ts:85-94` already exports. The only addition is a `.md` extension check. Two copies of the "is this in a Doorstop document" rule can drift apart.

## Reproduction

1. Compare `src/headerFolding.ts:19-26` with `src/itemFile.ts:86-93`. The loops are the same apart from variable names.

## Suspected Code Paths

- `src/headerFolding.ts:15` (`isDoorstopItem`): the duplicate.
- `src/itemFile.ts:85` (`inDoorstopDocument`): the shared helper.

## Root Cause Hypothesis

Spec 034 (header folding) wrote its own helper instead of reusing the one in `itemFile.ts`. Confidence: high.

## Proposed Remediation

**Preferred**: Make `isDoorstopItem` return `path.extname(fsPath).toLowerCase() === '.md' && inDoorstopDocument(fsPath)`, importing `inDoorstopDocument` from `./itemFile`. Keep the existing `ponytail:` note about non-item notes. Remove the `node:fs` import if nothing else in the file uses it.

**Files likely to change**:

- `src/headerFolding.ts`

**Tests to add or update**:

- None new. The existing spec 034 header-folding tests must still pass, because behavior is identical.

## Risks & Considerations

- Check that the new import does not create a cycle (`itemFile.ts` must not import `headerFolding.ts`). This is unlikely.

## Open Questions

- None.
