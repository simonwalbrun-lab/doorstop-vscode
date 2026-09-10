# Feature Specification: Doorstop Regression Test Model

**Feature Branch**: `012-doorstop-test-model`

**Created**: 2026-09-09

**Status**: Draft

**Input**: User description: "we need to provicde a stable project to our users. therefore we need to test all features at leat at a basic level to have no regressions. I suppose to generate a doorstop testmodel which covers all cases and can also be used for further tests." (Follow-up: "I also want to have the integration tests running automatically" — folded into User Story 3 and FR-012–FR-014 below.)

## Clarifications

### Session 2026-09-10

- Q: Should the fixture only be *usable* by automated tests (someone still has to write and run them later), or must this feature itself wire an automated integration test suite that exercises the fixture automatically on every push/PR? → A: This feature must wire the automated run into the existing CI pipeline (see `.github/workflows/ci.yml`), not just leave the fixture consumable. User Story 3 and FR-012–FR-014 were updated accordingly.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Run a full manual regression pass before release (Priority: P1)

As a maintainer preparing a new release, I want a ready-made Doorstop project fixture that already contains every kind of document, item, link, and state the extension's shipped features operate on, so that I can exercise each feature by hand against known data and confirm nothing has regressed, without having to construct test data from scratch every time.

**Why this priority**: This is the core problem statement — releases currently have no shared, repeatable basis for confirming "nothing broke." Without it, regressions reach users. This alone delivers the requested value even if nothing else in this feature is built.

**Independent Test**: Can be fully tested by opening the fixture folder in VS Code, working through the accompanying checklist item by item (tree view, item lifecycle commands, document utilities, CodeLens/autocompletion, hover, diagrams, go-to-definition, auto-reveal toggle), and confirming each step produces the documented expected result.

**Acceptance Scenarios**:

1. **Given** the test model fixture is opened in a workspace, **When** the maintainer follows the regression checklist from top to bottom, **Then** every checklist step references a concrete document/item in the fixture and completes with the documented expected outcome.
2. **Given** a maintainer has never worked with the fixture before, **When** they open the checklist, **Then** they can identify which fixture item/document to use for any given shipped feature without reading extension source code.
3. **Given** the regression pass has been completed once, **When** it is re-run after a code change, **Then** the same fixture and checklist can be reused unmodified (no rebuild or reset step required beyond discarding any edits made during the previous pass).

---

### User Story 2 - Verify edge-case and non-happy-path behavior (Priority: P2)

As a maintainer, I want the test model to include unusual and boundary states — an empty document, a suspect (outdated) link, a dangling link to a missing item, items with only a UID and no text, items with long multi-paragraph text, and a deeply nested document hierarchy — so that I can verify how each feature behaves outside the happy path, not just on well-formed data.

**Why this priority**: Most regressions surface at edges (empty lists, broken references, long content) rather than in straightforward cases. This extends the P1 fixture rather than replacing it, so it can be delivered right after the core fixture exists.

**Independent Test**: Can be fully tested by pointing each relevant feature (explorer tree, hover preview, diagram suspect-link indicator, review/clear-suspect commands) at the specific edge-case item/document called out in the checklist and confirming the documented (non-crashing, clearly-indicated) behavior occurs.

**Acceptance Scenarios**:

1. **Given** the fixture's empty document, **When** it is opened in the explorer tree and in a diagram, **Then** it renders as a valid document with zero items instead of erroring or being hidden.
2. **Given** the fixture's suspect link, **When** the review/clear-suspect commands and the diagram's link indicators are used against it, **Then** the suspect state is visibly flagged and can be cleared through the normal command.
3. **Given** the fixture's dangling link (target item does not exist), **When** the maintainer hovers it, navigates via go-to-definition, or views it in a diagram, **Then** the feature reports the broken reference clearly instead of failing silently or crashing.

---

### User Story 3 - Catch regressions automatically on every change, without a human running the checklist (Priority: P2)

As a maintainer, I want an automated integration test suite that exercises the test model's fixture and runs by itself on every push and pull request, so that a regression is caught and visibly blocks the change before it ever reaches a manual regression pass or a release.

