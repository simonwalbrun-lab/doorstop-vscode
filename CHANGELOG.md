# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

- Review and suspect links: **Do Review**, **Clear Suspect Link** and **Clear All
  Suspect Links** are no longer CodeLenses floating above the field. They are now
  Quick Fixes on the problems Doorstop already reports for them — put the cursor
  on the reported line and press `Ctrl+.`, or click the lightbulb in the margin.
  Because they hang off Doorstop's own validation, they only appear when there is
  something to fix: an already-reviewed item or an already-cleared link offers
  nothing, and **Clear All Suspect Links** shows up only once an item has more
  than one suspect link. **+ Derive Requirement** is unchanged and still a CodeLens
- Requirements tree: the **Review** and **Clear Suspect** icon buttons are gone from
  the item rows, which now carry only **Add** and **Link**. Both actions are still
  on the right-click menu, unchanged
- Canvas: right-click an item for **Remove from Diagram** (takes it off the canvas
  only — the requirement and all of its links are untouched) and **Add Link to…**,
  which creates a real link to the next item you click, with no drag gesture needed
- Canvas: items you place now stay exactly where you put them. Adding an item or
  toggling any view option never rearranges the canvas. The **Auto-Arrange** toggle
  is gone, since there is no longer anything for it to turn off; ghost items are
  still positioned automatically, as before
- Canvas: new **Grid Layout** arranges all items in a compact near-square box, and
  **Hierarchical Layout** is now a one-shot arrangement rather than a mode — after
  either, items stay put and remain freely draggable
- Canvas: no toolbar button disables another any more. Ghost Preview and
  Hierarchical Layout are no longer mutually exclusive
- Problem reporting: Doorstop's own validation is shown inline in requirement
  files - errors as red squiggles, warnings as yellow ones, info in the Problems
  panel - anchored to the field each problem concerns (the individual link entry
  for link checks, `reviewed:`, `derived:`, `level:`, `ref:`, or the document's
  config file for document-level problems). Refreshes on save, after any
  extension-initiated change, and via "Doorstop: Re-check Problems".
  Self-link, link-cycle and child-link-inactive checks are **not** reported,
  because Doorstop 3.2 does not implement them as validation checks.
- deriveProvider: the target quick pick now names each candidate document's
  relationship to the source (child, grandchild, sibling, nephew, cousin) and
  lists them in that order
- hover, autocompletion and go-to-definition now resolve items through the
  server's `GET /tree` instead of scanning and parsing files client-side; the
  `js-yaml` dependency is gone
- Create Document now asks which document should be the parent
- Export/Publish now report where Doorstop actually wrote the output
- Diagrams reopen from their backup after a crash or reload
- Canvas with Traces and Drag and Drop.
- Jump to new files.
- Go to Definition (F12) and Find All References (Shift+F12) for requirement UIDs, including a usages view on `derived:` lines
- codeLens: "Do Review" on the `reviewed:` field, "Clear All Suspicions" above `links:`, and "Clear the Suspicion" on each individual link entry
- deriveProvider: candidate target documents now come from the server's `GET /tree` instead of a client-side `.doorstop.yml` scan, and a failed lookup is reported instead of silently shortening the list

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
