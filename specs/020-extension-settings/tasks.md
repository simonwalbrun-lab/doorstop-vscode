# Tasks: Extension Settings

**Input**: Design documents from `/specs/020-extension-settings/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/settings-and-api.md, quickstart.md

**Tests**: Required — Constitution Principle VI (every feature ships with a CI-runnable test).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 = problem reports (P1), US2 = new-document defaults (P2), US3 = publish template (P3)

## Phase 1: Setup / Phase 2: Foundational

None. No new dependencies, files or shared infrastructure; every story touches
existing files only. `package.json` → `contributes.configuration` is created
as an **array of sections** by whichever story lands first (T001); later
stories append a section to that array.

---

## Phase 3: User Story 1 - Silence problem reports (Priority: P1) 🎯 MVP

**Goal**: One checkbox per problem kind; unticked kinds disappear from the Problems panel and the document view without a manual re-check.

**Independent Test**: Untick `doorstop.problems.suspectLink` → REQ-007's `suspect_link` diagnostic disappears, REQ-009's `linked_to_unknown_item` remains; re-tick → it returns.

- [X] T001 [US1] In `package.json`, add `contributes.configuration` as an array whose first entry is `{ "title": "Problems", "properties": { … } }` with 18 keys, each `"type": "boolean", "default": true` and a `markdownDescription` quoting Doorstop's message: `doorstop.problems.invalidUidInLinks` ("invalid UID in links: <UID>"), `linkedToUnknownItem` ("linked to unknown item: <UID>"), `externalReferenceNotFound` ("external reference not found: …"), `linkedToNonNormative` ("linked to non-normative item: <UID>"), `suspectLink` ("suspect link: <UID>"), `nonNormativeHasLinks` ("non-normative, but has links"), `noLinksFromChildDocument` ("no links from child document: …"), `noLinksToParentDocument` ("no links to parent document: …"), `noItems` ("no items"), `noDocuments` ("no documents"), `noText` ("no text"), `unreviewedChanges` ("unreviewed changes"), `duplicateLevel` ("duplicate level: …"), `skippedLevel` ("skipped level: …"), `needsInitialReview` ("needs initial review"), `prefixDiffersFromDocument` ("prefix differs from document (…)"), `unexpectedParentPrefix` ("parent is '…', but linked to: <UID>"), `unknown` ("a Doorstop message the extension could not classify"). Do NOT add keys for the reserved ids `linked_to_self`, `link_cycle`, `child_link_inactive` (research R2).
- [X] T002 [US1] In `src/problemsProvider.ts` `refreshNow()`, right after the `GET /validate` + `GET /tree` `Promise.all`, replace `validation` with a filtered copy: keep an issue unless `vscode.workspace.getConfiguration('doorstop.problems').get<boolean>(camel(issue.check), true)` is `false`, where `camel` converts snake_case to camelCase (`s.replace(/_([a-z])/g, (_, c) => c.toUpperCase())`). Pass the filtered response to `buildDiagnostics` AND store it in `lastRefresh`, so the document view (`src/documentViewLanguage.ts` `projectProblems`) hides the same kinds (research R1). Unknown keys default to kept.
- [X] T003 [US1] In `src/extension.ts`, right after `registerProblemsProvider(...)` (≈ line 189), push `vscode.workspace.onDidChangeConfiguration(e => { if (e.affectsConfiguration('doorstop.problems') && doorstopServer.isRunning) { void problemsProvider.refreshNow(); } })` onto `context.subscriptions` (FR-004, research R6).
- [X] T016 [US1] Rework (user request): replace the 18 `doorstop.problems.<camelCase>` booleans in `package.json` with one object setting `doorstop.problems` (boolean property per check id, `additionalProperties: false`, all `true` by default) so VS Code shows one compact checkbox list; `src/problemsProvider.ts` filters with `enabled[issue.check] !== false`; test T004 updates the object.
- [X] T004 [US1] In `src/test/regressionFixture.test.ts`, in the Feature 014 problems block, add test `'Settings: an unticked problem kind is hidden and comes back when re-ticked (020 US1)'`: set `doorstop.problems.suspectLink` to `false` with `vscode.ConfigurationTarget.Global` (never Workspace — the fixture must stay untouched), call `diagnosticsFor(REQ-007.yml)` and assert `withCode(..., 'suspect_link')` is empty while `withCode(diagnosticsFor(REQ-009.yml), 'linked_to_unknown_item')` still has 1; then reset the setting to `undefined` in a `finally` and assert the `suspect_link` diagnostic is back.

**Checkpoint**: US1 works and is tested on its own.

---

## Phase 4: User Story 2 - Defaults for new documents (Priority: P2)

**Goal**: "Create Document" applies item format, separator and digits from settings.

**Independent Test**: With `itemFormat = markdown`, `separator = "-"`, `digits = 4`, Create Document yields a `DocumentNode` with exactly those values.

- [X] T005 [US2] In `package.json` `contributes.configuration`, append section `{ "title": "New Document", "properties": { … } }`: `doorstop.newDocument.itemFormat` (`"type": "string", "enum": ["yaml", "markdown"], "enumItemLabels": ["YAML", "Markdown"], "default": "yaml"`), `doorstop.newDocument.separator` (`"type": "string", "enum": ["", "-", ".", "_"], "enumItemLabels": ["None", "- (hyphen)", ". (dot)", "_ (underscore)"], "default": ""`), `doorstop.newDocument.digits` (`"type": "integer", "minimum": 1, "maximum": 9, "default": 3`). Descriptions say they apply only to documents created afterwards.
- [X] T006 [US2] In `src/doorstopCommands.ts` `doorstop.createDoc` handler, read `const settings = vscode.workspace.getConfiguration('doorstop.newDocument')` and add `itemFormat: settings.get('itemFormat', 'yaml')`, `separator: settings.get('separator', '')`, `digits: settings.get('digits', 3)` to the `POST /documents` body (server already accepts them — research R4).
- [X] T007 [US2] In `src/test/regressionFixture.test.ts`, add test `'Create Document applies the new-document settings (020 US2)'`: set the three `doorstop.newDocument.*` settings (Global target) to `markdown`, `-`, `4`; call `createDocumentInto('TMPSET', items => items.find(item => labelOf(item) === 'REQ'), …)` and assert `created.itemFormat === 'markdown'`, `created.separator === '-'`, `created.digits === 4`; reset all three to `undefined` in `finally`.

**Checkpoint**: US2 works and is tested on its own.

---

## Phase 5: User Story 3 - Publish with my own template (Priority: P3)

**Goal**: A configured template name is passed to Doorstop on HTML/LaTeX publish; a missing template fails with a message naming the template and the setting.

**Independent Test**: Publish HTML with `template: "custom"` on a document without a `template` folder → HTTP 400 `DOORSTOP_ERROR`; without `template` → unchanged 200.

- [X] T008 [P] [US3] In `server/src/doorstop_server/schemas.py`, add `template: Optional[str] = None` to `PublishRequest`.
- [X] T009 [US3] In `server/src/doorstop_server/routers/documents.py` `publish_document`, call `publisher.publish(document, body.destinationPath, ext=ext, template=body.template)` (depends on T008).
- [X] T010 [P] [US3] In `server/tests/test_documents.py`, add `test_publish_with_missing_template_is_a_doorstop_error(client, document, tmp_path)`: add an item, POST `/documents/{prefix}/publish` with `{"format": "html", "destinationPath": str(tmp_path / "publish.html"), "template": "custom"}`, assert `status_code == 400` and `response.json()["error"]["code"] == "DOORSTOP_ERROR"`. The existing `test_publish_html_nests_under_documents_subfolder` covers the no-template path.
- [X] T011 [US3] In `package.json` `contributes.configuration`, append section `{ "title": "Publish", "properties": { "doorstop.publish.template": { "type": "string", "default": "", "markdownDescription": "Template used for HTML and LaTeX publishing. Must name a template in the document's `template` folder. Empty = Doorstop's built-in template." } } }`.
- [X] T012 [US3] In `src/doorstopCommands.ts` `doorstop.publish` handler, read `const template = vscode.workspace.getConfiguration('doorstop.publish').get<string>('template', '').trim()`; include `template` in the request body only when non-empty AND `format.value` is `'html'` or `'latex'` (research R5). When a template was sent, wrap the request so a rejection is rethrown as `new Error(\`${message} (template "${template}" from setting doorstop.publish.template)\`)` before `run` shows it (FR-011).

**Checkpoint**: All three stories work independently.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T013 [P] Add a short "Settings" section to `README.md` listing the three groups (Problems, New Document, Publish) and their defaults.
- [X] T014 Run `npm run compile` (type-check + lint + build), `cd server && pytest`, and `npm test`; all must pass.
- [X] T015 Walk through `specs/020-extension-settings/quickstart.md` manual steps 1–4.

---

## Dependencies & Execution Order

- US1, US2, US3 are independent of each other; only `package.json` (T001, T005, T011) and `src/doorstopCommands.ts` (T006, T012) and `src/test/regressionFixture.test.ts` (T004, T007) are shared files, so edits to the same file run sequentially.
- Within US3: T008 → T009; T010 can be written first (it fails until T009).
- Polish after the stories you ship.

## Parallel Opportunities

- US3 server work (T008, T010) in parallel with any US1/US2 extension task.
- T013 (README) in parallel with anything.

## Implementation Strategy

1. **MVP**: US1 (T001–T004) → validate → ship.
2. Add US2 (T005–T007) → validate.
3. Add US3 (T008–T012) → validate.
4. Polish (T013–T015).

## Phase 7: Convergence

Constitution v1.4.0 Principle VIII: every FR needs an automated CI test carrying a `Spec 020 FR-NNN` trace comment.

- [ ] T017 CRITICAL Add a manifest test in `src/test/` (reads `package.json` `contributes.configuration`) asserting: one boolean per problem check id defaulting to true with a description (`# Spec 020 FR-001`, `FR-002`); `doorstop.newDocument` itemFormat enum yaml/markdown default yaml, separator enum ""/-/./_ default "", digits integer min 1 max 9 default 3 (`FR-005`, `FR-008`); `doorstop.publish.template` string default "" (`FR-009`); all settings in "Doorstop"-titled configuration sections with scope not `machine` (`FR-012`) per Constitution VIII (missing)
- [ ] T018 CRITICAL Add a test in `src/test/regressionFixture.test.ts` that changes `doorstop.newDocument.*` settings and asserts existing documents' config is unchanged (`# Spec 020 FR-007`) per Constitution VIII (missing)
- [ ] T019 CRITICAL Add a test that, with all settings at default, Create Document, Publish and the Problems panel behave as before (`# Spec 020 FR-013`) per Constitution VIII (missing)
- [ ] T020 CRITICAL Add a test that `doorstop.publish` sends `template` in the request body when `doorstop.publish.template` is non-empty and omits it when empty (`# Spec 020 FR-010`), and that a failing template error message names the template and the setting `doorstop.publish.template` (`# Spec 020 FR-011`) per Constitution VIII (partial: only server-side 400 is tested)
- [ ] T021 CRITICAL Add trace comments to existing tests: `# Spec 020 FR-001`/`FR-003`/`FR-004` on 'Settings: an unticked problem kind...' (`src/test/regressionFixture.test.ts`); `# Spec 020 FR-006` on 'Create Document applies the new-document settings'; `# Spec 020 FR-010`/`FR-011` on `test_publish_with_missing_template_is_a_doorstop_error` (`server/tests/test_documents.py`); existing comments use "(020 US1)" style, not the required format per Constitution VIII (partial)
