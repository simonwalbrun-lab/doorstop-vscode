# Bug Fix: drag-and-drop of a path containing "%" fails silently in the diagram

- **Slug**: diagram-dnd-percent-silent
- **Fixed**: 2026-11-01
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

A dropped plain path with a literal `%` (e.g. `C:\x\reqs 100%\REQ-001.md`) made `decodeURIComponent` throw `URIError` before the method's error handling, so the drop did nothing. The decode now falls back to the raw text, and the path resolves by basename as intended (preferred remediation).

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/diagrammPanel.ts` | modified | Dropped-text-to-UID parsing extracted into the exported pure function `droppedTextToUid`. `decodeURIComponent` is wrapped in an inline try/catch that keeps the raw text. `handleDroppedData` calls the function; the rest of its behavior is unchanged. |
| `src/test/diagramLayout.test.ts` | added test | New suite "Dropped text to UID (bug diagram-dnd-percent-silent)". |

## Diff Highlights

```ts
try { localPath = decodeURIComponent(cleanText); } catch { /* keep the raw text */ }
```

## Tests Added or Updated

- `src/test/diagramLayout.test.ts` › "a plain path with a literal "%" resolves by basename instead of throwing": `C:\x\reqs 100%\REQ-001.md` → `REQ-001`.
- `src/test/diagramLayout.test.ts` › "a normal path, a file: URI and a bare UID still resolve": a normal Windows path, a percent-encoded `file:` URI, and a bare UID with a trailing line.

## Local Verification

- `npm run compile` → OK (type check, lint and esbuild)
- `npm run compile-tests` → OK
- `npx vscode-test --label diagramLayout` → 24 passing, 0 failing
- `npx vscode-test --label unit` → 28 passing, 0 failing
- `testdata/` was unchanged after the runs.

## Deviations from Assessment

- The UID parsing was extracted into an exported pure function (`droppedTextToUid`) so it can be unit-tested. The assessment allowed this ("or extract the UID parsing into a small exported function"). The test checks the parsed UID. It does not drive the `resolveDroppedItem` → `addNode` message path.

## Follow-ups

- `resolveDroppedItem` (L170-173) still awaits `handleDroppedData` with no catch, so any other unexpected throw would still be silent. This is out of scope here.
