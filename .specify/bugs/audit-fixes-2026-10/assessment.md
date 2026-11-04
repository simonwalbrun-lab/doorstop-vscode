# Bug Assessment: Audit fixes 2026-10 (server binding, host check, new-item order, canvas vendoring, extension cleanup)

- **Slug**: audit-fixes-2026-10
- **Created**: 2026-10-31
- **Source**: pasted text (findings 1-7 of a whole-repo audit run in this session)
- **Verdict**: valid (all seven findings)
- **Severity**: high (overall; per finding below)

| # | Finding | Kind | Severity |
| --- | --- | --- | --- |
| 1 | Second VS Code window adopts another window's server | bug, data written to wrong project | high |
| 2 | Server accepts any `Host` header (DNS rebinding) | security | high |
| 3 | Consecutive new items in the document view are saved in reverse order | bug | medium |
| 4 | Canvas loads vis-network from unpkg; CSP allows the whole host | security / offline | medium |
| 5 | Reveal-in-tree logic duplicated in `extension.ts` | maintenance | low |
| 6 | Activation toast and `console.log` trace noise in `extension.ts` | cleanup | low |
| 7 | Generator template `vsc-extension-quickstart.md` still in the repo | cleanup | low |

## Report (verbatim or summarized)

> 1) second VS Code window talks to another window's server because /health projectRoot is not checked;
> 2) server lacks TrustedHostMiddleware (DNS rebinding);
> 3) consecutive new items in document view saved in reverse order;
> 4) bundle vis-network from npm into dist/webview and drop unpkg;
> 5) duplicated reveal-in-tree code in extension.ts;
> 6) activation toast and console.log noise in extension.ts;
> 7) delete vsc-extension-quickstart.md

User decision for 4: copy vis-network from npm into `dist/webview` and drop unpkg completely.

---

## Finding 1 — Second window adopts another window's server

### Symptom

With window A already running the Doorstop server on the fixed port 7867, opening a second Doorstop project in window B reports "Doorstop server is ready", but every read and write in B goes to A's project. Expected: B detects the taken port and shows the existing "port in use" hint.

### Reproduction

1. Open Doorstop project A in a VS Code window; wait for "Doorstop server is ready."
2. Open a different Doorstop project B in a second window.
3. B reports "Doorstop server is ready." The tree in B shows A's documents; a save in B's document view edits A's files.

### Suspected Code Paths

- `src/doorstopServer.ts:isHealthy()` (~L270-277) — returns `response.ok` only and ignores the body.
- `src/doorstopServer.ts:waitForHealthy()` (~L248-260) — polls every 100 ms. The first poll hits A's server and resolves before B's child process has finished starting Python, failed to bind and exited.
- `src/doorstopServer.ts:start()` — `settled = true` after the health check, so the later `exit` event (port in use) is ignored and `outputSuffix()`/`portInUseHint()` never reach the user.
- `server/src/doorstop_server/routers/health.py` — already returns `projectRoot` (= the `--project` argument the extension passed, `path.resolve(projectPath)`).

### Root Cause Hypothesis

The health check proves that *a* server answers on the port, not that it is *ours*. Python startup takes far longer than one HTTP round trip to an existing server, so the race is lost almost every time. Confidence: high.

### Proposed Remediation

**Preferred**: In `start()`, keep the resolved project path (`this.projectRoot = path.resolve(projectPath)`). In `isHealthy()`, parse the JSON body and return true only when `projectRoot` equals it. Compare case-insensitively on `win32`, because drive letters can differ in case. A foreign server then counts as "not healthy". B's own child exits with the port error, and the existing `exit` handler rejects with the stderr and `portInUseHint`. That is the intended behaviour today.

**Alternatives**:
- Pass port 0 and read the chosen port from stdout. This removes the conflict entirely, but it changes the server CLI, the regression fixture and the fixed `DOORSTOP_SERVER_PORT` contract. It is a larger change than the bug needs.

**Files likely to change**:
- `src/doorstopServer.ts`
- `src/test/` — new or existing unit test file for `DoorstopServer` (e.g. next to `serverPackageInstall.test.ts`)

