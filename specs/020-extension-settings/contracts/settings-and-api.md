# Contract: Settings and API changes

## 1. `package.json` → `contributes.configuration`

An array of three titled sections so the settings UI groups them under
"Doorstop":

| Section title | Keys |
|---------------|------|
| Doorstop › Problems | `doorstop.problems` (one object, 18 boolean properties, see data-model.md) |
| Doorstop › New Document | `doorstop.newDocument.itemFormat`, `.separator`, `.digits` |
| Doorstop › Publish | `doorstop.publish.template` |

Per key:

- `doorstop.problems`: `"type": "object"`, `"additionalProperties": false`,
  one `"type": "boolean"` property per check id with a `description` quoting
  Doorstop's message, and a `default` object with every id `true`. An object
  whose properties are all booleans is shown as one compact checkbox list.
- `itemFormat`: `"enum": ["yaml", "markdown"]`, `"enumItemLabels": ["YAML",
  "Markdown"]`.
- `separator`: `"enum": ["", "-", ".", "_"]`, `"enumItemLabels": ["None",
  "- (hyphen)", ". (dot)", "_ (underscore)"]`.
- `digits`: `"type": "integer", "minimum": 1, "maximum": 9`.
- `template`: `"type": "string"`, description says it applies to HTML and
  LaTeX and must name a template in the document's `template` folder.

All keys use the default `window` scope (settable per user and per workspace).

## 2. `POST /documents` (unchanged)

Already accepts `itemFormat`, `digits`, `separator`. The extension now always
sends all three from settings.

## 3. `POST /documents/{prefix}/publish` (changed)

Request body gains one optional field:

```json
{ "format": "html", "destinationPath": "...", "template": "custom" }
```

- `template` omitted or `null` → behaviour unchanged.
- `template` set → forwarded to Doorstop's `publish(template=...)`.
- Doorstop cannot use the template (no `template` folder, or missing file) →
  the existing structured `DoorstopError` response
  (`{"error": {"code": "DOORSTOP_ERROR", "message": ...}}`, HTTP 400).