**Why this priority**: A manual checklist only catches what a human remembers to run, and only when they run it. Wiring the same fixture into the existing automated pipeline turns "no regressions" from a release-day ritual into a standing guarantee checked on every change — raised above the original P3 "usable by automated tests" framing because the user explicitly asked for the tests to run automatically, not merely be runnable.

**Independent Test**: Can be fully tested by pushing a change that deliberately breaks one shipped feature (e.g., a command that no longer completes), opening a pull request, and confirming the automated pipeline runs the integration suite against the fixture and reports a clear failure without any manual step.

**Acceptance Scenarios**:

1. **Given** the fixture lives at a fixed, documented path in the repository, **When** the automated integration test suite runs, **Then** it loads the fixture's documents/items and exercises the shipped feature areas covered by the regression checklist without any manual setup step, network access, or external services beyond the local Doorstop server.
2. **Given** a push or pull request is made to the repository, **When** the existing automated pipeline runs, **Then** the integration test suite against the fixture runs automatically as part of that pipeline, with no human needing to trigger it separately.
3. **Given** the integration test suite finds that a shipped feature no longer behaves as the fixture expects, **When** the pipeline run completes, **Then** the pipeline reports a clear, visible failure attributable to that feature, the same way the pipeline's existing checks already report failures.
4. **Given** a test run modifies the fixture's files (e.g., adding an item), **When** the test suite finishes, **Then** the fixture is left unchanged or reset, so the next run (automated or manual) starts from the same known state.

---

### Edge Cases

