# Contract: Publish endpoints

## `POST /documents/{prefix}/publish` (extended)

Request body adds one optional field:

```json
{
  "format": "markdown | html | latex",
  "destinationPath": "<file path>",
  "template": "<name>",          // optional, existing
  "sharedTemplate": false        // optional, new, default false
}
```

- `sharedTemplate: true` + non-empty `template` + format not `markdown` +
  document without `template/` folder: the server temporarily copies the first
  owning document's template folder into the document, publishes, and removes
  the copy in all outcomes.
- Otherwise identical to today. Response: `{ "path": "<written file>" }`.
- Errors: `400 DOORSTOP_ERROR` (Doorstop message), unchanged shape.

## `POST /publish` (new, combined run)

```json
{
  "format": "markdown | html | latex",
  "destinationPath": "<directory>",
  "template": "<name>"           // optional
}
```

- Calls Doorstop's tree publish once. Doorstop enforces that at most one
  document owns a template folder.
- Response: `{ "path": "<index.html if written, else destination directory>" }`.
- Errors: `400 DOORSTOP_ERROR` (e.g. `Multiple templates found in tree`, or
  `nothing to publish` for an empty project).

## Extension surface

`doorstop.publish` picker: documents, then "All documents - one file each",
"All documents - combined run". No new command ids or settings.
