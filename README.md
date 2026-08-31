# Doorstop Requirements for VS Code

Seamlessly view and navigate [Doorstop](https://doorstop.readthedocs.io/) requirement items directly inside VS Code.

This extension brings inline requirement inspection into your developer workflow, allowing you to preview requirement text, levels, and upstream links without switching between source code and YAML/Markdown specification files.

---

## Features

### Requirement ID Hover Hints

Hover over any Doorstop requirement UID (e.g., `REQ-0001`, `SYS-0002`) across your workspace files—whether in code comments, Markdown documentation, or source files—to view a detailed hover preview card containing:

* **Requirement Title & Level:** Header and hierarchy level.
* **Requirement Text:** Fully rendered specification description.
* **Traceability Links:** Formatted list of linked upstream/parent requirement IDs.
* **Reference Fields:** File path or external references (`ref`).

Supports both standard Doorstop **YAML (`.yml`)** files and **YAML Frontmatter + Markdown (`.md`)** item formats.

---

## Requirements

This extension operates on workspace files and does not require external tools for basic hover previews.

For full requirement lifecycle management (creating documents, linking items, running validation), ensure [Doorstop](https://pypi.org/project/doorstop/) is installed in your Python environment:

```bash
pip install doorstop-cli
