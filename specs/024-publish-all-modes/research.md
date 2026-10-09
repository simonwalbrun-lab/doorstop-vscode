# Research: Publish All Modes

## R1. Why single-document publish fails without a local template

- **Finding**: `doorstop.core.template.get_template` takes the template from
  `obj.template`, i.e. `<document path>/template` only. With a template name
  and no such folder it raises `Template flag set, but no 'template' folder was
  found.` For a tree it scans every document and raises
  `Multiple templates found in tree` when more than one has the folder.
- **Decision**: Do not patch Doorstop (spec FR-010). Provide the folder the
  lookup expects.

## R2. Where the borrowed template is provisioned

- **Decision**: Server side, inside the per-document publish request, behind an
  opt-in `sharedTemplate` flag. A context manager copies the owner's
  `template/` contents into `<doc>/template/` when the document has none and
  removes it in `finally`.
- **Rationale**: Constitution I/II; cleanup scoped to one request means a
  crashing extension cannot leave folders behind (SC-002), the server's
  one-request-at-a-time lock already serialises it, and `copy_dir_contents` /
  `delete` from Doorstop are reused.
- **Alternatives**: Extension copies files with `vscode.workspace.fs`
  (rejected: client-side file logic, cleanup not guaranteed if the window
  dies). Always borrow without a flag (rejected: changes single-document
  publish, FR-009).

## R3. Which document supplies the template

- **Decision**: First document in `tree.documents` order whose `template` is
  not `None`. Documents with their own folder are untouched. If no document
  owns one, nothing is borrowed and Doorstop's existing error surfaces.

## R4. Combined run

- **Decision**: New `POST /publish` calling
  `publisher.publish(tree, destinationPath, ext=ext, template=...)`. Doorstop
  itself then writes every document, the HTML index, and the traceability
  matrix, and enforces the one-template rule.
- **Output path reporting**: destination is a folder. Report
  `<folder>/index.html` for HTML if it exists, else the folder (`_resolve_written_path`
  keeps working for single files and is not reused for folders).
- **Alternatives**: Loop on the extension (that is the other mode).

## R5. Markdown and no template

- **Decision**: Unchanged from spec 020: Markdown sends no template; with no
  template configured, `sharedTemplate` is ignored by the server (nothing to
  borrow).

## R6. Picker naming

- **Decision**: Entries "All documents - one file each" (description: each
  document published separately, shared template supplied) and "All documents -
  combined run" (description: published together with index and traceability
  matrix). Other callers of `chooseDocumentOrAll` (non-publish commands) keep
  their single "all" entry; only publish uses the new list.