- What happens when the fixture's Doorstop server fails to start (e.g., Python/Doorstop not installed on the tester's machine)? The checklist must call out this prerequisite up front rather than let testers discover it mid-pass.
- How does the explorer/diagram handle the fixture's document that has no items at all?
- How do hover preview and diagram content preview render an item whose text is empty versus one whose text spans many paragraphs?
- How do review/clear-suspect and the diagram's suspect indicator behave on the fixture's intentionally outdated (suspect) link?
- How do hover, go-to-definition, and the diagram handle the fixture's intentionally broken (dangling) link?
- What happens if a tester edits or deletes fixture data while working through the checklist — is there a documented way to restore the fixture to its known-good state before the next regression pass?
- What happens when the automated pipeline's environment cannot start the Doorstop server (e.g., a setup step fails)? The pipeline job must fail clearly and visibly rather than silently skipping the integration tests or reporting a false pass.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The test model MUST be a working Doorstop project (server-loadable) containing multiple documents arranged in a multi-level hierarchy (at least one root document and two child documents), reflecting realistic parent/child usage.
- **FR-002**: The test model's items MUST collectively cover every state the extension's currently shipped features read or act on: a plain item, an item with an upstream link, an item with a derived link, an item containing a heading, an item awaiting review, an item already reviewed, and an item whose suspect link has been cleared.
- **FR-003**: The test model MUST include at least one suspect link (an item whose upstream link is stale relative to the upstream item's current content) so review, clear-suspect, and diagram suspect-link indicators can each be exercised.
- **FR-004**: The test model MUST include at least one dangling link (a reference to an item UID that does not exist in the project) so link-related features' error handling can be exercised.
- **FR-005**: The test model MUST include at least one document with zero items, to exercise empty-state rendering in the explorer tree and in diagrams.
- **FR-006**: The test model MUST include both an item with minimal (near-empty) text and an item with long, multi-paragraph text, to exercise hover preview and diagram content preview rendering at both extremes.
- **FR-007**: The test model MUST include at least one persisted traceability diagram file that already references a mix of the fixture's items, so diagram creation, interaction, and rendering features can be exercised without first having to build a diagram from scratch.
- **FR-008**: The test model MUST be accompanied by a regression checklist document that maps each of the extension's currently shipped feature areas to the specific fixture document/item that exercises it and the expected observable outcome.
- **FR-009**: The regression checklist MUST be structured so it can be re-run in full after any code change or before any release, using only the fixture and the checklist (no additional setup, scripts, or external services beyond the local Doorstop server).
- **FR-010**: The test model MUST be stored in the repository at a fixed, documented location so it can be referenced consistently by manual testers and by automated tests.
- **FR-011**: The test model and checklist MUST exclude feature areas that are not yet implemented in the shipped extension at the time the fixture is created, so every checklist step is currently verifiable; the checklist MUST note which shipped feature areas it covers so newly implemented features can be added later.
- **FR-012**: An automated integration test suite MUST exercise the test model fixture, covering the same shipped feature areas as the manual regression checklist, without requiring a human to run or trigger it.
- **FR-013**: The automated integration test suite MUST run automatically as part of the repository's existing automated pipeline on every push and pull request, alongside the pipeline's other existing automated checks, rather than as a separate manually-invoked step.
- **FR-014**: When the automated integration test suite detects that a shipped feature no longer behaves as the fixture expects, the pipeline run MUST report a clear, visible failure attributable to that feature — consistent with how the pipeline already reports failures for its other checks — so the regression blocks the change before it merges.

### Key Entities

- **Test Model (Fixture Project)**: The sample Doorstop repository — its set of documents, items, links, and one persisted diagram — that stands in for a real user project during regression testing. Lives at a fixed path in the repository and is not shipped as part of the packaged extension.
- **Document**: A Doorstop document within the fixture (e.g., a root and its children), each playing a distinct role in coverage (populated, empty, deeply nested).
- **Item**: An individual requirement entry within a document, carrying the attributes needed to cover a specific extension behavior (links, derived links, headings, review state, suspect state, text length).
- **Regression Checklist**: A document mapping each shipped feature area to the fixture element(s) that exercise it and the expected outcome; the artifact a maintainer works through before release.
- **Diagram Fixture**: A persisted traceability diagram file, checked into the test model, referencing a subset of the fixture's items so diagram-related features have a ready starting point.
- **Automated Integration Test Suite**: The automated tests that exercise the fixture's shipped feature areas and run on their own as part of the repository's existing automated pipeline, giving the same coverage as the manual checklist without a human running it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A maintainer unfamiliar with the fixture can complete a full manual regression pass covering every currently shipped feature area in under 30 minutes using only the test model and the checklist.
- **SC-002**: 100% of the extension's currently shipped feature areas have at least one corresponding verification step in the checklist that references a specific fixture document or item.
- **SC-003**: A maintainer can identify which fixture item or document to use for verifying any given shipped feature within 2 minutes of opening the checklist, without reading extension source code.
- **SC-004**: The test model requires no manual setup beyond opening the fixture folder in VS Code (no scripts to run, no external accounts, no network access) before the checklist can be started.
- **SC-005**: After a regression pass, the fixture can be restored to its known-good starting state in under 5 minutes, so the same fixture supports repeated passes across releases without drifting.
- **SC-006**: A deliberately introduced regression in a shipped feature is caught and visibly reported by the automated pipeline on its next run against a push or pull request, with no maintainer needing to manually trigger a test or notice the problem themselves.

## Assumptions

- "All features" is scoped to the extension's currently shipped feature areas — those already present in the codebase at the time this test model is built (server connection & lifecycle, explorer & commands panel, item lifecycle commands, document utilities, CodeLens & autocompletion, hover & navigation, diagram core, diagram interaction, go-to-definition & usage navigation, and the treeview auto-reveal toggle). Feature areas still in specification/design (e.g., diagram ghost items & content preview) are out of scope until they ship, per FR-011.
- The test model is a static, checked-in fixture rather than a generated-on-demand project; it is regenerated manually if the extension's data model changes in a way the fixture no longer represents.
- "Stable" in the user's request is addressed indirectly: this feature produces the test model and checklist that make regressions detectable before release; it does not itself change runtime behavior of the extension.
- The regression checklist is a living document maintained alongside the fixture — updated when either the fixture or the shipped feature set changes — rather than a one-time snapshot.
- One shared fixture project is sufficient to cover every shipped feature area at a basic level; the feature does not require separate fixtures per feature area.
- The manual regression checklist (User Stories 1 & 2) and the automated integration test suite (User Story 3) are expected to cover the same fixture and the same shipped feature areas, kept in sync as a single source of truth for "what regression coverage exists" rather than drifting into two separate lists.
- "The repository's existing automated pipeline" refers to the CI workflow already present in this repository (which currently builds/packages the extension and runs the server's test suite); this feature extends that same pipeline with an integration test job rather than standing up a new or separate automation system.
- Automated integration tests exercising the VS Code extension itself (not just the server) are assumed to be a currently-missing but addable job in that same pipeline; no new external CI provider or paid service is introduced.
