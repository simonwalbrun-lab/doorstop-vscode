# Quickstart: 029 validation

Prerequisites: extension built, Python environment with the server package.

1. **Empty git folder**: create a folder, run `git init`, open it in the Extension Development Host. Open the Doorstop activity-bar view: the Explorer shows the hint and Commands lists "Create Document". Run it (prefix `REQ`, accept the dialog, root document). Expect the document in the Explorer without a reload.
2. **Not under git**: open an empty folder without `git init`. Run Create Document. Expect the git error message and no files created.
3. **Dialog start**: in step 1 the folder dialog opens at the workspace folder.
4. **Move**: in a project with documents the Explorer toolbar has no Create Document; the Commands view and the palette do.
5. **Cancel**: cancel at the prefix prompt and at the dialog; the folder is unchanged.

Automated: the extension test suite; new tests carry spec 029 trace comments per FR.

## Python environment (FR-011..FR-014, SC-005)

6. **Wait**: start the Development Host with the Python environment still activating (or none selected). Expect a one-time "waiting for Python environment" notice; once an environment is active the server starts within 5 seconds with no manual restart. No other interpreter is used.
7. **Switch**: change the environment while running; the server restarts with the new interpreter.
8. **Install re-check**: with an environment lacking the package, leave the install prompt open, switch environment, then press Install. Nothing is installed into the old environment; the check restarts for the new one.
9. **Restart Extension**: the palette lists "Doorstop: Restart Extension" and no "Restart Server"; running it restarts the server and refreshes Explorer, Commands and Problems.

Automated: tests with trace comments `// Spec 029 FR-011` to `FR-014` (resolver helper with a fake Python API, package.json command check).
