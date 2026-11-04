# Bug Assessment: vis-network loaded from the internet instead of shipped

- **Slug**: bundle-vis-network
- **Created**: 2026-11-04
- **Source**: pasted text
- **Verdict**: invalid for the current source (already fixed, unreleased); valid for the released 0.4.0
- **Severity**: low (the original finding was medium; see below)

## Report (verbatim or summarized)

> the visnetwork is loaded from the internet instead of shipped with the extension. I want to have the visnetwork page be shipped with the extension

## Symptom

The diagram canvas (`doorstop.diagram` custom editor) pulls `vis-network` from `https://unpkg.com`. Expected: the library ships inside the extension, so the canvas works offline and no third-party host runs script in the webview.

## Reproduction

1. Install the released `doorstop-0.4.0.vsix` (built 2026-10-18).
2. Open any `*.doorstop.json` diagram.
3. Open the webview developer tools (*Developer: Open Webview Developer Tools*) → Network: `vis-network.min.js` and `.min.css` come from `unpkg.com`.

Verified without running VS Code, by reading the packaged file:

```text
unzip -p doorstop-0.4.0.vsix extension/dist/webview/diagram/diagram.html
  style-src {{cspSource}} https://unpkg.com; script-src 'nonce-{{nonce}}' https://unpkg.com;
  <link href="https://unpkg.com/vis-network@10.1.2/styles/vis-network.min.css" ...>
  <script ... src="https://unpkg.com/vis-network@10.1.2/standalone/umd/vis-network.min.js">
```

On the current source this does **not** reproduce (see below). [NEEDS CLARIFICATION: was the symptom seen in an installed 0.4.0, or in an Extension Development Host?]

## Suspected Code Paths

The behaviour you ask for is already in the working tree. Nothing here needs new code:

- `src/webview/diagram/diagram.html:6-8,36` — CSP is `default-src 'none'; style-src {{cspSource}}; script-src 'nonce-{{nonce}}'`; scripts and CSS use `{{visJsUri}}` / `{{visCssUri}}`. No remote URL.
- `esbuild.js:13-18` — `copyWebviewAssets()` copies `node_modules/vis-network/standalone/umd/vis-network.min.js` and `styles/vis-network.min.css` into `dist/webview/diagram/vendor/`.
- `src/diagrammPanel.ts:739-740` — `_getHtmlForWebview()` maps both to `webview.asWebviewUri(dist/webview/diagram/vendor/…)`.
- `package.json:843` — `vis-network` `10.1.2` is a devDependency (copied into `dist`, so `vsce package --no-dependencies` ships it).
- `src/test/diagramLayout.test.ts:373` — test "diagram.html references no remote URL; vis-network is vendored into dist".

Evidence that it works:

- `git log -S"vendor/vis-network"` → commit `9a2f728` ("cleanup", 2026-10-31). It is the fix for finding 4 of `.specify/bugs/audit-fixes-2026-10` (`fix.md` status: applied).
- `v0.4.0` is dated 2026-10-18; `git merge-base --is-ancestor 9a2f728 v0.4.0` fails, so **the fix is not in any release**.
- `dist/webview/diagram/diagram.html` (current build) contains no `http(s)://`.
- `npx vsce ls --no-dependencies` lists `dist/webview/diagram/vendor/vis-network.min.js` and `.min.css`, so the next package includes them. `.vscodeignore` does not exclude `dist/**`.
- The vendored `vis-network.min.js` only contains URLs in licence/comment headers, no runtime fetch.

## Root Cause Hypothesis

The code was fixed after 0.4.0 was cut, and no release or `.vsix` has been built since. What you saw is the released 0.4.0 (or an older install) still running the pre-fix `diagram.html`. Confidence: high.

## Proposed Remediation

**Preferred**: no source change for the requested behaviour. Cut the next release so the fix reaches users: `npm run package` (runs type check, lint, and `esbuild --production`, which copies the vendor files), then `vsce package --no-dependencies`, and install the new `.vsix`. Check once in the webview dev tools that no request goes to `unpkg.com` and that there are no CSP errors in the console.

Two small leftovers from that fix, both housekeeping:

1. `CHANGELOG.md` `[Unreleased]` → *Fixed* has no entry for it; add one (the diagram canvas no longer loads vis-network from unpkg and works offline).
2. `doc/architecture.md` still draws and describes an "unpkg CDN" external system (lines 42, 53, 67). Remove the node, the edge, and the table row.

Optional: `src/test/regressionFixture.test.ts:295` says the webview "loads vis-network from a CDN"; the comment is stale. The `specs/015` and `specs/025` mentions are historical records and should stay as written.

**Alternatives** (not recommended):

- Inline vis-network into `diagram.html` as a base64 or inline script. Needs `'unsafe-inline'` or a hash in the CSP, and the file is large. The vendored file under `dist` is simpler and keeps the CSP strict.
- Bundle vis-network into a webview entry point with esbuild. More build config for no gain over copying one prebuilt file.

**Files likely to change**:

- `CHANGELOG.md`
- `doc/architecture.md`
- `src/test/regressionFixture.test.ts` (comment only)
- `package.json` (version bump, if cutting a release)

**Tests to add or update**:

- None required. The existing test checks the source HTML and the vendored files in `dist`. It does not inspect a built `.vsix`; a manual `unzip -p … diagram.html | grep unpkg` on the new package covers that.

## Risks & Considerations

- vis-network's standalone build may inject styles at runtime. The CSP has no `'unsafe-inline'` for styles, so a first-open check for CSP violations is worthwhile (the audit assessment made the same point).
- vis-network (Apache-2.0 / MIT dual) permits redistribution; the licence header stays in the minified file.
- The `.vsix` grows by the vendored files (about 850 KB uncompressed: 652 KB JS, 220 KB CSS; the zip compresses them). Not a concern.
- Users on 0.4.0 keep the unpkg dependency until they update.

## Open Questions

- [NEEDS CLARIFICATION: where did you observe the network load: an installed 0.4.0 or a dev host? If a dev host built from the current branch still shows it, `dist/` is stale; run `node esbuild.js` and reload the window.]
- [NEEDS CLARIFICATION: should the next release be 0.4.1 or 0.5.0? `[Unreleased]` already holds new features and a breaking settings change, which suggests 0.5.0.]
