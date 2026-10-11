---

description: "Task list for 028 Traceability Cross-Document Links"
---

# Tasks: Traceability Cross-Document Links

**Input**: Design documents from `/specs/028-traceability-cross-links/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/publish-cli.md](contracts/publish-cli.md), [quickstart.md](quickstart.md)

**Tests**: Included. Constitution VI and VIII require at least one CI-run test
per FR. Each test carries a trace comment, `# Spec 028 FR-NNN` (Python) or
`// Spec 028 FR-NNN` (TypeScript/JS), directly above the test function, and
lists every FR it verifies.

**Organization**: Grouped by user story. Paths are relative to the repo root.

- Doorstop itself and the `.tpl` templates are **not** changed (FR-010).
- The server already serializes requests (`SerializeRequestsMiddleware`), so
  the class-level overrides in `publish.py` cannot overlap.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an
  incomplete task)
- **[Story]**: US1-US3 from spec.md

---

## Phase 1: Setup

No setup is needed. There is no new dependency, package or project. Go to
Phase 2.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The publish-scoped override module, request fields, endpoint
wiring, both settings and the shared test fixture. Every story needs these.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T001 Create `server/src/doorstop_server/publish.py` with a module
  docstring explaining research R1/R2: Doorstop finds children only in
  directly-below documents, so this module overrides two public Doorstop
  methods for one publish, and Doorstop itself is never modified.
  - Imports: `from contextlib import contextmanager`,
    `from unittest.mock import patch`, `from doorstop import settings`,
    `from doorstop.core.item import Item, UnknownItem`,
    `from doorstop.core.tree import Tree`.
  - Implement `@contextmanager def publish_options(matrix: str = "complete", child_links: bool = True)`.
  - Capture the originals first:
    - `original_children = Item.find_child_items_and_documents`
    - `original_matrix = Tree.get_traceability`
  - Define `def tree_wide_children(self, document=None, tree=None, find_all=True)`:
    - Keep Doorstop's child documents:
      `_, documents = original_children(self, document=document, tree=tree, find_all=False)`.
    - On the first call, build a reverse index once. Use a closure dict plus a
      `built` flag, not "index is empty", so a project without links does not
      rebuild every time.
    - Build it from `tree or self.tree`: for each `document2` in that tree (in
      tree order), for each `item2` in `document2`, for each `uid` in
      `item2.links`, append to `index[str(uid)]` either `item2` when
      `item2.active`, or `UnknownItem(item2.uid)` when it is not.
    - `return list(index.get(str(self.uid), [])), documents`.
    - Add the comment
      `# ponytail: index built from the first tree seen; one publish = one tree`.
  - For now, keep the `matrix` argument but leave the matrix override as
    `TODO(T008/T009)`. It is a no-op until US1.
  - Body:
    `with patch.object(Item, "find_child_items_and_documents", tree_wide_children), patch.object(settings, "PUBLISH_CHILD_LINKS", child_links): yield`.
    `patch.object` restores both on any exit, including exceptions (FR-010,
    Constitution III).
- [X] T002 [P] In `server/src/doorstop_server/schemas.py`, extend
  `class PublishRequest` with two fields, each with a short comment
  referencing spec 028:
  - `traceability: Literal["complete", "doorstop"] = "complete"` (FR-011;
    any other value is a 422);
  - `childLinks: bool = True` (FR-012).
- [X] T003 In `server/src/doorstop_server/routers/documents.py`, import
  `from doorstop_server.publish import publish_options` and wrap both publish
  calls in `with publish_options(matrix=body.traceability, child_links=body.childLinks):`:
  - In `publish_document`, place it inside the existing
    `with _borrowed_template(...)` block around `publisher.publish(...)`.
  - In `publish_tree`, wrap `publisher.publish(tree, ...)`.
  - Keep `_resolve_written_path` and the index logic unchanged.
  - Depends on T001 and T002.
