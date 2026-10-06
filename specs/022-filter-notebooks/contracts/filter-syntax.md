# Contract: Filter Cell Syntax

A filter cell's text is YAML. `#` comments are allowed anywhere.

## Grammar

```text
cell        := filter
             | { filters: filter, order: [attribute, ...] }   # Bases-style; order: optional

filter      := expression                       # YAML string
             | { and:       [filter, ...] }     # all must match
             | { or:        [filter, ...] }     # at least one must match
             | { not:       [filter, ...] }     # none may match (Bases semantics)
             | { hasChild:  filter }            # some direct child matches
             | { hasParent: filter }            # some direct parent matches

expression  := attribute OP literal
             | attribute "." method "(" [literal] ")"

OP          := == | != | < | <= | > | >=
method      := contains(literal) | startsWith(literal) | isEmpty() | isNotEmpty()
literal     := "string" | 'string' | number | true | false | null
attribute   := uid | document | level | header | text | ref
             | active | normative | derived | reviewed | links
             | <any custom attribute name>      # letters, digits, _ and -, e.g. invented-by
```

Rules:

- A mapping must have exactly one key. A group list must not be empty.
- `hasChild` / `hasParent` take one filter. To combine several conditions,
  nest a group: `hasChild: { and: [...] }`.
- Group lists hold strings or nested groups, to any depth.
- `order:` lists the table columns after UID, in order; `uid` in it is ignored.
  Without `order:` the columns are `document`, `level`, `header`. A `filters:`
  mapping may hold only `filters` and `order`.
- Anything else (unknown keys, function calls on other names, arithmetic,
  `&&`, `||`, `!`) is rejected with `INVALID_FILTER`.

## Semantics

| Case | Result |
|------|--------|
| Attribute missing on the item | Comparisons, `contains`, `startsWith`, `isNotEmpty()` → no match; `isEmpty()` → match |
| Type mismatch (e.g. text `>` number) | No match |
| `contains` on text | Case-sensitive substring |
| `contains` on a list (`links`, custom lists) | Membership |
| `level` compared with a literal | Both sides compared as Doorstop levels; write levels as strings (`"1.10"`) |
| `hasChild` on an item without children | No match |
| `hasParent` with a link to an unknown UID | That link is ignored |

## Examples

```yaml
# Draft tests with their status and owner as columns
filters:
  and:
    - document == "TST"
    - status == "draft"
order: [status, owner, header]
```

```yaml
# Unreviewed active items (the new-notebook example)
and:
  - active == true
  - reviewed == false
```

```yaml
# REQ items that have an approved child
and:
  - document == "REQ"
  - hasChild: status == "approved"
```

```yaml
# Items in REQ or SYS that have no ref, at level 2 or deeper
and:
  - or:
      - document == "REQ"
      - document == "SYS"
  - ref.isEmpty()
  - level >= "2"
```

```yaml
# Items with at least one child, where every child is approved
and:
  - not:
      - hasChild:
          not:
            - status == "approved"
  - hasChild: uid != ""
```
