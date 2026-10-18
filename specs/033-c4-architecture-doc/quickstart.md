# Quickstart: Reviewing the C4 Architecture Document

No automated tests (user decision). Review `doc/architecture.md` with the steps below.

## Prerequisites

- The branch pushed to GitHub (to check rendering), or VS Code with a Mermaid-enabled Markdown preview.

## Checks

| FR | Check | Expected |
|----|-------|----------|
| FR-001 | `ls doc/architecture.md` | File exists; its overview says it supersedes `doc/arc42/`. |
| FR-002 | Read section "Level 1" | Developer, system, VS Code, Python env/pip, Doorstop, Git, PDF tooling shown. |
| FR-003 | Read section "Level 2" | All containers from [data-model.md](data-model.md) and their relationships shown. |
| FR-004, FR-005 | Read both "Level 3" sections | Each component has one-sentence responsibility + source paths. |
| FR-006 | Open the file on GitHub | Every Mermaid block renders; each has a table with the same elements. |
| FR-007 | Run the script below | No module listed as missing. |
| FR-008 | Same script | No path listed as stale. |
| FR-009 | Top of file | `**Up to date with spec:** 033` and `**Pending specs:** 032`. |
| FR-010 | Section "Dynamic view" | Sequence from UI to disk and back to refresh. |
| FR-011 | Section "Key decisions" | Each row names a principle or spec. |
| FR-012 | Section "How to update" | Steps from data-model.md present. |

## One-off coverage check (FR-007, FR-008)

Run from repo root in Git Bash; it is a review aid, not committed:

```bash
for f in src/*.ts src/webview/* server/src/doorstop_server/*.py server/src/doorstop_server/routers/*.py; do
  case "$f" in *__init__.py) continue;; esac
  grep -qF "$f" doc/architecture.md || echo "missing: $f"
done
grep -oE '(src|server|doc)/[A-Za-z0-9_./-]+' doc/architecture.md | sort -u | while read p; do
  [ -e "${p%.}" ] || echo "stale: $p"
done
```

Expected output: nothing.
