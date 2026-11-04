# Bug Fix: Audit fixes 2026-10 (server binding, host check, new-item order, canvas vendoring, extension cleanup)

- **Slug**: audit-fixes-2026-10
- **Fixed**: 2026-10-31
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

All seven findings are fixed:

- **Startup:** the extension now accepts a server on the port only if `/health` names its own project.
- **Host check:** the server rejects foreign `Host` headers.
- **New items:** new blocks typed in a row are created in typed order.
- **Canvas:** vis-network is shipped inside the extension instead of loaded from unpkg.
- **Cleanup:** the duplicated reveal code is merged, the debug noise is removed, and the generator template is deleted.

Open questions from the assessment, as answered by the user:

- **Test for finding 1:** it drives `start()` against a fake HTTP server with a short timeout.
- **Release for finding 2:** batched with other server changes. Nothing was committed or released in the `server/` submodule.

## Changes

| File | Change | Notes |
| --- | --- | --- |
| `src/doorstopServer.ts` | modified | `start()` stores `projectRoot`. `isHealthy()` requires `/health`'s `projectRoot` to match (case-insensitive on win32). (1) |
| `src/test/doorstopServer.test.ts` | added test | Fake `/health` for another project → `start()` rejects. Matching project → resolves. (1) |
| `.vscode-test.mjs` | modified | New `doorstopServer` test label. (1) |
| `server/src/doorstop_server/app.py` | modified | `TrustedHostMiddleware(allowed_hosts=["127.0.0.1", "localhost"])`, added last so it runs first. (2) |
| `server/tests/conftest.py` | modified | `TestClient(app, base_url="http://127.0.0.1")`. (2) |
| `server/tests/test_errors.py`, `test_tree_cache.py`, `test_tree_reload.py`, `test_validation_background.py`, `test_serialization.py`, `test_timing.py` | modified | Their own `TestClient`/`httpx.AsyncClient` instances now use `base_url` `http://127.0.0.1` instead of `testserver`/`http://test`. (2) |
| `server/tests/test_health.py` | added test | `test_foreign_host_is_rejected`. (2) |
| `src/documentViewProvider.ts` | modified | `saveView` chains consecutive creations that share an anchor onto the item created just before. (3) |
| `src/test/regressionFixture.test.ts` | added test | "new blocks in a row are created in the order they were typed". (3) |
| `package.json`, `package-lock.json` | modified | devDependency `vis-network` `10.1.2` (exact). npm re-indented `package.json`; that was reverted and only the one line was added. (4) |
| `esbuild.js` | modified | `copyWebviewAssets()` copies `vis-network.min.js` and `.min.css` into `dist/webview/diagram/vendor/`. (4) |
| `src/diagrammPanel.ts` | modified | Template values `visCssUri`, `visJsUri`. (4) |
| `src/webview/diagram/diagram.html` | modified | Local URIs. `https://unpkg.com` removed from `style-src` and `script-src`. (4) |
| `src/test/diagramLayout.test.ts` | added test | `diagram.html` has no `http(s)://`, and the vendored files exist in `dist`. (4) |
| `src/extension.ts` | modified | One `revealInTree(uri, focus)` used by `activateRequirement` and `syncActiveRequirement` (5). Activation toast and every `console.log` removed; `warn`/`error` kept (6). |
| `vsc-extension-quickstart.md` | removed | Deletion is staged with `git rm`. (7) |
| `.vscodeignore` | modified | Its line removed. (7) |

## Diff Highlights

```ts
// src/doorstopServer.ts — isHealthy()
const { projectRoot } = await response.json() as { projectRoot?: string };
return typeof projectRoot === 'string' && same(path.resolve(projectRoot), this.projectRoot);
```

```ts
// src/documentViewProvider.ts — saveView(), per creation
const chained = previous && previous.anchor === creation.afterUid ? previous : undefined;
const afterUid = chained?.uid ?? creation.afterUid;
...
previous = { anchor: creation.afterUid, uid: added.uid, prefix };
```

```python
# server/src/doorstop_server/app.py
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost"])
```

## Tests Added or Updated

- **`src/test/doorstopServer.test.ts` › "does not adopt a server that serves another project"** — pins finding 1. Without the fix it fails with "Missing expected rejection".
- **`src/test/doorstopServer.test.ts` › "is ready once the server on the port serves our project"** — the root comparison accepts our own project.
- **`server/tests/test_health.py::test_foreign_host_is_rejected`** — `Host: evil.example` → 400; `Host: localhost:7867` → 200.
- **`src/test/regressionFixture.test.ts` › "new blocks in a row are created in the order they were typed"** — two placeholders below REQ-003 and two above the first block. Both pairs keep their typed order.
- **`src/test/diagramLayout.test.ts` › "diagram.html references no remote URL; vis-network is vendored into dist"** — no CDN, and the vendored files exist.

## Local Verification

- **`.venv/Scripts/python.exe -m pytest server/tests`** → 191 passed. Before the extra test-client updates, 10 tests failed with 400 "Invalid host header", which confirmed the middleware is active.
- **`npm test`** (compile, lint, all configs) → every suite passed except the new `doorstopServer` suite. Its fake project folder did not exist, so `spawn` failed on its `cwd` with ENOENT. Fixed by creating the folder with `mkdtemp`.
- **`npx vscode-test --label doorstopServer`** after the fix → 2 passing, three runs in a row. With the root check temporarily switched off → the negative test fails, as it should. The check was then restored.
- **`npm run check-types` and `npm run lint`** after the final test edit → clean.
- **Manual checks:** none. The canvas was not opened by hand, offline or online.

## Deviations from Assessment

- **Finding 2:** besides `conftest.py`, six more server test files build their own clients with the `testserver` or `http://test` host and needed `base_url="http://127.0.0.1"`.
- **Finding 1:** the test runs the extension host's own binary as Node (`ELECTRON_RUN_AS_NODE`) as the "interpreter". It exits on `-m`, so only the fake server can make it ready. The suite skips itself if that variable is missing, because spawning the binary would then open a VS Code window. Both tests use a 10 s timeout: the first cold launch of the binary on Windows took about 2 s, which is mocha's default timeout.
- **Finding 3:** if a creation in a chain fails, the next one still goes after the last item that was created. This keeps the order of the rest.
- **Finding 5/6:**
  - The `console.warn` for "no tree item matched path" in `activateRequirement` is gone. `revealInTree` treats "no match" silently for both callers, as `syncActiveRequirement` already did.
  - The second `context.subscriptions.push(treeView)` was removed.

## Follow-ups

- **Server submodule:**
  - The changes are uncommitted in `server/`, next to your already staged filter work in `app.py`, `filters.py`, `schemas.py` and `test_filter.py`.
  - Commit, release `doorstop-vscode-server` together with the other server changes, then bump the submodule pointer here.
  - Until users get that release, finding 2 is fixed only for installs from source.
- **`src/test/serverPackageInstall.test.ts` never runs.** It has no label in `.vscode-test.mjs`. Add one (found during this fix, not part of the assessment).
- **Manual check of the canvas:**
  - Open a `*.doorstop.json` offline. Nodes should render and drag, with no CSP errors in the webview devtools.
  - The standalone vis bundle may inject styles at runtime, and the CSP does not allow inline styles. This matches the old behaviour, but it is not verified.
- **`git rm` staged the deletion of `vsc-extension-quickstart.md`.** Everything else is unstaged.
