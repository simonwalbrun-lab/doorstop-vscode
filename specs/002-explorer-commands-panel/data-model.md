# Data Model: Requirements Explorer & Commands Panel

Server types in `src/doorstopTypes.ts` (`TreeResponse`, `DocumentNode`, `ItemNode`).

- **Document** (`DocumentNode`): `prefix`, `markerPath` (`.doorstop.yml`), `parentPrefix?`, `items[]`.
  Rendered as a root `RequirementTreeItem` (`contextValue doorstop.root`, label = folder name, `itemData.prefix`).
- **Item** (`ItemNode`): `uid`, `path`, `level`, `header`, `text`, flags (`active`, `normative`, `derived`, `reviewed`, `cleared`), `links`.
  Rendered as `doorstop.item`; title = header, else markdown H1, else first line.
- **Hierarchy**: parent = nearest preceding item with smaller `levelDepth`, else the document root; siblings sorted by numeric level segments, then UID.
- **Commands node**: `TreeItem` with `command = { command: 'doorstop.*' }`, `contextValue doorstop.utility`.
