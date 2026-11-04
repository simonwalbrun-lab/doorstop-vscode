<!--
Sync Impact Report
==================
Version change: 1.7.0 → 2.0.0
Rationale for 2.0.0: MAJOR. Rules were removed or redefined, not only added:
Principle I loses the 20% response-time rule and the CPython advice (both now
live only in spec 032); Principle VIII gains an exemption for
documentation-only specs; the diagram-persistence and vis-network constraints
leave the constitution. Four principles (IX–XII) are also added.

Modified principles:
  - I. Server Is the Single Source of Truth (background work and cancellation
    cut to three rules; 20% figure, measurement and GIL advice moved to spec 032)
  - III. All Features Must Include Error Handling (rationale cut to one sentence)
  - V. Typed, Linted, and Tested Before It Ships (typed ESLint config,
    no-floating-promises, --max-warnings 0, windows-latest, minimum VS Code
    version, audit gate; rationale trimmed)
  - VI. Every Feature Ships With a CI-Runnable Test (tests check runtime
    behaviour, not source text)
  - VIII. Every Functional Requirement Has a Traceable Automated Test
    (documentation-only exemption, CI FR-coverage check, older providers)

Added principles:
  - IX. Repository Content and Local Callers Are Untrusted
  - X. Activation Never Blocks, and Nothing Outlives the Extension
  - XI. Fast on Large Projects
  - XII. Native, Accessible UX Following the VS Code UX Guidelines

Modified sections:
  - Additional Constraints (*.doorstop.json and vis-network bullets moved to
    doc/architecture.md, which already describes them)
  - Development Workflow (spec status lifecycle, superseded FRs, README and
    CHANGELOG in done, [manual] tasks)
  - Governance (per-principle Constitution Check table in plan.md is a MUST)

Removed sections: all prior Sync Impact Reports (kept in git history).
Deferred / TODO placeholders: none.

Follow-up (non-governance): see "Known violations" at the end of each new
principle's rationale; spec 032 plan.md still cites "the constitution's 20%
tolerance" and should cite its own SC-001 instead.

History (details in git):
| Version | Date       | Change                                                  |
|---------|------------|---------------------------------------------------------|
| 1.0.0   | 2026-09-09 | Initial ratification, principles I–V                    |
| 1.0.1   | —          | Dropped CHANGELOG entry-format rule                     |
| 1.1.0   | —          | Added VI (CI-runnable test per feature)                 |
| 1.2.0   | —          | Added VII (long-running operations visible)             |
| 1.3.0   | —          | VII trigger changed to "still running after 1 s"        |
| 1.4.0   | —          | Added VIII (traceable test per FR)                      |
| 1.5.0   | —          | I: cancellation for a closed list of reasons            |
| 1.6.0   | —          | I: background validation in a separate process          |
| 1.7.0   | 2026-10-18 | V: linting mandatory for TypeScript and Python          |
| 2.0.0   | 2026-11-01 | Trimmed I/III/V; added IX–XII; workflow and governance  |
-->

# Doorstop Requirements for VS Code Constitution

## Core Principles

### I. Server Is the Single Source of Truth

All requirement discovery, parsing, hierarchy computation, and mutation (create,
link, derive, review, clear-suspect, reorder, import, export, publish) MUST go
through the Python server wrapping the Doorstop API. The TypeScript extension
MUST NOT re-implement Doorstop file parsing or duplicate business logic on the
client side; UI surfaces read and write exclusively through the server's API.
Requests reaching the server MUST be processed one at a time so no two
mutations race against the same Doorstop repository. Three rules govern work
that runs beside or interrupts that queue:

- Background work (e.g. validation the user is not waiting on) MUST NOT hold
  the request lock or any other lock that requests need.
- Background work MUST be read-only and MUST work on its own copy of the
  project (e.g. its own Doorstop tree loaded from disk), never on objects that
  requests read or mutate.
