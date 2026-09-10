# Research: Go to Definition & Usage Navigation

No `[NEEDS CLARIFICATION]` markers exist in the Technical Context — the
existing code (`hoverProvider.ts`, `requirementTree.ts`, `doorstopServer.ts`,
`server/src/doorstop_server/routers/tree.py`) and the VS Code language-feature
APIs fully determine the approach. This document records the decisions made
and the alternatives rejected.

## Decision 1: Resolve UID↔path and reverse links from `GET /tree`, not local YAML parsing

**Decision**: Build a per-request lookup (uid → path, and uid →
list-of-items-that-link-to-it) from the server's existing `GET /tree`
response (`server/src/doorstop_server/routers/tree.py`, already consumed by
`DoorstopTreeProvider` in `src/requirementTree.ts`). Every item in the
response already carries `uid`, `path`, and its own forward `links` array
(`LinkInfo[]`), which is exactly enough to answer both directions: "where is
UID X's file" (direct map lookup) and "who links to UID X" (scan every
item's `links` for X).

**Rationale**: Constitution Principle I requires the server to be the single
source of truth for requirement discovery; Principle II forbids
reimplementing Doorstop parsing/linking client-side. `GET /tree` already
*is* that server-computed truth — reusing it is less code than an
alternative, not more. It also sidesteps an ambiguity the existing hover
implementation has to guess around: `hoverProvider.ts`'s
`vscode.workspace.findFiles('**/${uid}.{yml,md}')` can match a stray/misplaced
file that isn't actually part of any loaded Doorstop document, and picks
whichever result the glob returns first. `GET /tree` only knows about real
items, so this feature's results are unambiguous by construction — resolving
this spec's "Given a requirement UID matches more than one file... behave
deterministically" edge case for free.

**Alternatives considered**:
- **Copy `hoverProvider.ts`'s local YAML-parse + `findFiles` glob approach**
  — rejected: this is the existing precedent, but it re-derives data the
  server has already computed (violates Principle I/II more directly than
  necessary), can't disambiguate duplicate/stray files as cleanly, and would
  duplicate parsing logic across two files instead of one. Not fixing hover
  itself (out of scope — see `plan.md` Constraints), but not repeating the
  same shortcut in new code either.
- **Add a new server endpoint** (e.g. `GET /items/{uid}/usages`) that returns
  fully-resolved locations including line numbers — rejected: `GET /tree`
  already returns everything needed except line position (see Decision 2),
  so a new endpoint would duplicate data the client already fetches, for a
  marginal saving that doesn't justify a server change under Principle IV's
  "no dependency/complexity without justification" spirit (applied here to
  API surface, not just packages).

## Decision 2: Locate the exact reference line with a client-side text scan, not server data

**Decision**: Once `GET /tree` identifies *which* files reference a given
UID (Decision 1), read each referencing file's raw text
(`vscode.workspace.fs.readFile`) and find the line containing that UID token
(reusing the same UID token shape `hoverProvider.ts` already matches:
`\b[A-Z0-9_-]+-\d+\b`) to build an accurate `vscode.Location` (file + line +
column). If the token can't be found in the text (unexpected formatting),
fall back to line 0 of that file rather than omitting the result.

**Rationale**: Doorstop's own item model (and therefore `GET /tree`'s
`LinkInfo`) has no concept of "which line" a link appears on — only that the
link exists. FR-002/FR-003 require file-*and-line* accuracy for the usages
view, so something has to locate the line. Doing this as a plain substring/
regex scan over already-known files is presentation bookkeeping (mapping a
known fact to an editor position), not Doorstop domain logic — it doesn't
tell us anything `GET /tree` didn't already establish, it only says *where
on screen* to point. This keeps Principle II intact: the scan can never
produce a link that `GET /tree` didn't already report.

**Alternatives considered**:
- **Point every usage Location at line 0** — rejected: technically satisfies
  "file", not "line"; every entry in the Peek/References view would show the
  top of the file regardless of where the link actually is, which fails
  FR-002/FR-003 and would look broken next to VS Code's own reference
  results for other languages.
- **Have the server return line numbers** — rejected per Decision 1
  (unnecessary server change; Doorstop doesn't track this either, so the
  server would have to do the same text scan itself, just across a network
  call instead of a local file read).

## Decision 3: Land "Go to Definition" on the target's header line, not line 0

