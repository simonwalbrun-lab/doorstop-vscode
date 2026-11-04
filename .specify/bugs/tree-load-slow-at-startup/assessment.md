# Bug Assessment: Startup validation and tree load compete, tree takes ~26 s

- **Slug**: tree-load-slow-at-startup
- **Created**: 2026-11-04
- **Source**: pasted text (timing output from `doorstop.timing.enabled`, plus the user's own experiment)
- **Verdict**: valid
- **Severity**: medium

## Report (verbatim or summarized)

> It takes very long until the treeview is loaded. that was already the case before this bugfix. If I press reload the startup is way faster.

The user's own explanation: "the validate is blocking the reading and therefore the extension is not able to get the data in time."

Project: about 9,200 items in 28 documents (`7000_elements`).

Timing, cold start, Automatic problem reporting:

```
startup                              6054 ms
tree.load                           25870 ms   (GET /tree: load 24500 · work 1159)
validation.run                      26933 ms   (GET /validate: work 26610)
```

Same, with `doorstop.problemReporting` = onDemand:

```
startup                              5121 ms
tree.load                            6206 ms   (GET /tree: load 4764 · work 1136)
validation.run (later, on demand)    7660 ms
```

The log timestamps are start times: the tree load and the check started within about a second of each other, right after the server became ready.

## Symptom

After a cold start the tree view stays empty for about 26 s once the server is up. Expected: about 6 s, the time the tree alone needs. A Reload is faster only because the files are then cached.

## Reproduction

1. Workspace with a large Doorstop project (about 9,000 items) and `doorstop.problemReporting` = automatic.
2. Cold start: close VS Code completely, reopen the workspace.
3. Watch `tree.load` in the *Doorstop Timing* output channel: about 26 s.
4. Set `doorstop.problemReporting` to onDemand and repeat: about 6 s.

A warm run on the 7000_elements project (files cached) did not reproduce it: `/tree` took 5.3 s alone and 5.2 s with `/validate` running at the same time. So it needs a cold file cache. [NEEDS CLARIFICATION: not reproduced here, only measured on the user's cold start.]

## Suspected Code Paths

- `src/extension.ts` `refreshViews` (called from `onStarted` in `registerServerStartup`): refreshed the tree and called `problemsProvider.scheduleRefresh()` at the same moment, so the first check started with the tree load.
- `server/src/doorstop_server/lock.py`: `/validate` is excluded from the request lock; it runs in its own process on its own copy of the project.
- `server/src/doorstop_server/deps.py` `_shared_tree` / `doorstop_tree.py` `load_tree`: the server's tree load, which reads every item file.
- `server/src/doorstop_server/validation_worker.py`: the check process builds and reads the whole project again.

## Root Cause Hypothesis

At startup two full reads of the project start together: the server's tree load (for `GET /tree`) and the check process (its own copy, started by the first `/validate`). With a cold file cache the two compete for disk and virus-scanner time, and the tree load is about four times slower than alone. The tree is what the user waits for, so the check should not start until it is loaded. Confidence: high that the concurrent check is the cause, because switching it off removed the slowdown. Medium on the exact mechanism (disk and scanner contention versus something else); a warm test could not separate them.

## Proposed Remediation

**Preferred**: schedule the first problems check only after the tree load has finished. In `refreshViews`, call `treeProvider.loadItems()` (made public; it joins the load VS Code starts) and schedule the check in its `.then`. This is one expression in `extension.ts` plus making `loadItems` public in `requirementTree.ts`. A failed tree load still resolves, so the check still runs afterwards.

This fix is already in the working tree (see `fix.md` once recorded).

**Alternatives**:
- Warm the OS file cache with a thread pool when the server starts. It would help both reads, but it is a guess until measured cold, and it adds server code.
- Have the check process reuse the server's loaded tree. Larger change to the design (the check is separate on purpose, Constitution Principle I).

**Files likely to change**:
- `src/extension.ts`
- `src/requirementTree.ts`
- `src/test/` (an ordering test)

**Tests to add or update**:
- With a stub tree provider whose `loadItems()` resolves later, assert that `scheduleRefresh()` is not called before it resolves and is called after. Needs `refreshViews` to be reachable from a test; today it is a closure inside `activate()`.

## Risks & Considerations

- Problems appear a few seconds later after startup, in Automatic mode only.
- The check now waits for the tree. If the tree never loads (server down), `loadItems()` resolves right away and the check runs and reports "server not available" as before.
- The remaining startup time is not addressed: the extension's own chain is about 5 s (Python extension ready about 2.4 s, server start about 2 s), and the tree needs about 5 s warm for 9,000 items (Doorstop's own item parsing).
- `/validate` takes 7.6 s alone and 33 s when the machine is busy; that cost is unchanged.

## Open Questions

- [NEEDS CLARIFICATION: with the fix, does a cold start show `tree.load` near 6 s and `validation.run` starting after it?]
- [NEEDS CLARIFICATION: is a few seconds' delay of the first problems check acceptable, or should it start earlier on small projects?]
