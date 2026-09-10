# Specification Quality Checklist: Doorstop Validation Problems In-Item

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-10
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`

### Validation findings (iteration 1)

- Terminology was normalised away from tool-specific wording: "item" → "requirement",
  "UID" → "identifier", "diagnostic" → "problem", "YAML/Markdown item file" →
  "attribute-file format" / "prose-file format", and `.doorstop.yml` → "the document's
  configuration file". The two anchor tables (FR-007, FR-008) intentionally retain
  Doorstop's own check wording, since those checks are the feature's input contract
  and must be traceable one-to-one to what the tool reports.
- All fifteen checks named in the feature description are covered by the anchor
  tables and by at least one acceptance scenario or by SC-001.
- Three points the description left open were resolved as documented assumptions
  rather than clarification markers, because a defensible default existed for each:
  the anchor for the external-reference error (the reference field, as no link entry
  exists for it), the scope of re-checking (whole tree, because cycles, cross-document
  links and duplicate levels cannot be judged from a single file), and the refresh
  triggers (on save, after extension-initiated changes, and on demand).
- Scope boundary made explicit: problem reporting is display-only — offering quick
  fixes from a problem is out of scope and left to the existing dedicated commands.
