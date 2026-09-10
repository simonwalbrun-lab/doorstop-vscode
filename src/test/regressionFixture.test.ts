import * as assert from 'assert';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

import * as vscode from 'vscode';

import { getDeriveTargetPrefixes } from '../deriveProvider';
import { DoorstopServer, DOORSTOP_SERVER_HOST, DOORSTOP_SERVER_PORT } from '../doorstopServer';
import { TreeResponse } from '../doorstopTypes';
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

  suiteSetup(async function () {
    this.timeout(30000);

    const ext = vscode.extensions.getExtension('SimonWalbrun.doorstop');
    assert.ok(ext, 'Doorstop extension should be discoverable');
    const exports = await ext!.activate();
    treeProvider = exports.treeProvider;
    assert.ok(treeProvider, 'activate() should export treeProvider for tests');

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
    assert.deepStrictEqual(await getDeriveTargetPrefixes(server, 'ARCH-001'), ['EMPTY', 'MD']);

    // From a root item, every child document qualifies.
    assert.deepStrictEqual(
      await getDeriveTargetPrefixes(server, 'REQ-001'),
      ['ARCH', 'EMPTY', 'MD']
    );

    assert.strictEqual(
      await getDeriveTargetPrefixes(server, 'REQ-999'),
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
});
