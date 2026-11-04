# Implementation Plan: Test Report Authoring

**Branch**: `035-test-report-authoring` | **Date**: 2026-10-31 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/035-test-report-authoring/spec.md`

## Summary

Testers tick task-list checkboxes with one click and attach evidence by
pasting or dropping files into an item's text. This is all extension-side,
with no server change:

- **Toggle**: a selection-change listener flips `[ ]`/`[x]` when a mouse
  click lands inside the brackets (research R1).
- **Attach**: paste and drop edit providers for item files and the Document
  View. Files go to the document's Doorstop `assets` folder, or, above a size
  threshold, to a MinIO/S3 bucket through one hand-signed PUT (R3–R6).

## Technical Context

**Language/Version**: TypeScript 6 on the VS Code Extension API

**Primary Dependencies**: VS Code API only; `node:crypto`, `node:fs`,
`node:http(s)`. No new packages (R6).

**Storage**: plain files under `<document>/assets/`; S3-compatible bucket

**Testing**: vscode-test (mocha), new labels `taskToggle`, `attachments`

**Target Platform**: VS Code desktop ≥ the release where paste/drop
`resolve*` are stable (expected 1.97, T001 confirms); Windows first-class,
all desktop OSes work

**Project Type**: VS Code extension (+ local Python server, untouched)

**Performance Goals**: toggle applies within one editor frame; a repo attach
of a few MB completes without a progress toast (< 1 s)

**Constraints**: no partial files or dangling links (SC-004); no secrets in
settings (FR-017); no network in CI tests

**Scale/Scope**: 3 new source files, ~400 lines; 2 test files

## Constitution Check

| Principle | Status | How |
| --- | --- | --- |
| I. Server is source of truth | ✅ | Document folder comes from `GET /tree` (`markerPath`) via `loadDoorstopIndex`. Asset copy and item text edits are not Doorstop mutations; item text reaches disk through the editor's normal save. No server change, no lock interaction. |
| II. No reinvention | ✅ | Uses Doorstop's own `assets` folder (`Document.ASSETS`), which `publish` copies. Reuses `itemFile.ts`, `documentViewModel.parse`, `withDelayedProgress`. |
| III. Error handling | ✅ | Every failure path is in the contract's Messages table; partial files are removed (R5). Server unreachable → explicit error, nothing guessed (R4). |
| IV. No unjustified dependencies | ✅ | SigV4 PUT is hand-written; the justification against `@aws-sdk/client-s3`/`minio` is in R6. The `engines.vscode` bump is not a dependency but is called out in T001. |
| V. Typed, linted, tested | ✅ | `npm run compile` gate; no Python change. |
| VI. CI-runnable test | ✅ | Both suites run under vscode-test, use temp folders and a local fake S3 server on port 0, with no network or MinIO. |
| VII. Long-running visible | ✅ | `withDelayedProgress(..., { cancellable: true })` around each attach (R7). Toggle is instant and exempt. |
| VIII. FR → test trace | ✅ | See Test coverage; each test carries `// Spec 035 FR-…`. |

Post-design re-check: no violations; Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/035-test-report-authoring/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/user-interface.md
└── tasks.md            # /speckit-tasks
```

### Source Code

```text
src/
├── itemFile.ts         # + textRange(lines, isMarkdown) for YAML text block / md body (R2)
├── taskToggle.ts       # NEW: taskBoxAt(), toggle handler, registerTaskToggle() (R1)
├── attachments.ts      # NEW: paste/drop providers, target rule, assets writer,
│                       #      credentials command, progress + errors (R3–R5, R7)
├── objectStorage.ts    # NEW: signV4() pure, putObject() over node:http(s) (R6)
├── extension.ts        # register the two features
└── test/
    ├── taskToggle.test.ts
    └── attachments.test.ts
package.json            # engines/@types bump, settings, command, configurationDefaults
.vscode-test.mjs        # labels taskToggle, attachments (no workspace)
README.md               # short section incl. "hold Shift when dropping"
```

**Structure Decision**: flat `src/` modules like every other feature. The
Document View integration is a selector plus `parse()` lookups inside
`attachments.ts`/`taskToggle.ts`; `documentViewProvider.ts` stays untouched.

## Design notes

- `attachments.ts` core takes a `documentFolderFor(uid)` function, so tests
  pass a temp folder and production passes the index lookup. No server stub
  is needed.
- Credentials are read via `context.secrets` at upload time; nothing is
  cached in memory beyond one attach.
- Toggle listener ignores editors whose document is not an item file
  (`uidFromItemPath`) or a Document View (`isViewUri`), so ordinary markdown
  files are untouched.

## Test coverage

| Test (file → case) | FRs |
| --- | --- |
| taskToggle → finds box for `-`, `*`, `+`, `1.`, nested, `[X]`; flips only the box char | 001, 002 |
| taskToggle → mouse click inside toggles; on text, keyboard, drag, double-click 2nd event don't | 001 |
| taskToggle → edit is undoable, document stays dirty, not saved | 003 |
| taskToggle → Document View text (`parse()` body) toggles; separator/fields lines don't | 004 |
| taskToggle → fenced code and YAML metadata lines don't toggle | 005 |
| attachments → uri-list drop of png + log into YAML text → files in temp `assets`, `![]`/`[]` lines, indented, ordered | 006, 008, 012 |
| attachments → paste of uri-list and of a URI-less image `DataTransferFile` → stored, timestamped name | 007 |
| attachments → plain-text transfer and position in metadata → no edit offered | 009 |
| attachments → folder URI → warning, nothing stored | 010 |
| attachments → mode setting `assets` / `objectStorage` routes by threshold, `0` = all | 011, 014 |
| attachments → same name+content reused, same name/other content → `-1`, never overwritten | 013 |
| objectStorage → `signV4` matches AWS published PUT Object example | 016 |
| objectStorage → fake server 200: body received, link = object URL; 403 → reason `403 AccessDenied` | 015, 016, 019 |
| attachments → credentials command stores to (fake) SecretStorage; settings untouched | 017 |
| attachments → slow fake server: `setProgressForTest` sees cancellable toast; cancel → no link, no partial | 018 |
| attachments → one of two files fails → other linked, partial removed, one error naming file | 019 |
| attachments → missing bucket / missing credentials → error names the setting/command; small file still stored | 020 |

## Complexity Tracking

None.
