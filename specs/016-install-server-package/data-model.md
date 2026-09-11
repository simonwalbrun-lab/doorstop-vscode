# Phase 1 Data Model: Prompt to Install Missing Server Package

**Feature**: `016-install-server-package` | **Date**: 2026-09-11

This feature introduces no persisted schema, no server-side entity, and no on-disk
document changes. What follows is the small amount of in-memory/runtime state and
the function contracts this feature adds to `src/doorstopServer.ts` and
`src/extension.ts`.

---

## 1. Package presence check — NEW

### `isServerPackageInstalled(pythonPath, spawnFn?) => Promise<boolean>`

| Input | Type | Meaning |
| --- | --- | --- |
| `pythonPath` | `string` | The interpreter path already resolved by `getActivePythonPath` — the same one `DoorstopServer.start` would use. |
| `spawnFn` | injectable, defaults to `node:child_process.spawn` | Lets tests substitute a fake process (Constitution VI). |

Returns `true` when the interpreter reports `doorstop_server` importable (exit code
`0` from the `find_spec` check, [research.md](./research.md) §1), `false` on any
other exit code or a spawn error (e.g. the interpreter path itself is invalid).

**Invariants**

- Never throws for "module missing" — that is the expected `false` case, not an
  error. Only a genuine inability to invoke the interpreter at all is exceptional,
  and even that resolves to `false` rather than rejecting, so callers have one
  boolean branch to handle (FR-001, FR-003).
- Idempotent and side-effect-free: safe to call on every server-start attempt
  (FR-010) without installing, importing with side effects, or leaving state behind.

---

## 2. Install operation — NEW

### `installServerPackage(pythonPath, options?) => Promise<InstallOutcome>`

```text
InstallOutcome = {
  success: boolean;
  output: string;   // captured, tail-truncated stdout+stderr (same 2000-char cap
                     // convention as DoorstopServer.recentStderr)
}
```

| Input | Type | Meaning |
| --- | --- | --- |
| `pythonPath` | `string` | Interpreter to install into. |
| `options.onOutput` | `(chunk: string) => void`, optional | Streamed output for a progress surface to display live. |
| `options.spawnFn` | injectable, defaults to `node:child_process.spawn` | Same testability seam as above. |

Runs `pythonPath -m pip install doorstop-vscode-server` ([research.md](./research.md)
§2) and resolves once the process exits, never rejecting — failure is represented
in the returned `success: false` rather than a thrown error, so callers (the
notification-flow code) have one place to branch on outcome (Constitution III).

**Invariants**

- At most one `installServerPackage` call is ever in flight per `pythonPath` at a
  time (FR-008); a second call for the same interpreter while one is running
  returns the same in-flight `Promise` instead of spawning a second process. This
  mirrors `DoorstopServer`'s own single-`startPromise` guard for `start()`.
- The in-flight guard is keyed by `pythonPath`, not global — installs for different
  interpreters (e.g. two different workspaces) do not block each other.
- The guard is cleared once the promise settles (success or failure), so a later,
  independent install attempt (e.g. after fixing a network issue) is not blocked by
  a past failure (FR-007's "retryable" requirement).

---

## 3. Notification/install flow state (`extension.ts`) — NEW control flow

Not a data structure so much as a state machine `startDoorstopServer` now drives
before it reaches the existing spawn-and-wait-for-health path:

```text
checking-package
   │
   ├─ installed ───────────────────────────────► (existing) start server
   │
   └─ missing ─► show notification [Install | Dismiss]
                    │
                    ├─ Dismiss / no response ─► stopped (unchanged from today's
                    │                            "startup did not proceed" outcome)
                    │
                    └─ Install ─► installing (progress notification)
                                     │
                                     ├─ success ─► (existing) start server
                                     │
                                     └─ failure ─► show error with captured output;
                                                    stopped, retryable on next
                                                    start/restart attempt
```

**Mapping to requirements**: FR-002 (notification instead of generic error),
FR-004–FR-006 (install → progress → auto-start), FR-007 (failure surfaced,
retryable), FR-009 (dismiss leaves server stopped, no retry loop).

**What does not change**: the "no workspace / no marker" and "no interpreter
selected" branches already in `startDoorstopServer` and `getActivePythonPath` run
*before* this new check, exactly as today — this flow only inserts itself between
"an interpreter was resolved" and "spawn the server," per the Edge Cases and
Dependencies sections of the spec.
