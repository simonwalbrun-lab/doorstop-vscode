# Data Model: Background Problem Checking and Reporting Modes

## Server state (`app.state`)

| Field | Type | Meaning |
|---|---|---|
| `cached_tree` | `doorstop.Tree` | The one shared tree, used by reads **and** mutations (was reads only) |
| `tree_fingerprint` | `dict[path, (mtime_ns, size)] \| None` | Snapshot taken before the last refresh. `None` forces a full reload |
| `tree_version` | `int` | +1 on every reload (partial or full) and on every mutating request. A mutation also cancels a running check (`changed`, C2). A reload on the read path does not (research R3) |
| `validator` | `Validator` | Talks to the worker process. Not started until the first `/validate` |

## Validator (server side, `validation_worker.py`)

| Field | Meaning |
|---|---|
| `process` | The worker process, or `None` before the first check or after it died |
| `conn` | Server end of the `multiprocessing.Pipe` |
| `wanted` | `multiprocessing.Value("i")`: the job number whose result is still wanted. Any other value cancels the running job |
| `job` | Last job number handed out |
| `reason` | Why `wanted` was last changed: `superseded`, `changed` or `disconnected` |
| `lock` | `asyncio.Lock`, used only by `/validate` handlers, so one at a time talks to the pipe |

## Worker process state

| Field | Meaning |
|---|---|
| `tree` | Its own Doorstop tree (the check copy), loaded on the first job |
| `fingerprint` | Its own snapshot. `None` forces a full load (start, or after a failed check) |

Pipe messages: server → worker `job: int`; worker → server `(job, "done", reload_kind, records)`, `(job, "changed", reload_kind, None)` or `(job, "error", None, message)`. A cancelled job gets no reply.

### Refresh decision (server: per request, under the lock; worker: per job)

```text
diff = changed paths between the old and new fingerprint
empty diff                          → nothing                 (FR-023)
any basename starts ".doorstop"     → full reload             (FR-021)
else: group paths by deepest document folder
      paths outside every document  → ignored
      documents D1..Dn              → reload D1..Dn, clear item cache (FR-020)
exception during partial reload     → full reload
```

## Problem check (one `/validate` request, one job)

```text
waiting for validator lock ──▶ running (job sent, wanted = job)
running ──(worker: done)─────────────────────▶ finished  → 200 ValidationResponse (unchanged)
running ──(wanted changed: C1/C2/C3)─────────▶ cancelled → 409 CANCELLED, reason
running ──(worker: changed, C2')─────────────▶ cancelled → 409 CANCELLED "changed"
running ──(worker: error, or process died)───▶ failed    → 500 (unchanged shape); next check restarts the worker
```

## Client state (`problemsProvider`)

| Field | Meaning |
|---|---|
| `mode` | `'automatic' \| 'onDemand' \| 'off'`, read from `doorstop.problemReporting` |
| `lastRefresh` | `{ unfiltered: ValidationResponse, validation: ValidationResponse, tree }`. `validation` is filtered by `doorstop.problems`. Cleared in Off mode |
| `running` | `AbortController` of the check in flight, if any |

### Mode transitions

| From → To | Effect |
|---|---|
| any → off | abort `running`, clear diagnostics, clear `lastRefresh`, fire refresh event (document view empties) |
| any → automatic | `refreshNow()` |
| any → onDemand | nothing (a running check finishes and is shown) |

### Triggers per mode

| Trigger | automatic | onDemand | off |
|---|---|---|---|
| startup, save, extension action | check | – | – |
| Refresh button | check (cancellable toast) | check (cancellable toast) | – |
| status report | check | check | report says "off" |
| `doorstop.problems` changed | re-filter | re-filter | – |
