# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

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
