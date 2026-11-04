# Bug Fix: tasks template says tests are optional, contradicting the constitution

- **Slug**: tasks-template-tests-optional
- **Fixed**: 2026-11-01
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

The tasks template and the `/speckit-tasks` skill now say tests are required. Their wording follows Constitution Principles VI (CI-runnable, runtime-behaviour tests) and VIII (every FR covered, with a `Spec <NNN> FR-<NNN>` trace comment). All "OPTIONAL" / "if tests requested" wording about tests is gone.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `.specify/templates/tasks-template.md` | modified | Line 12 tests note rewritten. US1–3 test headings changed to "(REQUIRED - cover every FR of this story)" with the ⚠️ removed. "(if requested)" removed from the unit-test polish task, "(if included)" from the ordering rules, "(if tests requested)" from the parallel example. The "write tests FIRST, ensure they FAIL" note is kept. |
| `.claude/skills/speckit-tasks/SKILL.md` | modified | Line 145 "Tests are OPTIONAL" rewritten as "Tests are REQUIRED" (FR coverage, trace comment, runtime behaviour, CI suite, test-first). The "if requested" qualifiers on lines 84, 187, 192 and 210 are removed. |

## Tests Added or Updated

- None. These are docs/prompt files, so there is nothing to run (as the assessment says).

## Local Verification

- `grep -n -i -E "OPTIONAL|if (tests )?requested|if included|⚠️"` on both files → the only hits left are unrelated: the hook `optional` flags, "Optional" design docs, the argument hint, and the "⚠️ CRITICAL" line in the Foundational phase. No test-related hits.
- CRLF line endings preserved: every line in both files still ends in CRLF.

## Deviations from Assessment

- Scope grew slightly within the same two files. Four lines the assessment did not list also made tests conditional: template 157 "(if requested)" and 182 "(if included)", skill 84 "tests (if requested)" and 210 "Tests (if requested)". They were changed for the same reason.

## Follow-ups

- These are local edits to files that come from upstream spec-kit. Re-apply them after any spec-kit upgrade that overwrites these files.