**Tests to add or update**:
- Start a tiny `node:http` server on a free port that answers `/health` with `{"status":"ok","projectRoot":"<other>"}`. Construct `DoorstopServer({ port, startupTimeoutMs: 500 })` and call `start(projectPath, pythonPath)`. For `pythonPath`, use an interpreter that cannot start `doorstop_server` (e.g. `process.execPath`, since node rejects `-m`), so the only thing that could make it "ready" is the fake server. Assert that `start()` rejects. A second case, where the fake server answers with the matching `projectRoot`, asserts the comparison accepts our own root (the start may still reject on the child exit; assert on whichever settles first, or test the compare through the smallest export).

### Risks & Considerations

- Path normalisation: the server echoes the string it was given (`settings.project_root`), so a byte-for-byte compare after `path.resolve` on both sides is enough; only casing on Windows needs care.
- `src/test/regressionFixture.test.ts:63` fetches `/health` directly and is unaffected.

---

## Finding 2 — Server accepts any Host header (DNS rebinding)

### Symptom

The local server answers any request that reaches `127.0.0.1:7867`, whatever its `Host` header says. A web page that rebinds its own domain to 127.0.0.1 becomes same-origin in the browser. It can then read the whole tree and call `/publish`, `/documents/{prefix}/export` or `/import` with paths it chooses. Expected: only requests addressed to `127.0.0.1` / `localhost` are served.

### Reproduction

1. Start the server.
2. `curl -H "Host: evil.example" http://127.0.0.1:7867/tree` returns 200 with the tree.
3. Expected: 400.

### Suspected Code Paths

- `server/src/doorstop_server/app.py:create_app()` — only `SerializeRequestsMiddleware` is added; no host check, no auth.

### Root Cause Hypothesis

Binding to loopback was assumed to be enough isolation. It does not protect against DNS rebinding. Confidence: high.

### Proposed Remediation

**Preferred**: In `create_app`, add `app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost"])` (from `starlette.middleware.trustedhost`). Starlette strips the port before comparing.

**Files likely to change**:
- `server/src/doorstop_server/app.py`
- `server/tests/conftest.py` — `TestClient(app)` sends `Host: testserver` by default and would get 400 on every test. Change it to `TestClient(app, base_url="http://127.0.0.1")`.
- `server/tests/test_health.py` (or a new `test_host.py`)

**Tests to add or update**:
- `client.get("/health", headers={"Host": "evil.example"})` → 400; with the default (127.0.0.1) → 200.

### Risks & Considerations

- The server is a separate git submodule (`server/`, its own repo `doorstop-vscode-server`) and is published to PyPI. The fix needs a commit in the submodule, a submodule pointer bump in this repo, and a PyPI release before users get it.
- Middleware order: Starlette runs the middleware added last first. A rejected host then answers before the request lock, which is the desired behaviour.
- `validation_worker.py` builds `Settings(host="")` but does not serve HTTP, so it is unaffected.

---

## Finding 3 — Consecutive new items saved in reverse order

### Symptom

In the document view, typing two new item blocks one after the other (X, then Y) below an existing item and saving creates them in the order Y, X. The same happens for two new blocks at the very top of a document. Expected: the saved order matches the text.

### Reproduction

1. Open a document as Document View.
2. Under `REQ-002`, use **+ New item below** twice so that two placeholders follow each other. Fill in header "X" in the first and "Y" in the second.
3. Save. The items' levels place Y before X; after regeneration the view shows Y above X.

### Suspected Code Paths

- `src/documentViewModel.ts:planSave()` (~L667-676) — every placeholder gets `afterUid: previousItemUid`, the last *existing* item above. Two placeholders in a row share the same anchor (or both have `undefined` at the top).
- `src/documentViewProvider.ts:saveView()` (~L616-640) — creations are posted in text order, each with `{ after: creation.afterUid }` (or `{ first: true }`).
- `server/src/doorstop_server/routers/documents.py` (~L115-137) — `after` gives the new item the level right after the anchor, and Doorstop's reorder shifts the items that were already there. So the second POST lands between the anchor and the first new item.