- [X] T004 [P] In `package.json`, under `contributes.configuration`, add two
  properties after `doorstop.publish.template` in the "Publish" block:
  - `"doorstop.publish.traceability"`:
    - `"type": "string"`, `"enum": ["complete", "doorstop"]`,
      `"default": "complete"`;
    - `"enumDescriptions"`: "Matrix includes every declared link, also links
      that skip a document level or cross branches." and "Matrix exactly as
      Doorstop's own publish produces it.";
    - `"markdownDescription"`: "Traceability matrix (`traceability.html`/`.csv`)
      produced when publishing all documents. Affects the matrix only; item
      child links always include cross-document links."
  - `"doorstop.publish.noChildLinks"`:
    - `"type": "boolean"`, `"default": false`;
    - `"markdownDescription"`: "Publish without child links on items (Doorstop's
      `--no-child-links`). Parent links are then labelled *Links:*. Does not
      change the traceability matrix."
- [X] T005 [P] In `src/doorstopCommands.ts` (`doorstop.publish` handler), next
  to where `configured` is read from `getConfiguration('doorstop.publish')`:
  - Read the settings once:
    `const publishSettings = vscode.workspace.getConfiguration('doorstop.publish');`
  - Build the options:
    `const linkOptions = { traceability: publishSettings.get<'complete' | 'doorstop'>('traceability', 'complete'), childLinks: !publishSettings.get<boolean>('noChildLinks', false) };`
    with the comment `// Spec 028: matrix mode and Doorstop's --no-child-links, applied server-side.`
  - Spread `...linkOptions` into all three request bodies:
    1. `publishOne` (`/documents/{prefix}/publish`);
    2. the PDF `POST /publish`;
    3. the combined-run `POST /publish`.
  - Run `npm run compile` and fix any type or lint errors.
- [X] T006 Create `server/tests/test_traceability.py`:
  - Imports: `csv`, `pathlib.Path`, `doorstop`, `pytest`, and the existing
    `client`/`project_root` fixtures from `conftest.py`.
  - Add a fixture `xlink(client, project_root)` that builds the spec's sample
    project through the HTTP API.
    - Documents, via `POST /documents` with `"separator": ""` so UIDs are
      `REQ001` etc.:
      - REQ at `project_root/"req"`;
      - SYS at `project_root/"sys"` with `parentPrefix: "REQ"`;
      - TST at `project_root/"tst"` with `parentPrefix: "SYS"`.
    - Items, via `POST /documents/{prefix}/items` with body `{}`: two in REQ,
      two in SYS, one in TST.
    - Links, via `POST /items/{child}/links` with `{"parentUid": ...}`:
      SYS001→REQ001, SYS002→REQ001, TST001→SYS001, TST001→SYS002,
      TST001→REQ002.
    - Return `project_root`.
  - Add helper `publish_all(client, out: Path, **options) -> Path`: it POSTs
    `/publish` with `{"format": "html", "destinationPath": str(out), **options}`,
    asserts 200 and returns `out`.
  - Add helper `matrix_rows(out: Path) -> list[tuple[str, ...]]`: it reads
    `out/"traceability.csv"` with `csv.reader`, skips the header row, and
    returns the rows as tuples of strings.
  - Add helper `doorstop_rows(project_root) -> list[tuple[str, ...]]`: it
    builds the tree with
    `doorstop.build(cwd=str(project_root), root=str(project_root), request_next_number=None)`
    and maps `tree.get_traceability()` to tuples of `str(item.uid)` or `""`,
    using unpatched Doorstop as the reference.
  - Note: if `/publish` needs a VCS root, run `git init -q` in `project_root`
    inside the fixture, as `src/test/pdf/exportPdf.test.mjs` does.
  - Depends on T003.

**Checkpoint**: `pytest server/tests` is still green (no behaviour asserted yet), and `npm run compile` passes.

---

## Phase 3: User Story 1 - Every declared link appears in the traceability matrix (Priority: P1) 🎯 MVP

**Goal**: In "complete" mode (the default), `traceability.html`/`.csv`
contain a row for every declared link between active normative items. In
"doorstop" mode, they equal Doorstop's own matrix.

**Independent Test**: Quickstart §2, "complete" and "dsmatrix" rows. The
`REQ002,,TST001` row exists by default and is absent with
`traceability: "doorstop"`.

### Tests for User Story 1

