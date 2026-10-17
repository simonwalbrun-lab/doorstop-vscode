# Quickstart: YAML Header Folding

## Automated

```sh
npm run compile
npx vscode-test --label headerFolding
```

Every FR has a test with a `// Spec 034 FR-NNN` trace comment in
`src/test/headerFolding.test.ts`.

## Manual (peek editor, FR-006)

The peek editor cannot be reached from the extension test API, so check it once
by hand in the Extension Development Host with `testdata/regression` open:

1. Click the fold button in the Doorstop tree view title bar; it changes from
   `$(unfold)` to `$(fold)`. Settings show `doorstop.foldYamlHeaderOnOpen: true`.
2. Close all editors. Open `children/MD/MD-001.md`: the header shows as one
   folded `---` line.
3. Unfold it, switch tabs and back: it stays unfolded.
4. On `REQ-001`, run "Peek References" or "Show Call Hierarchy" and select
   `MD-001`: the header in the peek editor is folded.
5. Click the button again: the setting is `false`. Close and reopen
   `MD-001.md`: the header is unfolded but has a fold control.
6. Open `CHECKLIST.md` (no header) and a Markdown file outside the fixture:
   nothing is folded.