- A running request MAY be cancelled only for one of these reasons: the user
  cancelled it; its result became obsolete (superseded, or its feature was
  switched off); it is untriggered read-only background work giving way to an
  interactive request; the server is shutting down. A mutation MUST NOT be
  cancelled once it has started writing. A cancelled request ends with a
  structured "cancelled" response (Principle III) that the extension treats as
  a cancellation, not an error. The plan MUST name each cancellation point and
  its reason.

Rationale: one server implementation keeps behaviour consistent with Doorstop's
own state and confines a Doorstop API change to one adapter; the single-writer
rule and the three rules above keep the repository from being corrupted while
long read-only work stays out of the user's way. How a feature meets these
rules (process vs. thread, response-time targets) belongs in its spec.

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

Rationale: past failures that bypassed the structured error path looked like
data loss to the user, and were only fixed by treating failure as first-class.

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

Linting is mandatory for all code in this repository. Every language in use
MUST have an established linter, configured in a committed file, and all code
MUST pass it before it is merged:

- TypeScript: ESLint (`eslint.config.mjs`, run as `npm run lint`) using the
  recommended type-checked config plus `@typescript-eslint/no-floating-promises`,
  run with `--max-warnings 0`.
- Python (`server/`): pylint (configured in `server/pyproject.toml`, installed
  via the `dev` extra).
- A new language or file type added to the repository MUST come with a linter
  in the same change.
- Lint MUST run in CI (`.github/workflows/ci.yml`) and a failing lint job
  blocks merge. A rule MAY be disabled only in the linter configuration or on
  the affected line, with a comment giving the reason; blanket suppression of a
  whole file or rule set is prohibited.

TypeScript changes MUST also pass type-checking (`check-types`); type-checking
and `lint` gate `npm run package` and `pretest` and MUST NOT be bypassed.
Server changes affecting requirement CRUD, linking, review/clear, reorder,
import/export/publish, error-response shape, or concurrency MUST be covered by
the `server/tests` pytest suite against a real temporary Doorstop project;
mocking Doorstop itself is prohibited.

CI MUST run on `ubuntu-latest` and `windows-latest`, and the extension tests
MUST run against both the minimum `engines.vscode` version and stable VS Code.
A high or critical finding from `npm audit` or `pip-audit` in a shipped
(non-dev) dependency blocks a release until it is fixed or explicitly
justified per Principle IV.

Rationale: a linter catches defects review misses (unawaited promises above
all in an async extension); the server suite runs against real Doorstop so it
catches the divergence Principles I and II exist to prevent; process-spawn and
path code behaves differently on Windows; `engines.vscode` is a promise only a
test against that version keeps.

### VI. Every Feature Ships With a CI-Runnable Test (NON-NEGOTIABLE)

Every feature MUST land together with at least one automated test that
exercises its primary success path end to end, and that test MUST run
unattended in CI on every pull request. Concretely:

- The test MUST live in a suite CI already executes — `server/tests` (pytest)
  for server-side behavior, `src/test` (vscode-test) for extension-side
  behavior — or in a new suite wired into `.github/workflows/ci.yml` as part
  of the same change.
- The test MUST check runtime behaviour. A test that only inspects source text
  (e.g. greps a file for a call or a string) does not count.
- The test MUST be non-interactive, headless-safe, and independent of
  developer-machine state: no reliance on a pre-existing Doorstop project on
  disk, a manually started server, network access, or a fixed port being free.
  Fixtures MUST create the state they need and clean it up.
- The test MUST be deterministic. A flaky test MUST be fixed or removed, never
  left red or retried until green, and MUST NOT be silenced with a skip marker
  to unblock a merge.
- "Basic" is the floor, not the ceiling: Principle VIII additionally requires a
  test per functional requirement. Principle III's error paths SHOULD be
  covered whenever the failure behavior is user-visible.
- A feature MAY ship without a new test only when an existing CI test already
  covers its behavior; the PR/commit MUST name that test explicitly.

