# Research: Extension Settings

No `NEEDS CLARIFICATION` remained in the Technical Context. The items below
record the design decisions made while reading the existing code.

## R1. Where problem kinds are filtered

- **Decision**: Filter the `ValidationResponse.issues` list in
  `refreshNow()` in `src/problemsProvider.ts`, right after `GET /validate`
  returns and before `buildDiagnostics` runs and `lastRefresh` is stored.
- **Rationale**: That is the one place every consumer reads from: the
  Problems panel (`buildDiagnostics`), the document view's projected problems
  (`documentViewLanguage.ts` reads `getLastRefresh()`), and the review quick
  fixes (driven by the diagnostics' `code`). Filtering there keeps all three
  consistent with a single `.filter()`.
- **Alternatives considered**:
  - *Doorstop's own check switches* (`--no-child-check`, `--no-ref-check`,
    `--no-review-check`, …). Rejected: they are coarse (one switch covers
    several kinds, e.g. the review check covers both `unreviewed_changes` and
    `suspect_link`) and so cannot meet "one checkbox per kind". Filtering
    reported issues does not re-implement any Doorstop logic, so Principle II
    holds.
  - *Server-side filtering via query parameter*. Rejected: adds an API
    surface for a pure presentation preference; a settings change would still
    need a round trip.

## R2. Which kinds get a checkbox

- **Decision**: The 17 check ids the server can emit
  (`server/src/doorstop_server/validation_rules.py` `CHECK_TABLE` entries with
  a pattern) plus `unknown` = 18 checkboxes. The three reserved ids
  (`linked_to_self`, `link_cycle`, `child_link_inactive`) get none.
- **Rationale**: The spec asks for one checkbox per kind Doorstop *can*
  report. Doorstop 3.2 never emits the reserved three (spec 014 scope
  decision), so a checkbox for them would never do anything.
- **Alternatives considered**: see R3 for the setting's shape.

## R3. Shape of the problem-kind setting

- **Decision**: One object setting `doorstop.problems` whose properties are
  the check ids (e.g. `suspect_link`), all `boolean`, with
  `additionalProperties: false`.
- **Rationale**: VS Code renders such an object as one compact list of
  checkboxes under a single heading (user request 2026-10-03: no heading per
  kind). Keys equal the diagnostic `code`, so no name mapping is needed.
- **Alternatives considered**: 18 separate boolean settings — rejected after
  review: each gets its own heading and the section becomes long.

## R4. New-document settings

- **Decision**: `doorstop.newDocument.itemFormat` (enum `yaml`|`markdown`,
  default `yaml`), `doorstop.newDocument.separator` (enum `""`|`-`|`.`|`_`,
  default `""`), `doorstop.newDocument.digits` (integer, min 1, max 9,
  default 3). `doorstop.createDoc` reads them and sends them on
  `POST /documents`.
- **Rationale**: The server already accepts `itemFormat`, `digits` and
  `separator` on `CreateDocumentRequest` and forwards them to
  `tree.create_document(sep=, digits=, itemformat=)`. No server change is
  needed. The defaults equal Doorstop's own, so FR-013 (unchanged default
  behaviour) holds.
- **Validation**: The enum makes the separator a dropdown, so no invalid value
  can be picked. `minimum`/`maximum` make the settings editor reject digits
  outside 1–9. A hand-edited `settings.json` with an out-of-range value is
  sent as-is; Doorstop then numbers with that width. Accepted ceiling — no
  extra guard code.

## R5. Publish template

- **Decision**: Add optional `template: str | None` to `PublishRequest`;
  `publish_document` passes it to `publisher.publish(..., template=...)`.
  The extension sends it from `doorstop.publish.template` when non-empty and
  the chosen format is HTML or LaTeX.
- **Rationale**: Doorstop 3.2's `publisher.publish` already takes
  `template=`. Its `get_template` raises `DoorstopError("Template flag set, but
  no 'template' folder was found.")` when the document has no `template`
  folder; the existing `DoorstopError` handler turns that into a structured
  error response (Principle III). Markdown output does not use a template,
  so the setting is not sent for it (otherwise a Markdown publish would fail
  in a document without a template folder).
- **Error message (FR-011)**: When a publish that sent a template fails, the
  extension's message names the template and the setting key, e.g.
  `Doorstop command failed: … (template "custom" from setting
  doorstop.publish.template)`.

## R6. Reacting to changes

- **Decision**: One `vscode.workspace.onDidChangeConfiguration` listener:
  if `affectsConfiguration('doorstop.problems')`, call
  `problems.refreshNow()`. New-document and publish settings are read at the
  moment the command runs, so they need no listener.
- **Rationale**: Meets FR-004 / SC-002 (≤ 2 s) with the existing refresh
  path; no cache of the unfiltered result is needed.
