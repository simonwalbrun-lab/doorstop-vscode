# Quickstart: validating spec 032

## Automated

```sh
cd server && pytest tests/test_validation_background.py tests/test_tree_reload.py
npm test        # extension suite, includes src/test/problemReporting.test.ts
```

Every test carries `Spec 032 FR-xxx` (Principle VIII).

## Manual (large tree)

Prerequisite: a project where a full check takes several seconds, for example
`testdata/regression` copied ×50 into one workspace.

| # | Do | Expect |
|---|---|---|
| 1 | Save an item, then immediately hover a link, expand the tree and edit an item | Each answers as fast as without a check (Output → Doorstop timing: `wait` near 0, `work` as usual); the status bar shows the spinner after 1 s. Task Manager shows a second Python process at below-normal priority |
| 2 | Save 5× quickly | Only the last result is shown (Output → Doorstop timing: earlier `/validate` calls end in 409 within a second) |
| 3 | Click the Problems button 3× | eye → eye-watch → eye-closed → eye; `.vscode/settings.json` follows |
| 4 | On demand: save | No check; old problems stay. Click Refresh → toast with Cancel → new problems |
| 5 | Cancel the toast | Old problems stay, no error |
| 6 | Off | All problems and Quick Fixes gone within 2 s; saves and Refresh do not check; status report says "off" |
| 7 | Set the mode in the Settings UI | Button changes at once |
| 8 | Edit one item, then request the tree | Server timing `load` well below a full reload; edit `.doorstop.yml` → full reload |
