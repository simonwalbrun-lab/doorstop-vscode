# Research: Hover Previews & Navigation (retroactive)

- **Data source**: Decision: read item data from the shared `DoorstopIndex` (`GET /tree`). Rationale: Principle I; avoids per-hover file parsing (see specs/013 research section 5). Alternative: file glob + YAML parse (original design, spec Assumptions) - replaced.
- **Link target**: Decision: `index.getUri(uid)` (server-reported path). Rationale: deterministic vs. `findFiles`. Spec assumption of a glob lookup is outdated; unknown UID is still "not found", no error.
- **Link opening**: Decision: `command:vscode.open` in a trusted MarkdownString. Alternative: custom command - unnecessary.
- **Tree sync**: Decision: no hover-specific code; any editor change triggers `syncActiveRequirement` (guarded by the auto-reveal toggle, spec 010).
- **Testing**: Decision: use `vscode.executeHoverProvider` on the regression fixture; for FR-005 assert tree selection after opening a file (or spy on `treeView`/`setActiveResource`), plus execute the hover link's `vscode.open` command.
