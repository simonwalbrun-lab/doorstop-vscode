# Contract: Document View Text Format

**Feature**: 019-document-view | **Consumers**: `documentViewModel.ts` (render / parse / plan), every test that asserts view content.

The view is plain markdown. Only the lines below carry structure; everything
else is item content.

## Managed lines

| Line | Exact form | Regex (anchored, whole line) |
| --- | --- | --- |
| Document marker (line 1) | `<!-- doorstop document SYS · keep this line -->` | `^<!-- doorstop document (?<prefix>[A-Za-z0-9_-]+) · keep this line -->$` |
| Item separator | `<!-- SYS-0006 · 1.1 · item separator. keep this line -->` | `^<!-- (?<uid>[A-Za-z0-9_.-]+) · (?<level>\d+(?:\.\d+)*) · item separator\. keep this line -->$` (the UID class is wide on purpose: Doorstop allows UIDs without a separator such as `REQ001`; the UID is validated against the snapshot) |
| Placeholder marker | `<!-- new item -->` | `^<!-- new item -->$` |

- The separator `·` is U+00B7 MIDDLE DOT surrounded by single spaces.
- UIDs follow the existing `UID_REGEX` (`/\b[A-Z0-9_-]+-\d+\b/`) used by hover / definition, so those providers recognise the UID token inside a separator.
- Level is shown verbatim as the server reports it (`1.0`, `1.1`, `1.1.1`).
- A separator is recognised only when the whole line matches; leading/trailing whitespace or any other deviation makes it a **changed separator** (warning) if the UID is still present as a whole word on a line starting with `<!--`, or ordinary text otherwise.

## Rendering (server snapshot → text)

```text
<!-- doorstop document SYS · keep this line -->
                                                   ← blank line
<!-- SYS-0001 · 1.0 · item separator. keep this line -->
# Introduction                                     ← header line (depth 1)
                                                   ← blank line (block separator)
<!-- SYS-0006 · 1.1 · item separator. keep this line -->
## Sensor input                                    ← header line (depth 2)
The system shall …                                 ← text lines, verbatim
Second paragraph.
                                                   ← blank line
<!-- SYS-0009 · 1.1.1 · item separator. keep this line -->
### SYS-0009                                       ← UID when header is empty
Text of an item without header.
```

Rules:
1. Line 1 is the document marker, followed by one blank line.
2. Items: only `active` items, in the order `/tree` delivers them (Doorstop sort order after the server change).
3. Each item block = separator, header line, text lines. Blocks are separated by exactly one blank line. The file ends with a single `\n` after the last text (or header) line.
4. Header line: `'#'.repeat(depth) + ' ' + (header.trim() || uid)`, `depth = min(6, max(1, levelDepth(level)))` where `levelDepth` = number of dotted segments after dropping a trailing `.0` (the tree's existing helper).
5. Text lines: the server's `text` split on `\n`, unchanged. No text lines when `text` is empty (this includes heading items: non-normative + header + empty text).
6. An item whose text contains a line matching the item-separator regex is rendered verbatim; the renderer reports it as a `separator-lookalike` structural error at that line.
7. Empty document (no active items): the document marker only, plus the trailing `\n`.

## Parsing (text → blocks)

1. Split on `\r?\n`.
2. Line 0 must be the document marker; if not, the document marker is "missing" (the first non-empty lines up to the first separator are an `orphan` block → `text-before-first-separator`).
3. Every line matching the item-separator regex or the placeholder regex starts a new block; the block runs to the line before the next managed line (or end of text). Headings inside a block never split it.
4. In each item/placeholder block: the line directly after the separator is the header line. `headerLineIsHeading = /^#{1,6}\s+\S/.test(line)`; `headerText = line.replace(/^#{1,6}\s+/, '').trim()` (undefined when not a heading; `''` when the line is empty). The number of `#` is ignored.
5. Body = remaining lines: right-trim each, drop leading and trailing blank lines, join with `\n`.
6. Blank lines directly before a separator belong to nobody (they are the block separator) — this is implied by rule 5.

## Save plan (blocks + fresh snapshot → ChangeSet)

| Situation | Result |
| --- | --- |
| Separator UID appears twice | `separator-duplicated` error at the second line → save refused |
| Separator UID not an active item of this document | `separator-unknown` error → save refused |
| `orphan` block | `text-before-first-separator` error → save refused |
| `separator-lookalike` present | error → save refused |
| Item block, header or text differs from snapshot | `update { uid, header, text, headerOnly }`; `header = ''` when `headerText === uid`. The line after the separator is always the header line (rule 4): when it is not a markdown heading its trimmed text still becomes the header, and a blank line means header `''` — the `missing-header` warning and the header-only confirmation are what catch the accidental case (spec edge case "Header deleted entirely") |
| Item block identical after normalisation | `unchanged` |
| Active snapshot UID with no block | `deletion` |
| Placeholder block with non-empty header or body | `creation { afterUid, header, text }`; `afterUid` = UID of the nearest preceding item block in the text, `undefined` if none |
| Placeholder block with empty header and body | ignored |

`headerOnly` is true when the header differs and the normalised text is identical; the provider asks "Header of `<UID>` changed from '<old>' to '<new>' - Apply / Keep" per such block.

## Structural diagnostics while typing (no snapshot needed except for restore)

Computed from the parsed blocks and the last accepted render:

| Code | Condition |
| --- | --- |
| `text-before-first-separator` | an `orphan` block exists |
| `separator-duplicated` | UID of a separator already seen |
| `separator-changed` | a line starting with `<!--` contains a UID of the last render as a whole word but does not match the separator regex exactly |
| `missing-header` | item block whose header line is empty or not a heading |
| `placeholder-empty-heading` | placeholder block whose header line is empty |
| `separator-lookalike` | reported by the renderer for the current snapshot |

Each carries the UID when known; the quick fix title is `Restore block structure of <UID>` (or `Restore block structure` when no UID applies).

## Placeholder block inserted by "+ New item below" / "Insert Item Here"

Inserted directly after the target block (after its last line), as:

```text
                                  ← blank line (separator from the block above)
<!-- new item -->
#                                 ← heading line: "# " + cursor here
                                  ← empty paragraph line
```

The heading line is prefixed with `#` of the same depth as the block above (`# ` when inserted after the document marker) so the depth matches the reading order; the cursor is placed after the trailing space. A blank line follows so the next block keeps its separator. Cancel removes exactly these lines (and one adjacent blank line).
