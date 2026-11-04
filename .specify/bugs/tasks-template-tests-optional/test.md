# Bug Verification: tasks template says tests are optional

- **Slug**: tasks-template-tests-optional
- **Tested**: 2026-11-04
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

No test-optional wording remains in `.specify/templates/tasks-template.md` or `.claude/skills/speckit-tasks/SKILL.md`. The new wording matches Constitution Principles VI and VIII, and both files are structurally intact. The fix is already committed (1ed8ee7). Reproduction by actually running `/speckit-tasks` was not exercised; verification is by static inspection only.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Grep template for optional/conditional wording | grep -i `optional\|if tests\|if requested\|if included\|requested\|if you want\|if desired` | pass | 0 hits |
| Grep skill for same | same pattern | pass | 7 hits, all unrelated: argument-hint, hook `optional` flags, "Optional" design docs (lines 4, 33-64, 105-119) |
| Read wording vs Principles VI / VIII | template L12, L83/109/131, skill L84, L145, L187, L192, L210 | pass | Says REQUIRED, per-FR coverage, `Spec <NNN> FR-<NNN>` trace, runtime behaviour, CI suites `server/tests` and `src/test`, test-first. Matches constitution lines 168-243; both paths exist |
| Structure intact | `grep '^#'` on template | pass | Phase 1-5, Polish, Dependencies, Strategy, Notes headings consistent; test sections retained in US1-3 |
| Line endings | CR count per file | pass | Working copy 252/252 and 218/218 lines CRLF. HEAD blobs are LF (core.autocrlf=true), as the pre-fix template (3f8c332) was, so no change in convention |
| Committed state | `git diff`, `git log` | pass | Neither file has uncommitted changes; last touched in 1ed8ee7 |
| End-to-end `/speckit-tasks` run | not performed | not-run | Would generate artifacts and needs a spec; out of scope |

## Output Excerpts

- Template L12: "Tests are REQUIRED (Constitution Principles VI and VIII). Every user story MUST include test tasks..."
- Skill L145: "**Tests are REQUIRED** (Constitution Principles VI and VIII): ..."

## Residual Risks

- The assessment's reproduction (running `/speckit-tasks`) was not exercised. Prompt behaviour is inferred from the wording.
- Local edits to upstream spec-kit files can be overwritten by a spec-kit upgrade (noted in the fix).
- Template L157 "Additional unit tests" in the Polish phase is unconditional, which is consistent.

## Recommendation

Close the bug. The check is static, so a spot-check of the next `/speckit-tasks` output for per-story FR test tasks is worthwhile.
