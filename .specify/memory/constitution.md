<!--
Sync Impact Report
==================
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

Templates requiring follow-up: none checked/updated by this command per the Scope Guard —
downstream templates (plan/spec/tasks) read this file at runtime and are not modified here.

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
already validates against real Doorstop projects instead of mocks.

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

**Version**: 1.0.1 | **Ratified**: 2026-09-09 | **Last Amended**: 2026-09-09
