# Treeview

outline of the idea of how to use the treeview provided

```text
+----------------------------------------------------------------------------------------------+
| DOORSTOP EXPLORER                           [file-directory-create] [refresh] [...]          |
+----------------------------------------------------------------------------------------------+
| v                                                                                            |
|   SYS (root doc .doorstop) [file-add]                [file-add]   [unverified] [call]        |
|   |-- SYS-001: System Architecture    .md/.yml       [file-add]   [unverified] [call] [link] |
|   |------ SYS-004: System Architecture .md/.yml      [file-add]   [unverified] [call] [link] |
|   |-- SYS-002: Safety Concept       .md/.yml         [file-add]   [unverified] [call] [link] |
|   |-- SYS-003: Interface Spec       .md/.yml         [file-add]   [unverified] [call] [link] |
|   REQ (root doc .doorstop)                           [file-add]   [unverified] [call]        |
|   |-- SYS-001: Some markdownfile .md/.yml            [file-add]   [unverified] [call] [link] |
|   |------ SYS-004: Some markdownfile  .md/.yml       [file-add]   [unverified] [call] [link] |
|   |-- SYS-002: Some markdownfile    .md/.yml         [file-add]   [unverified] [call] [link] |
|   `-- SYS-003: Some markdownfile    .md/.yml         [file-add]   [unverified] [call] [link] |
|                                                                                              |
+----------------------------------------------------------------------------------------------+
```

## COMMANDS & UTILITIES

```text
+-----------------------------------------------------------------------+
| v COMMANDS & UTILITIES                                                | 
|   |                                                                   |
|   |-- file-add Add Item                                               |
|   |   |-- [quick] Select Target Document / Prefix                     |
|   |   `-- [user] Enter Level (optional, e.g. 1.2.3)                   |
|   |                                                                   |
|   |-- [list-ordered] Reorder Document                                 |
|   |   |-- [quick] Select Document                                     |
|   |   `-- [quick] Select Mode (Automatic -a / Manual -m)              |
|   |                                                                   |
|   |-- [link] Link Items                                               |
|   |   |-- [user] Enter Child Item UID                                 |
|   |   `-- [user] Enter Parent Item UID                                |
|   |                                                                   |
|   |-- [call-incoming] Clear Suspect Status                            |
|   |   `-- [quick] Select Document Prefix, or 'all'                    |
|   |                                                                   |
|   |-- [unverified] Review Document                                    |
|   |   `-- [quick] Select Document Prefix, or 'all'                    |
|   |                                                                   |
|   |-- [folder-opened] Import Document                                 |
|   |   |-- [quick] Select Prefix                                       |
|   |   `-- [file-dialog] Select Source File (Open Dialog)              |
|   |                                                                   |
|   |-- [save] Export Document                                          |
|   |   |-- [quick] Select Document (or 'all')                          |
|   |   |-- [quick] Select Format (YAML, CSV, TSV, XLSX)                |
|   |   `-- [file-dialog] Select Destination File (Save Dialog)         |
|   |                                                                   |
|`-- [rocket] Publish Document                                          |
|       |-- [quick] Select Document                                     |
|       |-- [quick] Select Target Format (Markdown, HTML, LaTeX)        |
|       `-- [file-dialog] Select Destination File (Save Dialog)         |
+-----------------------------------------------------------------------+
```
