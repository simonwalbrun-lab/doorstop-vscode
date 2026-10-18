# Implementation Plan: Publish Without Child Links

**Branch**: `028-traceability-cross-links` | **Date**: 2026-10-18 | **Spec**: [spec.md](spec.md)

## Summary

Publishing runs Doorstop's publisher unchanged. The only option is the
checkbox `doorstop.publish.noChildLinks`: the extension sends `childLinks`
with each publish request, and the server sets Doorstop's own
`settings.PUBLISH_CHILD_LINKS` for that request and restores it afterwards.

## Technical Context

**Language/Version**: Python ≥3.9 (server), TypeScript (extension)

**Dependencies**: doorstop ≥3.0, FastAPI, VS Code API. No new dependency.

**Testing**: pytest (`server/tests/test_publish.py`), vscode-test (`src/test/regressionFixture.test.ts`), node (`src/test/pdf/exportPdf.test.mjs`)

**Constraints**: Doorstop unmodified; output equals `doorstop publish`; item files untouched.

## Constitution Check

PASS on all principles. The server owns the behaviour (I), Doorstop's own switch
is reused (II), the setting is restored in `finally` (III), no new dependency
(IV), type-check and lint gate the change (V), tests run in CI (VI, VIII).
Complexity Tracking: none.

## Source Code

```text
server/src/doorstop_server/schemas.py           # PublishRequest.childLinks (default true)
server/src/doorstop_server/routers/documents.py # _child_links() around both publish calls
server/tests/test_publish.py                    # FR-001, FR-003, FR-004, FR-005
package.json                                    # doorstop.publish.noChildLinks
src/doorstopCommands.ts                         # sends { childLinks } with every publish
src/test/regressionFixture.test.ts              # FR-004 (setting)
src/test/pdf/exportPdf.test.mjs                 # plain `doorstop publish` (FR-005)
.github/workflows/ci.yml                        # pdf-export installs doorstop
README.md  CHANGELOG.md  doc/publish-pdf.md  doc/architecture.md   # FR-006
```

## Test mapping

| FR | Test |
| -- | ---- |
| FR-001 | `test_publish_leaves_doorstop_unpatched` |
| FR-002 | `exportPdf.test.mjs` (plain Doorstop publish feeds the PDF export) |
| FR-003 | `test_publish_ignores_removed_traceability_field` |
| FR-004 | `test_no_child_links_applies_and_restores_setting`; extension test for `noChildLinks` |
| FR-005 | `test_ci_wrapper_module_is_gone`; `exportPdf.test.mjs` |
| FR-006 | Review of README, CHANGELOG and docs |
| FR-007 | Publishing writes only to the destination (not separately tested) |
