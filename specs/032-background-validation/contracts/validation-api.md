# Contract: `GET /validate` (changes only)

Response body, check ids and anchors are unchanged from
[spec 014 contracts/validation-api.md](../../014-doorstop-validation-diagnostics/contracts/validation-api.md).

## Behaviour

- The check runs in a separate worker process with its own copy of the project.
  `/validate` does not take the server's request lock, so every other request is
  served at its normal speed while a check runs (SC-001).
- Only one check runs at a time. A new `/validate` supersedes the running one.
- A cancelled check stops within 1 s, and the response comes within about 0.2 s.

## New response: cancelled

```http
HTTP/1.1 409 Conflict
{"error": {"code": "CANCELLED", "message": "superseded" | "changed" | "disconnected"}}
```

| message | Cause (research R3) | Client action |
|---|---|---|
| `superseded` | a newer `/validate` started (C1) | ignore; the newer check answers |
| `changed` | a mutation through the server while the check ran (C2), or files changed on disk meanwhile (C2') | keep the shown problems; check again if this pass is still the newest |
| `disconnected` | the client aborted (C3) | none (no one is listening) |

A cancelled check never returns partial issues, and nothing is written to disk.

## All other endpoints

Responses are unchanged. Internally they share one refreshed tree (research R4).
Any response after a partial reload equals the response after a full reload
(FR-022).