### Root Cause Hypothesis

The anchor is resolved once from the original text. It does not account for items created earlier in the same save. Confidence: high (follows directly from the code; there is no test with two consecutive placeholders).

### Proposed Remediation

**Preferred**: In `saveView`, keep the UID created by the previous creation together with the anchor it was created for. When the next creation has the same `afterUid` as that previous creation, post it with `{ after: <previous added.uid> }` instead of the original anchor (or `{ first: true }`). It also picks the previous item's document prefix as its neighbour. If the previous creation failed, fall back to the original anchor. This changes only the save loop. `planSave` and its contract stay as they are.

**Alternatives**:
- Have `planSave` express the chain itself (e.g. `afterCreation: index`). That is a bigger contract change for the same result.

**Files likely to change**:
- `src/documentViewProvider.ts`
- `src/test/regressionFixture.test.ts` (document view suite, next to "a placeholder above the first block becomes the first item (US4)" ~L2043)

**Tests to add or update**:
- Regression fixture: insert two placeholders below one item, fill "X" and "Y", save, assert X's level is lower than Y's and the view lists X before Y.
- Same with two placeholders above the first block (both `first`).

### Risks & Considerations

- Partial failure path (`spliceFailedBlocks`) must keep working: a failed first creation must not break the second one's anchor.
- Section and filter views append `added.uid` to `state.scope.uids` — unchanged.

---

## Finding 4 — Canvas loads vis-network from unpkg

### Symptom

The canvas webview loads `vis-network@10.1.2` script and CSS from `https://unpkg.com` with no integrity hash, and its CSP allows *any* script from that host. The canvas does not work offline. If unpkg is compromised, a script runs inside a webview that can create links and remove items.

### Reproduction

1. Disconnect from the network and open a `*.doorstop.json` diagram: the canvas stays blank (`vis` is undefined).
2. Inspect `src/webview/diagram/diagram.html:6` — `script-src 'nonce-…' https://unpkg.com`.

### Suspected Code Paths

- `src/webview/diagram/diagram.html:6,8,36` — CSP, CSS link, script tag.
- `esbuild.js:copyWebviewAssets()` — copies `src/webview` to `dist/webview`; no vendor copy.
- `src/diagrammPanel.ts:_getHtmlForWebview()` (~L730-750) — template values; `localResourceRoots` already is `dist/webview`.
- `package.json` — vis-network is not a dependency.

### Root Cause Hypothesis

The library was pulled from a CDN when the canvas was built and has not been vendored since. Confidence: high.

### Proposed Remediation

