# UI Contract: 029

| Surface | Before | After |
|---------|--------|-------|
| Explorer view title toolbar | Create Document, Refresh, … | Create Document removed |
| Commands view | no Create Document | "Create Document" node runs `doorstop.createDoc` |
| Command palette | Doorstop: Create Document | unchanged |
| Empty Explorer | blank | welcome text pointing to the Commands view |
| Not under git | server/creation error | error: "Doorstop: this folder is not under git version control. Run `git init` (or open a git repository) and try again." No prompts, no files created |
| Folder dialog | starts at `<workspace>/<prefix>` | starts at `<workspace>` |
| Activation | needs `.doorstop.yml` | also when the Doorstop view is opened or Create Document is run |

## Python environment and restart (FR-011..FR-014)

| Surface | Before | After |
|---------|--------|-------|
| No active Python environment | warning "Doorstop server unavailable: No active Python environment..." and the server never starts | one-time notice "Doorstop: waiting for the Python environment..."; server starts automatically when an environment becomes active; no PATH fallback |
| Environment changed while running | server keeps the old interpreter | server restarts with the new interpreter |
| Install pressed after an environment change | installs into the originally offered interpreter | no install into the old one; the check restarts for the new environment |
| Command palette | "Doorstop: Restart Server" (`doorstop.restartServer`) | "Doorstop: Restart Extension" (`doorstop.restartExtension`); re-resolves environment, re-checks package, restarts server, refreshes Explorer/Commands/Problems |