- [X] T007 [P] [US1] In `server/tests/test_traceability.py`, add the
  following tests, each with its trace comment:
  - (a) `# Spec 028 FR-001, FR-002`: with the default options,
    `("REQ002", "", "TST001")` is in `matrix_rows(...)`.
  - (b) `# Spec 028 FR-003`: a hierarchy-only project (the `xlink` fixture
    after `DELETE /items/TST001/links/REQ002`) gives `matrix_rows` equal, in
    order, to `doorstop_rows(project_root)`.
  - (c) `# Spec 028 FR-004`: the CSV rows equal the rows parsed from
    `traceability.html`. Parse the `<tbody>` `<td>` texts with
    `html.parser.HTMLParser`, a stdlib subclass collecting text per
    `<tr>`/`<td>`, mapping empty cells to `""`.
  - (d) `# Spec 028 FR-007`:
    - add a cycle with `POST /items/REQ001/links {"parentUid": "SYS001"}`;
    - add a same-document link with
      `POST /items/SYS002/links {"parentUid": "SYS001"}`;
    - publish, and assert it returns 200, all rows are unique
      (`len(rows) == len(set(rows))`), and `("REQ002", "", "TST001")` is
      still present.
  - (e) `# Spec 028 FR-011`: `publish_all(..., traceability="doorstop")` gives
    `matrix_rows` equal to `doorstop_rows(project_root)` and contains
    `("REQ002", "", "")`.
  - (f) `# Spec 028 FR-011`: `traceability="bogus"` gives 422.
- [X] T008 [P] [US1] In `src/test/regressionFixture.test.ts`, add the test
  `'Publish honours doorstop.publish.traceability (028)'`, preceded by
  `// Spec 028 FR-011`.
  - Assert that
    `vscode.workspace.getConfiguration('doorstop.publish').inspect('traceability')?.defaultValue === 'complete'`.
  - Create a cross-branch link:
    `await server.request('POST', '/items/MD-001/links', { parentUid: 'ARCH-001' })`.
  - Inside `try`:
    - Publish with `withTempDir` and `withStubbedDialogs` (`openDialog: [vscode.Uri.file(dir)]`).
      The quickPick returns the item labelled `'HTML'` when the labels
      include `'Markdown'`, otherwise `'All documents - combined run'`. This
      is the pattern of the existing 024 combined-run test.
    - Read `<dir>/traceability.csv` and assert a line contains both
      `ARCH-001` and `MD-001`.
    - Then
      `await vscode.workspace.getConfiguration('doorstop.publish').update('traceability', 'doorstop', vscode.ConfigurationTarget.Global)`,
      publish into a second temp dir, and assert that no line contains both
      UIDs.
  - In `finally`:
    - `await server.request('DELETE', '/items/MD-001/links/ARCH-001')`;
    - reset the setting with `update('traceability', undefined, Global)`.
  - Use `this.timeout(60000)`.

### Implementation for User Story 1

- [X] T009 [US1] In `server/src/doorstop_server/publish.py`, add
  `def _complete_traceability(self)`, a copy of Doorstop 3.2's
  `Tree.get_traceability` and `Tree._iter_rows`
  (`.venv/Lib/site-packages/doorstop/core/tree.py` lines 492-581) as one
  function with a nested recursive generator.
  - Keep all of the following:
    - the `by_uid` sort key;
    - `mapping` from `document.prefix` to column index;
    - the `rows` set;
    - starting only from `item.active` items;
    - the `Row(list)` class with `parent`/`child` flags;
    - the `if item.normative` gate;
    - parent recursion via `item.parent_items` (`child=False`) and child
      recursion via `item.child_items` (`parent=False`);
    - yielding when both flags are set.
  - Make exactly one change, applied in both directions:
    - Before recursing, filter the neighbours:
      `items = [i for i in items if not (i.normative and row[mapping[i.document.prefix]] is not None)]`.
    - Set the boundary flag when this filtered list is empty.
  - Comment the change as research R4: never fill a document column twice,
    which stops cycles and same-document overwrites. In hierarchy-only trees
    it never triggers.
  - Note: `UnknownItem` has `normative = False` and no real document, so the
    `i.normative` check must come first (short-circuit).
