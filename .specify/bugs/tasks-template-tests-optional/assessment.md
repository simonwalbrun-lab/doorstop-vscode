# Bug Assessment: tasks template says tests are optional, contradicting the constitution

- **Slug**: tasks-template-tests-optional
- **Created**: 2026-11-01
- **Source**: pasted text
- **Verdict**: valid
- **Severity**: medium

## Report (verbatim or summarized)

> remove "Tests are OPTIONAL" from tasks-template.md

## Symptom

`/speckit-tasks` produces task lists with no test tasks unless the spec asks for tests explicitly. Constitution Principles VI ("Every Feature Ships With a CI-Runnable Test") and VIII ("Every Functional Requirement Has a Traceable Automated Test") make tests mandatory.

## Reproduction

1. Run `/speckit-tasks` on a spec that does not mention tests.
2. The generated `tasks.md` has no test tasks, following the template and skill wording below.

## Suspected Code Paths

- `.specify/templates/tasks-template.md:12`: "Tests are OPTIONAL - only include them if explicitly requested in the feature specification."
- `.specify/templates/tasks-template.md:83, 109, 131`: "(OPTIONAL - only if tests requested) ⚠️" on each user-story test section.
- `.specify/templates/tasks-template.md:202`: "(if tests requested)".
- `.claude/skills/speckit-tasks/SKILL.md:145`: "**Tests are OPTIONAL**: Only generate test tasks if explicitly requested…". This is the instruction the generator actually follows. Changing only the template does not fix the behavior.
- `.claude/skills/speckit-tasks/SKILL.md:187, 192`: "If tests requested: …".

## Root Cause Hypothesis

These are upstream spec-kit defaults that were never adapted to this project's constitution. Confidence: high.

## Proposed Remediation

**Preferred**: Rewrite the five template lines and the three skill lines to say tests are required. Each user story gets test tasks covering its FRs (Principle VIII) that run in CI (Principle VI). Drop the "OPTIONAL"/⚠️ markers. Keep the "write tests first, ensure they FAIL" note.

**Files likely to change**:

- `.specify/templates/tasks-template.md`
- `.claude/skills/speckit-tasks/SKILL.md`

**Tests to add or update**:

- None automated. Verify with a grep for "OPTIONAL" / "if tests requested" in both files, which should return no hits.

## Risks & Considerations

- A later spec-kit upgrade may overwrite both files. Note the local change so it survives an upgrade.
- Only these two files matched the grep. No other template carries the wording.

## Open Questions

- None.
