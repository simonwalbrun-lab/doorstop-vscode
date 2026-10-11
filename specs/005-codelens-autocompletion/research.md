# Research: 005 Derive CodeLens & Link Autocompletion (retroactive)

## 1. Derive targets
- Decision: offer every document at the source's depth or below, labelled by kinship; documents come from `GET /tree`.
- Rationale: Doorstop only treats a `child` link as canonical, but cross-branch derivation stays possible; the label lets the user tell them apart. Wider than spec FR-003 "valid children" by design (spec 013 research section 5).
- Alternatives: direct children only (rejected, blocks cross-branch use); glob `.doorstop.yml` client-side (rejected, Principles I/II).

## 2. Derive action
- Decision: `POST /documents/{target}/items`, then `POST /items/{uid}/links {parentUid}`, inside `withDelayedProgress`; then notify, refresh via `onChanged`, open the file.
- Alternatives: single server call (none exists; no server change warranted).

## 3. Completion
- Decision: candidates from the shared `/tree` index; block detection scans upward for `links:`; Markdown requires being inside the first frontmatter fence; trigger characters `-` and `_`; inserts `UID: null`.
- Ranking: `sortText` zero-padded by recent-view index; unviewed items after, alphabetical.
- Alternatives: glob files (rejected; offered non-items such as notes.yml).

## 4. Testing under Principle VIII
- Real server and fixture; UI prompts (`showQuickPick`) are patched as `regressionFixture.test.ts` already does (~line 648) for publish tests. Doorstop itself is never mocked.
- The derive end-to-end test must clean up the item it creates.