- [X] T010 [US1] In `server/src/doorstop_server/publish.py`, replace the
  T001 TODO:
  - Define `def _doorstop_traceability(self)`, which runs
    `with patch.object(Item, "find_child_items_and_documents", original_children): return original_matrix(self)`.
    It is defined inside `publish_options` so it can see the originals.
    Comment it as research R5: Doorstop's own matrix must not see the
    tree-wide child lookup used for item pages.
  - Add a third `patch.object(Tree, "get_traceability", _complete_traceability if matrix == "complete" else _doorstop_traceability)`
    to the `with` statement.
  - Depends on T009. T007 (a)-(f) now pass.

**Checkpoint**: `pytest server/tests/test_traceability.py` US1 tests and the 028 extension test are green. This is the MVP.

---

## Phase 4: User Story 2 - Target items show incoming cross-document links (Priority: P2)

**Goal**: Item pages (HTML and Markdown) list every incoming link as a child
link in both matrix modes. The checkbox hides child links as Doorstop's
`--no-child-links` does.

**Independent Test**: Quickstart §2 "complete", "dsmatrix" and "nochild"
columns for `REQ.html`.

### Tests for User Story 2

- [X] T011 [P] [US2] In `server/tests/test_traceability.py`, add these
  tests, each with its trace comment:
  - (a) `# Spec 028 FR-005`, combined run:
    - after `publish_all`, `out/"documents"/"REQ.html"` contains
      `href="TST.html#TST001"`;
    - the text between the `REQ002` anchor and the next item contains
      "Child links".
  - (b) `# Spec 028 FR-005`, Markdown:
    - publish via
      `POST /documents/REQ/publish {"format": "markdown", "destinationPath": str(tmp/"REQ.md")}`;
    - assert the file contains `Child links:` and `TST001`.
  - (c) `# Spec 028 FR-005`:
    - a hierarchy-only project (unlink TST001→REQ002);
    - the Markdown publish of SYS lists exactly the same child links as plain
      Doorstop;
    - for the reference, call `doorstop.core.publisher.publish(tree.find_document("SYS"), path, ext=".md")`
      on a freshly built tree, outside `publish_options`, and compare the
      `Child links:` lines.
  - (d) `# Spec 028 FR-006`: `out/"documents"/"TST.html"`'s parent-links line
    contains `REQ002`, `SYS001` and `SYS002`.
  - (e) `# Spec 028 FR-011, FR-005`: with `traceability="doorstop"`,
    `REQ.html` still contains `href="TST.html#TST001"`.
  - (f) `# Spec 028 FR-012`: with `childLinks=False`:
    - no `documents/*.html` contains "Child links";
    - `TST.html` contains "Links:" and not "Parent links:";
    - `matrix_rows` equals the default-options rows.
- [X] T012 [P] [US2] In `src/test/regressionFixture.test.ts`, add the test
  `'Publish honours doorstop.publish.noChildLinks (028)'`, preceded by
  `// Spec 028 FR-012`.
  - Assert that `inspect('noChildLinks')?.defaultValue === false`.
  - Set `update('noChildLinks', true, Global)`.
  - Run the Markdown combined run (the quickPick picks `'Markdown'` and
    `'All documents - combined run'`, like the existing 024 test) into a temp
    dir.
  - Assert that no `*.md` file in the output contains `Child links`, and
    that `ARCH.md` contains `Links:` (ARCH-001 links to a REQ item; REQ items
    have no parents).
  - In `finally`, reset the setting to `undefined`.
  - Use `this.timeout(60000)`.

### Implementation for User Story 2

- [X] T013 [US2] No new production code: the tree-wide child lookup (T001)
  and the `PUBLISH_CHILD_LINKS` override (T001) already deliver US2. Run
  T011/T012 and fix `tree_wide_children` in
  `server/src/doorstop_server/publish.py` if any fails. Check in particular:
  - child order equals Doorstop's for hierarchy-only projects (T011 c);
  - inactive linkers appear as plain UIDs.

**Checkpoint**: All US2 tests are green, and the US1 tests are still green.

---

## Phase 5: User Story 3 - Same result in the PDF and in CI (Priority: P3)

**Goal**: The PDF export and a CI run without VS Code produce the same
matrix and item pages as the extension, for the same option choices.

