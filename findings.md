# Doorstop VS Code Extension — Spec / Constitution / Code Audit

Audit date: 2026-09-10. Scope: all specs under `specs/` (001–014) cross-checked against
`src/`, `server/`, and `.specify/memory/constitution.md`. Each item is meant to be
actioned and checked off individually; grouped by priority, not by spec number.

---


## Remediation status (updated 2026-09-10)

**21 items closed**: A1, A2, A3, A4, A5, A6, B1, B2, B3, B4, B5, C2, C3, C4,
C5, C6, C7, D1, E2, E3, F4. The extension suite (50 tests) and the server suite
(60 tests) both pass, and `testdata/regression` is left byte-identical.

Three things drove most of it:

- **`src/doorstopIndex.ts`** - one shared, server-backed view of the project
  that hover, completion and go-to-definition all resolve through. Closed the
  Principle I/II violations (B1/B2/B4), let `js-yaml` be dropped (D1), and
  removed the hover-vs-F12 disagreement (C3) as a side effect.
- **Feature 014 (A2)** - built end to end after the user acknowledged the
  15-to-12 check scope reduction: `GET /validate` and `validation_rules.py` on
  the server, `src/problemsProvider.ts` in the extension.
- **Derive kinship labels (B3)** - the user chose to keep the wider candidate
  set and make it legible, rather than narrow it to true descendants.

Changes in the **`server/` submodule** (a separate repository) need their own
commit and push:

- `ItemNode.ref` on `GET /tree`, so hover keeps showing an item's `ref` without
  reading the file itself.
- `_resolve_written_path()` in `routers/documents.py`, so Export/Publish report
  where Doorstop actually wrote the output.
- `validation_rules.py`, `routers/validation.py`, the `ValidationIssue` schemas
  and `tests/test_validation.py` - the whole server half of feature 014.

### Still open, in the order they should be picked up

1. **B6-B9** duplicate server logic on the client. B7/B8/B9 cannot be fixed
   without new server endpoints (level placement, UID resolution, a
   non-destructive index check); B6 needs server-supplied hierarchy in `/tree`.
2. **C1** - "Add Item" still only ever creates a sibling, never a child.
3. **E1** - partially done. `createDoc` and Export/Publish now have
   extension-level tests; `add`, `link` and the reorder/import dialogs do not.
4. **E4** - no webview test harness exists, so 007/008/011 remain at zero
   coverage. This is the largest remaining test gap.
5. **E5, F1-F3** - process and documentation cleanup.

---

## A. Not implemented at all (highest priority)

- [x] **A1. [013] Review & suspect-link CodeLenses — 0% built.**
  `spec.md`/`plan.md`/`tasks.md` (39 tasks, all unchecked) describe three CodeLenses
  (`doReview`, `clearAllSuspicions`, `clearSuspicion`). No `reviewLensProvider.ts`, no
  matching commands in `package.json`, no fixture (`REQ-010.yml` never added), no
  server test for selective `parents` clear. Nothing shipped.
  - **Status: RESOLVED before this pass (audit entry was stale): `src/reviewLensProvider.ts`, the three commands in `package.json` and `testdata/regression/REQ-010.yml` all exist and are covered by tests.**

