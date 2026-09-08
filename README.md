# Doorstop Requirements for VS Code

Seamlessly manage, view, and navigate [Doorstop](https://doorstop.readthedocs.io/) requirement items directly inside VS Code.

This extension brings requirement lifecycle management into your developer workflow—from interactive tree views and inline editor actions to smart autocompletion and hover previews.

---

## Features

### Doorstop Explorer & Commands

**Requirement Tree View:** Browse all your Doorstop documents and items directly in the SideBar ordered by level of the items.

![alt text](media/promotion/06-treeview-navigation.gif)

**Inline Node Actions:** Quickly **Add**,
![alt text](media/promotion/07-new_requirement.gif)
**Review**, **Clear Suspect Status**, or
![alt text](<media/promotion/08-review and clear links.gif>)
**Link** items via inline action buttons on hover.
![alt text](media/promotion/09_link_items.gif)

**Global Utilities:** Access frequent operations (Reorder, Import, Export, Publish) from the dedicated panel or the VS Code Command Palette.

![alt text](media/promotion/11_some_more_commands.png)

### Editor Integration (CodeLens & IntelliSense)

 **CodeLens Derivation:** Derive downstream requirements with a single click directly above your requirement definitions.
 ![alt text](media/promotion/04_derive_requirement.gif)

 **Smart Autocompletion (IntelliSense):** Autocomplete upstream links with history support showing recently opened items at first.
![alt text](media/promotion/05_autocomplete.gif)

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