**Independent Test**: Quickstart §2 via the command line equals the endpoint
output, and `traceability.pdf` contains the cross row.

### Tests for User Story 3

- [X] T014 [P] [US3] In `server/tests/test_traceability.py`, add these
  tests:
  - (a) `# Spec 028 FR-009`. For each of `([], {})`,
    `(["--traceability", "doorstop"], {"traceability": "doorstop"})` and
    `(["--no-child-links"], {"childLinks": False})`:
    - run
      `subprocess.run([sys.executable, "-m", "doorstop_server.publish", *flags, "all", str(cli_out), "--html"], cwd=project_root, check=True, capture_output=True)`;
    - publish the same project through the endpoint with the matching
      options;
    - assert `matrix_rows(cli_out) == matrix_rows(api_out)`;
    - assert `(cli_out/"documents"/"REQ.html").read_text()` and
      `(cli_out/"documents"/"TST.html").read_text()` equal the endpoint's
      files.
  - (b) `# Spec 028 FR-008`:
    - create a custom template by copying Doorstop's bundled
      `views/doorstop.tpl` and `views/base.tpl` (from
      `Path(doorstop.__file__).parent/"views"`) into
      `project_root/"req"/"template"/"views"/`, renaming `doorstop.tpl` to
      `custom.tpl`;
    - call `publish_all(..., template="custom")`;
    - assert that `("REQ002", "", "TST001")` is in `matrix_rows` and that
      `REQ.html` links TST001.
- [X] T015 [P] [US3] In `src/test/pdf/exportPdf.test.mjs`, in the existing
  `"publish all as HTML, then one PDF per document plus traceability.pdf"`
  test:
  - Before publishing, add a cross-branch link in the temp copy:
    `execFileSync("doorstop", ["link", "MD-001", "ARCH-001"], { cwd: project, stdio: "pipe" })`.
  - Replace the `doorstop publish` call with
    `execFileSync(process.env.PYTHON ?? "python", ["-m", "doorstop_server.publish", "all", join(tmp, "out"), "--html"], { cwd: project, stdio: "pipe" })`.
  - After export, assert that `out/traceability.csv` has a line containing
    both `ARCH-001` and `MD-001`. The PDF text is not extractable with
    pdf-lib, and the PDF is a 1:1 print of that HTML; say so in a comment.
  - Add the trace comment `// Spec 028 FR-008, FR-009` above the test.

### Implementation for User Story 3

- [X] T016 [US3] In `server/src/doorstop_server/publish.py`, add
  `def main(argv=None) -> None` and
  `if __name__ == "__main__": main()`, per
  [contracts/publish-cli.md](contracts/publish-cli.md).
  - Parse our flag:
    - `parser = argparse.ArgumentParser(prog="python -m doorstop_server.publish", description="doorstop publish with complete cross-document links (spec 028)")`;
    - `parser.add_argument("--traceability", choices=["complete", "doorstop"], default="complete")`;
    - `args, rest = parser.parse_known_args(argv)`.
  - Run Doorstop's CLI inside our context:
    `from doorstop.cli.main import main as doorstop_main`, then
    `with publish_options(matrix=args.traceability): doorstop_main(["publish", *rest])`.
  - Do not set `child_links`, because Doorstop's CLI applies
    `--no-child-links` itself, inside the context. Doorstop's `sys.exit(1)`
    on failure propagates, and the patches are still restored.
- [X] T017 [US3] In `.github/workflows/ci.yml`, job `pdf-export`:
  - replace `- run: pip install doorstop` with `- run: pip install ./server`,
    which brings doorstop and the `doorstop` CLI that T015 still uses for
    `doorstop link`;
  - add `env: PYTHON: python` to the test step only if `python` is not on
    PATH by default (setup-python provides it, so normally no change).
- [X] T018 [P] [US3] In `README.md`:
  - In the PDF/CI section (around lines 144-200), replace
    `pip install doorstop` with `pip install doorstop-vscode-server` and every
    `doorstop publish all out --html` with
    `python -m doorstop_server.publish all out --html`, in both the GitHub
    and GitLab examples.
  - Add one sentence saying that the command takes the same arguments as
    `doorstop publish`, plus `--traceability doorstop` for Doorstop's own
    matrix, and `--no-child-links`.
  - In the settings section, document `doorstop.publish.traceability` and
    `doorstop.publish.noChildLinks` (one line each, same wording as T004).

