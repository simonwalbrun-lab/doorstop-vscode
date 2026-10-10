<!--
Sync Impact Report
==================
Version change: 1.3.0 → 1.4.0
Rationale for 1.4.0: MINOR — a new principle (VIII. Every Functional
Requirement Has a Traceable Automated Test) was added, raising the test floor
from one test per feature to one test per functional requirement, with a
mandatory trace comment linking each test to its spec and requirement ID.
No principle was removed.

Added principles:
  - VIII. Every Functional Requirement Has a Traceable Automated Test (NON-NEGOTIABLE)

Modified principles:
  - VI. Every Feature Ships With a CI-Runnable Test: the "Basic is the floor"
    bullet now points to Principle VIII for the per-requirement floor.

Modified sections:
  - Development Workflow: feature completeness now also requires every FR ID
    in the spec to appear in at least one test trace comment.

Added sections: none
Removed sections: none
Deferred / TODO placeholders: none.

Follow-up (non-governance): existing tests are not retrofitted by this
amendment; specs 001–026 predate Principle VIII.

---
Prior report (1.3.0, superseded by the above):
Version change: 1.2.0 → 1.3.0
Rationale for 1.3.0: MINOR — Principle VII's trigger was redefined from
"expected to take longer than one second" (toast shown at start) to "still
running after one second" (toast shown by the 1 s mark at the latest), decided
at spec 026 clarification. Added explicit rules for user-input wait time and
exempt background/editor-native work. No principle was removed.

Modified principles:
  - VII. Long-Running Operations Are Always Visible (trigger redefined)

Added sections: none
Removed sections: none
Deferred / TODO placeholders: none.

---
Prior report (1.2.0, superseded by the above):
Version change: 1.1.0 → 1.2.0
Rationale for 1.2.0: MINOR — a new principle (VII. Long-Running Operations Are
Always Visible) was added. No existing principle was removed or redefined.

Added principles:
  - VII. Long-Running Operations Are Always Visible

Modified principles: none
Added sections: none
Removed sections: none

Deferred / TODO placeholders: none.

Templates requiring follow-up: none updated by this command per the Scope Guard —
downstream templates (plan/spec/tasks) read this file at runtime.

Follow-up (non-governance): existing commands have not been audited for
compliance with Principle VII; some already use vscode.window.withProgress
(src/extension.ts, src/doorstopCommands.ts), others may not.

---
Prior report (1.1.0, superseded by the above):
Version change: 1.0.1 → 1.1.0
Rationale for 1.1.0: MINOR — a new principle (VI. Every Feature Ships With a
CI-Runnable Test) was added and the Development Workflow section was materially
expanded with a CI gate. No existing principle was removed or redefined in a
backward-incompatible way.

Added principles:
  - VI. Every Feature Ships With a CI-Runnable Test (NON-NEGOTIABLE)

Modified sections:
  - Development Workflow: added the requirement that the per-feature test from
    Principle VI runs in the GitHub Actions CI workflow, and that a change is
    not merged while any CI job is failing.
  - Principle V: unchanged in substance; a cross-reference to Principle VI was
    appended to its rationale so the two testing rules read as one policy —
    per-change quality gates in V, per-feature coverage floor in VI.

Added sections: none
Removed sections: none

Deferred / TODO placeholders: none — the CI jobs referenced (server-tests,
extension-build, extension-integration-tests) already exist in
.github/workflows/ci.yml, and both suites referenced (server/tests via pytest,
src/test via vscode-test) already exist in the repository.

Templates requiring follow-up: none checked/updated by this command per the Scope Guard —
downstream templates (plan/spec/tasks) read this file at runtime and are not modified here.

---
Prior report (1.0.1, superseded by the above):
Version change: 1.0.0 → 1.0.1
Rationale for 1.0.1: PATCH — trimmed the Development Workflow section; no
principle was added, removed, or redefined.

Modified sections:
  - Development Workflow: removed the CHANGELOG.md entry-format requirement
    (too implementation-detail-level for a constitution; belongs in
    CONTRIBUTING-style docs, not a MUST a PR can be blocked on here).

