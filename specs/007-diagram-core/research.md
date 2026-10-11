# Research: Diagram Core (retroactive)

No unknowns. Decisions recovered from code:

- **Editor type**: `CustomEditorProvider` (not webview panel) so Save/Save As/Revert/backup are native. Alternative (plain panel + manual file writes) rejected: no dirty state, no hot exit.
- **Paths**: workspace-relative, forward slashes, so diagrams survive moves between machines. Alternative: absolute URIs - breaks sharing.
- **Content vs layout**: file stores layout only; status, links, colours come from `GET /tree` each load (Principle I).
- **Failure mode**: `/tree` failure -> render saved file, one warning per panel.
- **Edges**: recomputed from server links; persisted edges touching an unknown endpoint kept (FR-007).
- **Open spec drift**: FR-005 mentions status badges; spec 025 removed them from the canvas (colour legend retained). Flagged for spec amendment.
