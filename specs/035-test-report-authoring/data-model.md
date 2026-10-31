# Data Model: Test Report Authoring

No new persisted data format. The feature reads and writes three existing
things: item text, files under a document's `assets` folder, and objects in
a bucket. Everything below is in-memory shape or settings.

## Task line

A line in an item's text range (research R2) that matches

```text
^(\s*)([-*+]|\d+[.)])\s+\[( |x|X)\](\s|$)
```

| Field | Meaning |
| --- | --- |
| line | 0-based line number in the editor document |
| boxStart | column of `[` |
| state | `' '` unchecked, `x`/`X` checked |

Toggle: `' '` → `x`; `x`/`X` → `' '`. Only the character at `boxStart + 1`
changes (FR-002). A click toggles when the cursor column is `boxStart + 1` or
`boxStart + 2`, i.e. strictly inside the brackets (FR-001).

Not a task line: inside a fenced block (```` ``` ```` / `~~~` toggles the
state on each fence line), or outside the text range (FR-005).

## Attachment source

One entry taken from the drop/paste data transfer.

| Field | Meaning |
| --- | --- |
| name | original file name; generated `paste-YYYYMMDD-HHMMSS.<ext>` for clipboard image data |
| size | bytes (from `fs.stat` or the data length) |
| read | file path on disk (`text/uri-list`, `file:` scheme) **or** bytes (`DataTransferFile` without URI) |

Rejected: a URI that is a directory (FR-010), a non-`file:` URI.

## Stored attachment

| Field | Meaning |
| --- | --- |
| target | `assets` or `objectStorage`, chosen per file (FR-011, FR-014) |
| link | relative path from the item's folder (assets) or object URL (object storage) |
| isImage | extension in `png jpg jpeg gif svg webp bmp` (case-insensitive) |

Target rule:

```text
mode == assets                         → assets
mode == objectStorage, size >  limit   → objectStorage
mode == objectStorage, size <= limit   → assets
limit = thresholdMB * 1024 * 1024; thresholdMB == 0 → every file to objectStorage
```

Inserted text per file (FR-008): `![name](link)` if `isImage`, else
`[name](link)`. Several files: one per line, each continuation line
indented to the text range's indent (YAML block scalar), in transfer order.

## Asset file name resolution (FR-013)

```text
candidate = name
loop:
  assets/candidate missing                 → write here
  assets/candidate same size and bytes     → reuse, no write
  else candidate = stem-N.ext (N = 1, 2, …)
```

Writes go to `assets/.<candidate>.partial` and are renamed when complete
(research R5).

## Object key

`{prefix}{UID}/{YYYYMMDD-HHMMSS}-{name}`. `prefix` comes from settings and is
used verbatim, so `reports/` gives `reports/TR-001/…`. The URL is
`{endpoint}/{bucket}/{encoded key}`.

## Settings and secrets

See [contracts/user-interface.md](contracts/user-interface.md#settings).
Secrets: `doorstop.objectStorage.accessKey`, `doorstop.objectStorage.secretKey`
in VS Code secret storage, per user and machine.

## State transitions of one attach operation

```text
provide (cheap, no side effects)
  └─ resolve (user applied the edit)
       ├─ index lookup fails           → error, no text inserted
       ├─ per file: store/upload
       │    ├─ ok                      → link collected
       │    ├─ failed                  → partial removed, error collected
       │    └─ cancelled               → partial removed, stop remaining files
       └─ insert links of ok files; show one error listing failed files
```
