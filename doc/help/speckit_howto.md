# Spec Kit Workflow

How the `/speckit-*` commands in this repo fit together. Grounded in
`.specify/workflows/speckit/workflow.yml` (the automated gated cycle) plus the
full set of commands available under `.claude/skills/speckit-*`.

## 1. Full command overview

Constitution is set up once (or amended later); everything else revolves
around one feature at a time, living in its own `specs/NNN-feature-name/`
folder.

```mermaid
flowchart TD
    Constitution["/speckit-constitution<br/>project principles"]
    Specify["/speckit-specify<br/>spec.md"]
    Clarify["/speckit-clarify<br/>resolve ambiguity in spec.md"]
    Checklist["/speckit-checklist<br/>requirements.md"]
    Plan["/speckit-plan<br/>plan.md"]
    Tasks["/speckit-tasks<br/>tasks.md"]
    Analyze["/speckit-analyze<br/>cross-artifact consistency check"]
    Implement["/speckit-implement<br/>execute tasks.md"]
    ToIssues["/speckit-taskstoissues<br/>tasks.md -> GitHub issues"]
    Converge["/speckit-converge<br/>diff code vs spec/plan/tasks"]
    Done(["Feature complete"])

    Constitution -. "once, or amend anytime" .-> Specify

    Specify --> Clarify
    Clarify -.-> Specify
    Specify --> Checklist
    Checklist -.-> Specify

    Specify --> Plan
    Plan --> Tasks
    Tasks --> Analyze
    Analyze -.->|"inconsistency found"| Specify

    Analyze --> Implement
    Analyze --> ToIssues

    Implement --> Converge
    Converge -->|"gap found"| Tasks
    Converge --> Done

    style Clarify stroke-dasharray: 4 3
    style Checklist stroke-dasharray: 4 3
    style Analyze stroke-dasharray: 4 3
    style ToIssues stroke-dasharray: 4 3
    style Converge stroke-dasharray: 4 3
```

Solid arrows are the required backbone (`specify -> plan -> tasks ->
implement`). Dashed nodes/arrows are optional enrichment steps you reach for
when you need them, not steps you must run every time:

- **Clarify** — only when the spec has real ambiguity (max 5 questions, and it
  edits `spec.md` in place rather than re-running specify).
- **Checklist** — a custom review checklist for the feature, on top of the
  auto-generated `requirements.md` from `/speckit-specify`.
- **Analyze** — a read-only consistency pass across spec/plan/tasks; only
  loops back to the spec if it finds something to fix.
- **Taskstoissues** — an alternative to `/speckit-implement` for teams that
  want a GitHub issue per task instead of Claude implementing directly.
- **Converge** — run after implementation (or after picking up someone else's
  partial work) to catch anything the tasks list missed; feeds any gap back
  in as new tasks rather than starting over.

## 2. The automated gated cycle

`.specify/workflows/speckit/workflow.yml` codifies the minimal, runnable
version of the above — the four required commands with a manual approval gate
between each design artifact:

```mermaid
sequenceDiagram
    actor Dev as Developer
    participant WF as speckit workflow
    participant Repo as specs/NNN-feature/

    Dev->>WF: run workflow (spec: "...")
    WF->>Repo: speckit.specify -> spec.md
    WF->>Dev: gate - review spec
    alt reject
        Dev->>WF: reject
        WF->>Dev: abort
    else approve
        Dev->>WF: approve
        WF->>Repo: speckit.plan -> plan.md
        WF->>Dev: gate - review plan
        alt reject
            Dev->>WF: reject
            WF->>Dev: abort
        else approve
            Dev->>WF: approve
            WF->>Repo: speckit.tasks -> tasks.md
            WF->>Repo: speckit.implement -> code
            WF->>Dev: feature implemented
        end
    end
```

Note: this gated cycle is deliberately narrower than section 1 — it has no
clarify/checklist/analyze/converge steps, so run those manually beforehand or
in between if the feature needs them; the workflow only automates the
required backbone plus its two approval gates.