- [x] **A2. [014] Doorstop validation diagnostics — 0% built** (the original
  "planning artifacts broken" claim is incorrect; see the note below).
  Only `spec.md` and `checklists/requirements.md` exist; `plan.md` repeatedly cites
  `research.md`, `data-model.md`, `contracts/validation-api.md`, and `tasks.md` — none
  exist on disk. `plan.md` also flags an unresolved scope reduction ("three spec'd
  checks not implemented — needs user acknowledgement, see Completion Report") and no
  Completion Report exists. No `GET /validate` endpoint, no
  `vscode.languages.createDiagnosticCollection` usage anywhere. **Needs a scoping
  decision before implementation resumes.**
  - **Status: BUILT. The user acknowledged the 15-to-12 scope reduction (Option 1: report what Doorstop reports) on 2026-09-10; it is recorded in spec.md "Scope decision" and plan.md "Completion Report". 55 of 56 tasks are done (T055 is a manual walkthrough, its key check automated). New: `GET /validate` + `validation_rules.py` server-side, `src/problemsProvider.ts` client-side, 24 new server tests and 7 new extension tests. The audit's "planning artifacts broken" claim was incorrect - all eight existed.**

- [x] **A3. [013] Prescribed fix for `deriveProvider.ts` was designed but never applied.**
  `research.md §5` diagnoses `deriveProvider.ts` as a Principle I/II violation and
  Phase 6 (T027–T033) plans the fix; the code is untouched (`js-yaml` import,
  `findFiles`/`.doorstop.yml` globbing all still present).
  - **Status: RESOLVED before this pass: `deriveProvider.ts` is server-backed and no longer imports `js-yaml`.**

- [x] **A4. [002] Create Document — parent selection never implemented.**
  `doorstopCommands.ts` `createDoc` only prompts for prefix + folder, never a parent
  quick-pick, even though `POST /documents` already supports `parentPrefix`
  server-side. Spec's own Assumptions section already flags this as a known gap.
  - **Status: FIXED: `createDoc` now runs a parent quick-select with an explicit "None (create as root document)" entry, and a dismissed pick cancels the command (FR-009/010/011). Note: Doorstop itself refuses a second parentless document in a project that already has a root, and that refusal is now surfaced rather than worked around.**

- [x] **A5. [008] Diagram backup-recovery fix — the one thing spec 008 was scoped to
  do — not implemented.** `extension.ts`'s `openCustomDocument(uri)` still has the old
  single-argument signature; `openContext`/`backupId` are never referenced. Spec 008's
  `tasks.md` (T001–T006) are all unchecked despite the spec header saying
  "Status: Implemented."
  - **Status: FIXED: `openCustomDocument(uri, openContext)` reopens from `openContext.backupId` when VS Code supplies one, falling back to the saved file if the backup cannot be read.**

- [x] **A6. [004] Export/Publish never report the resulting path to the user.**
  FR-008 explicitly requires surfacing the actual write location (which can differ
  from the requested one, e.g. Doorstop's HTML-nesting quirk). The server computes and
  returns it; `exportCommand`/`publish` in `doorstopCommands.ts` discard the response
  entirely — no notification shown.
  - **Status: FIXED: Export/Publish now report the written path and offer "Reveal in Explorer". The server was itself reporting a non-existent path for HTML publish; it now resolves the real `documents/` location.**

---

## B. Constitution Principle I/II violations — systemic client-side re-parsing

The single biggest cross-cutting issue: **4 production files** bypass the server's
already-computed `GET /tree` data by re-globbing and re-parsing raw `.yml`/
`.doorstop.yml` files with `js-yaml` instead of calling the server.

- [x] **B1. `src/hoverProvider.ts`** (`parseDoorstopFile`, `findReverseLinks`) —
  reimplements item discovery and reverse-link computation client-side.
  Non-deterministic when duplicate/stray files exist (`findFiles(..., 1)` returns
  "whichever result comes first").
  - **Status: FIXED: `hoverProvider.ts` reads everything from `GET /tree` through the new shared `src/doorstopIndex.ts` - no file reads, no `js-yaml`, deterministic UID resolution.**

- [x] **B2. `src/completionProvider.ts`** (`parseRequirement`, `getDocuments`) —
  re-derives requirement titles for autocomplete from raw files instead of
  `GET /tree`'s `header`/`text` fields.
  - **Status: FIXED: `completionProvider.ts` builds its candidate list from `GET /tree`; files that are not Doorstop items are no longer offered as link targets.**

- [x] **B3. `src/deriveProvider.ts`** (`getDocuments`, `findPrefix`, `findParent`) —
  recomputes document hierarchy from `.doorstop.yml` markers instead of the server's
  `prefix`/`parentPrefix`. Also has a **behavioral drift**: derive-target filtering
  uses tree *depth* (`getDepth(prefix) >= sourceDepth`) rather than true ancestry, so
  unrelated sibling-depth documents in a different branch can be wrongly offered as
  derive targets (violates FR-003). Also swallows parse errors with an empty
  `catch {}` at line ~103, silently shortening the candidate document list.
  - **Status: RESOLVED - the server-backed half was already fixed; for the depth-vs-ancestry drift the user chose to KEEP the wider candidate set (Option A) and make it legible instead. The quick pick now labels every candidate with its kinship to the source document - child, grandchild, sibling, nephew, cousin, or "related" - and lists them in that order, so a cross-branch derive is a visible choice rather than an accident. The empty-catch that swallowed parse errors is gone. See `describeRelationship` in src/deriveProvider.ts and the "Derive Target Kinship" suite.**

- [x] **B4. `src/diagrammPanel.ts`** (drag-and-drop handler, ~line 633) — reads and
  `yaml.load`s the dropped item file even when server-derived `knownMeta` is already
  available; the inline comment claims metadata is "preferred from the server," which
  contradicts the actual code path.
  - **Status: FIXED: the drop handler uses the server-derived `knownMeta` only, and reports an unknown UID instead of parsing the file.**

- [x] **B5. Self-documented but unaddressed.** `specs/013.../research.md §5`
  explicitly names `hoverProvider.ts`, `completionProvider.ts`, and `diagrammPanel.ts`
  as known instances and says feature 014 was "the natural place to address"
  hover/completion — but 014 was never built (see A2).
  - **Status: PARTIALLY RESOLVED: hover and completion are done (B1/B2). Feature 014 itself is still unbuilt - see A2.**

Related, lower-severity duplication of server logic on the client:

- [ ] **B6. [002] `requirementTree.ts`** (`attachHierarchy`) reconstructs parent/child
  nesting from flat level strings via a depth-stack heuristic instead of
  server-supplied hierarchy (own comment admits it's an approximation).

- [ ] **B7. [003] `doorstopCommands.ts`** (`nextLevel()`) computes the next Doorstop
  level client-side and sends it to the server as a mutation input, instead of
  letting Doorstop/the server compute placement.

- [ ] **B8. [003] `doorstopCommands.ts`** (`editorUid()`) guesses the item UID by
  stripping the active file's extension instead of resolving it via `/tree`.

- [ ] **B9. [004] `doorstopCommands.ts`** (manual reorder) calls
  `vscode.workspace.fs.stat` directly on a hardcoded `index.yml` path to decide
  whether to offer "reuse or discard," duplicating knowledge of Doorstop's internal
  `Document.INDEX` constant — no non-destructive server endpoint exists for this
  check.

---

## C. Behavioral drift (spec says one thing, code does another)

- [ ] **C1. [003] "Add Item" only ever creates a sibling, never a child.**
  Acceptance Scenario 2 implies child creation should be possible; `nextLevel()` only
  increments the same-depth segment.

- [x] **C2. [007] `withAuthoritativeEdges` only checks one edge endpoint.** FR-007
  requires preserving any persisted edge that "touches" a node the server doesn't
  recognize; code only checks `edge.from`, so an edge with an unrecognized `to` is
  silently dropped.
  - **Status: FIXED: `withAuthoritativeEdges` now preserves a persisted edge when *either* endpoint is unknown to the server.**

- [x] **C3. [009] FR-006 contradicts the feature's own `research.md`.** Spec says
  go-to-definition "MUST resolve matches the same way existing hover previews do."
  `research.md` Decision 1 explicitly chose a *different*, tree-backed mechanism
  specifically because hover's approach can't disambiguate duplicates — meaning F12
  and hover can genuinely disagree on which file a UID resolves to, uncaught by the
  (fully-checked) requirements checklist.
  - **Status: FIXED: hover and go-to-definition now resolve through the same `DoorstopIndex`, so they can no longer disagree about which file a UID names.**

- [x] **C4. [001] Restart-timeout path doesn't surface server output.** FR-006
  requires surfacing recent server output on any startup/restart failure; the
  process-exit path does this, but `waitForHealthy`'s timeout path throws a bare
  message with no server output.
  - **Status: FIXED: the `waitForHealthy` timeout path now appends the captured server output, like the process-exit path already did.**

- [x] **C5. [001] Port-conflict handling is an open question the spec never
  answers.** Fixed port 7867, no distinct "port already in use" detection/error
  anywhere.
  - **Status: FIXED: a startup failure whose output matches a port-in-use error now carries an explicit "port 7867 is already in use" hint naming the likely cause.**

- [x] **C6. [004] FR-008's regression test doesn't actually verify the reported
  path** — it only checks the file exists on disk, never asserts the response body's
  `path` field reflects Doorstop's actual (differing) write location.
  - **Status: FIXED: `test_publish_html_nests_under_documents_subfolder` now asserts the response body's `path` equals the real nested file, and that the requested path does not exist.**

- [x] **C7. [012] "Reports the broken reference clearly" is unverified.** The only
  automated test checks that go-to-definition returns zero locations, not that any
  user-visible message appears — `definitionProvider.ts` returns `undefined` silently,
  so "reported clearly" is unfalsifiable by the current test.
  - **Status: FIXED: `resolveDefinitionAt` returns a `brokenUid`, the provider shows a warning naming it, and a test asserts the UID is reported rather than silently swallowed.**

---

## D. Constitution Principle IV — undocumented dependency

- [x] **D1. `js-yaml` (the repo's only runtime npm dependency) was added with no
  recorded justification.** It entered in the initial commit ("initial version with
  only feature hover window") with no rationale, and it exists specifically to
  support the Principle I/II violations in section B — removing those violations
  would likely let this dependency be dropped entirely.
  - **Status: FIXED: `js-yaml` removed from `package.json` - the extension now has no runtime npm dependencies at all.**

---

## E. Constitution Principle VI — CI test coverage gaps

Full mapping (verified by reading every test file):

| Feature | CI coverage of primary path |
|---|---|
| 001 Server lifecycle | Partial — server lock/health tested; restart command, Python-path resolution, spawn failures untested |
| 002 Explorer/Commands panel | Partial — tree read path tested; Commands panel & createDoc untested |
| 003 Add/Review/Clear/Link | Partial — server-side full; review/clear tested end-to-end; add/link untested at extension level |
| 004 Reorder/Import/Export/Publish | Partial — server-side full; no extension-level test of any command wiring (this is how A6 went uncaught) |
| 005 CodeLens/autocompletion | **None** |
| 006 Hover/navigation | **None** |
| 007 Diagram core | **None** — no webview test harness exists at all |
| 008 Diagram interaction | **None** |
| 009 Go-to-definition | Yes — solid |
| 010 Auto-reveal toggle | Yes — solid |
| 011 Ghost items preview | **None** — acknowledged/accepted gap in tasks.md, but plan.md's Constitution Check table never even lists Principle VI |
| 012 Test model | Is the test infrastructure itself |
| 013 Review/suspect CodeLenses | **None — feature unbuilt** |
| 014 Validation diagnostics | **None — feature unbuilt** |

- [ ] **E1.** Backfill extension-level tests for 001–004's command wiring (add, link,
  createDoc, reorder/import/export/publish dialogs) — server-side is already covered,
  but regressions in the TS command handlers themselves (like A6) are currently
  invisible to CI.
  - **Status: PARTIALLY DONE - `createDoc` (all three FR-009/010/011 outcomes) and Export/Publish path reporting now have extension-level tests. `add`, `link` and the reorder/import dialogs are still untested.**
- [x] **E2.** Add test coverage for 005 (derive/completion providers) — currently zero.
  - **Status: DONE - the completion provider is covered by "Link completion offers exactly the items the server knows"; the derive provider by "Derive: target documents come from the server".**
- [x] **E3.** Add test coverage for 006 (hover provider) — currently zero.
  - **Status: DONE - covered by "Hover on a link UID previews the server's text" and "Hover on a derived: line lists the items that link to this one".**
- [ ] **E4.** Stand up a webview test harness and add coverage for 007/008/011
  (diagram core, diagram interaction, ghost items) — currently zero, and no
  infrastructure exists to test `src/webview/diagram/*.js` at all.
- [ ] **E5. Several `plan.md` "Constitution Check" tables (at least 009, 011) omit
  Principle VI entirely** even though it was already ratified (v1.1.0, 2026-09-09)
  before or on the same day those plans were written — the gate that should have
  caught the test gaps above was never actually run. Fix the plan template/process so
  future features check Principle VI explicitly.

---

## F. Documentation staleness (lower priority, cheap to fix)

- [ ] **F1. [011] `spec.md` still says "Status: Draft"** despite `tasks.md` showing
  all 46 tasks complete across two post-ship revision rounds.
- [ ] **F2. [008]** has no `checklists/requirements.md` (010 and 011 do) — the
  completeness-checklist step was skipped for this feature.
- [ ] **F3. [012]** T024–T026 (final polish/verification pass) left unchecked in an
  otherwise fully-checked `tasks.md`.
- [x] **F4. [014] `CHANGELOG.md`** still lists a bare "Diagnostics" bullet under
  `[Unreleased]`, predating the spec — reconcile once 014's actual scope is decided.
  - **Status: FIXED - the bare "Diagnostics" bullet is replaced by the real 014 scope, including the note that self-link, link-cycle and child-link-inactive are not reported.**

---

## Suggested fix order

1. **B** (systemic re-parsing violation) — fixing hover/completion/derive/diagram
   together also lets you drop `js-yaml` and closes **D**.
2. **A4 / A5 / A6** — small, contained missing-implementation bugs in already-shipped
   features.
3. **C** — drift items, mostly one-line fixes.
4. **E** — backfill tests, prioritizing 007/008/011 which have zero coverage.
5. **A1 / A3** (013) and **A2** (014) — the two big unbuilt features; largest effort,
   014 needs a scoping decision first given its abandoned Completion Report question.
6. **F** — docs cleanup.