Modified principles: none
Added sections: none
Removed sections: none (Development Workflow retained, just narrowed)

Deferred / TODO placeholders: none.

---
Prior report (1.0.0, superseded by the above):
Version change: (unratified template) → 1.0.0
Rationale for 1.0.0: initial ratification — the file previously held only unfilled
[PLACEHOLDER] tokens from the template, so this is the project's first concrete
constitution rather than an amendment.

Added principles (five, per user-supplied input):
  - I. Server Is the Single Source of Truth
  - II. No Reinvention of Doorstop Functionality
  - III. All Features Must Include Error Handling
  - IV. No External Dependencies Without Justification
  - V. Typed, Linted, and Tested Before It Ships

Added sections:
  - Additional Constraints
  - Development Workflow
  - Governance (procedure + versioning policy)

Deferred / TODO placeholders: none — principle wording came directly from the
user, and supporting detail/rationale was derivable from repo context
(README.md, doc/arc42/2000_introduction_and_goals.md, doc/arc42/01_arc42-in-a-nutshell-help.md,
CHANGELOG.md, package.json scripts, git history).
-->

# Doorstop Requirements for VS Code Constitution

## Core Principles

### I. Server Is the Single Source of Truth

All requirement discovery, parsing, hierarchy computation, and mutation (create,
link, derive, review, clear-suspect, reorder, import, export, publish) MUST go
through the Python server wrapping the Doorstop API. The TypeScript extension
MUST NOT re-implement Doorstop file parsing or duplicate business logic on the
client side; UI surfaces (TreeView, hover provider, diagram canvas, CodeLens)
read and write exclusively through the server's API. Concurrent requests
reaching the server MUST be processed one at a time so no two mutations race
against the same Doorstop repository.

Rationale: an earlier design had the extension re-parse files itself, which
could disagree with Doorstop's own generated index; consolidating on one
server implementation keeps behavior consistent, confines the blast radius of
a Doorstop API change to one adapter layer, and the single-writer discipline
prevents concurrent mutations from corrupting the underlying repository.

### II. No Reinvention of Doorstop Functionality

If Doorstop already implements a capability — parsing, validation, linking,
numbering, publish, the review/suspect-link workflow, etc. — the project MUST
call into Doorstop's own API/library for it rather than reimplementing
equivalent logic in the server or the extension. Hand-rolled logic is only
acceptable where Doorstop has no equivalent capability.

Rationale: duplicated logic is exactly what let the extension's view and
Doorstop's own generated state disagree in the past; there must be exactly one
implementation of any given Doorstop behavior to fix or trust.

### III. All Features Must Include Error Handling

Every feature — extension command, webview interaction, or server endpoint —
MUST handle failure explicitly as part of its initial implementation, not as a
follow-up. Server errors MUST surface as structured, typed responses (e.g.
`{"error": {...}}`) rather than raw, unhandled exceptions. Extension-side
failures (for example, a metadata fetch against a stale or unrestarted server)
MUST fall back to an explicit, safe state — such as rendering exactly what is
already on disk — instead of silently discarding user data or state.

Rationale: two real incidents motivate this — a request-serialization
middleware that let an unexpected exception bypass the structured error path,
and a diagram loader whose metadata-fetch failure looked indistinguishable
from data loss. Both were fixed by treating failure paths as first-class, not
by hardening only the happy path after the fact.

### IV. No External Dependencies Without Justification

Adding a new runtime or development dependency (an npm package or a Python
package) MUST come with explicit justification recorded in the PR/commit:
what capability it provides that the existing stack (VS Code Extension API,
esbuild, FastAPI, Doorstop, vis-network) does not, and why implementing it
directly would be worse. Dependencies MUST NOT be added purely for
convenience or because "it's what's usually used."

Rationale: every added dependency widens the extension's install footprint and
the server's `pip install` surface, and is one more thing that could hide a
correctness or supply-chain problem behind a version bump nobody reviewed.

### V. Typed, Linted, and Tested Before It Ships

