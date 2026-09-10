# Contract: Validation API and Anchor Mapping

Two interfaces are specified here: the server's `GET /validate` endpoint, and the
extension's check → editor-anchor mapping. Both are pinned to **Doorstop 3.2**
(see [research.md §4](../research.md) on version coupling).

---

## 1. `GET /validate`

Read-only. Validates the whole tree and returns every issue Doorstop reports.

**Request**: no parameters, no body.

**Response `200`**:

```json
{
  "issues": [
    {
      "severity": "warning",
      "check": "suspect_link",
      "message": "suspect link: REQ-001",
      "documentPrefix": "REQ",
      "uids": ["REQ-007"],
      "relatedUid": "REQ-001",
      "field": "link_entry"
    },
    {
      "severity": "error",
      "check": "linked_to_unknown_item",
      "message": "linked to unknown item: REQ-999",
      "documentPrefix": "REQ",
      "uids": ["REQ-009"],
      "relatedUid": "REQ-999",
      "field": "link_entry"
    },
    {
      "severity": "warning",
      "check": "duplicate_level",
      "message": "duplicate level: 1.0 (REQ-001, REQ-002)",
      "documentPrefix": "REQ",
      "uids": ["REQ-001", "REQ-002"],
      "relatedUid": null,
      "field": "level"
    },
    {
      "severity": "warning",
      "check": "no_items",
      "message": "no items",
      "documentPrefix": "EMPTY",
      "uids": [],
      "relatedUid": null,
      "field": "document"
    }
  ]
}
```

Field semantics and validation rules: [data-model.md §2](../data-model.md).

**Errors**: the existing structured shape, via `register_exception_handlers` —
`{"error": {"code": "...", "message": "..."}}`. A malformed project surfaces as
`400 DOORSTOP_ERROR`; anything unexpected as `500 INTERNAL_ERROR`. The endpoint
never returns a partial issue list alongside an error.

### Behavioural guarantees (each is a test in `server/tests/test_validation.py`)

1. **No writes.** Every file under the project root is byte-identical before and
   after the call. This is the regression test for [research.md §1](../research.md);
   without the read-only settings scope it fails on any project containing an
   unreviewed item or an unstamped link.
2. **Whole tree.** Issues are returned for every document, including documents
   with no open editor and empty documents.
3. **Nothing dropped.** Every issue Doorstop yields appears exactly once,
   including Info-class issues and messages matching no template.
4. **Prefix stripped.** No `message` begins with `"<UID>: "`; that information is
   in `uids`.
5. **Fan-out preserved.** A message naming two items yields one record with two
   entries in `uids`, not two records.

---

## 2. Check catalogue and anchor mapping

`check` ids are stable identifiers owned by this contract. The **Doorstop 3.2
message** column is the classification input; the **Anchor** column is what the
extension does with `field`.

### 2a. Implemented — Warnings

| `check` | Doorstop 3.2 message | `field` | `relatedUid` | Anchor |
|---|---|---|---|---|
| `no_items` | `no items` | `document` | — | Document config file, line 0 |
| `duplicate_level` | `duplicate level: {lvl} ({uidA}, {uidB})` | `level` | — | `level:` line of **each** named item |
| `no_text` | `no text` | `text` | — | `text:` line; **last line of file** for markdown items |
| `unreviewed_changes` | `unreviewed changes` | `reviewed` | — | `reviewed:` line |
| `linked_to_non_normative` | `linked to non-normative item: {uid}` | `link_entry` | the uid | That link entry |
| `suspect_link` | `suspect link: {uid}` | `link_entry` | the uid | That link entry |
| `non_normative_has_links` | `non-normative, but has links` | `links` | — | `links:` line |
| `no_links_from_child_document` | `no links from child document: {prefix}` | `derived` | — | `derived:` line |
| `no_links_to_parent_document` | `no links to parent document: {prefix}` | `derived` | — | `derived:` line |
| `no_documents` | `no documents` | `document` | — | Root document config file |
| `skipped_level` | `skipped level: {lvl} ({uid}), {lvl} ({uid})` | `level` | — | `level:` line of each named item — **Info class**, listed here as a level check |

### 2b. Implemented — Errors

| `check` | Doorstop 3.2 message | `field` | `relatedUid` | Anchor |
|---|---|---|---|---|
| `invalid_uid_in_links` | `invalid UID in links: {uid}` | `link_entry` | the uid | That link entry |
| `linked_to_unknown_item` | `linked to unknown item: {uid}` | `link_entry` | the uid | That link entry |
| `external_reference_not_found` | `external reference not found: {ref}` | `ref` | — | `ref:` / `references:` line |

> `linked_to_unknown_item` also covers the spec's **"parent link is an inactive
> item ⇒ ERROR"**: `Tree.find_item()` skips inactive items, so an inactive parent
> is reported through this check at error severity. See
> [research.md §2b](../research.md). No severity override exists anywhere in this
> feature — the extension reports Doorstop's own class in every case.

### 2c. Implemented — Info

| `check` | Doorstop 3.2 message | `field` |
|---|---|---|
| `needs_initial_review` | `needs initial review` | `reviewed` |
| `prefix_differs_from_document` | `prefix differs from document ({prefix})` | `null` |
| `unexpected_parent_prefix` | `parent is '{prefix}', but linked to: {uid}` | `link_entry` |

### 2d. Reserved — not emitted by Doorstop 3.2

These ids and anchors are fixed now so the checks route correctly if Doorstop
adds them. **No code produces them today** — see
[research.md §2c](../research.md) and the plan's Complexity Tracking.

| `check` | Spec check | Reserved `field` |
|---|---|---|
| `linked_to_self` | An item is linked to itself | `link_entry` |
| `link_cycle` | There is a cycle of item links | `links` |
| `child_link_inactive` | An item's child link is an inactive item | `link_entry` |

### 2e. Fallback

| `check` | When | `field` | Anchor |
|---|---|---|---|
| `unknown` | Message matched no template above | `null` | Item's first line, at Doorstop's own severity |

---

## 3. Severity mapping (extension)

| `severity` | `vscode.DiagnosticSeverity` | Presentation |
|---|---|---|
| `error` | `Error` | Red squiggle, error in Problems panel |
| `warning` | `Warning` | **Yellow squiggle**, warning in Problems panel |
| `info` | `Information` | Listed in Problems panel; no warning/error noise |

Every diagnostic sets `source: "doorstop"` and `code: <check>`, so users can
filter by check and so a future quick-fix provider has a stable hook.

---

## 4. Command contract (extension)

| Command id | Title | Behaviour |
|---|---|---|
| `doorstop.recheckProblems` | `Doorstop: Re-check Problems` | Forces a full refresh, bypassing the debounce (FR-013) |

Automatic refresh triggers (FR-012): server-ready; `onDidSaveTextDocument` for
`.yml`/`.md` files in the workspace; after any extension-initiated mutation.
Debounced 300 ms; in-flight refreshes are superseded, not queued.

**On fetch failure** (FR-014): the collection is cleared and one message is shown
per failure transition — never a repeat per debounce tick, and never a stale
problem left on screen.
