# Contract: Derive command and links completion

## `doorstop.deriveRequirement`
- Input: `DeriveCommandContext` (CodeLens) or `RequirementTreeItem` (context menu, `viewItem == doorstop.item`, group `1_requirement@2`).
- Flow: `GET /tree` -> quick pick (label prefix, description kinship) -> `POST /documents/{prefix}/items` -> `POST /items/{newUid}/links {parentUid: sourceUid}` -> info message -> open `path`.
- Errors: unresolved UID, server unreachable, source in no document, no targets, create/link failure each surface a message; cancelling the pick does nothing.

## CodeLens
`+ Derive Requirement` at column 0 of every line matching `^\s*derived\s*:` in yaml/markdown files named `<uid>.yml|md`; none for non-item files such as `.doorstop.yml`.

## CompletionItemProvider
Selector yaml + markdown, triggers `-` and `_`. Offers items only inside a `links:` block (Markdown: first frontmatter only) on a `- ` list line; replaces the partial token.