Rationale: this project's regressions have consistently been integration-level
disagreements between the extension, the server, and Doorstop's own state —
the class of bug only a test running the real stack catches. A source-text
check passes while the behaviour is broken (spec 031 T024 had to be reworked
for exactly this reason).

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

- The test MUST meet all rules of Principle VI.
- The trace comment MUST sit directly above or at the start of the test
  function and use the form `Spec <NNN> FR-<NNN>`, where `<NNN>` is the
  numeric prefix of the `specs/<NNN>-<name>/` directory, e.g.
  `# Spec 026 FR-001` (Python) or `// Spec 026 FR-001, FR-003` (TypeScript).
- One test MAY cover several requirements and one requirement MAY be covered
  by several tests; each such test lists every FR ID it verifies.
- A CI step MUST compare the FR IDs in each in-scope `spec.md` with the trace
  comments and fail on any uncovered FR or any trace comment naming an FR that
  no longer exists.
- When a requirement is changed, renumbered, or removed, the trace comments
  that reference it MUST be updated in the same change.
- A requirement that cannot be checked by an automated test is a defect in
  the spec: it MUST be reworded until it is testable, not left uncovered.
- Exemption: a spec whose deliverable is documentation only (e.g. spec 033)
  MUST state "Test exemption: documentation-only" in its `spec.md` with a
  one-line reason, and its FRs are verified by a review checklist in the spec
  folder instead. No other exemption exists.
- This applies to every spec whose implementation starts on or after
  2026-10-10. Tests for older specs are not retrofitted, but changing the
  behaviour of an older, untested provider or module MUST add a test with a
  trace comment for the behaviour that changed.

Rationale: a single happy-path test per feature (Principle VI) leaves most
requirements unverified. The fixed trace form makes coverage checkable by a
script, and a written, checklist-backed exemption keeps "NON-NEGOTIABLE"
meaningful instead of quietly ignored.

### IX. Repository Content and Local Callers Are Untrusted

Item text, repository files, workspace settings and anything reaching the
local server are treated as attacker-controlled. Concretely:

- `MarkdownString`s built from item or repository text MUST NOT set
  `isTrusted = true`; when command links are needed they MUST use
  `isTrusted: { enabledCommands: [...] }` listing only the commands required.
- Webviews MUST use a Content-Security-Policy starting from
  `default-src 'none'`, with scripts allowed only by nonce;
  `localResourceRoots` MUST be limited to the folders the webview actually
  loads from; every message from a webview MUST be validated at runtime before
  use; a file path in such a message MUST resolve inside the workspace or be
  rejected.
- A setting that selects an executable, a network endpoint or credentials MUST
  use `machine` or `application` scope, so a cloned repository cannot set it.
- Credentials MUST be stored only in `context.secrets`, never in settings,
  files or logs.
- `package.json` MUST declare `capabilities.untrustedWorkspaces`, and the
  extension MUST check `vscode.workspace.isTrusted` before spawning a process
  or running `pip`.
- The local server MUST bind to `127.0.0.1` only, MUST reject any request
  carrying an `Origin` header, and MUST require a per-session token generated
  by the extension at start-up.

Rationale: opening a repository must not let its content run commands, read
files outside the workspace, redirect signed uploads, or reach the server from
a browser page. Known violations at ratification: hover Markdown is trusted
(`src/hoverProvider.ts:42,62`); `doorstop.objectStorage.endpoint` has
`resource` scope.

### X. Activation Never Blocks, and Nothing Outlives the Extension

- `activate()` MUST register every command, view and provider before doing
  anything else, and MUST NOT await the server, the network or a user prompt;
  those run afterwards and report their state through the UI.
- Every `Disposable` MUST be added to `context.subscriptions`, and
  `deactivate()` MUST return the server's shutdown promise.
- Child processes MUST exit when the extension host exits, including when it
  is killed.
- Two VS Code windows MUST be able to run the extension at the same time
  without port collisions (e.g. the server picks a free port and reports it).
- Providers MUST pass their `CancellationToken` on to the work they start and
  stop when it is cancelled.

