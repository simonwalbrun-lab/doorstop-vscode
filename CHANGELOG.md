# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- Disable/enable documents from the tree view via `.doorstop.skip`
- Problem checks run in a separate background process; the editor and server stay responsive on large trees
- Setting `doorstop.problemReporting` (Automatic / On demand / Off) with a tree view button
- The server reloads only changed documents
- Faster server on large trees: libyaml, cached tree answers, cheaper change checks, much faster publish

### Removed

- **Doorstop: Re-check Problems** (use Refresh)

## [0.3.0] - 2026-10-11

### Added

- Open sections and filter results as document
- Reload from disk lens in document views
- Setting `doorstop.documentView.fields` for editable header fields
- Server uses only VS Code's active Python environment
- **Doorstop: Restart Extension** replaces Restart Server
- Create projects and documents from empty folders
- Create Document moved to Commands view
- Publish all documents: one file each, or combined
- Publish as PDF, including landscape traceability matrix
- Published links include cross-document links
- Settings `doorstop.publish.traceability` and `doorstop.publish.noChildLinks`
- Server: `POST /publish`, `traceability`, `childLinks`, `sharedTemplate` options
- Diagram: moved items are found again by UID

### Changed

- Progress notifications for any operation over one second
- Diagram: New Diagram moved to Commands panel
- Diagram: layouts respect node size, headings wrap

### Removed

- Diagram: Open Traceability Graph command and title-bar buttons
- Diagram: Edit toolbar on canvas
- Diagram: status icons and red suspect border

### Fixed

- Publishing all documents failed without own `template` folder

## [0.2.0] - 2026-10-07

### Added

- Document View: edit a whole document as markdown
- Filter notebooks (`*.doorstop-filter`) with YAML filters
- Generate Status Report with Mermaid charts
- Publish `all` documents into one folder
- Timing (`doorstop.timing.enabled`) for developers
- Server: item `PATCH`/`DELETE`, `POST /filter`, insert position

### Changed

- Faster on large projects through caching
- Commands show progress, can't run twice
- Server: `GET /tree` returns items in level order

### Fixed

- Linux/macOS: server restart waits for old process

## [0.1.0] - 2026-09-11

### Added

- Canvas: collect items, traces, drag and drop
- Canvas: Grid and Hierarchical layouts
- Problems: Doorstop validation shown inline
- Review and suspect link Quick Fixes
- Call hierarchy for requirement items
- Go to Definition and Find All References for UIDs
- Derive Requirement names targets by relationship
- Create Document asks for parent document

### Changed

- Hover, completion and definitions resolve via server
- Tree rows carry only Add and Link
- Simplified icons, friendlier startup

### Fixed

- Reorder Document → Manual applies existing `index.yml`

## [0.0.4] - 2026-09-06

### Added

- Palette and sidebar commands for quick access
- Tree view item and document commands
- CodeLens to derive requirements downstream
- Autocomplete for upstream links with history

## [0.0.3] - 2026-09-05

### Added

- Tree view of all Doorstop items
- Canvas to collect items

## [0.0.2] - 2026-08-31

### Added

- Hover with clickable links in preview

## [0.0.1] - 2026-08-31

### Added

- Hover over links for preview

## Notes

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
