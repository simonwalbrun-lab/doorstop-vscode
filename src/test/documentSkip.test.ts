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
    const tree = new DoorstopTreeProvider({ request: async () => response } as unknown as DoorstopServer);

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
});
