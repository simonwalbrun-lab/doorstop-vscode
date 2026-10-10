# Data Model: Publish All Modes

No persisted data. Transient concepts only.

## Publish mode (extension, per command run)

| Value | Meaning |
|-------|---------|
| `document:<PREFIX>` | One document, today's behaviour (FR-009) |
| `each` | Loop over documents, `sharedTemplate: true` (FR-002/003) |
| `together` | One tree request (FR-006) |

## Borrowed template (server, per request)

- **Owner**: first document in tree order with a `template/` folder.
- **Target**: `<document path>/template`, created only if absent.
- **Lifecycle**: created before `publisher.publish`, removed in `finally`;
  never created when the document already has the folder, the format is
  Markdown, no template name was sent, or no owner exists.

## Validation rules

- `sharedTemplate` only has effect together with a non-empty `template`.
- Tree publish `format`/`destinationPath` follow the document publish rules;
  `destinationPath` is a directory.
