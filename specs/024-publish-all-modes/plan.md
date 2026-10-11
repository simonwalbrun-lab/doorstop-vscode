# Implementation Plan: Publish All Modes

**Branch**: `024-publish-all-modes` | **Date**: 2026-10-09 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/024-publish-all-modes/spec.md`

## Summary

Replace the single "all" entry of the Publish picker with two entries:
"All documents - one file each" (today's per-document loop, now with a
temporary shared-template copy so documents without their own `template/`
folder no longer fail) and "All documents - combined run" (one Doorstop
`publish(tree, ...)` call). Both mechanics live in the server (Constitution I,
II): the per-document endpoint gains an opt-in flag that provisions and always
removes the borrowed template folder, and a new tree-publish endpoint calls
Doorstop's own tree publishing. The extension only changes the picker and which
endpoint it calls.

## Technical Context

**Language/Version**: TypeScript (extension, esbuild), Python 3 (FastAPI server)

**Primary Dependencies**: VS Code Extension API, FastAPI, `doorstop` (no new dependencies)

**Storage**: Files only (Doorstop repository, published output folder)

**Testing**: `server/tests` pytest (real temp Doorstop projects, no mocks); `src/test` vscode-test for the picker

**Target Platform**: VS Code desktop; Windows/Linux/macOS (CI runs Linux)

**Project Type**: VS Code extension + local Python server

**Performance Goals**: N/A (publish is a user-initiated batch action)

**Constraints**: Doorstop unmodified; template lookup only at `<doc>/template`; server serialises requests (existing lock)

**Scale/Scope**: Tens of documents per project

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Note |
|-----------|--------|------|
| I. Server single source of truth | Pass | Template provisioning/cleanup and tree publish are server-side; the extension only picks the mode. |
| II. No reinvention of Doorstop | Pass | Tree publish calls `publisher.publish(tree, ...)`; template copy uses `doorstop.common.copy_dir_contents`/`delete`. Only the "borrow a template" step is new, since Doorstop has no equivalent. |
| III. Error handling | Pass | Cleanup in `finally`; failures stay structured `DOORSTOP_ERROR` (400); per-document and template-name context added in the extension as today. |
| IV. No new dependencies | Pass | None. |
| V. Typed/linted/tested | Pass | `check-types`, `lint`, pytest suite. |
| VI. CI-runnable test | Pass | pytest cases for both server paths; extension picker case in `src/test`. |

Re-check after design: unchanged, still passing.

## Project Structure

### Documentation (this feature)

```text
specs/024-publish-all-modes/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── publish.md
└── tasks.md             # /speckit-tasks, not created here
```

### Source Code (repository root)

```text
server/
├── src/doorstop_server/
│   ├── schemas.py              # PublishRequest.sharedTemplate, TreePublishRequest
│   └── routers/documents.py    # borrowed-template context manager; POST /publish
└── tests/test_documents.py     # new cases (shared template, cleanup, tree publish)

src/
├── doorstopCommands.ts         # picker entries, mode dispatch
└── test/                       # picker/mode test

CHANGELOG.md, README.md         # user-facing note
```

**Structure Decision**: Existing two-part layout (extension + server); no new files in source, tests added to existing suites.

## Complexity Tracking

No constitution violations.
