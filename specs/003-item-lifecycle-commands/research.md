# Research: Item Lifecycle Commands

Retroactive; no unknowns. Decisions as found in code.

- **Target resolution**: tree item wins; else prompt (`chooseDocumentOrAll`, includes literal `all`). Rationale: mirrors Doorstop CLI scope disambiguation. Alternative (single free-text prompt) rejected by existing UX.
- **Level on Add**: scoped to an item -> `nextLevel()` (last dotted component + 1) sent to server; scoped to a document root -> none (server picks next); palette -> optional input. Server validates collisions.
- **Link direction**: tree row = parent, active editor / Document View `childUid` / input = child. Self-link and unknown UIDs are rejected server-side, not duplicated in the extension (Principle I).
- **Test approach for prompt flows (open)**: stub `vscode.window.showQuickPick` / `showInputBox` inside vscode-test cases and restore in `finally`. No new dependency.
