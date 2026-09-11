# Implementation Plan: Prompt to Install Missing Server Package

**Branch**: `016-install-server-package` | **Date**: 2026-09-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/016-install-server-package/spec.md`

## Summary

Before spawning `python -m doorstop_server` in `DoorstopServer.start`/`restart`
(`src/doorstopServer.ts`), check whether the `doorstop_server` module is importable
in the selected interpreter (`python -c "import importlib.util,sys; ..."`). If it
is not, `startDoorstopServer` in `src/extension.ts` shows a warning notification
("Install" / "Dismiss") instead of attempting to start the server and surfacing the
generic `ModuleNotFoundError` failure it produces today. Clicking "Install" runs
`python -m pip install doorstop-vscode-server` (the interpreter's own installer,
against the real PyPI package this repo already publishes — see
`server/.github/workflows/publish.yml`) with progress feedback, then starts the
server automatically on success or shows the captured pip output on failure. No
server or webview code changes; everything lives in the extension host.

## Technical Context

**Language/Version**: TypeScript 5.x (extension host only).

**Primary Dependencies**: VS Code Extension API; Node's built-in `node:child_process`
(already used by `DoorstopServer` to spawn the server itself). **No new dependency is
introduced** (Constitution IV) — the package check and the install both reuse the
same "spawn the selected interpreter" mechanism `doorstopServer.ts` already uses.

**Storage**: N/A — no new persisted state. (An in-memory "install in progress" guard
is process-lifetime only, not persisted.)

**Testing**: `@vscode/test-cli` suites under `src/test` (Node/Mocha inside a VS Code
host). The check/install logic is written as pure, dependency-injected functions
(spawn function passed in) so tests can substitute a fake process instead of a real
Python interpreter or network call — no `server/tests` involvement (no server code
changes).

**Target Platform**: VS Code desktop extension host.

**Project Type**: VS Code extension, single project (no new subproject).

**Performance Goals**: The presence check MUST NOT noticeably delay startup versus
today — a plain `python -c "..."` exit is expected to complete in well under a
second, far faster than the server's own health-check wait. Install duration is
network-bound and outside this feature's control; SC-002 only requires it to
complete without manual terminal use, not within a fixed time budget.

**Constraints**: Must reuse the existing "resolve active interpreter" path
(`getActivePythonPath` in `src/extension.ts`) rather than re-resolving it
independently, so the checked/installed-into interpreter is always the one that
would have started the server. Must not start a second install for the same
interpreter while one is in flight (FR-008).

**Scale/Scope**: One check per server-start attempt (initial activation and
"Doorstop: Restart Server"). Touched files: `src/doorstopServer.ts` (or a small new
sibling module) for the check/install primitives, `src/extension.ts` for wiring the
notification flow into `startDoorstopServer`, plus new tests under `src/test`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Assessment | Verdict |
| --- | --- | --- |
| **I. Server is the single source of truth** | This feature never touches the Doorstop tree/API; it only decides whether to spawn the server process at all. Nothing about requirement data is duplicated or bypassed. | PASS |
| **II. No reinvention of Doorstop functionality** | Not applicable — package presence/installation is an environment-setup concern, not a Doorstop capability. | PASS |
| **III. All features must include error handling** | A failed presence check, a failed install, and a concurrent install attempt are all explicit, user-visible outcomes (FR-007, FR-008) rather than silent failures or crashes — extending the same try/catch + `showWarningMessage` pattern `startDoorstopServer` already uses. | PASS |
| **IV. No external dependencies without justification** | Zero new npm or Python dependencies. The check and install both spawn the already-selected interpreter, exactly as `DoorstopServer.start` does today. | PASS |
| **V. Typed, linted, tested before it ships** | Gated by `npm run compile` (check-types + lint + esbuild). No server-side CRUD/linking/concurrency behavior changes, so `server/tests` needs no addition. | PASS |
| **VI. Every feature ships with a CI-runnable test** | The presence-check and install-command logic is written as pure functions taking an injectable spawn function, so `src/test` can exercise both the "module present," "module missing," "install succeeds," and "install fails" paths with a fake process — deterministic, no real Python interpreter, network, or fixed port required. See [quickstart.md](./quickstart.md) §Automated. | PASS |

**Result**: No violations. Complexity Tracking section omitted — nothing to justify.

## Project Structure

### Documentation (this feature)

```text
specs/016-install-server-package/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md         # Phase 1 output
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

No `contracts/` directory: this feature exposes no API, webview message, or other
interface consumed by another system — it is entirely internal notification/process
plumbing inside the extension host.

### Source Code (repository root)

```text
src/
├── doorstopServer.ts          # CHANGED: export `isServerPackageInstalled` and
│                               #   `installServerPackage` (spawn-based, injectable),
│                               #   sitting alongside the existing spawn-based
│                               #   `start`/`restart` for the same interpreter
├── extension.ts                # CHANGED: `startDoorstopServer` checks package
│                               #   presence before spawning; on missing, shows the
│                               #   install notification and wires
│                               #   Install → installServerPackage → retry start
└── test/
    └── serverPackageInstall.test.ts   # NEW: presence-check and install-flow tests
                                        #   against a fake interpreter/process
                                        #   (wired into .vscode-test.mjs)

.vscode-test.mjs               # CHANGED: register the new suite
```

**Structure Decision**: Extends `doorstopServer.ts` rather than introducing a new
module, since the new functions are the same "spawn the selected interpreter and
capture its output" shape as the existing `start`/`restart` methods, and belong next
to the class that owns the server's lifecycle. `extension.ts` gets the only new
control flow (the notification + retry wiring), consistent with how it already owns
`startDoorstopServer`.

## Phase 0 — Research

See [research.md](./research.md). Four questions were resolved:

1. How to check whether `doorstop_server` is importable in an arbitrary interpreter
   without spawning the full server module.
2. How to run `pip install` against the selected interpreter and capture output for
   both progress and failure display, reusing the existing spawn/capture pattern.
3. How to serialize installs so a second start attempt never races an in-flight one
   for the same interpreter.
4. How to make the whole flow assertable in `src/test` without a real network call
   or a real Python interpreter.

No `NEEDS CLARIFICATION` markers remain.

## Phase 1 — Design & Contracts

- [data-model.md](./data-model.md) — the small set of in-memory states this feature
  introduces (package-check result, install outcome, in-flight install guard); no
  on-disk schema changes.
- [quickstart.md](./quickstart.md) — how to manually validate the notification/install
  flow against a real venv, and what the automated `src/test` suite covers.

### Post-design Constitution re-check

Re-evaluated after the artifacts above were written: still **PASS** on all six
principles. The design added no dependency, no server surface, and no duplicated
Doorstop logic; the only new code extends the existing server-lifecycle module with
two more spawn-based operations.
