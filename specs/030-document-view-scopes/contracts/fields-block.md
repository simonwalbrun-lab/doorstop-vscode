# Contract: Editable fields block and setting

## Setting

```json
"doorstop.documentView.fields": {
  "type": "array",
  "items": { "type": "string" },
  "default": [],
  "markdownDescription": "Item YAML header fields (e.g. `ref`, `status`) shown for editing in document views, in this order. Applies the next time a view is opened. Protected fields such as `level`, `links` and `reviewed` cannot be listed."
}
```

Default `[]` ⇒ views identical to today (FR-014). Entries are trimmed and
de-duplicated; protected names are ignored with one status-bar/info message
naming them (FR-016).

## Rendering

For an item with at least one configured field present (scalar value), the
block is:

````text
<!-- SYS-0006 · 1.1 · item separator. keep this line -->
## Sensor checklists
```doorstop-fields
ref: sensors.md
status: draft
```
Item text starts here…
````

- Directly after the heading line; absent when the item has none of the fields.
- Fence lines (```` ```doorstop-fields ```` and the closing ```` ``` ````) are
  dimmed like separators. Editing them is not reverted; a damaged block is the
  structural error `fields-structure` (one code for missing / extra / renamed /
  malformed / unclosed lines) that refuses the save, with a "Restore block
  structure" quick fix that rebuilds the block from the item.
- One `name: value` line per field, in setting order. Value = the raw scalar,
  single line. `name` is fixed by the setting; editing it is a structural error.
- The first occurrence of this fence right after the heading is the block; the
  same fence text deeper in the item text is ordinary text (as for headings in
  019 FR-011).

## Save plan

- Changed value line ⇒ `PATCH /items/{uid}` with `fields: {name: value}`
  (combined with header/text of the same item in one request).
- Missing field line / extra line / multi-line value ⇒ structural error, save
  refused with the existing "Restore block structure" quick fix.
- A field the item did not have is not shown, so it cannot be added here.
