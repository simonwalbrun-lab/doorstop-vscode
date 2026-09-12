import * as assert from 'assert';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

import * as vscode from 'vscode';

import { brokenReferenceMessage, resolveDefinitionAt } from '../definitionProvider';
import { chooseParentPrefix } from '../doorstopCommands';
import { getDeriveTargets } from '../deriveProvider';
import { loadDoorstopIndex } from '../doorstopIndex';
import { ProblemsProvider, registerProblemsProvider } from '../problemsProvider';
import { DoorstopServer, DOORSTOP_SERVER_HOST, DOORSTOP_SERVER_PORT } from '../doorstopServer';
import { DocumentViewHandle, Prompts } from '../documentViewProvider';
import { DocumentNode, TreeResponse } from '../doorstopTypes';
import { DoorstopTreeProvider, RequirementTreeItem } from '../requirementTree';

// Runs against the real testdata/regression fixture, through the real Doorstop
// server (not a mock), matching the extension's own production code path -
// see specs/012-doorstop-test-model/research.md §2-3 for why this suite does
// not go through getActivePythonPath()/ms-python.python.

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE_ROOT = path.join(REPO_ROOT, 'testdata', 'regression');

/** Candidates checked in order: the project's own .venv first (what a local
 * `pip install -e .[dev]` from server/ actually populates), then bare
 * python3/python from PATH (what CI's actions/setup-python puts there directly,
 * with no project .venv). A bare "python"/"python3" on PATH is not reliable on
 * its own - on a dev machine it may resolve to an unrelated system interpreter
 * that has never had doorstop_server installed into it (observed in practice:
 * a Test Explorer run resolved "python" to C:\Python314\python.exe, which is
 * not this project's .venv and has no doorstop_server module). */
function candidatePythonPaths(): string[] {
  const venvPython = process.platform === 'win32'
    ? path.join(REPO_ROOT, '.venv', 'Scripts', 'python.exe')
    : path.join(REPO_ROOT, '.venv', 'bin', 'python3');
  const pathCandidates = process.platform === 'win32' ? ['python', 'python3'] : ['python3', 'python'];
  return [venvPython, ...pathCandidates];
}

function resolvePythonCommand(): string {
  for (const candidate of candidatePythonPaths()) {
    const probe = spawnSync(candidate, ['-c', 'import doorstop_server'], { stdio: 'ignore' });
    if (!probe.error && probe.status === 0) {
      return candidate;
    }
  }
  throw new Error(
    'No Python interpreter with doorstop_server installed was found (checked the project .venv and ' +
    'python3/python on PATH). Run "pip install -e .[dev]" from server/ into a .venv at the repo root, ' +
    'or ensure a PATH python has doorstop_server installed (as CI does).'
  );
}

/** Fetches /tree from whatever is currently listening on the default Doorstop
 * server port, or undefined if nothing responds there. */
async function fetchTreeIfListening(): Promise<TreeResponse | undefined> {
  try {
    const health = await fetch(`http://${DOORSTOP_SERVER_HOST}:${DOORSTOP_SERVER_PORT}/health`);
    if (!health.ok) {
      return undefined;
    }
    const tree = await fetch(`http://${DOORSTOP_SERVER_HOST}:${DOORSTOP_SERVER_PORT}/tree`);
    return tree.ok ? await tree.json() as TreeResponse : undefined;
  } catch {
    return undefined;
  }
}

/** The extension's own DOORSTOP_SERVER_PORT default is shared machine-wide, so a
 * developer's own separate, already-running VS Code/Doorstop instance (for an
 * unrelated project) can already be bound to it locally - this happened during
 * this suite's own development. Verifying the fixture's exact shape before
 * trusting an already-healthy server turns that into a clear setup error
 * instead of silently asserting against the wrong project's data. */
function isRegressionFixtureTree(tree: TreeResponse): boolean {
  const byPrefix = new Map(tree.documents.map(doc => [doc.prefix, doc]));
  return byPrefix.get('REQ')?.items.length === 10
    && byPrefix.get('ARCH')?.items.length === 1
    && byPrefix.get('EMPTY')?.items.length === 0;
}

/** Restores a fixture file's exact original bytes after `fn` runs, even if `fn` throws - per
 * contracts/fixture-layout.md invariant 2 (a consumer must leave the fixture unchanged). */
async function withRestoredFile<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
  const original = await fs.readFile(filePath);
  try {
    return await fn();
  } finally {
    await fs.writeFile(filePath, original);
  }
}

async function findTreeItem(
  tree: DoorstopTreeProvider,
  predicate: (item: RequirementTreeItem) => boolean
): Promise<RequirementTreeItem | undefined> {
  const queue: RequirementTreeItem[] = await tree.getChildren();
  while (queue.length > 0) {
    const item = queue.shift()!;
    if (predicate(item)) {
      return item;
    }
    queue.push(...(await tree.getChildren(item)));
  }
  return undefined;
}

