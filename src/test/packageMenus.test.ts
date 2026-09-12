import * as assert from 'assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Menu placement is purely declarative: VS Code resolves `contributes.menus`
// itself and offers no API for reading back which actions a tree row ended up
// showing inline. The contribution file is therefore the only thing that can be
// asserted, and it is also the thing this feature changes (017 US2).

const REPO_ROOT = path.resolve(__dirname, '..', '..');

interface MenuEntry {
  command: string;
  when?: string;
  group?: string;
}

function treeViewMenus(): MenuEntry[] {
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
  return manifest.contributes.menus['view/item/context'] as MenuEntry[];
}

function entriesFor(command: string): MenuEntry[] {
  return treeViewMenus().filter(entry => entry.command === command);
}

function inlineEntries(command: string): MenuEntry[] {
  return entriesFor(command).filter(entry => entry.group?.startsWith('inline'));
}

suite('TreeView Row Actions (017 US2)', () => {
  test('Review and Clear Suspect are no longer clickable icons on a row', () => {
    assert.deepStrictEqual(inlineEntries('doorstop.review'), [], 'no inline Review icon');
    assert.deepStrictEqual(inlineEntries('doorstop.clear'), [], 'no inline Clear Suspect icon');
  });

  test('Review and Clear Suspect are still offered in the context menu', () => {
    // FR-010: the context menu is deliberately untouched, so removing the icon
    // does not remove the capability.
    assert.ok(
      entriesFor('doorstop.review').some(entry => entry.group === '1_requirement@3'),
      'Review keeps its context-menu entry'
    );
    assert.ok(
      entriesFor('doorstop.clear').some(entry => entry.group === '1_requirement@4'),
      'Clear Suspect keeps its context-menu entry'
    );
  });

  test('Add Item and Link Items keep their inline icons', () => {
    // FR-011: only two of the four inline icons were meant to go.
    assert.strictEqual(inlineEntries('doorstop.add').length, 1, 'Add Item stays inline');
    assert.strictEqual(inlineEntries('doorstop.link').length, 1, 'Link Items stays inline');
  });
});

suite('TreeView Call Hierarchy Icon (018 US1)', () => {
  const COMMAND = 'doorstop.showCallHierarchy';

  test('Show Call Hierarchy is an inline icon on requirement rows only', () => {
    const inline = inlineEntries(COMMAND);
    assert.strictEqual(inline.length, 1, 'exactly one inline entry');
    assert.ok(inline[0].when?.includes('viewItem == doorstop.item'), 'offered on requirement items');
    assert.ok(!inline[0].when?.includes('doorstop.root'), 'never offered on document roots (FR-001)');
  });

  test('the command is declared with an icon', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
    const command = (manifest.contributes.commands as { command: string; icon?: string }[])
      .find(entry => entry.command === COMMAND);
    assert.ok(command, 'command is contributed');
    assert.ok(command.icon, 'an inline action needs an icon to render');
  });

  test('Add Item and Link Items are unaffected', () => {
    assert.strictEqual(inlineEntries('doorstop.add').length, 1);
    assert.strictEqual(inlineEntries('doorstop.link').length, 1);
  });
});

// Spec 019: the Document View's entry points and its themeable colour are
// manifest contributions too.
suite('Document View contributions (019)', () => {
  const manifest = () => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
  const commandTitle = (id: string): string | undefined =>
    (manifest().contributes.commands as { command: string; title: string }[]).find(entry => entry.command === id)?.title;

  test('both open commands exist with the spec wording', () => {
    assert.strictEqual(commandTitle('doorstop.openDocumentView'), 'Doorstop: Open Document View');
    assert.strictEqual(commandTitle('doorstop.openAsDocument'), 'Open as document');
    assert.strictEqual(commandTitle('doorstop.insertItemHere'), 'Doorstop: Insert Item Here');
    assert.strictEqual(commandTitle('doorstop.documentView.restoreBlock'), 'Restore block structure');
  });

  test('"Open as document" is an inline icon and a context entry on document nodes only', () => {
    const entries = entriesFor('doorstop.openAsDocument');
    assert.strictEqual(entries.length, 2);
    assert.strictEqual(inlineEntries('doorstop.openAsDocument').length, 1, 'one inline icon');
    assert.ok(entries.some(entry => entry.group?.startsWith('1_requirement')), 'one context-menu entry');
    for (const entry of entries) {
      assert.strictEqual(entry.when, 'view == doorstop.treeView && viewItem == doorstop.root');
    }
  });

  test('lens-only commands are hidden from the palette', () => {
    const palette = manifest().contributes.menus.commandPalette as MenuEntry[];
    for (const id of ['doorstop.openAsDocument', 'doorstop.documentView.newItemBelow', 'doorstop.documentView.cancelPlaceholder', 'doorstop.documentView.restoreBlock']) {
      assert.strictEqual(palette.find(entry => entry.command === id)?.when, 'false', id);
    }
    assert.strictEqual(palette.find(entry => entry.command === 'doorstop.insertItemHere')?.when, 'resourceScheme == doorstop-document');
  });

  test('the alternating block colour has a default for every theme kind', () => {
    const colours = manifest().contributes.colors as { id: string; defaults: Record<string, string> }[];
    const colour = colours.find(entry => entry.id === 'doorstop.documentView.altBlockBackground');
    assert.ok(colour, 'colour contribution present');
    for (const kind of ['dark', 'light', 'highContrast', 'highContrastLight']) {
      assert.match(colour!.defaults[kind], /^#[0-9a-f]{8}$/i, kind);
    }
  });
});
