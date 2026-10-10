# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- The server starts only with the interpreter of the Python environment VS Code has
  activated: it waits (with a one-time notice) until one is active, never falls back
  to another interpreter, restarts when the environment changes, and re-checks the
  environment before installing the server package
- **Doorstop: Restart Extension** replaces **Doorstop: Restart Server**: it re-resolves
  the Python environment, re-checks the package, restarts the server and refreshes the views
- Start a project from an empty folder: the Doorstop view and **Create Document**
  now work without an existing `.doorstop.yml`. A folder that is not under git
  version control gets a clear error instead
- **Create Document** moved from the Explorer toolbar to the Commands view (still
  in the command palette); its folder dialog opens in the workspace folder
- Publish has two "all" entries: **All documents - one file each** (a template
  kept next to one document is lent to the others during the run and removed
  again) and **All documents - combined run** (one Doorstop run with index and
  traceability matrix; Doorstop allows only one template folder there)
- Server: `POST /publish` (all documents in one run), `sharedTemplate` option on
  `POST /documents/{prefix}/publish`
- Publish as **PDF**: one A4 PDF per document, plus a landscape
  `traceability.pdf` for all documents, printed from Doorstop's HTML by a
  headless-browser script that the first PDF publish adds to the workspace
  (`doorstop-pdf/`), so CI pipelines run the very same script
- Published traceability matrix and item child links include cross-document
  links (links that skip a document level or cross branches), which Doorstop
  itself drops. Settings `doorstop.publish.traceability` (`complete` /
  `doorstop`, matrix only) and `doorstop.publish.noChildLinks` (Doorstop's
  `--no-child-links`)
- Server: `traceability` and `childLinks` options on both publish endpoints;
  `python -m doorstop_server.publish` runs `doorstop publish` with the same
  links for CI
- Diagram: items moved on disk are found again by UID when a diagram is opened;
  the corrected paths are saved with the next Save

### Changed

- Progress notifications appear for any Doorstop operation still running after
  one second - now also server start/restart, Refresh, Recheck Problems,
  document view open/save, diagram load and canvas link actions, Derive, and
  the review lenses - and no longer flash for operations that finish sooner
- Diagram: **New Diagram** moved to the Doorstop Commands panel (palette title
  "Doorstop: New Diagram"); existing diagrams open by clicking the
  `*.doorstop.json` file
- Diagram: Grid and Hierarchical Layout account for each node's size; long
  headings wrap after about 30 characters

### Removed

- Diagram: "Open Traceability Graph" command and the diagram buttons in the
  TreeView title bar
- Diagram: the "Edit" toolbar on the canvas (use the toolbar buttons and the
  context menu)
- Diagram: status icons (reviewed, suspect, derived, inactive, non-normative)
  and the red suspect border

### Fixed

- Publishing all documents with a custom template failed for every document
  that had no `template` folder of its own

## [0.2.0] - 2026-10-07

### Added

- **Document View**: edit a whole document as one markdown text; saves only
  changed items, confirms deletions, quick fix for broken blocks, insert items
  in place; problems, hover, go to definition, references and call hierarchy
  work in it
- **Filter notebooks** (`*.doorstop-filter`): YAML filters (Obsidian Bases
  style: `and`/`or`/`not`, `hasChild`/`hasParent`, custom attributes) render
  matching items as a table; `order:` picks columns
- **Generate Status Report**: `doorstop-status.md` with Mermaid charts of
  items, problems and weekly volatility from git
- Publish `all`: every document into one folder, stops at the first failure
- Timing (`doorstop.timing.enabled`, dev only): command and request durations
  in the **Doorstop Timing** channel; summary, reset and JSON export
- Server: `PATCH`/`DELETE /items/{uid}`, `POST /filter`, insert position on
  `POST /documents/{prefix}/items`, `Server-Timing` header

### Changed

- Faster on large projects: server caches the project for reads until a file
  changes; overlapping identical requests share one round trip; Explorer loads
  the tree once
- Commands show progress and can't run twice at once
- Server: `GET /tree` returns items in level order

### Fixed

- Linux/macOS: restarting the server waits for the old process to exit
  instead of racing it for the port

## [0.1.0] - 2026-09-11

### Added

- Canvas: collect items on a diagram with traces, drag and drop, and a ghost
  preview of linked items; **Grid** and **Hierarchical** one-shot layouts; items
  stay where you put them; right-click for **Remove from Diagram** and
  **Add Link to…**; diagrams are restored from backup after a reload
- Problems: Doorstop's own validation is shown inline in requirement files
  (errors, warnings, info) anchored to the affected field; refreshes on save
  and via "Doorstop: Re-check Problems"
- Review and suspect links: **Do Review**, **Clear Suspect Link** and
  **Clear All Suspect Links** are Quick Fixes (`Ctrl+.`) on the reported problems
- Requirements tree: **Show Call Hierarchy** shows upstream (outgoing) and
  downstream (incoming) links of an item; also via *Peek Call Hierarchy*
  (`Shift+Alt+H`) in any requirement file
- Go to Definition (`F12`) and Find All References (`Shift+F12`) for UIDs
- Derive Requirement: target documents are named by their relationship to the
  source (child, sibling, …) and ordered accordingly
- Create Document asks for the parent document; Export/Publish report the
  output location

### Changed

- Hover, autocompletion and go-to-definition resolve items via the server
  (`GET /tree`) instead of parsing files client-side
- Requirements tree item rows carry only **Add** and **Link**; review and
  clear-suspect actions moved to the right-click menu
- Simplified icons and a more user-friendly startup

### Fixed

- **Reorder Document → Manual**: re-running the command with an existing
  `index.yml` offers **Apply index.yml**; unsaved index is saved before applying

## [0.0.4] - 2026-09-06

### Added

- palette: command into commands palette for quick access
- sidebar.commands: often used commands for quick access
- sidebar.treeview: commands by click
    items:  add, review, remove suspicous and link
    documents: add document
- codeLens: derive requiremts per click downstream
- completion: autocomplete to link upstream with history


## [0.0.3] - 2026-09-05

### Added

- Treeview of all doorstop items in explorer with name
- Canvas to collect items for later usage

## [0.0.2] - 2026-08-31

### Added

- Hover with clickable links in preview

## [0.0.1] - 2026-08-31

### Added

- Hover over links for Preview

## Notes

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