TypeScript changes MUST pass type-checking (`check-types`) and linting
(`lint`) before being packaged — these already gate `npm run package` and
`pretest` and MUST NOT be bypassed. Server (Python) changes affecting
requirement CRUD, linking, review/clear, reorder, import/export/publish,
error-response shape, or concurrency behavior MUST be covered by the
`server/tests` pytest suite, which exercises the FastAPI app against a real
temporary Doorstop project; mocking Doorstop itself in these tests is
prohibited, since it can hide exactly the kind of divergence Principles I and
II exist to prevent.

Rationale: this codifies practice the project already follows — the build
scripts already enforce type/lint gates, and the existing server suite
already validates against real Doorstop projects instead of mocks. This
principle sets the per-change quality gate; Principle VI sets the per-feature
coverage floor.

### VI. Every Feature Ships With a CI-Runnable Test (NON-NEGOTIABLE)

Every feature MUST land together with at least one automated test that
exercises its primary success path end to end, and that test MUST run
unattended in CI on every pull request. Concretely:

- The test MUST live in a suite CI already executes — `server/tests` (pytest)
  for server-side behavior, `src/test` (vscode-test) for extension-side
  behavior — or in a new suite wired into `.github/workflows/ci.yml` as part
  of the same change.
- The test MUST be non-interactive, headless-safe, and independent of
  developer-machine state: no reliance on a pre-existing Doorstop project on
  disk, a manually started server, network access, or a fixed port being free.
  Fixtures MUST create the state they need — as `server/tests` already does
  with temporary Doorstop projects — and clean it up.
- The test MUST be deterministic. A flaky test MUST be fixed or removed, never
  left red or retried until green, and MUST NOT be silenced with a skip marker
  to unblock a merge.
- "Basic" is the floor, not the ceiling: one test proving the feature actually
  works is required, and Principle VIII additionally requires a test per
  functional requirement. Broader edge-case coverage is encouraged where the
  feature's failure modes warrant it, and Principle III's error paths SHOULD
  be covered whenever the failure behavior is user-visible.
- A feature MAY ship without a new test only when an existing CI test already
  covers its behavior; the PR/commit MUST name that test explicitly.

Rationale: this project's regressions have consistently been integration-level
disagreements between the extension, the server, and Doorstop's own state —
exactly the class of bug only a test running the real stack catches. A test
that runs solely on the author's machine does not prevent the next regression,
so the CI-runnable property is part of the requirement rather than a separate
concern.

### VII. Long-Running Operations Are Always Visible

The user MUST always be able to tell that a longer-running operation is in
progress. Any command or user-triggered operation whose work is still running
one second after it started MUST show a VS Code progress notification (toast,
via `vscode.window.withProgress` with `ProgressLocation.Notification`) until
it finishes. Whether a toast is needed is decided by the actual run time, not
by a list of commands judged slow in advance, because the same operation can be
fast on a small project and slow on a large one. Concretely:

- The toast MUST be visible no later than one second after the work started,
  and MUST stay visible until the operation finishes, whether it succeeds,
  fails, or is cancelled. It MUST NOT be dismissed early while work is still
  running in the background.
- Work that finishes within one second MUST NOT show a toast, so fast
  operations cause no flicker. An operation that always takes longer than one
  second (e.g. installing the server package) MAY show its toast immediately.
- Time spent waiting for user input (prompts, pickers, confirmations) MUST NOT
  count towards the one second and MUST NOT be covered by a toast.
