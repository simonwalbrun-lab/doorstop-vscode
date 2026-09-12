# Quickstart: validating the Document View

**Feature**: 019-document-view. Contracts: [document-view-format.md](./contracts/document-view-format.md), [server-api.md](./contracts/server-api.md), [commands-and-ui.md](./contracts/commands-and-ui.md).

## Prerequisites

- Node 24 + `npm ci` at the repo root; Python 3.12 with the server installed
  editable into the repo's `.venv`: `cd server && pip install -e .[dev]`
  (the extension tests look for `.venv/Scripts/python.exe` /
  `.venv/bin/python3` first, then `python3`/`python` on PATH).
- The fixture `testdata/regression` (REQ 10 items, ARCH 1, EMPTY 0, MD 1
  markdown-format item) must be unmodified — run `git status testdata/` first.
- Note: `.vscode-test.mjs` is deleted in the current working tree (`git
  status` shows `D .vscode-test.mjs`); `npm test` needs it — restore it with
  `git checkout -- .vscode-test.mjs` before running the suites.

## Automated checks (what CI runs)

```bash
# Server: new endpoints against a real temporary Doorstop project
cd server && pytest -q
# → test_items.py: PATCH header/text (yaml + markdown), 422/400 paths, DELETE + renumbering
# → test_documents.py: POST after= (sibling level, heading → child), after+level → 422
# → test_tree.py: /tree items sorted by level

# Extension: type-check, lint, build, then all vscode-test configs
npm run compile
xvfb-run -a npm test     # Linux CI; plain `npm test` on a desktop
# → unit:             documentViewModel.test.ts (render/parse/plan, no server)
# → regressionFixture: "Document View (019)" block (real server on the fixture)
# → packageMenus:     Open-as-document menu entries + colour contribution
```

Expected: all green; `git status testdata/` clean afterwards (every test
restores the fixture directory).

## Manual walkthrough (F5 extension host on `testdata/regression`)

1. **Open** — In the Doorstop explorer, hover the `REQ` node and click the
   book icon ("Open as document"), or run "Doorstop: Open Document View" and
   pick `REQ`. Expect a tab `REQ (document)` in markdown mode whose first
   lines are:

   ```text
   <!-- doorstop document REQ · keep this line -->

   <!-- REQ-001 · 1.0 · item separator. keep this line -->
   # REQ-001
   The system shall provide a baseline capability with no upstream or
   …
   ```

   REQ-004 shows `## Heading Display Coverage`; all others show their UID
   as heading. Every second block is tinted; separators are dimmed; each
   separator has an action line `REQ-00x | Open item | Review | Derive |
   Link... | no links | + New item below`. Clicking the `REQ` node's icon
   again reveals the same tab.
2. **Markdown preview** — `Markdown: Open Preview to the Side` renders the
   headings and text; the HTML-comment separators are invisible there.
3. **Edit and save** — Change REQ-002's text and REQ-004's heading, Ctrl+S.
   Expect the "Header of REQ-004 changed from 'Heading Display Coverage' to
   '…' - Apply / Keep" dialog (text unchanged) → Apply. Then `git diff
   testdata/` shows exactly `REQ-002.yml` (`text:`) and `REQ-004.yml`
   (`header:`), nothing else. The Problems panel now lists "unreviewed
   changes" for both, anchored on their separator lines in the view and on
   `reviewed:` in the files; the action lines read `Do Review`.
4. **Quick fix parity** — On REQ-002's separator, open the lightbulb: "Do
   Review". Apply it → problem disappears in both places; the view refreshes.
5. **Separator is read-only** — Type inside a separator line: the line
   snaps back and the status bar says "This line is managed by Doorstop -
   use the actions above it". Change the number of `#` on a heading and
   save: the heading is written without `#`s and re-renders at the level's
   depth.
6. **New item** — On REQ-003's action line click `+ New item below`. A
   `<!-- new item -->` block appears with the cursor on `## `. Type a heading
   and a paragraph, Ctrl+S. Expect a new `REQ-011.yml` at level `1.3` and
   REQ-004…REQ-010 renumbered `1.4`…`1.10`; the view shows the new block with
   a real separator between REQ-003 and REQ-004. Undo with `git checkout --
   testdata/ && rm testdata/regression/REQ-011.yml`.
7. **Typed heading never creates an item** — Type `## Not an item` inside
   REQ-005's text, save: it is saved as part of REQ-005's `text:`.
8. **Deletion protection** — Select REQ-010's whole block (separator to
   text) and delete it, Ctrl+S. Expect "REQ-010 would be deleted - Delete /
   Keep / Cancel". Keep → the block reappears, file untouched. Repeat with
   Cancel → nothing written, tab still dirty. Repeat with Delete →
   `REQ-010.yml` is gone (restore it from git afterwards).
9. **Refused save** — Copy a separator line so it appears twice, Ctrl+S.
   Expect "Failed to save 'REQ (document)': separator for REQ-00x appears
   twice (line N) …" and a warning squiggle on that line with the quick fix
   "Restore block structure of REQ-00x". Apply the fix, save again → ok.
10. **Disk consistency** — With the view clean, edit `REQ-001.yml` in its own
    tab and save: the view updates within ~1 s. Make an unsaved edit in the
    view, then change `REQ-002.yml` on disk: expect "REQ-002 changed on disk
    — Reload / Keep my edits". Keep, then save the view: REQ-002's new disk
    text is *not* overwritten unless its block was edited in the view.
11. **Navigation** — Hover a UID in a separator (item preview), F12 (opens
    the item file at its header), "Show Call Hierarchy" on the separator's
    UID (peek rooted at that item), `2 links` on ARCH's action line (open
    ARCH as document) opens the hierarchy.
12. **Close** — Close the dirty view: the standard Save / Don't Save / Cancel
    dialog appears.

## Edge checks

- Open `EMPTY` as document: only the document marker line and a single
  `+ New item below` action line; inserting and saving creates `EMPTY-001`.
- Open `MD` as document: MD-001 renders its markdown body; editing and saving
  rewrites `MD-001.md` with the new body after the frontmatter (Doorstop's
  markdown item format).
- Stop the server (`Doorstop: Restart Server` with a broken interpreter, or
  kill the process) and save: "Failed to save … server unavailable", tab
  stays dirty, nothing written.