**Preferred** (user's choice):
1. `npm install --save-dev vis-network@10.1.2`. It is a devDependency because it is copied into `dist`, and `vsce package --no-dependencies` ships `dist`, not `node_modules`.
2. In `copyWebviewAssets()`, after the existing copy, copy `node_modules/vis-network/standalone/umd/vis-network.min.js` and `node_modules/vis-network/styles/vis-network.min.css` into `dist/webview/diagram/vendor/`.
3. In `_getHtmlForWebview()`, add `visJsUri: assetUri('vendor/vis-network.min.js')` and `visCssUri: assetUri('vendor/vis-network.min.css')`.
4. In `diagram.html`, use those URIs and drop `https://unpkg.com` from both `style-src` and `script-src`.

**Files likely to change**:
- `package.json`, `package-lock.json`
- `esbuild.js`
- `src/diagrammPanel.ts`
- `src/webview/diagram/diagram.html`

**Tests to add or update**:
- A unit test that reads `src/webview/diagram/diagram.html` and asserts that it contains no `https://` URL. This locks out CDN use again.
- Manual: open a diagram offline; nodes render and drag.

### Risks & Considerations

- The vis-network *standalone* build may inject styles at runtime. The CSP today has no `'unsafe-inline'` for styles, so behaviour is unchanged. Still, verify on first open that nothing renders unstyled (check the webview devtools console for CSP violations).
- The VSIX grows by about 0.5 MB (the minified bundle). That is acceptable.
- vis-network's licence (Apache-2.0 / MIT dual) permits redistribution; keep its licence header in the minified file.

---

## Finding 5 — Reveal-in-tree logic duplicated

### Symptom

`doorstop.activateRequirement` and `syncActiveRequirement` in `src/extension.ts` each contain the same ~30-line block. It finds the tree item for a URI, prepares its ancestors, reveals it, and on failure reloads and retries once. Only `focus` differs (true vs false). A fix to one copy can easily miss the other.

### Suspected Code Paths

- `src/extension.ts` — `activateRequirementCommand` handler and `syncActiveRequirement`, plus the nested `prepareTreeItemForReveal`.

### Proposed Remediation

**Preferred**: One local `revealInTree(uri: vscode.Uri | undefined, focus: boolean)` function holding the find/prepare/reveal/retry logic. `activateRequirement` calls it with `vscode.Uri.file(filePath), true`. `syncActiveRequirement` keeps `recordViewedRequirement` and the auto-reveal check and calls it with `editor?.document.uri, false`. Behaviour stays identical.

**Files likely to change**: `src/extension.ts`

**Tests to add or update**: none new. The existing extension-host tests that reveal items (`src/test/extension.test.ts`) must still pass.

### Risks & Considerations

- Keep the error handling: the retry and the final `console.error` on retry failure stay.

---

## Finding 6 — Activation toast and trace logging

### Symptom

Every activation shows the toast "Doorstop VS Code Extension is active!". `extension.ts` also has 21 `console.log` calls, most of them step-by-step traces of revealing in the tree and of drag events. One of them hard-codes "127.0.0.1:7867", a second copy of `DOORSTOP_SERVER_HOST`/`DOORSTOP_SERVER_PORT`.

### Suspected Code Paths

- `src/extension.ts:28` — `showInformationMessage('Doorstop VS Code Extension is active!')`.
- `src/extension.ts:79` — hard-coded address in the "Server is ready" log.
- `src/extension.ts` — `console.log` traces in `activate`, `handleDrag`, `activateRequirement`, `syncActiveRequirement`, `prepareTreeItemForReveal`, `onDidChangeActiveTextEditor`.

### Proposed Remediation

**Preferred**: Delete the toast. Delete the trace `console.log` lines. Keep `console.warn`/`console.error` for failures. Keep the "Server is ready" log but build it from the exported constants, or drop it, since the user already gets the "Doorstop server is ready." notification.

**Files likely to change**: `src/extension.ts`

**Tests to add or update**:
- Grep the tests for the toast text before deleting it (`Extension is active`). If a test waits for it, switch that test to wait on the returned API or on server readiness instead.

### Risks & Considerations

- Do this together with Finding 5 (same lines), to avoid merge noise.

---

## Finding 7 — Generator template left in repo

### Symptom

`vsc-extension-quickstart.md` is the stock "Welcome to your VS Code Extension" file from the extension generator. It describes nothing about this project, and `.vscodeignore` has to exclude it.

### Proposed Remediation

**Preferred**: Delete `vsc-extension-quickstart.md` and its line in `.vscodeignore`.

**Files likely to change**: `vsc-extension-quickstart.md` (delete), `.vscodeignore`

**Tests to add or update**: none.

### Risks & Considerations

- None. No file references it (checked: no hits outside `.vscodeignore`).

---

## Risks & Considerations (overall)

- Finding 2 lives in the `server/` submodule and needs its own commit, a PyPI release and a submodule pointer bump. Findings 1, 3-7 are extension-only.
- Findings 1 and 2 are independent: after 2, a server from another window still answers 127.0.0.1, so 1 is still needed.
- Run all three CI suites after the fix: `npm test` (extension host), `pytest server/tests`, `node --test src/test/pdf/exportPdf.test.mjs`.

## Open Questions

- [NEEDS CLARIFICATION: Finding 1 test harness — whether exporting a tiny `isHealthy`-equivalent for the test is acceptable, or the test should drive `start()` against a fake HTTP server with a short timeout.]
- [NEEDS CLARIFICATION: Finding 2 release — bump and publish a new `doorstop-vscode-server` version now, or batch it with other server changes?]
