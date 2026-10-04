# Contract: `doorstop-status.md` format

The file is written to `<workspace root>/doorstop-status.md` and overwritten on
every run. Sections always appear in this order. `<…>` marks generated values.

````markdown
# Doorstop Project Status — <projectName>

Generated: <generatedAt, ISO 8601 local, minutes precision>

## Items per Document

```mermaid
---
config:
  xyChart:
    height: 200
---
xychart
    title "Items per document"
    x-axis ["<PREFIX1>", "<PREFIX2>", …]
    y-axis "Items"
    bar [<count1>, <count2>, …]
```

## Problems per Document

### <PREFIX1>

```mermaid
---
config:
  xyChart:
    height: 200
---
xychart
    title "Problems in <PREFIX1>"
    x-axis ["<check-a>", "<check-b>", …]
    y-axis "Problems"
    bar [<n-a>, <n-b>, …]
```

### <PREFIX2>

No problems.

## Requirement Volatility

```mermaid
---
config:
  xyChart:
    height: 200
---
xychart
    title "Changed item files per week (last 26 weeks)"
    x-axis ["<YYYY-MM-DD>", … 26 entries]
    y-axis "Changed item files"
    bar [<w1>, …, <w26>]
```
````

## Rules

- **No documents**: "Items per Document" and "Problems per Document" each contain
  the single line `No documents.`, with no chart.
- **Document without issues**: its `###` section contains `No problems.`
- **Version history unavailable**: the volatility section contains
  `Version history unavailable: <reason>.`, with no chart.
- **Chart size**: every chart starts with the Mermaid frontmatter
  `config.xyChart.height: 200` so the charts stay compact. Width is left at
  Mermaid's default.
- **Labels**: always double-quoted. Any `"` inside a label is removed.
- **Order**:
  - documents: `/tree` order;
  - problem types: count descending, then name ascending;
  - weeks: oldest first.
- **Atomicity**: no file is written if `/tree` or `/validate` fails. A git
  failure is not fatal (see the volatility rule above).
