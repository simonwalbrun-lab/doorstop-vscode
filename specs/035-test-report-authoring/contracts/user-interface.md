# Contract: User Interface

What users and other tools see. Implementation must match this exactly;
tests assert against it.

## Settings

Contributed in `package.json` → `contributes.configuration`. Scope
`resource` (workspace-shareable).

| Key | Type | Default | Meaning |
| --- | --- | --- | --- |
| `doorstop.attachments.storage` | `"assets"` \| `"objectStorage"` | `"assets"` | Where pasted/dropped files go (FR-011) |
| `doorstop.attachments.objectStorage.thresholdMB` | number ≥ 0 | `10` | Files larger than this go to object storage; `0` = all (FR-014) |
| `doorstop.attachments.objectStorage.endpoint` | string | `""` | e.g. `https://minio.example.com:9000` (FR-016) |
| `doorstop.attachments.objectStorage.bucket` | string | `""` | Bucket name (FR-016) |
| `doorstop.attachments.objectStorage.prefix` | string | `""` | Key prefix, e.g. `reports/` (FR-016) |
| `doorstop.attachments.objectStorage.region` | string | `"us-east-1"` | Signing region; MinIO's default, Garage's `s3_region` (commonly `garage`) |
| `doorstop.attachments.objectStorage.publicUrl` | string | `""` | Link base: links are `{publicUrl}/{key}` when set, else `{endpoint}/{bucket}/{key}`; trailing `/` ignored (FR-015) |

Contributed `configurationDefaults` for `[markdown]` and `[yaml]` (research R3):

```json
"editor.pasteAs.preferences": ["markdown.link.doorstop"],
"editor.dropIntoEditor.preferences": ["markdown.link.doorstop"]
```

## Commands

| Command ID | Title | Behavior |
| --- | --- | --- |
| `doorstop.setObjectStorageCredentials` | Doorstop: Set Object Storage Credentials | Two input boxes: access key (visible, it is an ID), then secret key (masked); both trimmed; stores both in secret storage; Esc on either aborts without change (FR-017) |

## Paste / drop edit

- Kind: `markdown.link.doorstop`; title: "Insert as Doorstop attachment".
- Offered only when the position is inside an item's text range and the
  transfer contains at least one file. Otherwise no edit (FR-009).
- Inserted text: see [data-model.md](../data-model.md#stored-attachment).

## Toggle

No command or UI element. A mouse click strictly inside `[ ]`, `[x]` or `[X]`
of a task line flips it (FR-001 – FR-005).

## Messages

| Situation | Message (`showErrorMessage` unless noted) |
| --- | --- |
| Folder dropped | `"<name>" is a folder; only files can be attached.` (warning) |
| Server unreachable, or the file is no item the server knows | no edit offered; the editor's default paste/drop applies (FR-009) |
| Store/upload failed | `Could not attach: "<name>" (<reason>)[, "<name2>" (<reason2>)…]` |
| Object storage not configured | reason `set doorstop.attachments.objectStorage.<endpoint\|bucket> first` or `run "Doorstop: Set Object Storage Credentials" first` in the message above |
| Progress (> 1 s) | title `Storing attachments…`, message `Uploading "<name>"…` while uploading, cancellable |

## Object storage request

```http
PUT {endpoint}/{bucket}/{encoded key} HTTP/1.1
Host: {endpoint host[:port]}
Content-Length: {size}
x-amz-date: {YYYYMMDDTHHMMSSZ}
x-amz-content-sha256: UNSIGNED-PAYLOAD
Authorization: AWS4-HMAC-SHA256 Credential={accessKey}/{date}/{region}/s3/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature={hex}
```

2xx means success and the link is the request URL. Anything else is a
failure, and the reason is the status code plus the `<Code>` and `<Message>`
elements of the S3 XML error body when present (e.g.
`403 AccessDenied: Access Denied.`, or `400 InvalidArgument: S3 API Requests
must be made to API port.` when the endpoint points at MinIO's console port).
