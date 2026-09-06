Implement a VS Code extension in TypeScript that connects to the `doorstop` CLI based server on the specified TreeView UI structure and user interaction flow.

So I want you to extent the currenlty availabel treeview by addtional buttons. for each element

### Requirements & UI Flow
Update the current `TreeDataProvider` for the "Doorstop Explorer" view in the SideBar. Commands can be triggered either directly from context-sensitive inline action icons on TreeItems (passing `node.prefix` or `node.uid`) or from the "Commands & Utilities" section (triggering VS Code UI inputs like `showQuickPick`, `showInputBox`, or `showOpenDialog`/`showSaveDialog`).


### Commands & Interactions:

Use the icons which from the Codicon library.

1. **Global Actions (Header / Menu)**
   - `[file-directory-create]` Create Document (`doorstop create`): Prompt for Prefix via `showInputBox` -> `doorstop create <prefix>`
   - `[refresh]` Refresh Tree (`doorstop refresh`): Reload tree data model.

2. **Document Actions on root folder**
   - `[file-add]` Add Item (`doorstop add`):
     - Get Target Document by selected doorstop.yml
     - Action: `doorstop add <prefix>`
   - `[unverified]` Add Item (`doorstop review`):
     - Get Target Document by selected doorstop.yml
     - Action: `doorstop review <prefix>`

3. **Item Actions**
   - `[file-add]` Add Item (`doorstop add`):
     - Get Target Document by parent doorstop.yml
     - Get level by selected item and increment last number by one
     - Action: `doorstop add <prefix> -l <incremented number>`
   - `[unverified]` Review Item (`doorstop review`):
     - Get Target items by selected item in tree
     - Action: `doorstop review <target>`
   - `[call-incoming]` Clear Suspect (`doorstop clear`):
     - Get Target items by selected item in tree
     - Action: `doorstop clear <target>`
   - `[link]` Link Items (`doorstop link`):
     - Get parentUid items by selected item in tree
     - Get childUid items by selected item in editor
     - Action: `doorstop link <childUid> <parentUid>`

4. **Utilities & File Operations**
   - Reorder (`doorstop reorder`): Select Prefix -> Select Mode ("-a" / "-m") -> `doorstop reorder <prefix> <mode>`
   - Import (`doorstop import`): Select Type ("-d" / "-i") -> Enter Target -> `showOpenDialog` -> `doorstop import <type> <target> <file>`
   - Export (`doorstop export`): Select Prefix -> Select Format ("-y", "-c", "-t", "-x") -> `showSaveDialog` -> `doorstop export <format> <prefix> <file>`
   - Publish (`doorstop publish`): Select Prefix -> Select Format ("-m", "-H", "-l") -> `showSaveDialog` -> `doorstop publish <format> <prefix> <file>`

### Execution & Architecture
- use the doorstop server and send commands to the server.
- 


Layout
```
+-------------------------------------------------------------+
| DOORSTOP EXPLORER                           [file-directory-create] [refresh] [...] | <- Global Header
+-------------------------------------------------------------+
| v 
|   SYS (root doc .doorstop) [file-add]                 [unverified] [call-incoming]        |
|   |-- SYS-001: System Architecture    .md/.yml       [file-add]   [unverified] [call-incoming] [link] |
|   |------ SYS-004: System Architecture .md/.yml      [file-add]   [unverified] [call-incoming] [link] |
|   |-- SYS-002: Safety Concept       .md/.yml         [file-add]   [unverified] [call-incoming] [link] |
|   |-- SYS-003: Interface Spec       .md/.yml         [file-add]   [unverified] [call-incoming] [link] |
|   REQ (root doc .doorstop) [file-add]   [unverified] [call-incoming]        |
|   |-- SYS-001: Some markdownfile .md/.yml            [file-add]   [unverified] [call-incoming] [link] |
|   |------ SYS-004: Some markdownfile  .md/.yml       [file-add]   [unverified] [call-incoming] [link] |
|   |-- SYS-002: Some markdownfile    .md/.yml         [file-add]   [unverified] [call-incoming] [link] |
|   `-- SYS-003: Some markdownfile    .md/.yml         [file-add]   [unverified] [call-incoming] [link] |
|                                                             |
+-------------------------------------------------------------+
| v COMMANDS & UTILITIES                                       | <- Actions Panel
|   |                                                          |             
|   |-- file-add Add Item                                      |
|   |   |-- [📋] Select Target Document / Prefix               |
|   |   `-- [⌨] Enter Level (optional, e.g. 1.2.3)             |
|   |                                                          |
|   |-- [list-ordered] Reorder Document                        |
|   |   |-- [📋] Select Document                               |
|   |   `-- [📋] Select Mode (Automatic -a / Manual -m)        |
|   |                                                          |
|   |-- [link] Link Items                                      |
|   |   |-- [⌨] Enter Child Item UID                           |
|   |   `-- [⌨] Enter Parent Item UID                          |
|   |                                                          |
|   |-- [call-incoming] Clear Suspect Status                   |
|   |   `-- [⌨] Enter Item UID, Document Prefix, or 'all'      |
|   |                                                          |
|   |-- [unverified] Review Item / Document                    |
|   |   `-- [⌨] Enter Item UID, Document Prefix, or 'all'      |
|   |                                                          |
|   |-- [folder-opened] Import Document                        |
|   |   |-- [📋] Select Import Type (Document )                |
|   |   |-- [⌨] Enter Target Prefix / Item UID                 |
|   |   `-- [📂] Select Source File (Open Dialog)              |
|   |                                                          |
|   |-- [save] Export Document                                 |
|   |   |-- [📋] Select Document (or 'all')                    |
|   |   |-- [📋] Select Format (YAML, CSV, TSV, XLSX)          |
|   |   `-- [📂] Select Destination File (Save Dialog)         |
|   |                                                          |
|   `-- [rocket] Publish Document                              |
|       |-- [📋] Select Document                               |
|       |-- [📋] Select Target Format (Markdown, HTML, LaTeX,SrucTex) |
|       `-- [📂] Select Destination File (Save Dialog)         |
+-------------------------------------------------------------+
```