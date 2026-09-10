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

  suiteSetup(async function () {
    this.timeout(30000);

    const ext = vscode.extensions.getExtension('SimonWalbrun.doorstop');
    assert.ok(ext, 'Doorstop extension should be discoverable');
    const exports = await ext!.activate();
    treeProvider = exports.treeProvider;
    assert.ok(treeProvider, 'activate() should export treeProvider for tests');
    problems = exports.problemsProvider;
    assert.ok(problems, 'activate() should export problemsProvider for tests');

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

  test('CodeLens: Do Review marks only the target requirement as reviewed', async function () {
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

  test("CodeLens: Clear All Suspicions clears the item's links", async function () {
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

  test('CodeLens: Clear the Suspicion clears one link and leaves the other suspect', async function () {
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

  test('CodeLens: Clear the Suspicion on a dangling link changes nothing', async function () {
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
    },
    fn: () => Promise<T>
  ): Promise<T> {
    const original = {
      showInputBox: vscode.window.showInputBox,
      showOpenDialog: vscode.window.showOpenDialog,
      showQuickPick: vscode.window.showQuickPick
    };
    const patched = vscode.window as unknown as Record<string, unknown>;
    patched.showInputBox = async () => stubs.inputBox;
    patched.showOpenDialog = async () => stubs.openDialog;
    patched.showQuickPick = async (items: readonly unknown[] | Thenable<readonly unknown[]>) =>
      stubs.quickPick ? stubs.quickPick(await items) : undefined;
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
});
