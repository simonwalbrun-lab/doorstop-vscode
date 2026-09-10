# Phase 1 Data Model: Doorstop Validation Problems In-Item

Entities are listed in the direction data flows: Doorstop's raw issue → the
server's structured record → the extension's diagnostic.

---

## 1. Raw Doorstop issue (input, not ours)

What `Document.get_issues()` yields. Listed to make the adapter's job explicit.

| Aspect | Value |
|---|---|
| Type | `DoorstopError`, `DoorstopWarning`, or `DoorstopInfo` (all `Exception` subclasses) |
| Payload | A single message string. **Nothing else** — no check id, no item reference, no field |
| Item attribution | Encoded *into the string* as a `"{uid}: "` prefix by `Document.get_issues` |
| Severity | Carried by the Python class only |

Class hierarchy note for the adapter: `DoorstopWarning` and `DoorstopInfo` both
derive from `DoorstopError`, so classification must test **`DoorstopInfo` first,
then `DoorstopWarning`, then `DoorstopError`**. Testing `DoorstopError` first
would classify every issue as an error.

---

## 2. `ValidationIssue` (server response record)

The feature's central entity. One record per distinct problem; a problem
concerning several items carries them all in `uids` (this is the FR-005 fan-out
carrier).

| Field | Type | Required | Meaning |
|---|---|---|---|
| `severity` | `"error" \| "warning" \| "info"` | yes | Doorstop's own class, mapped 1:1. Never overridden. |
| `check` | `string` | yes | Stable identifier for the check, e.g. `suspect_link`. `"unknown"` when the message matched no template (FR-011). |
| `message` | `string` | yes | Doorstop's message with the item-UID prefix stripped, so the user reads Doorstop's own wording (FR-004). |
| `documentPrefix` | `string` | yes | Document the issue was found in. |
| `uids` | `string[]` | yes | Items the problem applies to. Empty ⇒ document-level, anchor on the document config file. Length > 1 ⇒ fan-out (`duplicate level`, `skipped level`). |
| `relatedUid` | `string \| null` | yes | The *other* item named by the message — the link target for link checks. Selects which link entry to anchor to. `null` when not applicable. |
| `field` | `FieldAnchor \| null` | yes | Semantic anchor hint (below). `null` ⇒ anchor to the item's first line. |

`FieldAnchor` = `"document" | "level" | "text" | "reviewed" | "links" | "link_entry" | "derived" | "ref"`.

`link_entry` is distinct from `links`: it means "the individual entry whose UID is
`relatedUid`", where `links` means the `links:` key itself.

**Validation rules**

- `field: "link_entry"` ⇒ `relatedUid` is non-null.
- `field: "document"` ⇒ `uids` is empty.
- `uids` empty ⇒ `field` is `"document"` or `null`.
- `check: "unknown"` ⇒ `field` is `null` (nothing is known about placement).
- `message` never retains the `"{uid}: "` prefix; the prefix's information lives
  in `uids` instead.

**Invariants**

- Read-only: producing a `ValidationIssue` never modifies the repository
  (research.md §1).
- Every issue Doorstop yields produces exactly one `ValidationIssue`. None is
  filtered, including Info-class and unrecognised messages (SC-007).

---

## 3. `ValidationResponse`

| Field | Type | Meaning |
|---|---|---|
| `issues` | `ValidationIssue[]` | All issues across the whole tree. Order is Doorstop's own (document, then item, then check order) and is not significant. |

Whole-tree by nature — cycles, cross-document links and duplicate levels cannot be
judged from a single file, so there is no per-file variant of this call
(FR-015, research.md §6).

---

## 4. `AnchorResolution` (extension-internal)

The transient result of turning one `ValidationIssue` + one target UID into a
place in a file. Not serialised.

| Field | Type | Meaning |
|---|---|---|
| `uri` | `vscode.Uri` | File to annotate — the item's `path`, or the document's `markerPath` for document-level issues. |
| `range` | `vscode.Range` | Line-level range for the resolved anchor. |
| `fallbackUsed` | `boolean` | True when the intended field was absent and FR-010's fallback applied. Diagnostic-quality signal for logging, not shown to the user. |

**Resolution order** (first match wins):

1. `field: "document"` → `markerPath`, line 0.
2. `field: "link_entry"` → within the `links:` block, the entry line whose UID
   token equals `relatedUid`.
3. `field: "text"` on a markdown-format item → the file's **last line** (FR-007).
4. Any other `field` → the first line matching that field's key regex
   (`/^\s*<key>\s*:/i`), searched inside the YAML frontmatter for markdown items.
5. Fallback → the item's first line.

**Rules**

- Files split on `/\r?\n/` (CRLF on Windows — research.md §5).
- A UID with no known path resolves to its document's `markerPath`.
- Resolution never fails: step 5 always yields a range.

---

## 5. Relationships

```text
Doorstop issue (string + class)
        │  classified by validation_rules.py  (server; research.md §3, §4)
        ▼
ValidationIssue ──┬─ uids[0..n] ──▶ Item ──▶ file path      (from GET /tree)
                  ├─ relatedUid  ──▶ Item  (link target, selects the entry line)
                  └─ documentPrefix ▶ Document ▶ markerPath  (from GET /tree)
        │  one diagnostic per uid  (FR-005 fan-out)
        ▼
AnchorResolution ──▶ vscode.Diagnostic ──▶ DiagnosticCollection
```

One `ValidationIssue` with *n* UIDs becomes *n* diagnostics carrying identical
`message` and `severity` — the mechanism behind FR-005 and SC-004. `duplicate
level` is the concrete case: one Doorstop warning naming two items becomes one
warning on each item's `level:` line.

---

## 6. Existing entities reused unchanged

`ItemNode` (`uid`, `path`, `links`), `DocumentNode` (`prefix`, `markerPath`,
`itemFormat`, `items`) and `TreeResponse` from
[doorstopTypes.ts](../../src/doorstopTypes.ts) and
[schemas.py](../../server/src/doorstop_server/schemas.py) already carry every
field the anchoring needs. **`GET /tree` requires no change.**
