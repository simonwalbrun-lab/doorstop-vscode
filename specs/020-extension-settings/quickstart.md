# Quickstart: validating Extension Settings

## Prerequisites

- Extension built (`npm run compile`) and launched in the Extension
  Development Host on a Doorstop project.
- Server tests runnable (`cd server && pytest`).

## Automated checks (Principle VI)

```text
cd server && pytest tests/test_documents.py -k template
npm test        # runs src/test, including regressionFixture.test.ts
```

Expected:

- Server: publish with `template` and no `template` folder → HTTP 400
  `DOORSTOP_ERROR`; publish without `template` → unchanged 200.
- Extension: creating a document with `separator = "-"`, `digits = 4`,
  `itemFormat = markdown` yields a `DocumentNode` with exactly those values.
- Extension: with `doorstop.problems.<kind> = false`, a refresh produces no
  diagnostic with that `code`; flipping it back restores them.

## Manual walkthrough

1. **Problem reports (US1)**: Open Settings, search "Doorstop problems",
   untick *Skipped Level*. Within 2 s every "skipped level" entry leaves the
   Problems panel and the document view; others stay. Tick it again → they
   return.
2. **New documents (US2)**: Set *Item Format* = Markdown, *Separator* = `-`,
   *Digits* = 4. Run "Create Document" for `REQ`, add an item → UID
   `REQ-0001`, file `REQ-0001.md`. Existing documents are unchanged.
3. **Publish template (US3)**: Leave *Template* empty, publish HTML → built-in
   template. Set *Template* to a name that does not exist → error message
   names the template and `doorstop.publish.template`, no success message.
4. **Defaults (SC-004)**: Reset all Doorstop settings → behaviour identical to
   before the feature.
