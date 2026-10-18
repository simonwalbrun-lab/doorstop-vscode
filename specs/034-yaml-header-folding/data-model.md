# Data Model: YAML Header Folding

## Setting `doorstop.foldYamlHeaderOnOpen`

| Field | Value |
|-------|-------|
| Type | boolean |
| Default | `false` |
| Written by | the two title-bar commands (Workspace target, Global without a folder) |
| Read by | the folding range provider (range kind), the `view/title` when clauses |

Transitions: `false` → `true` by `doorstop.foldYamlHeaderOnOpen.on`, `true` → `false`
by `.off`, or any value by the Settings UI / settings file. Every change fires
`onDidChangeFoldingRanges`.

## Header fold range

Derived per document, never stored.

| Field | Value |
|-------|-------|
| start | 0 (the opening `---`) |
| end | line of the closing `---` |
| kind | `Imports` when the setting is on, none when off |

Exists only when: file is `.md`, an ancestor folder holds `.doorstop.yml`,
line 0 is `---`, a closing `---` follows, and `end >= 2`.