Rationale: a command that is missing because activation is still waiting is
indistinguishable from a broken extension, and an orphaned server holds the
port for the next window. Known violations at ratification: an ignored
"Install" toast leaves every command unregistered; the server port is fixed
at 7867.

### XI. Fast on Large Projects

- Every plan MUST state how many server requests each user action makes. One
  user action MUST make O(1) requests, not one per item.
- Hover, completion and go-to-definition MUST NOT fetch the whole tree per
  call; they MUST use a cache that is dropped when the tree changes.
- Work triggered on every keystroke MUST be debounced.
- Server file scans MUST skip `node_modules`, and blocking Doorstop calls MUST
  NOT run on the server's event loop.
- One committed large fixture is the reference project size for these rules
  and for performance claims in specs.

Rationale: per-item requests and per-call tree fetches are invisible on a
demo project and unusable on a real one. Known violation at ratification:
saving the document view sends one request per changed item.

### XII. Native, Accessible UX Following the VS Code UX Guidelines

- Native UI (tree views, quick picks, notifications, editors) MUST be used
  before a webview; a webview needs a stated reason in the plan.
- Every contributed command MUST have `"category": "Doorstop"` and MUST either
  be reachable from the Command Palette or be hidden there on purpose via
  `menus.commandPalette` with a `when` clause.
- Webview colours MUST come only from `--vscode-*` CSS variables.
- Webviews MUST be fully usable by keyboard, MUST carry ARIA labels on
  interactive elements, and MUST be checked in a high-contrast theme.
- Production code MUST log through one `LogOutputChannel`, not `console.*`.
- Localization via `vscode.l10n` MAY be adopted; it is not required until the
  project decides to ship translations.

Rationale: native UI and theme variables inherit accessibility, theming and
keyboard support for free; a single log channel is where users and
maintainers look when something fails. Localization is a cost on every string
and only pays off once translations exist.

## Additional Constraints

- Stack: the extension is TypeScript on the VS Code Extension API, bundled
  with esbuild; the backend is Python (FastAPI + the `doorstop` package), run
  as a local server per `server/`.
- Product design decisions (diagram file format, graph library, container
  structure) live in `doc/architecture.md`, not in this constitution.

## Development Workflow

- Before a change is considered done: extension changes MUST pass
  `npm run compile` (type-check + lint + build); all server changes MUST pass
  pylint, and those touching the areas listed in Principle V MUST pass the
  `server/tests` pytest suite.
- Every feature branch MUST leave CI green. The CI workflow
  (`.github/workflows/ci.yml`) runs the linters, the FR-coverage check, the
  server pytest suite, the extension build/package, and the extension
  integration tests on every pull request. A change MUST NOT be merged while
  any of those jobs is failing, and CI jobs MUST NOT be disabled or narrowed
  to make a change pass.
- A feature is not complete until its Principle VI test exists and passes in
  CI, every `FR-NNN` in its `spec.md` is traced per Principle VIII, `README.md`
  reflects the feature, and the `CHANGELOG.md` "Unreleased" section has an
  entry for it. Deferring any of these to a follow-up change does not satisfy
  this.
- Spec status MUST move `Draft` → `Implemented` → `Superseded` or `Abandoned`.
  A spec is set to `Implemented` in the change that completes it.
- A change to a functional requirement of an earlier spec MUST, in the same
  change, add `Superseded by <NNN> FR-<x>` to that earlier FR.
- Quickstart tasks that need a human MUST be marked `[manual]` in `tasks.md`;
  they do not block `Implemented`.
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
and replace the Sync Impact Report at the top of this file, adding one row to
its history table.

Every `plan.md` MUST contain a Constitution Check table with one row per
principle, each marked PASS, N/A (with reason) or a justified deviation.
Unjustified complexity, or a deliberate deviation from a principle, MUST be
called out explicitly in that table and in the PR/commit description rather
than left implicit.

**Version**: 2.0.0 | **Ratified**: 2026-09-09 | **Last Amended**: 2026-11-01
