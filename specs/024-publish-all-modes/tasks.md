---

description: "Task list for 024 Publish All Modes"
---

# Tasks: Publish All Modes

**Input**: Design documents from `/specs/024-publish-all-modes/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/publish.md](contracts/publish.md), [quickstart.md](quickstart.md)

**Tests**: Included. Constitution V and VI require CI-runnable tests; server tests run against real temporary Doorstop projects, Doorstop is never mocked.

**Organization**: Grouped by user story. Paths are relative to the repo root.

`server/` is a git submodule. Server tasks are committed inside `server/` first, then this repo's submodule pointer is bumped (T018).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1-US3 from spec.md

---

## Phase 1: Foundational

**Purpose**: Request shapes both server paths share.

- [X] T001 Extend `PublishRequest` in `server/src/doorstop_server/schemas.py` with `sharedTemplate: bool = False` (ignored unless `template` is non-empty), and add `TreePublishRequest(format: Literal["markdown","html","latex"], destinationPath: str, template: Optional[str] = None)`. Reuse `PublishResponse` for both responses (see [contracts/publish.md](contracts/publish.md)).

---

## Phase 2: User Story 1 - Shared template, one file each (Priority: P1)

**Goal**: Every document publishes with a template owned by only one document; no `template/` folder remains afterwards.

**Independent Test**: Project with REQ owning `template/` and SYS not; publish SYS with `template` + `sharedTemplate: true`; it succeeds and `SYS/template` is gone afterwards.

### Tests for User Story 1

- [X] T002 [P] [US1] In `server/tests/test_documents.py` add a test: create a second document SYS under REQ, give REQ a `template/` folder (copy of Doorstop's built-in HTML template folder `doorstop/core/files/templates/html` so the template name resolves), publish SYS as HTML with `template` set and `sharedTemplate: true`; assert 200, output exists, and `<SYS path>/template` does not exist afterwards.
- [X] T003 [P] [US1] In `server/tests/test_documents.py` add tests for the guard rails: (a) without `sharedTemplate` the same request still returns 400 `DOORSTOP_ERROR` (FR-009); (b) REQ's own `template/` is unchanged after publishing REQ with the flag (FR-004); (c) `format: markdown` with the flag creates no folder; (d) no document owns a template: 400 `DOORSTOP_ERROR` and no folder left behind; (e) a publish forced to fail after provisioning (e.g. unwritable/invalid destination) still leaves no `template/` folder in the document (SC-002).

### Implementation for User Story 1

- [X] T004 [US1] In `server/src/doorstop_server/routers/documents.py` add a context manager `_borrowed_template(tree, document, requested)` that, when `requested.sharedTemplate` and `requested.template` and `requested.format != "markdown"` and `document.template is None`, finds the first document in `tree.documents` with a non-`None` `.template`, creates `<document.path>/template`, fills it with `doorstop.common.copy_dir_contents(owner.template, target)`, and in `finally` removes it with `doorstop.common.delete(target)`. It must only remove a folder it created. No owner found: yield without doing anything so Doorstop's own error surfaces.
- [X] T005 [US1] Wrap the `publisher.publish(...)` call in `publish_document` (`server/src/doorstop_server/routers/documents.py`) with `_borrowed_template`. Depends on T004.
- [X] T006 [US1] In `src/doorstopCommands.ts` make the per-document loop (the `prefixes` loop in the `doorstop.publish` command) send `sharedTemplate: true` whenever a template is sent. A single-document publish must not send it.

**Checkpoint**: Run `server/tests` publish cases; "Publish All" no longer fails on documents without a template.

---

## Phase 3: User Story 2 - Combined run (Priority: P2)

**Goal**: One request publishes all documents through Doorstop's tree publishing.

**Independent Test**: `POST /publish` with HTML and a directory; every document file and `index.html` exist.

### Tests for User Story 2

- [X] T007 [P] [US2] In `server/tests/test_documents.py` add a test: two documents with one item each, `POST /publish` markdown into a temp directory; assert 200 and one `<PREFIX>.md` per document.
- [X] T008 [P] [US2] In `server/tests/test_documents.py` add tests: (a) HTML combined run returns a `path` that exists and ends in `index.html`; (b) with a `template/` folder in two documents the response is 400 `DOORSTOP_ERROR` mentioning the multiple templates (spec User Story 2, scenario 2); (c) an empty project returns 400 `DOORSTOP_ERROR`.

### Implementation for User Story 2

- [X] T009 [US2] In `server/src/doorstop_server/routers/documents.py` add `@router.post("/publish")` handler outside the `/documents` prefix (new `APIRouter()` named `publish_router`, or place it in `server/src/doorstop_server/routers/tree.py`; register in `server/src/doorstop_server/app.py` if a new router is used) that calls `publisher.publish(tree, body.destinationPath, ext=_PUBLISH_EXTENSIONS[body.format], template=body.template)`. Return `<destination>/index.html` when that file exists, else the destination directory.
- [X] T010 [US2] In `src/doorstopCommands.ts` add a `publishTogether(folder)` helper that calls `POST /publish` with `{ format, destinationPath: folder, ...(template ? { template } : {}) }`, reusing the existing template-error wrapping, and reports the written location with `reportWrittenPath`.

**Checkpoint**: Combined run works through the server and the helper; nothing in the picker routes to it yet.

---

## Phase 4: User Story 3 - Clear picker entries (Priority: P3)

**Goal**: The Publish picker offers the two modes with self-explanatory names.

**Independent Test**: Open Publish; the list shows each document, then "All documents - one file each" and "All documents - combined run", each with a description.

### Tests for User Story 3

- [X] T011 [P] [US3] In `src/test/regressionFixture.test.ts` add a test using `withStubbedDialogs`: run `doorstop.publish`, capture the first quick-pick items and assert the two labels and non-empty descriptions are present and the former plain `all` label is not; choose "All documents - combined run" with Markdown and a temp folder as `openDialog`, then assert a `<PREFIX>.md` file exists for every document in the fixture. Clean the temp folder afterwards.

### Implementation for User Story 3

- [X] T012 [US3] In `src/doorstopCommands.ts` replace `chooseDocumentOrAll` use inside `doorstop.publish` with a new `choosePublishTarget(tree)` returning `{ kind: 'document'; prefix } | { kind: 'each' } | { kind: 'together' }`, listing documents first, then "All documents - one file each" (description: "Publish every document separately; a shared template is supplied to documents without one") and "All documents - combined run" (description: "Publish all documents together with index and traceability matrix"). Leave `chooseDocumentOrAll` unchanged for its other callers.
- [X] T013 [US3] In `src/doorstopCommands.ts` dispatch on `kind`: `document` keeps today's save-dialog flow, `each` runs the existing folder dialog + sequential fail-fast loop (T006), `together` asks for a folder with the same dialog and calls `publishTogether` (T010). Show the document count message only for `each`. Depends on T006, T010, T012.

**Checkpoint**: All three stories work from the command.

---

## Phase 5: Polish & Cross-Cutting

- [X] T014 [P] Add a CHANGELOG.md entry: Publish picker now offers "All documents - one file each" (shared template supplied and cleaned up) and "All documents - combined run".
- [X] T015 [P] Update README.md (Publish section and the `doorstop.publish.template` setting description near line 142) to explain the two modes and the one-template limit of the combined run. Update the `markdownDescription` of `doorstop.publish.template` in `package.json` to match.
- [X] T016 Run `npm run compile`, `cd server; python -m pytest`, and `npm test`; fix failures. Perform the manual steps in [quickstart.md](quickstart.md).
- [X] T017 [P] Confirm no `template/` folder remains in the fixture or any test temp project after the suites run (SC-002).
- [ ] T018 Commit the server changes inside `server/`, then commit the bumped submodule pointer in this repo.

---

## Dependencies & Execution Order

- T001 first. US1 (T002-T006) and US2 (T007-T010) then both only depend on T001 and touch different server code, but both edit `server/src/doorstop_server/routers/documents.py` and `src/doorstopCommands.ts`, so do them in sequence P1 then P2.
- US3 (T011-T013) depends on T006 and T010.
- Polish last.

## Parallel Opportunities

- T002 and T003 (same file, different tests; write together) and T007/T008 are all test-only and can be drafted in parallel before their implementations.
- T014, T015 and T017 are independent.

## Implementation Strategy

- **MVP**: Phase 1 + User Story 1 (T001-T006). This fixes the reported failure; the existing "all" entry keeps working and now succeeds.
- Then US2, then US3 to finalise the picker, then Polish.

---

## Phase 6: Convergence

- [X] T019 Add an extension test in `src/test/regressionFixture.test.ts` that drives `doorstop.publish` with "All documents - one file each" (Markdown, temp folder) and asserts one `<PREFIX>.md` per fixture document, so the per-document loop and its picker routing are covered end to end per US1/AC1 and FR-003 (partial)
- [ ] T020 Run the manual steps of `quickstart.md` (HTML one file each with a template only on REQ, combined run, two-template error, single document) and tick them off, since T016 was marked done without them per T016 (partial)

---

## Phase 7: Convergence

- [ ] T021 CRITICAL: Add the `Spec 024 FR-NNN` trace comment to each existing 024 test (server/tests/test_documents.py: test_publish_with_shared_template_borrows_and_removes_it FR-003/FR-004, test_publish_without_shared_template_flag_still_fails FR-003, test_shared_template_is_removed_when_publish_fails FR-004, test_combined_publish_markdown_writes_every_document FR-006, test_combined_publish_html_reports_the_index FR-006/FR-007, test_combined_publish_with_two_templates_is_a_doorstop_error FR-008, test_combined_publish_of_an_empty_project_is_a_doorstop_error FR-008; src/test/regressionFixture.test.ts: picker test FR-001/FR-006, "one file each" test FR-002/FR-003, real HTML location test FR-007) per Constitution VIII (partial)
- [ ] T022 CRITICAL: Add `Spec 024 FR-009` traced regression to test_documents.py (or tag test_publish_markdown_writes_to_requested_path / test_publish_html_nests_under_documents_subfolder if they cover single-document publish unchanged) per FR-009 / Constitution VIII (partial)
- [ ] T023 CRITICAL: Add an automated test, traced `Spec 024 FR-005`, where two documents each own a template folder: each keeps its own and the first owner in tree order supplies the copies to templateless documents per FR-005 / Constitution VIII (missing)
- [ ] T024 CRITICAL: Add an automated test, traced `Spec 024 FR-008`, that a "one file each" failure message names the failing document and, when a template was sent, the template and the supplying setting per FR-008 / Constitution VIII (missing)
- [ ] T025 CRITICAL: Add an automated CI check, traced `Spec 024 FR-010`, asserting Doorstop's own package/template lookup is unmodified (e.g. installed doorstop files unpatched, no monkeypatch of its template lookup in server/src) per FR-010 / Constitution VIII (missing)
