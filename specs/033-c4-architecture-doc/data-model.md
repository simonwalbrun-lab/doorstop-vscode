# Data Model: C4 Architecture Document

The "data" of this feature is the document itself. This file fixes its outline, so every
later spec update knows where things go.

## Document outline (`doc/architecture.md`)

| # | Section | Content | FR |
|---|---------|---------|----|
| 0 | Title + spec marker | `**Up to date with spec:** NNN` and `**Pending specs:** …` directly under the title | FR-009 |
| 1 | Overview | 3–5 sentences: what the system is, how to read this document, legend for C4 element types; states it supersedes `doc/arc42/` | FR-001 |
| 2 | Level 1 – System Context | Mermaid diagram + table of person/systems | FR-002, FR-006 |
| 3 | Level 2 – Containers | Mermaid diagram + table (name, technology, responsibility, source path) + relationships table | FR-003, FR-006 |
| 4 | Level 3 – Components: Extension host | Mermaid diagram + table (component, responsibility, source paths) | FR-004, FR-005, FR-006, FR-007 |
| 5 | Level 3 – Components: Requirements server | Same as 4 | FR-004, FR-005, FR-006, FR-007 |
| 6 | Dynamic view – change a requirement | Mermaid sequence diagram: UI → extension → server (lock) → Doorstop → disk → refresh | FR-010 |
| 7 | Cross-cutting concepts | Server start/connection, one-request-at-a-time + cancellation, progress toasts, error responses — one short paragraph each, linked to constitution | US3 |
| 8 | Key decisions | Table: decision, reason, constitution principle / spec | FR-011 |
| 9 | How to update this document | Steps per new spec (see below) | FR-012 |

## C4 elements

**Person**: Developer (requirements author) using VS Code.

**Software system**: Doorstop Requirements for VS Code.

**External systems**: VS Code workbench; Python environment / pip (installs and runs the server package); Doorstop library (inside the server process); Git (status report); PDF export tooling (Node script).

**Containers**:

| Container | Technology | Source |
|-----------|------------|--------|
| Extension host | TypeScript, VS Code Extension API, esbuild | `src/*.ts` |
| Diagram webview | JavaScript, vis-network | `src/webview/diagram/` |
| Filter-results renderer | JavaScript, notebook renderer | `src/webview/filterResults/` |
| Requirements server | Python, FastAPI, uvicorn, Doorstop | `server/src/doorstop_server/` |
| Requirements repository | `.doorstop.yml`, `.yml`, `.md` files, `*.doorstop.json` diagrams | user workspace |

**Relationships** (directed, with what flows):

- Extension host → Requirements server: HTTP/JSON on localhost (`doorstopServer.ts`); spawns it as a child process.
- Extension host ↔ Diagram webview: `postMessage` JSON.
- Extension host → Filter-results renderer: notebook output (`application/vnd.doorstop.filter-results+json`).
- Requirements server → Requirements repository: reads/writes via the Doorstop API.
- Extension host → Requirements repository: reads/writes `*.doorstop.json` diagram files (custom editor), watches files.

**Components**: grouped per R4 in [research.md](research.md); the full module-to-component mapping is made during implementation and must cover every module listed in the plan's Scale/Scope.

## Validation rules

- Every module in `src/*.ts` and `server/src/doorstop_server/**/*.py` (excluding `__init__.py`, `__pycache__`, tests) appears in exactly one component row (FR-007).
- Every path in the document exists (FR-008).
- Every diagram element appears in the table below it, and vice versa (FR-006).

## Update steps (content of section 9)

1. Set `Up to date with spec` to the spec just implemented; remove it from `Pending specs`.
2. New or removed source module → add/remove it in the right component row.
3. New container, external system, or communication path → update levels 1–2.
4. New cross-cutting rule or constitution principle → update sections 7–8.
5. No architectural change → only step 1.
