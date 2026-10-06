# Data Model: Execution Timing

All state lives in memory in the extension host, in [src/timing.ts](../../src/timing.ts),
and lasts for the current session only. The server stores nothing. It only reports
per-request stages in a header (see [contracts/server-timing-header.md](contracts/server-timing-header.md)).

## TimingEntry

One measured execution.

| Field | Type | Notes |
| --- | --- | --- |
| `name` | string | A command ID (`doorstop.refresh`), an operation label (`tree.load`), or for server entries the route (`GET /items/{uid}/links`). This is the key the summary groups by. |
| `source` | `'extension' \| 'server'` | |
| `start` | number | Epoch ms (`Date.now()` at start); used for display and export. |
| `durationMs` | number | Measured with `performance.now()` on the extension side. For a server entry it is the full round-trip as seen by the extension. |
| `outcome` | `'ok' \| 'failed' \| 'cancelled'` | |
| `stages` | `Stage[]` | Server entries: `wait`, `load`, `work` from the header. Extension entries: empty. |
| `children` | `TimingEntry[]` | Server requests (and nested `measure` calls) issued while this entry was running. Their order is completion order. |

### Rules

- An entry is recorded only if timing was enabled when it **started**, and it is
  recorded only once it is complete (FR-001, edge case: toggling during an operation).
- An entry becomes a child only if its parent is **still running** when the entry
  completes. If the parent has already finished — e.g. a debounced re-check that a
  command scheduled via `setTimeout`, which inherits the command's async context —
  the entry is recorded as top-level and printed on its own (spec Clarifications
  2026-10-06). This way every recorded entry appears in the log exactly once. Each
  entry counts toward its own name's summary row either way.
- Each entry carries an internal `done` flag (not exported), set when it settles.
- `durationMs ≥ sum(stages)` is not enforced. For a server entry, the difference is
  network + HTTP overhead. The log prints it as `other` (US3 scenario 2: time not
  covered by any stage).

## Stage

| Field | Type | Notes |
| --- | --- | --- |
| `name` | string | `wait`, `load`, or `work`. Any other name from the header is kept as-is, so new server stages need no extension change. |
| `durationMs` | number | |

## OperationSummary

Kept per `name` and updated whenever any entry with that name completes, whether
top-level or child.

| Field | Type | Notes |
| --- | --- | --- |
| `count` | number | Exact; includes evicted entries (FR-010). |
| `totalMs` | number | Exact. |
| `minMs` / `maxMs` | number | Exact. |
| `avgMs` | derived | `totalMs / count`. |
| `p95Ms` | derived on demand | Nearest-rank over the durations of retained entries with this name. |

## Retention

- A ring buffer holds at most **10,000 top-level entries** (`MAX_ENTRIES`, a constant —
  no setting). When it is full, the oldest entry is dropped first. Summaries are not
  decremented.
- **Reset** clears both the ring buffer and the summaries.

## Lifecycle of a measured operation

```text
measure(name, fn)
  ├─ timing disabled?    → return fn()                      (no bookkeeping)
  ├─ create entry, start = now
  ├─ als.run(entry, fn)  → server requests inside append children
  ├─ settle: ok | failed | cancelled, durationMs = now − start, done = true
  ├─ parent in ALS and parent not done? → push into parent.children
  │                                else → push into ring buffer, print to log
  ├─ update summary[name]
  └─ return result / re-throw original error
```
