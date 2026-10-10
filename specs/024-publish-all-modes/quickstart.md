# Quickstart: validating Publish All Modes

## Automated

```powershell
cd server; python -m pytest tests/test_documents.py -k "publish"   # shared template, cleanup, tree publish
npm run compile                                                      # types, lint, build
npm test                                                             # picker/mode integration test
```

Expected: all green; the shared-template test asserts that no `template/`
folder remains in documents that had none (SC-002), including after a forced
publish failure.

## Manual

1. Project with documents REQ and SYS; only `REQ/template/` exists; set
   `doorstop.publish.template` to its template name.
2. Run **Doorstop: Publish**, pick *All documents - one file each*, format HTML,
   choose a folder. Expect: both documents published, success message with
   count; `SYS/template` absent afterwards.
3. Run it again with *All documents - combined run*. Expect: one run, `index.html`
   in the folder.
4. Add a second `template/` folder to SYS and repeat step 3. Expect: Doorstop's
   "Multiple templates found" error shown, step 2 still works.
5. Pick a single document: behaviour as before.
