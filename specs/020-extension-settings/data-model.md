# Data Model: Extension Settings

All settings live in VS Code's configuration (user or workspace scope,
FR-012). Nothing is persisted by the extension itself.

## Problem-report setting

One object setting `doorstop.problems` (rendered by VS Code as a single
checkbox list). Each property is a check id, `boolean`, default `true`:

- `invalid_uid_in_links`
- `linked_to_unknown_item`
- `external_reference_not_found`
- `linked_to_non_normative`
- `suspect_link`
- `non_normative_has_links`
- `no_links_from_child_document`
- `no_links_to_parent_document`
- `no_items`
- `no_documents`
- `no_text`
- `unreviewed_changes`
- `duplicate_level`
- `skipped_level`
- `needs_initial_review`
- `prefix_differs_from_document`
- `unexpected_parent_prefix`
- `unknown`

Rule: an issue is kept unless `doorstop.problems[issue.check] === false`. A
check id with no property (e.g. a reserved id, or one added to the server
later) is kept.

## New-document settings

| Key | Type | Allowed | Default |
|-----|------|---------|---------|
| `doorstop.newDocument.itemFormat` | string enum | `yaml`, `markdown` | `yaml` |
| `doorstop.newDocument.separator` | string enum | `""`, `-`, `.`, `_` | `""` |
| `doorstop.newDocument.digits` | integer | 1–9 | `3` |

Read when `doorstop.createDoc` runs; applied only to the document being
created (FR-007).

## Publish setting

| Key | Type | Default |
|-----|------|---------|
| `doorstop.publish.template` | string | `""` (Doorstop's built-in template) |

Sent only for HTML and LaTeX publishes, and only when non-empty.
