# Contract: Filter Notebook File and Commands

## File

- Notebook type: `doorstop-filter`, file pattern `*.doorstop-filter`.
- Content: UTF-8 JSON, 2-space indent, trailing newline. Outputs are never
  stored (FR-014).

```json
{
  "cells": [
    { "kind": "markdown", "value": "# Doorstop filter\n…" },
    { "kind": "filter", "value": "and:\n  - active == true\n  - reviewed == false\n" }
  ]
}
```

| Field | Values |
|-------|--------|
| `kind` | `"markdown"` → text cell (never run); `"filter"` → filter cell, language `yaml` |
| `value` | Cell source text |

- An empty file (0 bytes) opens as a notebook with no cells.
- Invalid JSON or a missing `cells` array → opening fails with an error naming
  the file; the file is not modified.

## Command

Also offered as **New Filter Notebook** in the Doorstop Commands panel.

| Command | Title | Behaviour |
|---------|-------|-----------|
| `doorstop.newFilterNotebook` | Doorstop: New Filter Notebook | Opens an untitled `doorstop-filter` notebook containing (1) a text cell explaining how to write and run a filter, with the operator / attribute / group cheat-sheet from [filter-syntax.md](filter-syntax.md), then (2) a simple example filter cell (`reviewed == false`) and (3) a complex one combining `and` / `or` / `not`, `ref.isEmpty()`, `header.startsWith(…)`, `hasChild:` and `order: [level, header, reviewed, links]`. |

## Cell output

| Situation | Output |
|-----------|--------|
| Matches | One item `application/vnd.doorstop.filter-results+json` = `{ columns, items }` from the server, drawn by the `doorstop-filter-results` notebook renderer (`src/webview/filterResults/renderer.js`): "N items matched", then a table `UID` + `columns`, each row the UID plus `values`. Clicking a UID posts `{ type: "open", path }` to the extension, which opens the file, or warns "Item no longer exists" when it is gone. (VS Code ignores `file:` links in notebook outputs, hence the renderer.) |
| No matches | `text/markdown`: `No items matched.` |
| Blank cell | `text/markdown` hint pointing to the example syntax; the server is not called |
| Server error / unreachable | `NotebookCellOutputItem.error` with the server message, or "Doorstop server is not available"; no table |
