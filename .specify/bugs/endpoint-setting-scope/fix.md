# Bug Fix: object-storage endpoint can be set by the workspace and receives the user's global credentials

- **Slug**: endpoint-setting-scope
- **Fixed**: 2026-11-01
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

`doorstop.attachments.objectStorage.endpoint` and `.region` are now `"scope": "machine"`, so VS Code reads them only from User/Remote settings and ignores workspace and folder values. A cloned repository can no longer send uploads signed with the user's credentials to a server of its choosing. The other attachment settings stay `resource`.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `package.json` | modified | `endpoint` and `region` scope `resource` -> `machine`; descriptions say they are User (or Remote) settings |
| `src/attachments.ts` | modified | "endpoint missing" error now reads `set doorstop.attachments.objectStorage.endpoint in User settings first` |
| `README.md` | modified | Object storage bullet and settings table say endpoint/region are User settings, workspace values ignored |
| `CHANGELOG.md` | modified | Unreleased > Changed: **Breaking** entry for workspace-level endpoint/region |
| `src/test/attachments.test.ts` | added tests | manifest scope check; missing-endpoint message |

## Diff Highlights

```ts
throw new Error(`set doorstop.attachments.objectStorage.${missing}${missing === 'endpoint' ? ' in User settings' : ''} first`);
```

`src/attachments.ts` still reads both values via `vscode.workspace.getConfiguration('doorstop.attachments', request.uri)`. A resource-scoped `getConfiguration` returns machine-scoped values from User/Remote settings; VS Code drops workspace/folder values for machine-scoped settings. No reader change was needed.

## Tests Added or Updated

- `src/test/attachments.test.ts` › "endpoint and region are machine-scoped; the other attachment settings stay resource": checks the scope of every `doorstop.attachments.*` setting in `package.json`.
- `src/test/attachments.test.ts` › "a missing endpoint points the user to User settings": the upload error names User settings.

## Local Verification

- `npm run compile` -> exit 0 (tsc, eslint, esbuild)
- `npm run compile-tests` -> exit 0
- `npx vscode-test --label attachments` -> 21 passing, 0 failing
- `npx vscode-test --label unit` -> 28 passing, 0 failing
- `testdata/` status unchanged; no `doorstop_server` processes left running.

## Deviations from Assessment

None. In scope as well: the missing-endpoint error message in `src/attachments.ts`.

## Open Questions

- [NEEDS CLARIFICATION, carried from the assessment] Is a per-repo endpoint a real requirement, e.g. projects pointing at different storage servers? If yes, switch to the alternative: keep `resource` and key the stored credentials by endpoint. This fix took the preferred remediation without an answer.

## Follow-ups

- No test checks that VS Code ignores a workspace value. The attachments suite runs without a workspace folder, and that is VS Code platform behavior.
- `publicUrl` stays `resource`. It only affects generated links, not where credentials go.
