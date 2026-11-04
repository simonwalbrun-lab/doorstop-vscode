import * as assert from 'assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { DoorstopServer } from '../doorstopServer';
import { TreeResponse } from '../doorstopTypes';
import { DoorstopTreeProvider } from '../requirementTree';

// The button is purely declarative (contributes.menus), so the manifest is what is asserted,
// in the style of packageMenus.test.ts.

const REPO_ROOT = path.resolve(__dirname, '..', '..');

interface MenuEntry {
  command: string;
  when?: string;
  group?: string;
}

const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
const TOGGLES = ['doorstop.skipDocument', 'doorstop.enableDocument'];

function locations(command: string): [string, MenuEntry][] {
  return Object.entries(manifest.contributes.menus as Record<string, MenuEntry[]>)
    .flatMap(([menu, entries]) => entries.filter(entry => entry.command === command).map(entry => [menu, entry] as [string, MenuEntry]));
}

suite('Toggle Document Skip (031)', () => {
  // Spec 031 FR-001
  test('each toggle is an inline tree view button and appears nowhere else', () => {
    for (const command of TOGGLES) {
      const placed = locations(command).filter(([menu]) => menu !== 'commandPalette');
      assert.strictEqual(placed.length, 1, `${command} has exactly one placement`);
      const [menu, entry] = placed[0];
      assert.strictEqual(menu, 'view/item/context');
      assert.ok(entry.group?.startsWith('inline'), `${command} is an inline button`);
      assert.ok(entry.when?.startsWith('view == doorstop.treeView'), `${command} is limited to the tree view`);
      const palette = locations(command).find(([menu]) => menu === 'commandPalette');
      assert.strictEqual(palette?.[1].when, 'false', `${command} is hidden from the command palette`);
    }
  });

  // Spec 031 FR-001, FR-004
  test('disable shows on enabled documents, enable on disabled ones, with distinct icons', () => {
    assert.ok(locations('doorstop.skipDocument')[0][1].when?.endsWith('viewItem == doorstop.root'));
    assert.ok(locations('doorstop.enableDocument')[0][1].when?.endsWith('viewItem == doorstop.root.skipped'));
    const commands: { command: string; icon: string; title: string }[] = manifest.contributes.commands;
    const [skip, enable] = TOGGLES.map(id => commands.find(c => c.command === id)!);
    assert.notStrictEqual(skip.icon, enable.icon);
    assert.notStrictEqual(skip.title, enable.title);
  });

  // Spec 031 FR-004, FR-006, FR-007
  test('a document moves between enabled and disabled rows as the server reports it', async () => {
    const marker = path.join(REPO_ROOT, 'reqs', 'REQ', '.doorstop.yml');
    const document = { prefix: 'REQ', markerPath: marker, items: [] };
    let response: TreeResponse = { documents: [], skippedDocuments: [{ prefix: 'REQ', markerPath: marker }] };
    const tree = new DoorstopTreeProvider({ port: 1, request: async () => response } as unknown as DoorstopServer);

    const [disabled] = await tree.getChildren();
    assert.strictEqual(disabled.contextValue, 'doorstop.root.skipped');
    assert.ok(!disabled.itemData.isDoorstopRoot, 'a disabled row is not a document root, so pickers never offer it');
    assert.ok(String(disabled.description).includes('disabled'));

    response = { documents: [document], skippedDocuments: [] };
    tree.refresh();
    const [enabled] = await tree.getChildren();
    assert.strictEqual(enabled.contextValue, 'doorstop.root');
    assert.strictEqual(enabled.itemData.isDoorstopRoot, true);
  });

  // Bug tree-fetch-error-at-startup: activation no longer waits for the server.
  test('a tree asked before the server runs stays empty without a request, then loads after refresh', async () => {
    const marker = path.join(REPO_ROOT, 'reqs', 'REQ', '.doorstop.yml');
    const server = {
      port: 0,
      requests: 0,
      request: async () => { server.requests++; return { documents: [{ prefix: 'REQ', markerPath: marker, items: [] }] }; }
    };
    const tree = new DoorstopTreeProvider(server as unknown as DoorstopServer);

    assert.deepStrictEqual(await tree.getChildren(), []);
    assert.strictEqual(server.requests, 0, 'nothing is requested from a server that is not up');

    server.port = 1;
    tree.refresh();
    assert.strictEqual((await tree.getChildren()).length, 1);
  });

  // Bug tree-load-slow-at-startup: extension.ts schedules the first problems check in
  // loadItems().then(...), so it must settle only after the load and share it with the view.
  test('loadItems resolves only after the load and shares it with getChildren', async () => {
    const marker = path.join(REPO_ROOT, 'reqs', 'REQ', '.doorstop.yml');
    let release: () => void = () => undefined;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const server = {
      port: 1,
      requests: 0,
      request: async () => { server.requests++; await gate; return { documents: [{ prefix: 'REQ', markerPath: marker, items: [] }] }; }
    };
    const tree = new DoorstopTreeProvider(server as unknown as DoorstopServer);

    let settled = false;
    const loaded = tree.loadItems().then(() => { settled = true; });
    const children = tree.getChildren();
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.strictEqual(settled, false, 'not settled while the server has not answered');

    release();
    await loaded;
    assert.strictEqual((await children).length, 1);
    assert.strictEqual(server.requests, 1, 'one request serves both callers');
  });
});