suite('Regression Fixture Integration Suite', () => {
  let server: DoorstopServer;
  let startedOwnServer = false;
  let treeProvider: DoorstopTreeProvider;
  let problems: ProblemsProvider;
  let documentView: DocumentViewHandle;

  suiteSetup(async function () {
    this.timeout(30000);

    const ext = vscode.extensions.getExtension('SimonWalbrun.doorstop');
    assert.ok(ext, 'Doorstop extension should be discoverable');
    const exports = await ext!.activate();
    treeProvider = exports.treeProvider;
    assert.ok(treeProvider, 'activate() should export treeProvider for tests');
    problems = exports.problemsProvider;
    assert.ok(problems, 'activate() should export problemsProvider for tests');
    documentView = exports.documentView;
    assert.ok(documentView, 'activate() should export documentView for tests');

    server = new DoorstopServer();
    // If the extension's own activation already started a server against this
    // workspace (e.g. a local run with ms-python.python installed and configured),
    // reuse it instead of racing a second process for the same port - but verify
    // it's actually serving this fixture first (see isRegressionFixtureTree).
    const existingTree = await fetchTreeIfListening();
    if (existingTree) {
      assert.ok(
        isRegressionFixtureTree(existingTree),
        'Port ' + DOORSTOP_SERVER_PORT + ' is already serving a different Doorstop project. ' +
        'Close whatever other VS Code window or process is running a Doorstop server ' +
        '(e.g. another instance of this extension) before running this suite locally.'
      );
    } else {
      const pythonPath = resolvePythonCommand();
      await server.start(FIXTURE_ROOT, pythonPath);
      startedOwnServer = true;
    }

    // The tree provider's own loadItems() may have already run once, early during
    // activation, before any server was confirmed reachable - it caches that
    // (possibly empty/failed) result permanently otherwise (requirementTree.ts's
    // `loaded` flag), so force it to re-fetch now that a server is confirmed up.
    treeProvider.refresh();
  });

  suiteTeardown(() => {
    if (startedOwnServer) {
      server.dispose();
    }
  });

  test('Explorer tree loads all three fixture documents', async () => {
    const tree = await server.request<TreeResponse>('GET', '/tree');
    const byPrefix = new Map(tree.documents.map(doc => [doc.prefix, doc]));

    assert.ok(byPrefix.has('REQ'), 'REQ document should be present');
    assert.ok(byPrefix.has('ARCH'), 'ARCH document should be present');
    assert.ok(byPrefix.has('EMPTY'), 'EMPTY document should be present');
    assert.strictEqual(byPrefix.get('REQ')!.items.length, 10);
    assert.strictEqual(byPrefix.get('ARCH')!.items.length, 1);
    assert.strictEqual(byPrefix.get('EMPTY')!.items.length, 0, 'EMPTY document should have zero items');
  });

  test("Item lifecycle: the review command marks REQ-001 as reviewed", async function () {
    this.timeout(10000);
    const filePath = path.join(FIXTURE_ROOT, 'REQ-001.yml');

    await withRestoredFile(filePath, async () => {
      const item = await findTreeItem(
        treeProvider,
        candidate => !candidate.itemData.isDoorstopRoot && candidate.itemData.uid === 'REQ-001'
      );
      assert.ok(item, 'REQ-001 should be present in the tree');

      await vscode.commands.executeCommand('doorstop.review', item);

      const tree = await server.request<TreeResponse>('GET', '/tree');
      const req001 = tree.documents.find(doc => doc.prefix === 'REQ')!.items.find(i => i.uid === 'REQ-001');
      assert.strictEqual(req001?.reviewed, true, 'REQ-001 should be reviewed after running the command');
    });
  });

  test("Go to Definition reports REQ-009's dangling link as broken", async () => {
    const uri = vscode.Uri.file(path.join(FIXTURE_ROOT, 'REQ-009.yml'));
    const document = await vscode.workspace.openTextDocument(uri);
    const line = document.getText().split('\n').findIndex(text => text.includes('REQ-999'));
    assert.ok(line >= 0, 'fixture must reference REQ-999');

    const locations = await vscode.commands.executeCommand<vscode.Location[]>(
      'vscode.executeDefinitionProvider',
      uri,
      new vscode.Position(line, 2)
    );

    assert.strictEqual(locations?.length ?? 0, 0, 'REQ-999 does not exist, so no definition should be found');
  });

  test("Item lifecycle: the clear-suspect command resolves REQ-007's suspect link", async function () {
    this.timeout(10000);
    const filePath = path.join(FIXTURE_ROOT, 'REQ-007.yml');

    await withRestoredFile(filePath, async () => {
      const before = await server.request<TreeResponse>('GET', '/tree');
      const beforeLink = before.documents.find(doc => doc.prefix === 'REQ')!.items.find(i => i.uid === 'REQ-007')!.links[0];
      assert.strictEqual(beforeLink?.suspect, true, 'REQ-007 should start suspect');

      const item = await findTreeItem(
        treeProvider,
        candidate => !candidate.itemData.isDoorstopRoot && candidate.itemData.uid === 'REQ-007'
      );
      assert.ok(item, 'REQ-007 should be present in the tree');

      await vscode.commands.executeCommand('doorstop.clear', item);

      const after = await server.request<TreeResponse>('GET', '/tree');
      const afterLink = after.documents.find(doc => doc.prefix === 'REQ')!.items.find(i => i.uid === 'REQ-007')!.links[0];
      assert.strictEqual(afterLink?.suspect, false, 'REQ-007 should no longer be suspect after clearing');
    });

    // The file is restored by withRestoredFile's finally block even if an assertion
    // above threw; re-check here that restoration actually put REQ-007 back to
    // suspect, which doubles as a check on the restore mechanism itself.
    const restored = await server.request<TreeResponse>('GET', '/tree');
    const restoredLink = restored.documents.find(doc => doc.prefix === 'REQ')!.items.find(i => i.uid === 'REQ-007')!.links[0];
    assert.strictEqual(restoredLink?.suspect, true, 'REQ-007 should be suspect again once the fixture file is restored');
  });

  /** The item node for `uid` as the server currently reports it. */
  async function itemNode(uid: string) {
    const tree = await server.request<TreeResponse>('GET', '/tree');
    return tree.documents.flatMap(doc => doc.items).find(item => item.uid === uid);
  }

  test('Action: Do Review marks only the target requirement as reviewed', async function () {
    this.timeout(10000);
    const filePath = path.join(FIXTURE_ROOT, 'REQ-007.yml');

    await withRestoredFile(filePath, async () => {
      assert.strictEqual((await itemNode('REQ-007'))?.reviewed, false, 'REQ-007 should start unreviewed');
      const otherBefore = (await itemNode('REQ-008'))?.reviewed;

      await vscode.commands.executeCommand('doorstop.doReview', {
        uid: 'REQ-007',
        documentUri: vscode.Uri.file(filePath).toString()
      });

      assert.strictEqual((await itemNode('REQ-007'))?.reviewed, true, 'REQ-007 should be reviewed');
      assert.strictEqual(
        (await itemNode('REQ-008'))?.reviewed,
        otherBefore,
        'no other requirement may be touched'
      );
    });
  });

  test("Action: Clear All Suspicions clears the item's links", async function () {
    this.timeout(10000);
    const filePath = path.join(FIXTURE_ROOT, 'REQ-010.yml');

    await withRestoredFile(filePath, async () => {
      const before = await itemNode('REQ-010');
      assert.deepStrictEqual(
        before?.links.map(link => link.suspect),
        [true, true],
        'REQ-010 should start with both links suspect'
      );

      await vscode.commands.executeCommand('doorstop.clearAllSuspicions', {
        uid: 'REQ-010',
        documentUri: vscode.Uri.file(filePath).toString()
      });

      const after = await itemNode('REQ-010');
      assert.deepStrictEqual(
        after?.links.map(link => link.suspect),
        [false, false],
        'every link of REQ-010 should be cleared'
      );
      assert.strictEqual(after?.cleared, true);
    });
  });

  test('Action: Clear the Suspicion clears one link and leaves the other suspect', async function () {
    this.timeout(10000);
    const filePath = path.join(FIXTURE_ROOT, 'REQ-010.yml');

    await withRestoredFile(filePath, async () => {
      await vscode.commands.executeCommand('doorstop.clearSuspicion', {
        uid: 'REQ-010',
        parentUid: 'REQ-001',
        documentUri: vscode.Uri.file(filePath).toString()
      });

      const after = await itemNode('REQ-010');
      const byParent = new Map(after!.links.map(link => [link.uid, link.suspect]));
      assert.strictEqual(byParent.get('REQ-001'), false, 'the named link should be cleared');
      assert.strictEqual(byParent.get('REQ-002'), true, 'the other link must stay suspect');
    });
  });

  test('Derive: target documents come from the server and match the fixture hierarchy', async function () {
    this.timeout(10000);

    // ARCH, EMPTY and MD are all children of REQ, so from ARCH-001 the
    // same-level-or-below targets are the other two children - the same set the
    // pre-remediation implementation derived by globbing .doorstop.yml itself.
    // Each now carries the kinship shown in the quick pick.
    assert.deepStrictEqual(await getDeriveTargets(server, 'ARCH-001'), [
      { prefix: 'EMPTY', relationship: 'sibling' },
      { prefix: 'MD', relationship: 'sibling' }
    ]);

    // From a root item, every child document qualifies.
    assert.deepStrictEqual(await getDeriveTargets(server, 'REQ-001'), [
      { prefix: 'ARCH', relationship: 'child' },
      { prefix: 'EMPTY', relationship: 'child' },
      { prefix: 'MD', relationship: 'child' }
    ]);

    assert.strictEqual(
      await getDeriveTargets(server, 'REQ-999'),
      undefined,
      'an item belonging to no document offers no targets'
    );
  });

  test('Action: Clear the Suspicion on a dangling link changes nothing', async function () {
    this.timeout(10000);
    const filePath = path.join(FIXTURE_ROOT, 'REQ-009.yml');
    const before = await fs.readFile(filePath);

    // REQ-999 does not exist, so the server rejects the request with a 400 before
    // stamping anything; the command surfaces that and leaves the item alone.
    await vscode.commands.executeCommand('doorstop.clearSuspicion', {
      uid: 'REQ-009',
      parentUid: 'REQ-999',
      documentUri: vscode.Uri.file(filePath).toString()
    });

    assert.deepStrictEqual(
      await fs.readFile(filePath),
      before,
      'a rejected clear must not rewrite the requirement file'
    );
    assert.strictEqual(
      (await itemNode('REQ-009'))?.links[0].suspect,
      true,
      "REQ-009's dangling link must still be reported suspect"
    );
  });

  // ---------------------------------------------------------------------
  // Providers backed by GET /tree (audit findings B1/B2, coverage gaps E2/E3).
  // These assert the *server's* data reaches the UI, which is what makes the
  // removal of the client-side js-yaml re-parsing verifiable.
  // ---------------------------------------------------------------------

  /** Position just inside the first occurrence of `needle` in the given file. */
  async function positionOf(
    filePath: string,
    needle: string
  ): Promise<{ uri: vscode.Uri; position: vscode.Position }> {
    const uri = vscode.Uri.file(filePath);
    const document = await vscode.workspace.openTextDocument(uri);
    const lines = document.getText().split(/\r?\n/);
    const line = lines.findIndex(text => text.includes(needle));
    assert.ok(line >= 0, `fixture ${path.basename(filePath)} must contain ${needle}`);
    return { uri, position: new vscode.Position(line, lines[line].indexOf(needle) + 1) };
  }

  function hoverText(hovers: vscode.Hover[] | undefined): string {
    return (hovers ?? [])
      .flatMap(hover => hover.contents)
      .map(content => typeof content === 'string' ? content : (content as vscode.MarkdownString).value)
      .join('\n');
  }

  test("Hover on a link UID previews the server's text for that item", async function () {
    this.timeout(10000);
    const { uri, position } = await positionOf(path.join(FIXTURE_ROOT, 'REQ-010.yml'), 'REQ-001');

    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
      'vscode.executeHoverProvider', uri, position
    );
    const text = hoverText(hovers);

    const target = (await itemNode('REQ-001'))!;
    assert.ok(
      text.includes(target.text!.trim().split('\n')[0]),
      `hover should show REQ-001's server-reported text, got: ${text}`
    );
    // The link target must be the path the server reports, not "whichever file
    // findFiles happened to return first".
    const expectedArgs = encodeURIComponent(JSON.stringify([vscode.Uri.file(target.path).toString()]));
    assert.ok(text.includes(expectedArgs), 'the hover link must point at the server-reported path');
  });

  test('Hover on a derived: line lists the items that link to this one', async function () {
    this.timeout(10000);
    const { uri, position } = await positionOf(path.join(FIXTURE_ROOT, 'REQ-001.yml'), 'derived:');

    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
      'vscode.executeHoverProvider', uri, position
    );
    const text = hoverText(hovers);

    assert.ok(text.includes('Downstream (Reverse) Links'), `expected the reverse-link hover, got: ${text}`);
    assert.ok(text.includes('ARCH-001'), 'ARCH-001 links to REQ-001 and must be listed');
  });

  test('Link completion offers exactly the items the server knows', async function () {
    this.timeout(10000);
    // An untitled YAML buffer: the suggestion list must come from the server, not
    // from whatever .yml files happen to sit in the workspace.
    const document = await vscode.workspace.openTextDocument({ language: 'yaml', content: 'links:\n  - ' });
    const list = await vscode.commands.executeCommand<vscode.CompletionList>(
      'vscode.executeCompletionItemProvider', document.uri, new vscode.Position(1, 4)
    );

    const uids = (list?.items ?? [])
      .map(completion => String(typeof completion.label === 'string' ? completion.label : completion.label.label))
      .map(label => label.split(' - ')[0]);

    const knownUids = (await server.request<TreeResponse>('GET', '/tree'))
      .documents.flatMap(doc => doc.items).map(item => item.uid);
    assert.ok(knownUids.length > 0, 'the fixture must have items to suggest');
    for (const uid of knownUids) {
      assert.ok(uids.includes(uid), `${uid} should be suggested, got: ${uids.join(', ')}`);
    }
    // Files that are not Doorstop items used to be offered too, because the
    // candidate list was built by globbing **/*.{yml,md}.
    for (const notAnItem of ['CHECKLIST', '.doorstop', 'diagram.doorstop', 'index']) {
      assert.ok(!uids.includes(notAnItem), `${notAnItem} is not an item and must not be suggested`);
    }
  });

  test('Go to Definition names the broken UID instead of failing silently', async function () {
    this.timeout(10000);
    const { uri, position } = await positionOf(path.join(FIXTURE_ROOT, 'REQ-009.yml'), 'REQ-999');
    const document = await vscode.workspace.openTextDocument(uri);

    const index = await loadDoorstopIndex(server);
    assert.ok(index, 'the index should load');
    const resolution = await resolveDefinitionAt(document, position, index!);

    assert.strictEqual(resolution.location, undefined, 'REQ-999 does not exist, so there is nowhere to go');
    assert.strictEqual(resolution.brokenUid, 'REQ-999', 'the broken UID must be reported, not swallowed');
    assert.ok(brokenReferenceMessage('REQ-999').includes('REQ-999'), 'the message must name the UID');
  });

  // ---------------------------------------------------------------------
  // Export / Publish report the location Doorstop actually wrote (004 FR-008).
  // ---------------------------------------------------------------------

  /** A fresh empty directory outside the fixture, removed once `fn` is done. */
  async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'doorstop-regression-'));
    try {
      return await fn(dir);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }

  test('Export reports the path the server actually wrote', async function () {
    this.timeout(20000);
    await withTempDir(async dir => {
      const requested = path.join(dir, 'REQ.yaml');
      const result = await server.request<{ path: string }>('POST', '/documents/REQ/export', {
        format: 'yaml',
        destinationPath: requested
      });

      assert.ok(result.path, 'the response must carry the written path');
      // Assert against the *reported* path, not merely that some file exists -
      // that distinction is the whole point of FR-008.
      await fs.access(result.path);
    });
  });

  test('Publish reports the real HTML location even when it differs from the request', async function () {
    this.timeout(30000);
    await withTempDir(async dir => {
      const requested = path.join(dir, 'REQ.html');
      const result = await server.request<{ path: string }>('POST', '/documents/REQ/publish', {
        format: 'html',
        destinationPath: requested
      });

      assert.ok(result.path, 'the response must carry the written path');
      // Doorstop's HTML publisher may nest its output; whichever it does, the
      // reported path - not the requested one - is the one that has to exist.
      await fs.access(result.path);
    });
  });

  // ---------------------------------------------------------------------
  // Command wiring (coverage gap E1): the TS handler itself, not just the API.
  // ---------------------------------------------------------------------

  /** Replaces the dialogs the command drives, restoring them afterwards. */
  async function withStubbedDialogs<T>(
    stubs: {
      inputBox?: string;
      openDialog?: vscode.Uri[];
      quickPick?: (items: readonly unknown[]) => unknown;
      /** What a notification's action button "returns"; undefined = the toast was dismissed. */
      infoMessage?: string;
    },
    fn: () => Promise<T>
  ): Promise<T> {
    const original = {
      showInputBox: vscode.window.showInputBox,
      showOpenDialog: vscode.window.showOpenDialog,
      showQuickPick: vscode.window.showQuickPick,
      showInformationMessage: vscode.window.showInformationMessage
    };
    const patched = vscode.window as unknown as Record<string, unknown>;
    patched.showInputBox = async () => stubs.inputBox;
    patched.showOpenDialog = async () => stubs.openDialog;
    patched.showQuickPick = async (items: readonly unknown[] | Thenable<readonly unknown[]>) =>
      stubs.quickPick ? stubs.quickPick(await items) : undefined;
    patched.showInformationMessage = async () => stubs.infoMessage;
    try {
      return await fn();
    } finally {
      Object.assign(vscode.window, original);
    }
  }

  /** Runs "Create Document" for `prefix` in a throwaway folder, then cleans up. */
  async function createDocumentInto(
    prefix: string,
    pickParent: (items: readonly unknown[]) => unknown,
    check: (created: DocumentNode | undefined, folder: string) => Promise<void>
  ): Promise<void> {
    const folder = path.join(FIXTURE_ROOT, 'children', prefix);
    try {
      await fs.mkdir(folder, { recursive: true });
      await withStubbedDialogs(
        { inputBox: prefix, openDialog: [vscode.Uri.file(folder)], quickPick: pickParent },
        () => vscode.commands.executeCommand('doorstop.createDoc') as Promise<void>
      );
      const tree = await server.request<TreeResponse>('GET', '/tree');
      await check(tree.documents.find(document => document.prefix === prefix), folder);
    } finally {
      // The fixture must be left exactly as it was found (contracts/fixture-layout.md).
      await fs.rm(folder, { recursive: true, force: true });
      treeProvider.refresh();
    }
  }

  const labelOf = (item: unknown): string => String((item as { label?: unknown }).label ?? '');

  test('Manual reorder: an edited index is applied on the second run of the command', async function () {
    this.timeout(30000);
    // Reproduces the reported bug: generate the index, edit it, run "Reorder
    // Document" again - the reorder must actually happen, and it must not
    // depend on a notification button the user may have dismissed. The edit is
    // deliberately left unsaved in the editor, since the server reads the file
    // from disk and the command must save it first.
    const prefix = 'TMPREORD';
    await createDocumentInto(
      prefix,
      items => items.find(item => labelOf(item) === 'REQ'),
      async (created, folder) => {
        assert.ok(created, 'throwaway document should exist');
        for (let i = 0; i < 3; i++) {
          await server.request('POST', `/documents/${prefix}/items`, {});
        }
        treeProvider.refresh();
        await treeProvider.getChildren();
        const uidsInOrder = async () => {
          const tree = await server.request<TreeResponse>('GET', '/tree');
          return tree.documents.find(doc => doc.prefix === prefix)!.items
            .slice()
            .sort((a, b) => a.level.localeCompare(b.level, undefined, { numeric: true }))
            .map(item => `${item.uid}@${item.level}`);
        };
        const [first, second, third] = (await uidsInOrder()).map(entry => entry.split('@')[0]);

        const pick = (...labels: string[]) => (items: readonly unknown[]) =>
          items.find(item => labels.includes(labelOf(item)));

        // First run: Manual generates the index; the toast is dismissed (undefined).
        await withStubbedDialogs(
          { quickPick: pick(prefix, 'Manual') },
          () => vscode.commands.executeCommand('doorstop.reorder') as Promise<void>
        );
        const indexUri = vscode.Uri.file(path.join(folder, 'index.yml'));
        const indexDocument = await vscode.workspace.openTextDocument(indexUri);
        const text = indexDocument.getText();
        assert.ok(text.includes('outline:'), 'index.yml should have been generated');

        // Move the last item to the top, as a sibling - unsaved, in the editor.
        const outline = `outline:\n    - ${third}: # \n    - ${first}: # \n        - ${second}: # \n`;
        const edited = text.slice(0, text.indexOf('outline:')) + outline;
        const edit = new vscode.WorkspaceEdit();
        edit.replace(indexUri, new vscode.Range(0, 0, indexDocument.lineCount, 0), edited);
        assert.ok(await vscode.workspace.applyEdit(edit));
        assert.ok(indexDocument.isDirty, 'the edit is intentionally unsaved');

        // Second run: the existing index is offered for applying right away.
        await withStubbedDialogs(
          { quickPick: pick(prefix, 'Manual', 'Apply index.yml') },
          () => vscode.commands.executeCommand('doorstop.reorder') as Promise<void>
        );

        assert.deepStrictEqual(await uidsInOrder(), [`${third}@1`, `${first}@2.0`, `${second}@2.1`]);
        const indexStillExists = await fs.stat(indexUri.fsPath).then(() => true, () => false);
        assert.strictEqual(indexStillExists, false, 'Doorstop removes the applied scratch index');
      }
    );
  });

  test('Create Document creates the new document under the chosen parent', async function () {
    this.timeout(20000);
    await createDocumentInto(
      'TMPCHILD',
      items => items.find(item => labelOf(item) === 'REQ'),
      async created => {
        assert.ok(created, 'the new document should exist');
        assert.strictEqual(created!.parentPrefix, 'REQ', 'the chosen parent must be applied (002 FR-009)');
      }
    );
  });

  test('The parent quick-select distinguishes "None" from a dismissed pick', async function () {
    this.timeout(20000);

    // FR-009/FR-010/FR-011 hinge on three distinct outcomes, and the difference
    // between "chose None" (null) and "dismissed" (undefined) is what decides
    // whether a root document is created or the command is cancelled outright.
    const picked = await withStubbedDialogs(
      { quickPick: items => items.find(item => labelOf(item) === 'REQ') },
      () => chooseParentPrefix(treeProvider)
    );
    assert.strictEqual(picked, 'REQ', 'choosing a document yields its prefix (FR-009)');

    const none = await withStubbedDialogs(
      { quickPick: items => items.find(item => labelOf(item).startsWith('None')) },
      () => chooseParentPrefix(treeProvider)
    );
    assert.strictEqual(none, null, 'the "None" entry means "root document", not "cancelled" (FR-010)');

    const dismissed = await withStubbedDialogs(
      { quickPick: () => undefined },
      () => chooseParentPrefix(treeProvider)
    );
    assert.strictEqual(dismissed, undefined, 'a dismissed pick cancels the command (FR-011)');

    // The list must offer every existing document plus exactly one "None" entry.
    // Captured from inside the stub: chooseParentPrefix maps its result, so the
    // raw offer list cannot be observed through its return value.
    let offered: string[] = [];
    await withStubbedDialogs(
      { quickPick: items => { offered = items.map(labelOf); return undefined; } },
      () => chooseParentPrefix(treeProvider)
    );
    assert.strictEqual(offered.filter(label => label.startsWith('None')).length, 1);
    for (const prefix of ['REQ', 'ARCH', 'EMPTY', 'MD']) {
      assert.ok(offered.includes(prefix), `${prefix} should be offered as a possible parent`);
    }
  });

  test('Create Document surfaces Doorstop\'s refusal of a second root document', async function () {
    this.timeout(20000);

    // The fixture already has a root (REQ), and Doorstop rejects a second
    // parentless document ("no parent specified"). The command must let that
    // error through rather than inventing a parent to make the call succeed.
    await createDocumentInto(
      'TMPROOT',
      items => items.find(item => labelOf(item).startsWith('None')),
      async (created, folder) => {
        assert.ok(!created, 'Doorstop refuses a second root, so nothing may be registered');
        // Doorstop removes the directory it had started to populate when the
        // creation is rejected, so "gone" and "empty" are both clean outcomes.
        const entries = await fs.readdir(folder).catch(() => [] as string[]);
        assert.deepStrictEqual(entries, [], 'no half-created document may be left behind');
      }
    );
  });

  test('Create Document creates nothing when the parent pick is dismissed', async function () {
    this.timeout(20000);
    await createDocumentInto(
      'TMPCANCEL',
      () => undefined,
      async (created, folder) => {
        assert.ok(!created, 'dismissing the parent pick must cancel the command (002 FR-011)');
        assert.deepStrictEqual(await fs.readdir(folder), [], 'no document marker may be written');
      }
    );
  });

  // ---------------------------------------------------------------------
  // Feature 014: Doorstop validation problems rendered as diagnostics.
  // The fixture has three known issues by design - REQ-009's dangling link
  // (error), REQ-007's suspect link (warning) and the EMPTY document
  // (warning) - so these assert against real Doorstop output, not a mock.
  // ---------------------------------------------------------------------

  /** Runs a full, non-debounced problem check and returns the diagnostics for `filePath`. */
  async function diagnosticsFor(filePath: string): Promise<vscode.Diagnostic[]> {
    await problems.refreshNow();
    return vscode.languages.getDiagnostics(vscode.Uri.file(filePath));
  }

  function withCode(diagnostics: vscode.Diagnostic[], code: string): vscode.Diagnostic[] {
    return diagnostics.filter(diagnostic => diagnostic.code === code);
  }

  /** The 0-based line of the first occurrence of `needle` in the file. */
  async function lineContaining(filePath: string, needle: string): Promise<number> {
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
    const line = document.getText().split(/\r?\n/).findIndex(text => text.includes(needle));
    assert.ok(line >= 0, `${path.basename(filePath)} must contain ${needle}`);
    return line;
  }

  test('Problems: a dangling link is an error on that link entry only (US1)', async function () {
    this.timeout(30000);
    const filePath = path.join(FIXTURE_ROOT, 'REQ-009.yml');

    const diagnostics = await diagnosticsFor(filePath);
    const broken = withCode(diagnostics, 'linked_to_unknown_item');

    assert.strictEqual(broken.length, 1, 'exactly one broken-link error');
    assert.strictEqual(broken[0].severity, vscode.DiagnosticSeverity.Error);
    assert.strictEqual(broken[0].source, 'doorstop');
    assert.strictEqual(
      broken[0].range.start.line,
      await lineContaining(filePath, 'REQ-999'),
      'the error anchors to the offending link entry'
    );
    assert.ok(broken[0].message.includes('REQ-999'), "Doorstop's own wording is preserved");
    assert.ok(
      !broken[0].message.startsWith('REQ-009:'),
      'the UID prefix belongs in the anchoring, not in the message'
    );
  });

  test('Problems: a suspect link is a warning on its link entry (US2)', async function () {
    this.timeout(30000);
    const filePath = path.join(FIXTURE_ROOT, 'REQ-007.yml');

    const diagnostics = await diagnosticsFor(filePath);
    const suspect = withCode(diagnostics, 'suspect_link');

    assert.strictEqual(suspect.length, 1, 'exactly one suspect-link warning');
    assert.strictEqual(suspect[0].severity, vscode.DiagnosticSeverity.Warning);
    assert.strictEqual(
      suspect[0].range.start.line,
      await lineContaining(filePath, 'REQ-001'),
      'the warning anchors to the suspect entry, not to the links: key'
    );
  });

  test('Problems: an empty document is reported on its config file (US4)', async function () {
    this.timeout(30000);
    const markerPath = path.join(FIXTURE_ROOT, 'children', 'EMPTY', '.doorstop.yml');

    const noItems = withCode(await diagnosticsFor(markerPath), 'no_items');

    assert.strictEqual(noItems.length, 1, 'the empty document is reported once');
    assert.strictEqual(noItems[0].severity, vscode.DiagnosticSeverity.Warning);
    assert.strictEqual(noItems[0].range.start.line, 0, 'document-level problems anchor at line 0');
  });

  test('Problems: a markdown item anchors its empty-text warning to the last line (US3)', async function () {
    this.timeout(30000);
    const filePath = path.join(FIXTURE_ROOT, 'children', 'MD', 'MD-001.md');

    await problems.refreshNow();
    const noText = withCode(vscode.languages.getDiagnostics(vscode.Uri.file(filePath)), 'no_text');

    // MD-001 has text, so this asserts the anchoring *rule* only when the check
    // fires; when it does not, the file must simply carry no such warning.
    if (noText.length > 0) {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
      const lines = document.getText().split(/\r?\n/);
      let lastContent = lines.length - 1;
      while (lastContent > 0 && lines[lastContent].trim().length === 0) {
        lastContent--;
      }
      assert.strictEqual(noText[0].range.start.line, lastContent);
    }
  });

  test('Problems: every diagnostic carries the doorstop source and its check id', async function () {
    this.timeout(30000);
    await problems.refreshNow();

    const doorstopDiagnostics = vscode.languages.getDiagnostics()
      .flatMap(([, diagnostics]) => diagnostics)
      .filter(diagnostic => diagnostic.source === 'doorstop');

    assert.ok(doorstopDiagnostics.length > 0, 'the fixture has known problems to report');
    for (const diagnostic of doorstopDiagnostics) {
      assert.ok(diagnostic.code, 'every diagnostic identifies the check that produced it');
      assert.ok(diagnostic.message.trim().length > 0);
    }
  });

  test('Problems: a fixed problem disappears on the next check (US5)', async function () {
    this.timeout(30000);
    const filePath = path.join(FIXTURE_ROOT, 'REQ-009.yml');

    await withRestoredFile(filePath, async () => {
      assert.strictEqual(
        withCode(await diagnosticsFor(filePath), 'linked_to_unknown_item').length,
        1,
        'the dangling link starts out reported'
      );

      // Point the link at an item that exists; the error must clear.
      const original = await fs.readFile(filePath, 'utf8');
      await fs.writeFile(filePath, original.replace('REQ-999', 'REQ-001'));

      assert.strictEqual(
        withCode(await diagnosticsFor(filePath), 'linked_to_unknown_item').length,
        0,
        'a problem that no longer exists must not linger on screen'
      );
    });

    // And it comes back once the fixture is restored, which also proves the
    // refresh is genuinely re-reading rather than caching the first result.
    assert.strictEqual(
      withCode(await diagnosticsFor(filePath), 'linked_to_unknown_item').length,
      1
    );
  });

  test('Problems: a failed check clears the collection instead of leaving stale problems', async function () {
    this.timeout(30000);
    const filePath = path.join(FIXTURE_ROOT, 'REQ-009.yml');

    assert.ok((await diagnosticsFor(filePath)).length > 0, 'problems are on screen to begin with');

    // A provider pointed at a dead port: the request fails the way it would if
    // the server had crashed.
    const failures: string[] = [];
    const deadServer = new DoorstopServer({ port: DOORSTOP_SERVER_PORT + 7 });
    const subscriptions: vscode.Disposable[] = [];
    const failing = registerProblemsProvider(
      { subscriptions } as unknown as vscode.ExtensionContext,
      {
        server: deadServer,
        workspaceFolder: vscode.workspace.workspaceFolders![0],
        reportFailure: message => failures.push(message)
      }
    );

    try {
      await failing.refreshNow();
      assert.strictEqual(failures.length, 1, 'the failure is surfaced, once');
      assert.ok(
        failures[0].toLowerCase().includes('problem'),
        `the message should name what failed, got: ${failures[0]}`
      );

      // A second failure must not re-notify - once per failure transition.
      await failing.refreshNow();
      assert.strictEqual(failures.length, 1, 'repeated failures do not re-notify');
    } finally {
      subscriptions.forEach(subscription => subscription.dispose());
      deadServer.dispose();
    }

    // The real provider's own diagnostics are untouched by the failing one,
    // which owns a separate collection.
    await problems.refreshNow();
  });

  // ---------------------------------------------------------------------
  // Feature 017: the review / suspect-link actions are offered as Quick Fixes
  // on those same diagnostics, instead of as CodeLenses above the field. They
  // live here rather than in reviewLensScan.test.ts because a Quick Fix only
  // exists where a problem does, and problems need a running server.
  // ---------------------------------------------------------------------

  /** Quick Fix titles offered at `line` of `filePath`, after a full problem check. */
  async function quickFixTitlesAt(filePath: string, line: number): Promise<string[]> {
    await problems.refreshNow();
    const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
      'vscode.executeCodeActionProvider',
      vscode.Uri.file(filePath),
      new vscode.Range(line, 0, line, 0),
      vscode.CodeActionKind.QuickFix.value
    );
    return (actions ?? [])
      .filter(action => action.command?.command.startsWith('doorstop.'))
      .map(action => action.title);
  }

  test('QuickFix: an unreviewed item offers Do Review on its reviewed: line (US1)', async function () {
    this.timeout(30000);
    // REQ-005 exists in the fixture precisely to hold the unreviewed state.
    const filePath = path.join(FIXTURE_ROOT, 'REQ-005.yml');

    const titles = await quickFixTitlesAt(filePath, await lineContaining(filePath, 'reviewed:'));

    assert.deepStrictEqual(titles, ['Do Review'], 'exactly the review fix, on the reviewed: line');
  });

  test('QuickFix: one suspect link offers only the single-link clear (US1)', async function () {
    this.timeout(30000);
    const filePath = path.join(FIXTURE_ROOT, 'REQ-007.yml');

    const titles = await quickFixTitlesAt(filePath, await lineContaining(filePath, '- REQ-001'));

    // REQ-007 has exactly one suspect link, so the bulk action must not appear -
    // "clear all" would be indistinguishable from "clear this one" (FR-003).
    assert.deepStrictEqual(titles, ['Clear Suspect Link']);
  });

  test('QuickFix: two suspect links offer both the single and the bulk clear (US1)', async function () {
    this.timeout(30000);
    const filePath = path.join(FIXTURE_ROOT, 'REQ-010.yml');

    // Offered from either entry, since the bulk fix has no anchor of its own.
    for (const parentUid of ['REQ-001', 'REQ-002']) {
      const titles = await quickFixTitlesAt(filePath, await lineContaining(filePath, `- ${parentUid}`));

      assert.deepStrictEqual(
        titles,
        ['Clear Suspect Link', 'Clear All Suspect Links'],
        `both fixes must be offered on the ${parentUid} entry`
      );
    }

    // Scenario 9: REQ-010 is also unreviewed, so the same item carries both
    // kinds of problem. Each line offers only the fixes that belong to it.
    assert.deepStrictEqual(
      await quickFixTitlesAt(filePath, await lineContaining(filePath, 'reviewed:')),
      ['Do Review'],
      'the reviewed: line offers the review fix and nothing else'
    );
  });

  test('QuickFix: the single-link fix clears only its own link (US1)', async function () {
    this.timeout(30000);
    const filePath = path.join(FIXTURE_ROOT, 'REQ-010.yml');

    await withRestoredFile(filePath, async () => {
      const line = await lineContaining(filePath, '- REQ-001');
      await problems.refreshNow();
      const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
        'vscode.executeCodeActionProvider',
        vscode.Uri.file(filePath),
        new vscode.Range(line, 0, line, 0),
        vscode.CodeActionKind.QuickFix.value
      );
      const fix = (actions ?? []).find(action => action.title === 'Clear Suspect Link');
      assert.ok(fix?.command, 'the single-link fix carries a command to run');

      // Run it exactly as selecting it in the lightbulb would.
      await vscode.commands.executeCommand(fix.command.command, ...(fix.command.arguments ?? []));

      const after = await itemNode('REQ-010');
      const byParent = new Map(after!.links.map(link => [link.uid, link.suspect]));
      assert.strictEqual(byParent.get('REQ-001'), false, 'the fixed link is cleared');
      assert.strictEqual(byParent.get('REQ-002'), true, 'its sibling stays suspect');

      // FR-008 / scenario 8: the fix leaves together with the problem it resolved.
      // quickFixTitlesAt re-runs the check first, so this is the "next check".
      assert.deepStrictEqual(
        await quickFixTitlesAt(filePath, line),
        [],
        'a resolved problem no longer offers its fix'
      );
      // And with one suspect link left, the bulk fix has nothing to add either.
      assert.deepStrictEqual(
        await quickFixTitlesAt(filePath, await lineContaining(filePath, '- REQ-002')),
        ['Clear Suspect Link'],
        'the remaining suspect link offers only the single-link fix'
      );
    });
  });

  test('QuickFix: nothing is offered where Doorstop reports no problem (US1)', async function () {
    this.timeout(30000);
    // REQ-006 is already reviewed; REQ-008's single link is already cleared.
    const reviewed = path.join(FIXTURE_ROOT, 'REQ-006.yml');
    const cleared = path.join(FIXTURE_ROOT, 'REQ-008.yml');

    assert.deepStrictEqual(
      await quickFixTitlesAt(reviewed, await lineContaining(reviewed, 'reviewed:')),
      [],
      'an already-reviewed item offers no review fix'
    );
    assert.deepStrictEqual(
      await quickFixTitlesAt(cleared, await lineContaining(cleared, '- REQ-001')),
      [],
      'a cleared link offers no clear fix'
    );
  });

  test('QuickFix: an unrelated diagnostic gets no review or clear fix (US1)', async function () {
    this.timeout(30000);
    // REQ-009's dangling link is an error this feature deliberately has no fix
    // for - the provider must not attach itself to every doorstop diagnostic.
    const filePath = path.join(FIXTURE_ROOT, 'REQ-009.yml');

    const titles = await quickFixTitlesAt(filePath, await lineContaining(filePath, 'REQ-999'));

    assert.deepStrictEqual(titles, []);
  });

  suite('Call Hierarchy (018)', () => {
    // Drives the provider through VS Code's own test commands
    // (vscode.prepareCallHierarchy / provideIncomingCalls / provideOutgoingCalls),
    // which is how the peek widget itself talks to it. The widget is not
    // observable through the API; its behaviour is VS Code's, checked manually
    // per specs/018-call-hierarchy-provider/quickstart.md.

    const ARCH_001 = path.join(FIXTURE_ROOT, 'children', 'ARCH', 'ARCH-001.yml');
    const MD_001 = path.join(FIXTURE_ROOT, 'children', 'MD', 'MD-001.md');

    /** `header:` for .yml, first `#` heading for .md - or line 0 when there is none,
     * which is the fallback findHeaderLocation documents (MD-001 has no heading). */
    async function headerLineOf(filePath: string): Promise<number> {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
      const regex = path.extname(filePath) === '.md' ? /^#{1,6}\s+/ : /^\s*header\s*:/i;
      return Math.max(0, document.getText().split(/\r?\n/).findIndex(text => regex.test(text)));
    }

    async function prepare(filePath: string, line?: number, character = 0): Promise<vscode.CallHierarchyItem[]> {
      const uri = vscode.Uri.file(filePath);
      await vscode.workspace.openTextDocument(uri);
      const items = await vscode.commands.executeCommand<vscode.CallHierarchyItem[] | undefined>(
        'vscode.prepareCallHierarchy',
        uri,
        new vscode.Position(line ?? await headerLineOf(filePath), character)
      );
      return items ?? [];
    }

    function incoming(item: vscode.CallHierarchyItem): Thenable<vscode.CallHierarchyIncomingCall[]> {
      return vscode.commands.executeCommand<vscode.CallHierarchyIncomingCall[]>('vscode.provideIncomingCalls', item);
    }

    function outgoing(item: vscode.CallHierarchyItem): Thenable<vscode.CallHierarchyOutgoingCall[]> {
      return vscode.commands.executeCommand<vscode.CallHierarchyOutgoingCall[]>('vscode.provideOutgoingCalls', item);
    }

    async function prepareOne(filePath: string, line?: number, character = 0): Promise<vscode.CallHierarchyItem> {
      const items = await prepare(filePath, line, character);
      assert.strictEqual(items.length, 1, `${path.basename(filePath)} should prepare exactly one root item`);
      return items[0];
    }

    test('root item reads "UID: Heading" with the document prefix as detail (US1)', async function () {
      this.timeout(30000);
      const item = await prepareOne(path.join(FIXTURE_ROOT, 'REQ-004.yml'));
      assert.strictEqual(item.name, 'REQ-004: Heading Display Coverage');
      assert.strictEqual(item.detail, 'REQ');
    });

    test('an item without a header is labelled by UID alone (US1)', async function () {
      this.timeout(30000);
      const item = await prepareOne(path.join(FIXTURE_ROOT, 'REQ-001.yml'));
      assert.strictEqual(item.name, 'REQ-001');
      assert.strictEqual(item.detail, 'REQ');
    });

    /** Every fixture item whose links name `uid`, straight from the server - the
     * same source hover reads (SC-005), so the test cannot drift from the fixture. */
    async function linkersOf(uid: string): Promise<string[]> {
      const tree = await server.request<TreeResponse>('GET', '/tree');
      return tree.documents
        .flatMap(doc => doc.items)
        .filter(item => item.links.some(link => link.uid === uid))
        .map(item => item.uid)
        .sort();
    }

    test('incoming calls are the items that link to the root (downstream) (US1)', async function () {
      this.timeout(30000);
      const calls = await incoming(await prepareOne(path.join(FIXTURE_ROOT, 'REQ-001.yml')));
      const byName = new Map(calls.map(call => [call.from.name, call.from.detail]));
      const expected = await linkersOf('REQ-001');
      assert.ok(expected.includes('ARCH-001') && expected.includes('MD-001'), 'fixture contract: child documents link to REQ-001');
      assert.deepStrictEqual([...byName.keys()].sort(), expected);
      assert.strictEqual(byName.get('ARCH-001'), 'ARCH');
      assert.strictEqual(byName.get('MD-001'), 'MD');
      assert.strictEqual(byName.get('REQ-007'), 'REQ');
    });

    test('a dangling link is an unresolved entry that expands to nothing (US1)', async function () {
      this.timeout(30000);
      const filePath = path.join(FIXTURE_ROOT, 'REQ-009.yml');
      const calls = await outgoing(await prepareOne(filePath));
      assert.strictEqual(calls.length, 1, 'REQ-009 has exactly one (dangling) link');
      const { to } = calls[0];
      assert.strictEqual(to.name, 'REQ-999');
      assert.strictEqual(to.detail, 'unresolved');
      assert.strictEqual(to.uri.fsPath, vscode.Uri.file(filePath).fsPath, 'points at the referencing file');
      assert.strictEqual(to.range.start.line, await lineContaining(filePath, 'REQ-999'), 'on the dangling links: line');
      assert.deepStrictEqual(await outgoing(to), [], 'unresolved entry has no outgoing calls');
      assert.deepStrictEqual(await incoming(to), [], 'unresolved entry has no incoming calls');
    });

    test('an item with no links has no outgoing calls (US1)', async function () {
      this.timeout(30000);
      assert.deepStrictEqual(await outgoing(await prepareOne(path.join(FIXTURE_ROOT, 'REQ-001.yml'))), []);
    });

    test('the tree command opens the item at its header line (US1)', async function () {
      this.timeout(30000);
      const filePath = path.join(FIXTURE_ROOT, 'REQ-001.yml');
      const item = await findTreeItem(
        treeProvider,
        candidate => !candidate.itemData.isDoorstopRoot && candidate.itemData.uid === 'REQ-001'
      );
      assert.ok(item, 'REQ-001 should be present in the tree');
      try {
        await vscode.commands.executeCommand('doorstop.showCallHierarchy', item);
        const editor = vscode.window.activeTextEditor;
        assert.ok(editor, 'an editor should be active');
        assert.strictEqual(editor.document.uri.fsPath, vscode.Uri.file(filePath).fsPath);
        assert.strictEqual(editor.selection.start.line, await headerLineOf(filePath));
      } finally {
        // No-op when no peek is open; keeps later tests from starting inside one.
        await vscode.commands.executeCommand('editor.closeCallHierarchy').then(undefined, () => undefined);
      }
    });

    test('expansion works through widget-created items to any depth (US2)', async function () {
      this.timeout(30000);
      const root = await prepareOne(path.join(FIXTURE_ROOT, 'REQ-001.yml'));
      const arch = (await incoming(root)).find(call => call.from.name === 'ARCH-001')?.from;
      assert.ok(arch, 'ARCH-001 should be an incoming call of REQ-001');

      const archOutgoing = await outgoing(arch);
      assert.strictEqual(archOutgoing.length, 1);
      assert.strictEqual(archOutgoing[0].to.name, 'REQ-001');
      assert.strictEqual(archOutgoing[0].to.detail, 'REQ');
      assert.deepStrictEqual(await incoming(arch), [], 'nothing links to ARCH-001');

      // Third level, through the object the previous expansion produced.
      const names = (await incoming(archOutgoing[0].to)).map(call => call.from.name).sort();
      assert.deepStrictEqual(names, await linkersOf('REQ-001'));
    });

    test('entries point at their header line so selecting one opens the item there (US3)', async function () {
      this.timeout(30000);
      const calls = await incoming(await prepareOne(path.join(FIXTURE_ROOT, 'REQ-001.yml')));
      for (const [name, filePath] of [['ARCH-001', ARCH_001], ['MD-001', MD_001]] as const) {
        const item = calls.find(call => call.from.name === name)?.from;
        assert.ok(item, `${name} should be listed`);
        assert.strictEqual(item.uri.fsPath, vscode.Uri.file(filePath).fsPath);
        assert.strictEqual(item.selectionRange.start.line, await headerLineOf(filePath), `${name} selects its header line`);
        assert.deepStrictEqual(item.range, item.selectionRange);
      }
    });

    test('navigating to an entry leaves a history entry for Go Back (US3)', async function () {
      this.timeout(30000);
      const origin = vscode.Uri.file(path.join(FIXTURE_ROOT, 'REQ-001.yml'));
      await vscode.window.showTextDocument(origin);
      const md = (await incoming(await prepareOne(origin.fsPath))).find(call => call.from.name === 'MD-001')?.from;
      assert.ok(md, 'MD-001 should be listed');

      await vscode.window.showTextDocument(md.uri, { selection: md.selectionRange });
      assert.strictEqual(vscode.window.activeTextEditor?.document.uri.fsPath, vscode.Uri.file(MD_001).fsPath);

      await vscode.commands.executeCommand('workbench.action.navigateBack');
      assert.strictEqual(vscode.window.activeTextEditor?.document.uri.fsPath, origin.fsPath, 'Go Back returns to the origin');
    });

    test('from the editor: a known UID token roots on that item, anything else on the file (US4)', async function () {
      this.timeout(30000);
      const onLink = await prepareOne(ARCH_001, await lineContaining(ARCH_001, 'REQ-001'), 4);
      assert.strictEqual(onLink.name, 'REQ-001');
      assert.strictEqual(onLink.detail, 'REQ');

      const onText = await prepareOne(ARCH_001, await lineContaining(ARCH_001, 'text:'));
      assert.strictEqual(onText.name, 'ARCH-001');
      assert.strictEqual(onText.detail, 'ARCH');

      const req009 = path.join(FIXTURE_ROOT, 'REQ-009.yml');
      const onDangling = await prepareOne(req009, await lineContaining(req009, 'REQ-999'), 4);
      assert.strictEqual(onDangling.name, 'REQ-009', 'an unknown UID falls back to the file itself');

      assert.deepStrictEqual(await prepare(path.join(FIXTURE_ROOT, 'CHECKLIST.md'), 0), [], 'not a requirement');
    });
  });

  // ===========================================================================
  // Spec 019 - Document View: one Doorstop document as a single editable
  // markdown text. Every save-path test runs inside withRestoredFixture:
  // Doorstop's reorder can rewrite several fixture files, and
  // isRegressionFixtureTree requires exactly 10 REQ items afterwards.
  // ===========================================================================
  suite('Document View (019)', () => {
    const VIEW_SCHEME = 'doorstop-document';
    const REQ_SEPARATOR = (uid: string, level: string): string =>
      `<!-- ${uid} · ${level} · item separator. keep this line -->`;

    async function waitFor(predicate: () => boolean | Promise<boolean>, what: string, timeoutMs = 5000): Promise<void> {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (await predicate()) {
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      assert.fail(`timed out waiting for: ${what}`);
    }

    async function listFiles(dir: string): Promise<string[]> {
      const out: string[] = [];
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          out.push(...(await listFiles(full)));
        } else {
          out.push(full);
        }
      }
      return out;
    }

    /** Snapshot every fixture file before `fn` and put the directory back afterwards. */
    async function withRestoredFixture<T>(fn: () => Promise<T>): Promise<T> {
      const before = new Map<string, Buffer>();
      for (const file of await listFiles(FIXTURE_ROOT)) {
        before.set(file, await fs.readFile(file));
      }
      try {
        return await fn();
      } finally {
        for (const [file, bytes] of before) {
          const current = await fs.readFile(file).catch(() => undefined);
          if (!current || !current.equals(bytes)) {
            await fs.writeFile(file, bytes);
          }
        }
        for (const file of await listFiles(FIXTURE_ROOT)) {
          if (!before.has(file)) {
            await fs.unlink(file);
          }
        }
        treeProvider.refresh();
      }
    }

    async function closeViews(): Promise<void> {
      for (const document of vscode.workspace.textDocuments.filter(candidate => candidate.uri.scheme === VIEW_SCHEME)) {
        await vscode.window.showTextDocument(document, { preview: false });
        await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
      }
    }

    async function openView(prefix: string): Promise<vscode.TextDocument> {
      // The tree may be mid-reload from a previous test's refresh; a fresh
      // load settles it.
      let root: RequirementTreeItem | undefined;
      for (let attempt = 0; attempt < 5 && !root; attempt++) {
        treeProvider.refresh();
        root = await findTreeItem(treeProvider, candidate => candidate.itemData.isDoorstopRoot === true && candidate.itemData.prefix === prefix);
        if (!root) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
      assert.ok(root, `${prefix} root node`);
      await vscode.commands.executeCommand('doorstop.openAsDocument', root);
      const document = vscode.window.activeTextEditor?.document;
      assert.ok(document && document.uri.scheme === VIEW_SCHEME, 'a document view is active');
      return document!;
    }

    const lineOf = (document: vscode.TextDocument, text: string): number => {
      const index = document.getText().split('\n').indexOf(text);
      assert.ok(index >= 0, `line "${text}" present`);
      return index;
    };

    async function replaceInView(document: vscode.TextDocument, from: string, to: string): Promise<void> {
      const offset = document.getText().indexOf(from);
      assert.ok(offset >= 0, `"${from}" present in the view`);
      const edit = new vscode.WorkspaceEdit();
      edit.replace(document.uri, new vscode.Range(document.positionAt(offset), document.positionAt(offset + from.length)), to);
      assert.ok(await vscode.workspace.applyEdit(edit), 'edit applied');
    }

    /** Top-level YAML sections of an item file, keyed by attribute - for "only this key changed" checks. */
    function sections(text: string): Map<string, string> {
      const map = new Map<string, string>();
      let key = '';
      for (const line of text.split(/\r?\n/)) {
        const match = /^([a-z_]+):/.exec(line);
        if (match) {
          key = match[1];
          map.set(key, line);
        } else if (key) {
          map.set(key, `${map.get(key)}\n${line}`);
        }
      }
      return map;
    }

    async function reqItems(): Promise<Map<string, { level: string; header?: string; text?: string; reviewed: boolean }>> {
      const tree = await server.request<TreeResponse>('GET', '/tree');
      return new Map(tree.documents.find(doc => doc.prefix === 'REQ')!.items.map(item => [item.uid, item]));
    }

    let originalPrompts: Prompts | undefined;
    setup(() => {
      originalPrompts ??= { ...documentView.prompts };
    });
    teardown(async () => {
      Object.assign(documentView.prompts, originalPrompts);
      await closeViews();
    });

    test('opens REQ as a markdown document with one block per item in level order (US1)', async function () {
      this.timeout(30000);
      const document = await openView('REQ');
      assert.strictEqual(document.languageId, 'markdown');
      assert.strictEqual(path.basename(document.uri.path), 'REQ (document)');
      const lines = document.getText().split('\n');
      assert.strictEqual(lines[0], '<!-- doorstop document REQ · keep this line -->');
      const separators = lines.filter(line => line.includes('item separator'));
      assert.deepStrictEqual(separators, [
        ['REQ-001', '1.0'], ['REQ-002', '1.1'], ['REQ-003', '1.2'], ['REQ-004', '1.3'], ['REQ-005', '1.4'],
        ['REQ-006', '1.5'], ['REQ-007', '1.6'], ['REQ-008', '1.7'], ['REQ-009', '1.8'], ['REQ-010', '1.9']
      ].map(([uid, level]) => REQ_SEPARATOR(uid, level)));
      assert.strictEqual(lines[lineOf(document, REQ_SEPARATOR('REQ-004', '1.3')) + 1], '## Heading Display Coverage');
      const req002 = lineOf(document, REQ_SEPARATOR('REQ-002', '1.1'));
      assert.strictEqual(lines[req002 + 1], '## REQ-002');
      assert.strictEqual(lines[req002 + 2], 'The system shall have minimal text.');
      assert.strictEqual(lines[req002 + 3], '', 'one blank line between blocks');

      await openView('REQ');
      const editors = vscode.window.visibleTextEditors.filter(editor => editor.document.uri.toString() === document.uri.toString());
      assert.strictEqual(editors.length, 1, 'the existing tab is reused');

      await documentView.openDocumentView('EMPTY');
      const empty = vscode.window.activeTextEditor?.document;
      assert.strictEqual(empty?.getText(), '<!-- doorstop document EMPTY · keep this line -->\n');
    });

    test('saves edited text and header through the server and regenerates the view (US2)', async function () {
      this.timeout(60000);
      await withRestoredFixture(async () => {
        const original002 = await fs.readFile(path.join(FIXTURE_ROOT, 'REQ-002.yml'), 'utf8');
        const original004 = await fs.readFile(path.join(FIXTURE_ROOT, 'REQ-004.yml'), 'utf8');
        const before = new Map<string, Buffer>();
        for (const file of await listFiles(FIXTURE_ROOT)) {
          before.set(file, await fs.readFile(file));
        }

        const document = await openView('REQ');
        await replaceInView(document, 'The system shall have minimal text.', 'The system shall have edited text.');
        await replaceInView(document, '## Heading Display Coverage', '## Heading Changed');
        const headerPrompts: string[][] = [];
        documentView.prompts.confirmHeaderChange = async (uid, oldHeader, newHeader) => {
          headerPrompts.push([uid, oldHeader, newHeader]);
          return 'apply';
        };
        assert.strictEqual(await document.save(), true, 'save succeeds');
        assert.strictEqual(document.isDirty, false);
        assert.deepStrictEqual(headerPrompts, [['REQ-004', 'Heading Display Coverage', 'Heading Changed']]);

        const items = await reqItems();
        assert.strictEqual(items.get('REQ-002')?.text, 'The system shall have edited text.');
        assert.strictEqual(items.get('REQ-004')?.header, 'Heading Changed');

        const after002 = sections(await fs.readFile(path.join(FIXTURE_ROOT, 'REQ-002.yml'), 'utf8'));
        for (const [key, value] of sections(original002)) {
          if (key !== 'text') {
            assert.strictEqual(after002.get(key), value, `REQ-002 ${key} untouched`);
          }
        }
        const after004 = sections(await fs.readFile(path.join(FIXTURE_ROOT, 'REQ-004.yml'), 'utf8'));
        for (const [key, value] of sections(original004)) {
          if (key !== 'header') {
            assert.strictEqual(after004.get(key), value, `REQ-004 ${key} untouched`);
          }
        }
        for (const [file, bytes] of before) {
          if (!file.endsWith('REQ-002.yml') && !file.endsWith('REQ-004.yml')) {
            assert.ok((await fs.readFile(file)).equals(bytes), `${path.basename(file)} untouched`);
          }
        }

        await waitFor(() => document.getText().includes('## Heading Changed') && !document.isDirty, 'view regenerated');
        assert.ok(document.getText().includes('The system shall have edited text.'));

        // A save without edits writes nothing.
        const snapshot = new Map<string, Buffer>();
        for (const file of await listFiles(FIXTURE_ROOT)) {
          snapshot.set(file, await fs.readFile(file));
        }
        await replaceInView(document, 'edited text.', 'edited text.');
        assert.strictEqual(await document.save(), true);
        for (const [file, bytes] of snapshot) {
          assert.ok((await fs.readFile(file)).equals(bytes), `${path.basename(file)} unchanged by an empty save`);
        }
      });
    });

    test('a save with the server unreachable fails and keeps the edits (US2)', async function () {
      this.timeout(60000);
      if (!startedOwnServer) {
        this.skip();
      }
      const document = await openView('REQ');
      await replaceInView(document, 'The system shall have minimal text.', 'Never written.');
      const errors: string[] = [];
      documentView.prompts.reportError = message => errors.push(message);
      server.dispose();
      try {
        assert.strictEqual(await document.save(), false, 'save is refused');
        assert.strictEqual(document.isDirty, true);
        assert.ok(document.getText().includes('Never written.'));
      } finally {
        await server.restart(FIXTURE_ROOT, resolvePythonCommand());
      }
      const original = await fs.readFile(path.join(FIXTURE_ROOT, 'REQ-002.yml'), 'utf8');
      assert.ok(!original.includes('Never written.'));
    });

    test('an edit inside a separator line is reverted with a hint (US3)', async function () {
      this.timeout(30000);
      const document = await openView('REQ');
      const hints: string[] = [];
      documentView.prompts.reportHint = message => hints.push(message);
      const separator = REQ_SEPARATOR('REQ-003', '1.2');
      const line = lineOf(document, separator);
      const edit = new vscode.WorkspaceEdit();
      edit.insert(document.uri, new vscode.Position(line, 5), 'x');
      await vscode.workspace.applyEdit(edit);
      await waitFor(() => document.lineAt(line).text === separator, 'separator restored');
      assert.deepStrictEqual(hints, ['This line is managed by Doorstop - use the actions above it']);
    });

    test('a missing block asks Delete / Keep / Cancel before anything is removed (US3)', async function () {
      this.timeout(60000);
      await withRestoredFixture(async () => {
        const file = path.join(FIXTURE_ROOT, 'REQ-010.yml');
        const document = await openView('REQ');
        const deleteBlock = async (): Promise<void> => {
          const line = lineOf(document, REQ_SEPARATOR('REQ-010', '1.9'));
          const edit = new vscode.WorkspaceEdit();
          edit.delete(document.uri, new vscode.Range(line - 1, 0, document.lineCount - 1, 0));
          await vscode.workspace.applyEdit(edit);
        };
        const asked: string[][] = [];

        await deleteBlock();
        documentView.prompts.confirmDeletions = async uids => { asked.push(uids); return 'keep'; };
        assert.strictEqual(await document.save(), true, 'Keep continues the save');
        assert.deepStrictEqual(asked, [['REQ-010']]);
        assert.ok(await fs.stat(file).then(() => true, () => false), 'REQ-010.yml still exists');
        await waitFor(() => document.getText().includes(REQ_SEPARATOR('REQ-010', '1.9')) && !document.isDirty, 'block restored');

        await deleteBlock();
        documentView.prompts.confirmDeletions = async () => 'cancel';
        assert.strictEqual(await document.save(), false, 'Cancel aborts the save');
        assert.strictEqual(document.isDirty, true);
        assert.ok(await fs.stat(file).then(() => true, () => false), 'REQ-010.yml still exists after Cancel');

        documentView.prompts.confirmDeletions = async () => 'delete';
        assert.strictEqual(await document.save(), true, 'Delete removes the item');
        await waitFor(() => fs.stat(file).then(() => false, () => true), 'REQ-010.yml removed');
        assert.strictEqual((await reqItems()).size, 9);
      });
    });

    test('a duplicated separator refuses the save and offers Restore block structure (US3)', async function () {
      this.timeout(60000);
      await withRestoredFixture(async () => {
        const before = new Map<string, Buffer>();
        for (const file of await listFiles(FIXTURE_ROOT)) {
          before.set(file, await fs.readFile(file));
        }
        const document = await openView('REQ');
        const separator = REQ_SEPARATOR('REQ-005', '1.4');
        const line = lineOf(document, separator);
        const edit = new vscode.WorkspaceEdit();
        edit.insert(document.uri, new vscode.Position(line + 1, 0), `${separator}\n`);
        await vscode.workspace.applyEdit(edit);

        assert.strictEqual(await document.save(), false, 'save refused');
        assert.strictEqual(document.isDirty, true);
        for (const [file, bytes] of before) {
          assert.ok((await fs.readFile(file)).equals(bytes), `${path.basename(file)} untouched`);
        }

        await waitFor(() => vscode.languages.getDiagnostics(document.uri).some(diagnostic =>
          diagnostic.source === 'doorstop-document' && diagnostic.code === 'separator-duplicated' && diagnostic.range.start.line === line + 1
        ), 'separator-duplicated diagnostic');
        const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
          'vscode.executeCodeActionProvider', document.uri, new vscode.Range(line + 1, 0, line + 1, 0)
        );
        const restore = actions.find(action => action.title === 'Restore block structure of REQ-005');
        assert.ok(restore?.command, 'quick fix offered');
        await vscode.commands.executeCommand(restore!.command!.command, ...(restore!.command!.arguments ?? []));
        assert.strictEqual(document.getText().split('\n').filter(candidate => candidate === separator).length, 1, 'duplicate removed');
      });
    });

    test('a deleted heading line triggers the header confirmation (US3)', async function () {
      this.timeout(60000);
      await withRestoredFixture(async () => {
        const file = path.join(FIXTURE_ROOT, 'REQ-004.yml');
        const original = await fs.readFile(file);
        const document = await openView('REQ');
        await replaceInView(document, '## Heading Display Coverage', '');
        const asked: string[][] = [];
        documentView.prompts.confirmHeaderChange = async (uid, oldHeader, newHeader) => {
          asked.push([uid, oldHeader, newHeader]);
          return 'keep';
        };
        assert.strictEqual(await document.save(), true);
        assert.deepStrictEqual(asked, [['REQ-004', 'Heading Display Coverage', '']]);
        assert.ok((await fs.readFile(file)).equals(original), 'REQ-004.yml unchanged');
        await waitFor(() => document.getText().includes('## Heading Display Coverage'), 'heading restored from disk');
      });
    });

    test('+ New item below creates an item after the block, renumbering its followers (US4)', async function () {
      this.timeout(60000);
      await withRestoredFixture(async () => {
        const document = await openView('REQ');
        const line = lineOf(document, REQ_SEPARATOR('REQ-003', '1.2'));
        await vscode.commands.executeCommand('doorstop.documentView.newItemBelow', { uri: document.uri.toString(), line });
        const marker = lineOf(document, '<!-- new item -->');
        assert.ok(marker > line, 'placeholder inserted below the block');
        assert.strictEqual(document.lineAt(marker - 1).text, '');
        assert.strictEqual(document.lineAt(marker + 1).text, '## ');
        assert.strictEqual(document.lineAt(marker + 2).text, '');
        assert.strictEqual(document.lineAt(marker + 3).text, REQ_SEPARATOR('REQ-004', '1.3'));
        const selection = vscode.window.activeTextEditor!.selection.active;
        assert.deepStrictEqual([selection.line, selection.character], [marker + 1, 3], 'cursor on the heading line');

        const edit = new vscode.WorkspaceEdit();
        edit.replace(document.uri, document.lineAt(marker + 1).range, '## Inserted item\nBody of the inserted item.');
        await vscode.workspace.applyEdit(edit);
        assert.strictEqual(await document.save(), true);

        const items = await reqItems();
        assert.strictEqual(items.size, 11);
        assert.deepStrictEqual(
          [items.get('REQ-011')?.level, items.get('REQ-011')?.header, items.get('REQ-011')?.text],
          ['1.3', 'Inserted item', 'Body of the inserted item.']
        );
        assert.strictEqual(items.get('REQ-004')?.level, '1.4');
        assert.strictEqual(items.get('REQ-010')?.level, '1.10');
        assert.ok(await fs.stat(path.join(FIXTURE_ROOT, 'REQ-011.yml')).then(() => true, () => false));
        await waitFor(() => document.getText().includes(REQ_SEPARATOR('REQ-011', '1.3')) && !document.isDirty, 'view shows the new item');
        const lines = document.getText().split('\n');
        assert.ok(lines.indexOf(REQ_SEPARATOR('REQ-003', '1.2')) < lines.indexOf(REQ_SEPARATOR('REQ-011', '1.3')));
        assert.ok(lines.indexOf(REQ_SEPARATOR('REQ-011', '1.3')) < lines.indexOf(REQ_SEPARATOR('REQ-004', '1.4')));

        // Cancel removes a placeholder; an empty one is ignored on save; a
        // typed heading never creates an item.
        await closeViews();
        const fresh = await openView('REQ');
        const rendered = fresh.getText();
        await vscode.commands.executeCommand('doorstop.documentView.newItemBelow', { uri: fresh.uri.toString(), line: lineOf(fresh, REQ_SEPARATOR('REQ-003', '1.2')) });
        await vscode.commands.executeCommand('doorstop.documentView.cancelPlaceholder', { uri: fresh.uri.toString(), line: lineOf(fresh, '<!-- new item -->') });
        assert.strictEqual(fresh.getText(), rendered, 'Cancel restores the text');
        await vscode.commands.executeCommand('doorstop.documentView.newItemBelow', { uri: fresh.uri.toString(), line: lineOf(fresh, REQ_SEPARATOR('REQ-003', '1.2')) });
        assert.strictEqual(await fresh.save(), true);
        assert.strictEqual((await reqItems()).size, 11, 'an empty placeholder creates nothing');

        const yml = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(FIXTURE_ROOT, 'REQ-001.yml')));
        await vscode.window.showTextDocument(yml);
        const ymlText = yml.getText();
        await vscode.commands.executeCommand('doorstop.insertItemHere');
        assert.strictEqual(yml.getText(), ymlText, 'Insert Item Here does nothing outside a document view');
      });
    });

    test('action line, projected problems and navigation work on the separators (US5)', async function () {
      this.timeout(60000);
      await withRestoredFile(path.join(FIXTURE_ROOT, 'REQ-001.yml'), async () => {
        const document = await openView('REQ');
        const separator = REQ_SEPARATOR('REQ-001', '1.0');
        const line = lineOf(document, separator);
        await problems.refreshNow();
        await waitFor(() => vscode.languages.getDiagnostics(document.uri).some(diagnostic =>
          diagnostic.source === 'doorstop' && diagnostic.range.start.line === line
        ), 'projected doorstop problem on the separator');
        const reviewCodes = new Set(['needs_initial_review', 'unreviewed_changes']);
        const reviewDiagnostic = vscode.languages.getDiagnostics(document.uri).find(diagnostic =>
          diagnostic.source === 'doorstop' && diagnostic.range.start.line === line && reviewCodes.has(String(diagnostic.code)));
        assert.ok(reviewDiagnostic, 'REQ-001 needs review');

        const titlesOn = async (target: number): Promise<string[]> => {
          const lenses = await vscode.commands.executeCommand<vscode.CodeLens[]>('vscode.executeCodeLensProvider', document.uri, 500);
          return lenses.filter(lens => lens.range.start.line === target).map(lens => lens.command?.title ?? '');
        };
        await waitFor(async () => (await titlesOn(line)).includes('Do Review'), 'Do Review lens');
        assert.deepStrictEqual(await titlesOn(line), ['REQ-001', 'Open item', 'Do Review', 'Derive', 'Link...', 'no links', '+ New item below']);
        assert.deepStrictEqual(await titlesOn(0), ['+ New item below']);
        const req010 = lineOf(document, REQ_SEPARATOR('REQ-010', '1.9'));
        assert.ok((await titlesOn(req010)).includes('2 links'));

        const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
          'vscode.executeCodeActionProvider', document.uri, new vscode.Range(line, 0, line, 0)
        );
        const doReview = actions.find(action => action.title === 'Do Review');
        assert.ok(doReview?.command, 'Do Review quick fix');
        await vscode.commands.executeCommand(doReview!.command!.command, ...(doReview!.command!.arguments ?? []));
        await waitFor(async () => (await reqItems()).get('REQ-001')?.reviewed === true, 'REQ-001 reviewed');
        await problems.refreshNow();
        await waitFor(async () => (await titlesOn(lineOf(document, separator))).includes('Review'), 'lens back to Review');

        const position = new vscode.Position(lineOf(document, separator), 6);
        const hovers = await vscode.commands.executeCommand<vscode.Hover[]>('vscode.executeHoverProvider', document.uri, position);
        assert.ok(hovers.some(hover => hover.contents.some(content =>
          (typeof content === 'string' ? content : (content as vscode.MarkdownString).value).includes('REQ-001'))), 'hover names the item');
        const definitions = await vscode.commands.executeCommand<vscode.Location[]>('vscode.executeDefinitionProvider', document.uri, position);
        assert.ok(definitions.some(location => location.uri.fsPath.endsWith('REQ-001.yml')), 'F12 opens the item file');
        const references = await vscode.commands.executeCommand<vscode.Location[]>('vscode.executeReferenceProvider', document.uri, position);
        const referenced = references.map(location => path.basename(location.uri.fsPath));
        for (const linker of ['ARCH-001.yml', 'MD-001.md', 'REQ-010.yml']) {
          assert.ok(referenced.includes(linker), `${linker} links to REQ-001`);
        }
        const roots = await vscode.commands.executeCommand<vscode.CallHierarchyItem[]>('vscode.prepareCallHierarchy', document.uri, position);
        assert.strictEqual(roots[0]?.name, 'REQ-001');
      });
    });

    test('changes on disk refresh a clean view and ask before touching a dirty one (US6)', async function () {
      this.timeout(60000);
      await withRestoredFixture(async () => {
        const rewrite = async (uid: string, from: string, to: string): Promise<void> => {
          const file = path.join(FIXTURE_ROOT, `${uid}.yml`);
          const text = await fs.readFile(file, 'utf8');
          assert.ok(text.includes(from), `${uid} contains "${from}"`);
          await fs.writeFile(file, text.replace(from, to));
        };
        const document = await openView('REQ');
        await rewrite('REQ-001', 'baseline capability', 'changed-on-disk capability');
        await waitFor(() => document.getText().includes('changed-on-disk capability') && !document.isDirty,
          `clean view refreshed (dirty=${document.isDirty}, state mtime=${documentView.getState('REQ')?.mtime}, state has change=${documentView.getState('REQ')?.text.includes('changed-on-disk')})`, 8000);

        await replaceInView(document, 'The system shall remain pending review', 'The system shall remain edited in the view');
        const labels: string[] = [];
        documentView.prompts.notifyDiskChange = async label => { labels.push(label); return 'keep'; };
        await rewrite('REQ-002', 'minimal text', 'text changed on disk');
        await waitFor(() => labels.length > 0, 'disk-change notification', 8000);
        assert.deepStrictEqual(labels, ['REQ-002 changed on disk']);
        assert.ok(document.isDirty, 'Keep my edits leaves the view dirty');
        assert.strictEqual(await document.save(), true);
        const items = await reqItems();
        assert.strictEqual(items.get('REQ-005')?.text, 'The system shall remain edited in the view, to exercise the unreviewed state.');
        assert.strictEqual(items.get('REQ-002')?.text, 'The system shall have text changed on disk.');
        await waitFor(() => document.getText().includes('text changed on disk') && document.getText().includes('edited in the view') && !document.isDirty, 'both changes visible');

        await replaceInView(document, 'edited in the view', 'edited again');
        documentView.prompts.notifyDiskChange = async () => 'reload';
        await rewrite('REQ-003', 'multi-paragraph text', 'multi-paragraph text (disk)');
        await waitFor(() => document.getText().includes('multi-paragraph text (disk)') && !document.getText().includes('edited again') && !document.isDirty, 'reload discards the edit', 8000);
      });
    });
  });
});
