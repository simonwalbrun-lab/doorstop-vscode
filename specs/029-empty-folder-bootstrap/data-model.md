# Data Model: 029

No new persistent data. Entities from the spec:

- **Project folder**: the workspace folder. Valid for creation when it lies inside a git working tree (a `.git` entry exists in it or an ancestor). Transient check, never cached.
- **Document**: unchanged (prefix, path, itemFormat, separator, digits, optional parentPrefix) as sent to `POST /documents`.

State: *empty folder* → (git check fails: error, no change) or (git check passes and create succeeds) → *project with at least one document*. Cancel at any prompt: no transition.

## Python environment state (FR-011..FR-013)

Transient, in memory only, never persisted:

- **Active interpreter**: path string from the Python extension, or none.
- States: waiting (none active; one-time notice shown) -> resolved (path known; package check runs; server starts) -> resolved with a new path on an environment change (server restarts). At install time the path is re-read; a different path aborts the install and re-enters the package check.
