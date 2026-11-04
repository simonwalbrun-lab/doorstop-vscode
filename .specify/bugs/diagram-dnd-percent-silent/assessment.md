# Bug Assessment: drag-and-drop of a path containing "%" fails silently in the diagram

- **Slug**: diagram-dnd-percent-silent
- **Created**: 2026-11-01
- **Source**: pasted text
- **Verdict**: valid
- **Severity**: low

## Report (verbatim or summarized)

> drag-and-drop with a % fails silently (diagrammPanel.ts:680)

## Symptom

Dropping onto the diagram fails silently, with no node, no warning, and no error, when the dropped text is a plain path or bare text containing a `%` that is not followed by two hex digits (e.g. `C:\proj\reqs 100%\REQ-001.md`). Expected behavior: the node is added, or the user sees a message.

## Reproduction

1. Put a Doorstop document in a folder whose name contains `%` (e.g. `reqs 100%`).
2. Drop that item's plain path text onto the diagram canvas.
3. Nothing happens. The extension host log shows an unhandled rejection (`URIError: URI malformed`).

[NEEDS CLARIFICATION: which drag sources send a plain path rather than a `file:` URI. A `file:` URI takes the `vscode.Uri.parse` branch and is not affected.]

## Suspected Code Paths

- `src/diagrammPanel.ts:680`: `decodeURIComponent(cleanText)` throws `URIError` on a malformed `%` sequence. It runs before the `try` at L692.
- `src/diagrammPanel.ts:170-173`: the `resolveDroppedItem` handler awaits `handleDroppedData` with no catch, and `onDidReceiveMessage` swallows the rejection. That is why the failure is silent.
- Other callers: `src/diagrammPanel.ts:455` (add to diagram) and `src/diagrammPanel.ts:585` (auto-place) feed paths through the same line.

## Root Cause Hypothesis

`decodeURIComponent` is applied to text that is usually not URI-encoded, and its exception escapes the method's error handling. Confidence: high.

## Proposed Remediation

**Preferred**: Fall back to the raw text when decoding fails, with an inline `try { decodeURIComponent(cleanText) } catch { cleanText }` at L680. A literal `%` path then resolves by basename as intended. The existing "server does not know UID" warning covers anything that still does not match.

**Alternatives**:

- Drop `decodeURIComponent` entirely. Plain paths are not encoded, and `file:` URIs are already parsed. This is simpler, but it would break a drag source that sends percent-encoded non-`file:` text. Unverified whether such a source exists.

**Files likely to change**:

- `src/diagrammPanel.ts`
- a diagram drop test under `src/test/`

**Tests to add or update**:

- Drop `C:\x\reqs 100%\REQ-001.md` with `REQ-001` known to the server: the panel posts `addNode` with `uid: 'REQ-001'`. Drive it through the `resolveDroppedItem` message, or extract the UID parsing into a small exported function if that is easier to test.

## Risks & Considerations

- None significant. The behavior only changes for inputs that threw before.

## Open Questions

- None.