- The toast MUST name the operation in user-facing terms (e.g. "Publishing
  requirements…"), not an internal command ID.
- When the operation fails, the toast MUST close and the failure MUST be
  reported per Principle III; a progress toast never replaces an error message.
- Operations that can be safely aborted SHOULD offer cancellation through the
  toast.
- Background work the user did not explicitly trigger (e.g. a debounced
  re-check after an edit) and editor-native features that already show their
  own running indicator (hover, completion, notebook cells) are exempt.

Rationale: several commands round-trip through the Python server and Doorstop
and can take seconds; without visible feedback the user cannot tell a slow
operation from a hung or ignored command and is likely to trigger it again,
which can lead to duplicate mutations.

### VIII. Every Functional Requirement Has a Traceable Automated Test (NON-NEGOTIABLE)

Every functional requirement (`FR-NNN`) in a feature spec MUST be covered by at
least one automated test, and every such test MUST state in a comment which
spec and requirement ID(s) it is derived from. Concretely:

- The test MUST meet all rules of Principle VI (lives in a CI-run suite,
  headless, deterministic, self-contained fixtures).
- The trace comment MUST sit directly above or at the start of the test
  function and use the form `Spec <NNN> FR-<NNN>`, where `<NNN>` is the
  numeric prefix of the `specs/<NNN>-<name>/` directory, e.g.
  `# Spec 026 FR-001` (Python) or `// Spec 026 FR-001, FR-003` (TypeScript).
  The form is fixed so coverage can be checked by plain text search.
- One test MAY cover several requirements and one requirement MAY be covered
  by several tests; each such test lists every FR ID it verifies.
- When a requirement is changed, renumbered, or removed, the trace comments
  that reference it MUST be updated in the same change. A trace comment MUST
  NOT reference an FR ID that no longer exists in its spec.
- A requirement that cannot be checked by an automated test is a defect in
  the spec: it MUST be reworded until it is testable, not left uncovered.
- This applies to every spec whose implementation starts on or after
  2026-10-10. Tests for older specs are not retrofitted, but a test added or
  changed for an older spec's requirement MUST carry a trace comment.

Rationale: a single happy-path test per feature (Principle VI) leaves most
requirements unverified, so a regression in any of them goes unnoticed. A
test per requirement, with a searchable trace back to the spec, shows at a
glance which requirements are covered and which tests must change when a
requirement does.

## Additional Constraints

- Stack: the extension is TypeScript on the VS Code Extension API, bundled
  with esbuild; the backend is Python (FastAPI + the `doorstop` package), run
  as a local server per `server/`.
- Diagram files (`*.doorstop.json`) MUST store workspace-relative requirement
  paths (for portability across machines/checkouts), open through a VS Code
  custom editor, and participate in standard Save / Save As / Revert / backup
  flows rather than a bespoke persistence mechanism.
- Graph rendering and interaction (layout, hit-testing, dragging, zoom) is
  delegated to `vis-network`; per Principle IV, do not hand-roll graph
  interaction primitives it already provides.

## Development Workflow

- Before a change is considered done: extension changes MUST pass
  `npm run compile` (type-check + lint + build); server changes touching the
  areas listed in Principle V MUST pass the `server/tests` pytest suite.
- Every feature branch MUST leave CI green. The CI workflow
  (`.github/workflows/ci.yml`) runs the server pytest suite, the extension
  build/package, and the extension integration tests on every pull request.
  A change MUST NOT be merged while any of those jobs is failing, and CI jobs
  MUST NOT be disabled or narrowed to make a change pass.
- A feature is not complete until its Principle VI test exists and passes in
  CI, and every `FR-NNN` ID in its `spec.md` appears in at least one test's
  Principle VIII trace comment. Deferring those tests to a follow-up change
  does not satisfy this.
- Prefer the smallest change that satisfies Principles I–IV; new abstraction
  layers or dependencies must be justified against those principles, not
  added speculatively.

## Governance

This constitution supersedes ad hoc practice for this repository. Amendments
are made by editing this file directly: propose the change, update the
affected principle(s) or section(s), increment `CONSTITUTION_VERSION` per
semantic versioning (MAJOR: a principle is removed or redefined in a
backward-incompatible way; MINOR: a principle or section is added or
materially expanded; PATCH: wording/clarification with no behavioral change),
and refresh the Sync Impact Report at the top of this file.

Every change touching requirement data handling, the server API, or diagram
persistence SHOULD be checked against the principles above before merge.
Unjustified complexity, or a deliberate deviation from a principle, MUST be
called out explicitly (e.g. in the PR/commit description) rather than left
implicit.

**Version**: 1.4.0 | **Ratified**: 2026-09-09 | **Last Amended**: 2026-10-10