**Decision**: When resolving the single-UID case (US1/US3), don't land the
cursor at `Range(0, 0, 0, 0)`. Instead, read the target file's raw text and
locate its header line, format-dependent:

- **`.yml` files**: the first line matching `^\s*header\s*:` (case-insensitive).
- **`.md` files**: the first line matching `^#{1,6}\s+` (the first Markdown
  heading).

If no such line is found (item has no `header:` field, or the Markdown file
has no heading), fall back to `Range(0, 0, 0, 0)`.

**Rationale**: User-requested refinement — landing at the very top of the
file (e.g. before a YAML `links:` block, or before frontmatter) is less
useful than landing where the requirement's title actually is, which is
exactly what "Go to Definition" should feel like: you see what you jumped
to, immediately. This reuses the same text-scan mechanism as Decision 2
(read a known file, regex for a known-shape line) rather than introducing a
new lookup mechanism — still presentation bookkeeping, not Doorstop domain
logic, so Principle II is unaffected.

**Alternatives considered**:

- **Use `ItemNode.header`'s *value* directly and search the text for that
  string** — rejected: less robust than matching the field/heading shape
  itself (the value could theoretically recur elsewhere in the file, e.g.
  inside `text:`), and doesn't handle the case where `header` is unset but a
  Markdown heading still exists or vice versa as cleanly as one shape-based
  regex per file type.
- **Only handle one of `.yml`/`.md` and fall back to line 0 for the other**
  — rejected: the user explicitly asked for both formats, and Doorstop items
  legitimately use either (`.yml` is the plain single-file format, `.md` is
  the frontmatter-plus-body format `hoverProvider.ts`'s `parseDoorstopFile`
  already parses); leaving one format at line 0 would make the feature feel
  inconsistent depending on which format a given document uses.

## Decision 4: `undefined`/`[]` + console warning on any failure, no modal dialogs

**Decision**: `provideDefinition`/`provideReferences` return `undefined`
(single-lookup case) or `[]` (usages case) whenever: the server request
fails (server unreachable/still starting), the cursor isn't on a recognized
UID or the `derived:` line, or a UID/derived-line lookup legitimately has no
match. Failures are logged via `console.error`/`console.warn` (matching
`hoverProvider.ts`'s existing `console.error('[Doorstop][hover] ...')`
pattern) rather than shown as `vscode.window.showErrorMessage`.

**Rationale**: Constitution Principle III requires explicit handling, not
silence — but F12/Shift+F12 are high-frequency, low-stakes actions a user
might press speculatively on any line; popping a modal on every miss (e.g.
cursor not on a UID) would be much worse UX than the editor's own built-in
"No definition found" status-bar message, which is what returning
`undefined`/`[]` naturally produces. This mirrors how `hoverProvider.ts`
already handles the equivalent case (returns `undefined`, logs to console,
no dialog) — consistent behavior across all navigation-adjacent features.

**Alternatives considered**:
- **Show `vscode.window.showErrorMessage` when the server is unreachable** —
  rejected: `deriveProvider.ts` reserves error dialogs for explicit,
  deliberate user actions (a mutating command the user just invoked and is
  waiting on); F12 is closer to hover in cadence and expectation, and
  `requirementTree.ts` already shows one "server unreachable" message the
  first time it happens rather than repeating it — a second, independent
  error surface for the same underlying condition would be redundant noise.

## Decision 5: One new file, `definitionProvider.ts`; `hoverProvider.ts` stays untouched

**Decision**: Implement both `vscode.DefinitionProvider` and
`vscode.ReferenceProvider` in a new `src/definitionProvider.ts`, registered
for the same `[{ language: 'yaml' }, { language: 'markdown' }]` selector
`deriveProvider.ts`'s CodeLens already uses. Do not refactor
`hoverProvider.ts` to share code with the new file.

**Rationale**: Per `plan.md`'s Constraints and the constitution's
"prefer the smallest change" workflow guidance, unifying hover's and this
feature's UID-resolution code is a legitimate future cleanup but not
required to ship this spec, and touching already-shipped, working hover
behavior widens this change's blast radius for no user-facing benefit.

**Alternatives considered**:
- **Refactor `hoverProvider.ts` to also use `GET /tree`, sharing one resolver
  with the new providers** — rejected for this feature: desirable in the
  abstract (would fully resolve hover's Principle I/II gap, not just avoid
  repeating it), but out of scope for a navigation-focused spec and adds
  regression risk to a feature spec 009 doesn't otherwise need to touch.
