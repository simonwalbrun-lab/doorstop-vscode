# Contract: Extension contributions (package.json)

## Setting

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `doorstop.timing.enabled` | boolean | `false` | Record how long extension operations and server requests take, and print them to the "Doorstop Timing" output channel. Intended for developing the extension. |

The setting takes effect immediately, with no reload, through
`onDidChangeConfiguration`. Turning it off keeps the data collected so far, so the
summary and export still work. Use reset to clear it.

## Commands

| ID | Title | Behaviour |
| --- | --- | --- |
| `doorstop.timing.showSummary` | Doorstop: Show Timing Summary | Prints the per-operation table (count, total, min, avg, p95, max), sorted by total in descending order, to the "Doorstop Timing" channel and reveals the channel. If there is no data, prints `No timing data recorded.` |
| `doorstop.timing.reset` | Doorstop: Reset Timing Data | Clears the entries and the summaries. |
| `doorstop.timing.export` | Doorstop: Export Timing Data… | Opens a save dialog (default name `doorstop-timing-<yyyyMMdd-HHmmss>.json`) and writes the data in the [export schema](timing-export.schema.json). If there is no data, shows `Doorstop: no timing data to export.` and writes nothing. A write failure shows an error message (Constitution III). |

`menus.commandPalette` shows all three only when `config.doorstop.timing.enabled`
is true. The commands are not themselves timed: each is registered with the raw
`vscode.commands.registerCommand` inside `timing.ts`, which the R5 source scan
allows.

## Log line format (output channel "Doorstop Timing")

```text
12:03:41.120  ok         doorstop.refresh                 143.2 ms
                └ ok     GET /tree                        131.0 ms  wait 0.0 · load 98.4 · work 29.1 · other 3.5
```
