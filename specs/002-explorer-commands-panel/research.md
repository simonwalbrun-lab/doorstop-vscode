# Research: Requirements Explorer & Commands Panel

No open unknowns; the feature is implemented. Decisions recorded from the code:

- **Nesting by outline depth**: items are sorted by level, then each item's
  parent is the nearest preceding shallower item (no synthetic nodes).
  Rationale: matches Doorstop's `index.yml` indentation and `Item.depth`.
  Alternative: level-string trie, rejected (needs placeholder nodes for skipped levels).
- **Single shared load**: `loadItems` shares one in-flight promise;
  `refresh()` bumps a generation counter so stale loads are dropped.
- **Error toast once**: `serverErrorShown` suppresses repeats until a load succeeds (FR-008).
- **Parent pick tri-state**: `chooseParentPrefix` returns prefix / `null` (None) /
  `undefined` (dismissed) so cancel differs from root (FR-009..011).
- **Test strategy for FR-001..008**: provider-level tests with a stub
  `DoorstopServer` (`{ request }`), as `extension.test.ts` already does for the
  definition provider; no Doorstop server or fixture workspace needed, so they
  run headless in CI. Alternative: more tests inside `regressionFixture`
  (needs the real server; heavier).
