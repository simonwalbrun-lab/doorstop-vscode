# Implementation Plan: Execution Timing

**Branch**: `023-execution-timing` | **Date**: 2026-10-06 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/023-execution-timing/spec.md`

## Summary

This feature adds an opt-in timing mode for developers. It records how long each
extension operation takes (every command, plus tree load, document view, diagram load,
validation, filter, hover, CodeLens and completion) and how long each server request it
triggers takes. Each server request is broken into `wait` / `load` / `work` stages. The
results are shown in a log, an aggregate summary, and a JSON export.

- **Server**: adds a standard `Server-Timing` response header, measured in the existing
  request-lock middleware and in `get_tree()`.
- **Extension**: one new module, `src/timing.ts`. It nests server requests under the
  operation that issued them via `AsyncLocalStorage`, keeps a bounded ring buffer and
  exact per-operation summaries, and prints to an output channel.
- **No new dependencies.**

## Technical Context

**Language/Version**: TypeScript (VS Code extension, engine ^1.75, Node ≥ 16 host); Python ≥ 3.9 (server)

**Primary Dependencies**: VS Code Extension API, Node stdlib (`node:async_hooks`, `perf_hooks`); FastAPI/Starlette ASGI, stdlib `time`, `contextvars` — all already present

**Storage**: In-memory only, for the session (extension host); JSON file only on explicit export

**Testing**: pytest + httpx `ASGITransport` (`server/tests`); vscode-test/mocha (`src/test`), including the existing real-server regression suite

**Target Platform**: VS Code desktop (Windows / macOS / Linux) with the local Doorstop server

**Project Type**: VS Code extension + local Python HTTP server (git submodule `server/`)

**Performance Goals**: < 1 ms of bookkeeping per measured operation (SC-004); < 2 % overhead when disabled (SC-003)

**Constraints**:

- Timing must never change a measured operation's result (FR-012).
- At most 10,000 retained entries, < 10 MB (SC-006).
- Must tolerate a server without the header.

**Scale/Scope**:

- ~22 command registrations and ~6 named operations to wrap
- 1 server middleware and 1 dependency to instrument

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment |
| --- | --- |
| I. Server is single source of truth | ✅ No Doorstop logic is added to the extension. The server only reports how long it spent. The request lock is unchanged; it is only measured. |
| II. No reinvention of Doorstop | ✅ Not applicable — Doorstop has no timing facility. |
| III. Error handling | ✅ Timing bookkeeping is wrapped and never alters results or errors (FR-012, R9). Export write failures surface as an error message. A missing or garbled header degrades gracefully. |
| IV. No unjustified dependencies | ✅ Zero new packages. Uses the W3C header plus the stdlib on both sides (R1, R4). |
| V. Typed, linted, tested | ✅ `npm run compile` gates apply. Server change (affects every response) is covered by `server/tests/test_timing.py` against real Doorstop. The 50 ms delay wraps the real `load_tree`; Doorstop is not mocked. |
| VI. CI-runnable test per feature | ✅ `server/tests/test_timing.py` runs in the `server-tests` job. `src/test/timing.test.ts` and an end-to-end refresh case in the real-server suite run in `extension-integration-tests`. No new CI wiring is needed. |

**Gate result: PASS (pre-research and post-design).** No violations, so the Complexity Tracking section is empty.

## Project Structure

### Documentation (this feature)

```text
specs/023-execution-timing/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── server-timing-header.md
│   ├── extension-contributions.md
│   └── timing-export.schema.json
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
server/                                  # git submodule — commit there first, then bump pointer
├── src/doorstop_server/
│   ├── timing.py                        # NEW: ContextVar[dict] + record(stage, ms) helper (~20 lines)
│   ├── lock.py                          # measure `wait`, wrap `send` to add Server-Timing header
│   └── deps.py                          # get_tree(): add `load` stage around load_tree()
└── tests/test_timing.py                 # NEW

src/
├── timing.ts                            # NEW: measure(), registerCommand(), recordServer(),
│                                        #      parseServerTiming(), summary/reset/export, channel
├── doorstopServer.ts                    # request(): time round-trip, parse header, attach child
├── extension.ts                         # init timing (setting listener, 3 commands)
├── requirementTree.ts                   # loadItems → measure('tree.load'); drop console.log timer (FR-013)
├── documentViewProvider.ts              # measure('documentView.load')
├── diagrammPanel.ts                     # measure('diagram.load')
├── problemsProvider.ts                  # measure('validation.run')
├── filterNotebook.ts                    # measure('filter.execute')
├── hoverProvider.ts, completionProvider.ts,
│   deriveProvider.ts,
│   documentViewLanguage.ts              # measure() around provide* callbacks
├── <9 files with registerCommand>       # vscode.commands.registerCommand → timing.registerCommand
└── test/timing.test.ts                  # NEW (+1 case in regressionFixture.test.ts)

package.json                             # setting + 3 commands + commandPalette `when`
```

**Structure Decision**: The existing two-part layout stays: extension `src/` plus server
submodule `server/`. One new module on each side; everything else is a small,
mechanical edit at existing call sites. Server changes must be committed in the
`server` submodule, and then its pointer bumped in this repo.

## Complexity Tracking

No constitution violations.
