# Doorstop Requirements for VS Code

Seamlessly manage, view, and navigate [Doorstop](https://doorstop.readthedocs.io/) requirement items directly inside VS Code.

This extension brings requirement lifecycle management into your developer workflow—from interactive tree views and inline editor actions to smart autocompletion and hover previews.

---

## Features

### Doorstop Explorer & Commands

**Requirement Tree View:** Browse all your Doorstop documents and items directly in the SideBar ordered by level of the items.

![alt text](media/promotion/06-treeview-navigation.gif)

**Inline Node Actions:** Quickly **Add**
![alt text](media/promotion/07-new_requirement.gif)
or **Link** items via inline action buttons on hover.
![alt text](media/promotion/09_link_items.gif)

**Review** and **Clear Suspect Status** are on the item's right-click menu. They are also offered as Quick Fixes in the editor, on the problems Doorstop reports for them (see below).
![alt text](<media/promotion/08-review and clear links.gif>)

**Global Utilities:** Access frequent operations (Reorder, Import, Export, Publish) from the dedicated panel or the VS Code Command Palette.

![alt text](media/promotion/11_some_more_commands.png)

### Editor Integration (CodeLens & IntelliSense)

 **CodeLens Derivation:** Derive downstream requirements with a single click directly above your requirement definitions.
 ![alt text](media/promotion/04_derive_requirement.gif)

 **Quick Fixes for Review & Suspect Links:** Where Doorstop reports a problem, it also offers the fix. Put the cursor on the reported line and press `Ctrl+.` (or click the lightbulb in the margin):

* **Do Review** on an item Doorstop reports as needing review marks that requirement as reviewed.
* **Clear Suspect Link** on a reported suspect link clears just that one link, leaving the item's other links suspect.
* **Clear All Suspect Links** appears alongside it when the item has more than one suspect link, and clears all of them at once.

 Because these are attached to Doorstop's own validation, they only appear when there is genuinely something to fix — an already-reviewed item or an already-cleared link offers nothing. All three act through the Doorstop server, so the file on disk is written by Doorstop itself. If the file has unsaved edits you are asked to save first — nothing is discarded silently.

 **Smart Autocompletion (IntelliSense):** Autocomplete upstream links with history support showing recently opened items at first.
![alt text](media/promotion/05_autocomplete.gif)

### Problem Reporting

**Doorstop validation, inline:** Every problem Doorstop reports appears in the
file it concerns - errors with a red squiggle, warnings with a yellow one, and
informational notes in the Problems panel. Each one is anchored to the field it
is actually about: the individual link entry for a broken or suspect link,
`reviewed:` for review state, `derived:` for missing parent/child links,
`level:` for duplicate or skipped levels, `ref:` for an unresolvable external
reference, and the document's own config file for document-level problems such
as an empty document.

The messages are Doorstop's own, so what you read here matches what
`doorstop` prints on the command line. Problems refresh when you save a
requirement, after any change this extension makes, and on demand via
**Doorstop: Re-check Problems**. They describe the state on disk, so a file with
unsaved edits may lag until you save it.

Three checks the extension deliberately does **not** report - self-links, link
cycles, and child links to inactive items - are not implemented as validation
checks by Doorstop 3.2. Reporting them would mean reimplementing Doorstop's
validation in a second place, which this extension avoids by design; an inactive
parent link already surfaces as a "linked to unknown item" error.

### Hover Previews & Navigation

Hover in editor over `links` e.g. (`REQ-0001`, `SYS-0002`):

* **Requirement Title & Level:** Header and hierarchy level.
* **Requirement Text:** Fully rendered specification description.
* **Traceability Links:** clickable parent requirement IDs.
![alt text](media/promotion/01_upstream-links.gif)
Hover in editor over `derived`:

**Traceability Links:** clickable list of linked child requirement IDs.
![alt text](media/promotion/02_downstream-links.gif)

### 🎨 Requirements Canvas

Collect and organize requirements on a visual canvas for spatial planning (and some future release traceability mapping).
![alt text](media/promotion/03_canvas_basics.gif)

Items you place on the canvas stay exactly where you put them — nothing rearranges
them behind your back. Right-click an item for **Add Linked Item…**, **Add Link to…**
(then click the item to link to), and **Remove from Diagram** — which takes the item
off the canvas only and never touches the requirement or its links. Right-click a
connection for **Remove Link**.

The toolbar offers two one-shot arrangements — **Hierarchical Layout** (top-down,
following link direction) and **Grid Layout** (a compact near-square box) — plus
**Ghost Preview**, which shows every item linked to what's on the canvas as a smaller,
lighter node, and **Show Headings**. All four are independent; none of them disables
another, and after either arrangement your items remain freely draggable.

---

## Requirements

For full requirement lifecycle management (creating documents, linking items, running validations), this extension launches a small local server that wraps the [Doorstop](https://pypi.org/project/doorstop/) Python API directly. Install it into the Python environment selected for your workspace (the interpreter chosen via the Python extension) — this single command also pulls in `doorstop`, `fastapi`, and `uvicorn` as dependencies:

```bash
pip install <path-to-this-extension-repo>/server
```

For local development of the server itself, use an editable install so source edits take effect without reinstalling:

```bash
pip install -e <path-to-this-extension-repo>/server
```
