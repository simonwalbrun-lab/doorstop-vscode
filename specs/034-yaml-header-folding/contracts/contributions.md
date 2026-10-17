# Contract: package.json contributions

## Setting

```json
"doorstop.foldYamlHeaderOnOpen": {
  "type": "boolean",
  "default": false,
  "markdownDescription": "Fold the YAML header of Markdown requirement items when they are opened, also in the peek editor of references and call hierarchy."
}
```

## Configuration default

```json
"configurationDefaults": {
  "[markdown]": { "editor.foldingImportsByDefault": true }
}
```

## Commands

| Command | Title (tooltip) | Icon |
|---------|-----------------|------|
| `doorstop.foldYamlHeaderOnOpen.on` | Fold YAML header on open: Off (click to turn on) | `$(unfold)` |
| `doorstop.foldYamlHeaderOnOpen.off` | Fold YAML header on open: On (click to turn off) | `$(fold)` |

## `view/title` menu entries

| Command | when | group |
|---------|------|-------|
| `doorstop.foldYamlHeaderOnOpen.on` | `view == doorstop.treeView && !config.doorstop.foldYamlHeaderOnOpen` | `navigation` |
| `doorstop.foldYamlHeaderOnOpen.off` | `view == doorstop.treeView && config.doorstop.foldYamlHeaderOnOpen` | `navigation` |

## Folding range provider

Selector `{ language: 'markdown', scheme: 'file' }`. Returns at most one
`FoldingRange` per document, as in [data-model.md](../data-model.md).