**Checkpoint**: All 028 tests are green, and the `pdf-export` job passes locally (`node --test src/test/pdf/exportPdf.test.mjs`).

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T019 [P] In `server/tests/test_traceability.py`, add the test
  `# Spec 028 FR-010`:
  - record `{p: p.read_bytes() for p in project_root.rglob("*.yml")}` before
    `publish_all` and assert it is identical afterwards;
  - assert that `Item.find_child_items_and_documents`,
    `Tree.get_traceability` and `doorstop.settings.PUBLISH_CHILD_LINKS` are
    the original objects/values after a `with publish_options(...)` block
    that raises `RuntimeError` inside (use `pytest.raises`).
- [X] T020 [P] In `CHANGELOG.md`, add an entry under the unreleased section:
  - the traceability matrix and item child links now include
    cross-document links;
  - the new settings `doorstop.publish.traceability` and
    `doorstop.publish.noChildLinks`;
  - the CI command `python -m doorstop_server.publish`.
- [X] T021 Verify the coverage of Constitution VIII:
  - Run `grep -rhoE "Spec 028 FR-[0-9]{3}(, FR-[0-9]{3})*" server/tests src/test`
    and confirm that every FR-001 through FR-012 appears.
  - Run `pytest server/tests`, `npm run compile`, `npm test` and
    `node --test src/test/pdf/exportPdf.test.mjs`; all must be green.
- [X] T022 Walk through [quickstart.md](quickstart.md) §1-§3 by hand once
  (CLI and extension) and confirm the expected table.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 2)**:
  - T001 and T002 come first;
  - T003 depends on T001 and T002;
  - T004 and T005 are independent of the server tasks;
  - T006 depends on T003.
- **US1 (Phase 3)**: depends on Phase 2.
  - T009 → T010.
  - The tests T007 and T008 can be written before T009 and should fail
    until T010.
- **US2 (Phase 4)**: depends on Phase 2 only. Behaviour comes from T001,
  and the tests can run without US1. T011 (f) compares matrices with each
  other only, so it does not need US1.
- **US3 (Phase 5)**: T016 depends on T010 for the `--traceability` flag to
  matter. T014 (a) depends on T010 and T016. T017 depends on T016.
- **Polish**: after all stories.

### Parallel Opportunities

- Phase 2: T002, T004 and T005 run in parallel (different files). T001 can
  run in parallel with T004 and T005.
- US1: T007 (pytest) and T008 (vscode-test) run in parallel.
- US2: T011 and T012 run in parallel.
- US3: T014, T015 and T018 run in parallel. T016 and T017 run in sequence.
- Polish: T019 and T020 run in parallel.

### Parallel Example: User Story 1

```text
Task: "T007 [US1] server tests FR-001..FR-004, FR-007, FR-011 in server/tests/test_traceability.py"
Task: "T008 [US1] extension test FR-011 in src/test/regressionFixture.test.ts"
```

### Parallel Example: User Story 3

```text
Task: "T014 [US3] CLI/endpoint equivalence + custom template tests in server/tests/test_traceability.py"
Task: "T015 [US3] exportPdf.test.mjs uses python -m doorstop_server.publish + cross row"
Task: "T018 [US3] README CI examples and settings"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2 (T001-T006).
2. Complete US1 (T007-T010). The matrix is now complete by default, and
   "doorstop" mode gives Doorstop's own matrix.
3. **Stop and validate**: quickstart §2 "complete" and "dsmatrix" rows.

### Incremental Delivery

1. US1: the matrix is fixed, which fixes the reported defect.
2. US2: item child links and the no-child-links checkbox, which are mostly
   delivered by Phase 2 and only need verifying.
3. US3: the CI command, PDF test and README, which give reproducible release
   artifacts.

---

## Notes

- The after-implement hook `ponytail:ponytail-review` is mandatory (see
  `.specify/extensions.yml`).
- Every new test needs its `Spec 028 FR-NNN` trace comment, or T021 fails.
- Commit after each phase checkpoint.
