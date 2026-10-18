# Contract: Extension settings, button, progress

## Setting (`package.json` → configuration "Problems")

```json
"doorstop.problemReporting": {
  "type": "string",
  "enum": ["automatic", "onDemand", "off"],
  "enumItemLabels": ["Automatic", "On demand", "Off"],
  "default": "automatic",
  "markdownDescription": "When Doorstop problems are checked. **Automatic**: after every change. **On demand**: only on Refresh. **Off**: never."
}
```

The `doorstop.problems` description gets: "Applies only while Problem Reporting is
not Off." (FR-015)

## Tree view button (view/title, `navigation` group)

| Command | Shown when `doorstop.problemReporting ==` | Icon | Title (tooltip) | Writes |
|---|---|---|---|---|
| `doorstop.problemReporting.toOnDemand` | `automatic` | `$(eye)` | Problems: Automatic (click for On demand) | `onDemand` |
| `doorstop.problemReporting.toOff` | `onDemand` | `$(eye-watch)` | Problems: On demand (click for Off) | `off` |
| `doorstop.problemReporting.toAutomatic` | `off` | `$(eye-closed)` | Problems: Off (click for Automatic) | `automatic` |

- Writes go to `ConfigurationTarget.Workspace`.
- The context key is set at activation and on every `onDidChangeConfiguration`
  that affects `doorstop.problemReporting` (FR-019).
- All three commands are hidden from the Command Palette (`commandPalette` `when: false`).
- No re-check command or button is added, and `doorstop.recheckProblems` is
  removed from `contributes.commands` (FR-014).

## Progress

| Check started by | UI | Cancel |
|---|---|---|
| startup, save, extension action (automatic) | status bar spinner (`ProgressLocation.Window`) after 1 s: "Checking Doorstop problems…" | – |
| Refresh button, status report | notification after 1 s: "Doorstop: Checking problems…" | yes, aborts the request |
