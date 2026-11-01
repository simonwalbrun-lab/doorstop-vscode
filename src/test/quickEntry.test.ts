import * as assert from 'assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import * as vscode from 'vscode';

import { FIELDS_FENCE_CLOSE, FIELDS_FENCE_OPEN } from '../documentViewModel';
import { DoorstopServer } from '../doorstopServer';
import { invalidateUsedValues } from '../filterCompletion';
import {
  fieldSuggestions, formatNow, itemFieldAt, normaliseQuickEntry, QuickEntryProvider, registerQuickEntry, viewFieldAt, yamlValue
} from '../quickEntry';

// Field quick entry (spec 037). No workspace and no Python: item files live in a
// temp Doorstop folder, document views are untitled documents, the server is a
// stub answering GET /filter/vocabulary, and settings go to the user (Global) scope.

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const KEYS = ['valueLists', 'dateTimeFields', 'suggestUsedValues'];
const STATUS = ['Draft', 'Approved', 'Obsolete'];

let used: Record<string, string[]> | Error;
const server = {
  request: async (_method: string, pathName: string) => {
    assert.strictEqual(pathName, '/filter/vocabulary');
    if (used instanceof Error) {
      throw used;
    }
    return { attributes: used };
  },
} as unknown as DoorstopServer;

async function set(key: string, value: unknown): Promise<void> {
  await vscode.workspace.getConfiguration('doorstop.quickEntry').update(key, value, vscode.ConfigurationTarget.Global);
}

/** A temp folder holding `.doorstop.yml` and the given files. */
function doorstopFolder(files: Record<string, string>, marker = true): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'doorstop-qe-'));
  if (marker) {
    fs.writeFileSync(path.join(root, '.doorstop.yml'), 'settings:\n  prefix: REQ\n');
  }
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(root, name), content);
  }
  return root;
}

async function complete(provider: QuickEntryProvider, document: vscode.TextDocument, line: number, character: number) {
  return provider.provideCompletionItems(document, new vscode.Position(line, character));
}

const labels = (items: vscode.CompletionItem[] | undefined) => (items ?? []).map(i => String(i.label));

async function accept(document: vscode.TextDocument, item: vscode.CompletionItem): Promise<void> {
  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, item.range as vscode.Range, item.insertText as string);
  assert.ok(await vscode.workspace.applyEdit(edit));
}

const settings = (raw: Parameters<typeof normaliseQuickEntry>[0]) => normaliseQuickEntry(raw);
const NOW = new Date(2026, 10, 1, 9, 5);

suite('Field quick entry (037)', () => {
  setup(() => {
    used = {};
    invalidateUsedValues(server);
  });

  teardown(async () => {
    for (const key of KEYS) {
      await set(key, undefined);
    }
  });

  suite('settings', () => {
    // Spec 037 FR-001, FR-006, FR-009
    test('reads value lists, date/time fields and the used-values option', () => {
      const result = settings({
        valueLists: { ' status ': ['Draft', 'Draft', '', 'Approved'], version: [1, true] },
        dateTimeFields: [' tested_on ', ''],
        suggestUsedValues: false,
      });
      assert.deepStrictEqual([...result.valueLists], [['status', ['Draft', 'Approved']], ['version', ['1', 'true']]]);
      assert.deepStrictEqual([...result.dateTimeFields], ['tested_on']);
      assert.strictEqual(result.suggestUsedValues, false);
      assert.strictEqual(settings({}).suggestUsedValues, true);
      assert.deepStrictEqual([settings({}).ignored, settings({}).invalid], [[], []]);
    });

    // Spec 037 FR-015
    test('drops protected field names and lists each once', () => {
      const result = settings({ valueLists: { links: ['x'], status: ['Draft'] }, dateTimeFields: ['reviewed', 'links'] });
      assert.deepStrictEqual(result.ignored, ['links', 'reviewed']);
      assert.deepStrictEqual([...result.valueLists.keys()], ['status']);
      assert.strictEqual(result.dateTimeFields.size, 0);
    });

    // Spec 037 FR-016
    test('ignores settings with the wrong shape and keeps the rest', () => {
      assert.deepStrictEqual(settings({ valueLists: 'x' }).invalid, ['valueLists']);
      const mixed = settings({ valueLists: { status: 'Draft', tester: ['Mister A'] } });
      assert.deepStrictEqual(mixed.invalid, ['valueLists.status']);
      assert.deepStrictEqual([...mixed.valueLists.keys()], ['tester']);
      assert.deepStrictEqual(settings({ dateTimeFields: [1] }).invalid, ['dateTimeFields']);
      const flag = settings({ suggestUsedValues: 'yes' });
      assert.deepStrictEqual([flag.invalid, flag.suggestUsedValues], [['suggestUsedValues'], true]);
    });
  });

  suite('values and fields', () => {
    // Spec 037 FR-005
    test('yamlValue matches the quoting fixture the server checks with PyYAML', () => {
      const pairs: { value: string; quoted: string }[] =
        JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'server', 'tests', 'yaml_quoting.json'), 'utf8'));
      assert.ok(pairs.length > 40);
      for (const { value, quoted } of pairs) {
        assert.strictEqual(yamlValue(value), quoted, JSON.stringify(value));
      }
    });

    // Spec 037 FR-007
    test('formatNow is local time to the minute', () => {
      assert.strictEqual(formatNow(new Date(2026, 0, 2, 3, 4)), '2026-01-02T03:04');
      assert.strictEqual(formatNow(new Date(2026, 10, 1, 21, 5)), '2026-11-01T21:05');
    });

    // Spec 037 FR-002, FR-003, FR-017
    test('itemFieldAt finds the field of a value or list entry in the metadata only', () => {
      assert.deepStrictEqual(itemFieldAt(['status: Draft'], 0, 8, false), { name: 'status', valueStart: 8, needsSpace: false });
      assert.deepStrictEqual(itemFieldAt(['status:'], 0, 7, false), { name: 'status', valueStart: 7, needsSpace: true });
      assert.deepStrictEqual(itemFieldAt(['tester:', '- Mister A'], 1, 2, false), { name: 'tester', valueStart: 2, needsSpace: false });
      assert.deepStrictEqual(itemFieldAt(['tester:', '- A', '', '  - '], 3, 4, false), { name: 'tester', valueStart: 4, needsSpace: false });
      const markdown = ['---', 'status: x', '---', 'status: body'];
      assert.strictEqual(itemFieldAt(markdown, 1, 8, true)?.name, 'status');
      assert.strictEqual(itemFieldAt(markdown, 3, 8, true), undefined);
      assert.strictEqual(itemFieldAt(['status: x'], 0, 8, true), undefined);
      assert.strictEqual(itemFieldAt(['---', 'status: x'], 1, 8, true)?.name, 'status');
      assert.strictEqual(itemFieldAt(['text: |', '  status: x'], 1, 10, false), undefined);
      assert.strictEqual(itemFieldAt(['text:', '- x'], 1, 2, false), undefined);
      assert.strictEqual(itemFieldAt(['links:', '- REQ-001'], 1, 2, false), undefined);
      assert.strictEqual(itemFieldAt(['status: Draft'], 0, 3, false), undefined);
    });

    // Spec 037 FR-002, FR-018
    test('fieldSuggestions: listed values in order, nothing otherwise', () => {
      const lists = settings({ valueLists: { status: STATUS }, suggestUsedValues: false });
      assert.deepStrictEqual(fieldSuggestions('status', lists, undefined, NOW), STATUS.map(value => ({ value, source: 'listed' })));
      assert.deepStrictEqual(fieldSuggestions('component', lists, { component: ['UI'] }, NOW), []);
      assert.deepStrictEqual(fieldSuggestions('level', settings({}), { level: ['1.0'] }, NOW), []);
    });

    // Spec 037 FR-007, FR-008
    test('fieldSuggestions: a date/time field offers now first, then its list', () => {
      const result = fieldSuggestions('tested_on', settings({ dateTimeFields: ['tested_on'], valueLists: { tested_on: ['never'] } }), undefined, NOW);
      assert.deepStrictEqual(result, [{ value: '2026-11-01T09:05', source: 'now' }, { value: 'never', source: 'listed' }]);
    });

    // Spec 037 FR-010, FR-011
    test('fieldSuggestions: used values only without a list and not for date/time fields', () => {
      const all = settings({ valueLists: { status: STATUS }, dateTimeFields: ['tested_on'] });
      const values = { component: ['Server', 'UI', 'two\nlines'], status: ['Aproved'], tested_on: ['2020-01-01T00:00'] };
      assert.deepStrictEqual(fieldSuggestions('component', all, values, NOW), [{ value: 'Server', source: 'used' }, { value: 'UI', source: 'used' }]);
      assert.ok(!fieldSuggestions('status', all, values, NOW).some(s => s.value === 'Aproved'));
      assert.deepStrictEqual(fieldSuggestions('tested_on', all, values, NOW).map(s => s.source), ['now']);
    });

    // Spec 037 FR-019, FR-020
    test('viewFieldAt finds field lines inside a field block only', () => {
      const lines = ['status: x', '### 1 Login', FIELDS_FENCE_OPEN, 'status: Draft', FIELDS_FENCE_CLOSE, 'status: text'];
      assert.deepStrictEqual(viewFieldAt(lines, 3, 8), { name: 'status', valueStart: 8, needsSpace: false });
      for (const line of [0, 2, 4, 5]) {
        assert.strictEqual(viewFieldAt(lines, line, 8), undefined, `line ${line}`);
      }
    });
  });

  suite('item files', () => {
    const ITEM = 'active: true\nstatus: Draft\ntester:\n- \ncomponent: \ntested_on: old\ntext: |\n  status: x\n';
    const item = new QuickEntryProvider(server, 'item');
    let root: string;
    let document: vscode.TextDocument;

    setup(async () => {
      await set('valueLists', { status: STATUS, tester: ['Mister A', 'Madame B', 'Mister A: lead'] });
      root = doorstopFolder({ 'REQ-001.yml': ITEM, 'REQ-002.md': '---\nstatus: Draft\n---\n\nstatus: body\n' });
      document = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(root, 'REQ-001.yml')));
    });

    // Spec 037 FR-002, FR-004
    test('a listed field offers its values in order and a pick replaces only the value', async () => {
      const items = await complete(item, document, 1, 8);
      assert.deepStrictEqual(labels(items), STATUS);
      assert.ok(items!.every(i => i.kind === vscode.CompletionItemKind.EnumMember && i.detail === 'value list'));
      const range = items![1].range as vscode.Range;
      assert.deepStrictEqual([range.start.character, range.end.character], [8, 13]);
      await accept(document, items![1]);
      assert.strictEqual(document.getText(), ITEM.replace('status: Draft', 'status: Approved'));
    });

    // Spec 037 FR-003, FR-005
    test('a list entry offers the same values, quoted where YAML needs it', async () => {
      const items = await complete(item, document, 3, 2);
      assert.deepStrictEqual(labels(items), ['Mister A', 'Madame B', 'Mister A: lead']);
      assert.deepStrictEqual(items!.map(i => i.insertText), ['Mister A', 'Madame B', "'Mister A: lead'"]);
    });

    // Spec 037 FR-017
    test('nothing outside a Doorstop document, in a markdown body or in item text', async () => {
      const outside = doorstopFolder({ 'REQ-001.yml': ITEM }, false);
      const stray = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(outside, 'REQ-001.yml')));
      assert.strictEqual(await complete(item, stray, 1, 8), undefined);
      const markdown = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(root, 'REQ-002.md')));
      assert.deepStrictEqual(labels(await complete(item, markdown, 1, 8)), STATUS);
      assert.strictEqual(await complete(item, markdown, 4, 8), undefined);
      assert.strictEqual(await complete(item, document, 7, 10), undefined);
    });

    // Spec 037 FR-018
    test('a field without list or date setting and the option off gets nothing', async () => {
      await set('suggestUsedValues', false);
      used = { component: ['UI'] };
      assert.strictEqual(await complete(item, document, 4, 11), undefined);
    });

    // Spec 037 FR-007, FR-008
    test('a date/time field offers the current date and time first and writes it quoted', async () => {
      await set('dateTimeFields', ['tested_on']);
      const items = await complete(item, document, 5, 11);
      const first = items![0];
      assert.strictEqual(first.label, 'Current date and time');
      assert.ok(first.preselect);
      assert.match(String(first.detail), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
      await accept(document, first);
      assert.match(document.lineAt(5).text, /^tested_on: '\d{4}-\d{2}-\d{2}T\d{2}:\d{2}'$/);
    });

    // Spec 037 FR-010
    test('a field without a list offers the values used in other items', async () => {
      used = { component: ['Server', 'UI'] };
      const items = await complete(item, document, 4, 11);
      assert.deepStrictEqual(labels(items), ['Server', 'UI']);
      assert.ok(items!.every(i => i.detail === 'used in other items'));
    });

    // Spec 037 FR-011
    test('a listed field never offers used values', async () => {
      used = { status: ['Aproved'] };
      assert.deepStrictEqual(labels(await complete(item, document, 1, 8)), STATUS);
    });

    // Spec 037 FR-018
    test('without a server, lists and the date still work', async () => {
      await set('dateTimeFields', ['tested_on']);
      used = new Error('server down');
      assert.deepStrictEqual(labels(await complete(item, document, 1, 8)), STATUS);
      assert.deepStrictEqual(labels(await complete(item, document, 5, 11)), ['Current date and time']);
      assert.strictEqual(await complete(item, document, 4, 11), undefined);
    });

    // Spec 037 FR-012
    test('used values follow item changes once the cache is cleared', async () => {
      used = { component: ['UI'] };
      assert.deepStrictEqual(labels(await complete(item, document, 4, 11)), ['UI']);
      used = { component: ['Database', 'UI'] };
      invalidateUsedValues(server);
      assert.deepStrictEqual(labels(await complete(item, document, 4, 11)), ['Database', 'UI']);
    });

    // Spec 037 SC-003
    test('2,000 used values are offered within a second', async () => {
      used = { component: Array.from({ length: 2000 }, (_, i) => `value-${String(i).padStart(4, '0')}`) };
      const start = Date.now();
      const items = await complete(item, document, 4, 11);
      assert.strictEqual(items!.length, 2000);
      assert.ok(Date.now() - start < 1000, `${Date.now() - start} ms`);
    });
  });

  suite('document view', () => {
    const view = new QuickEntryProvider(server, 'view');
    const TEXT = ['## 1 Login', FIELDS_FENCE_OPEN, 'status: Draft', 'tested_on: x', 'component: ', FIELDS_FENCE_CLOSE, 'status: in the text'].join('\n');

    // Spec 037 FR-019
    test('field lines get the same suggestions, inserted as plain text', async () => {
      await set('valueLists', { status: ['Mister A: lead', ...STATUS] });
      await set('dateTimeFields', ['tested_on']);
      used = { component: ['UI'] };
      const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: TEXT });
      const status = await complete(view, document, 2, 8);
      assert.deepStrictEqual(labels(status), ['Mister A: lead', ...STATUS]);
      assert.strictEqual(status![0].insertText, 'Mister A: lead');
      assert.strictEqual(labels(await complete(view, document, 3, 11))[0], 'Current date and time');
      assert.deepStrictEqual(labels(await complete(view, document, 4, 11)), ['UI']);
    });

    // Spec 037 FR-020
    test('nothing outside a field block', async () => {
      await set('valueLists', { status: STATUS });
      const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: TEXT });
      for (const line of [1, 5, 6]) {
        assert.strictEqual(await complete(view, document, line, 8), undefined, `line ${line}`);
      }
    });
  });

  suite('settings at runtime', () => {
    const item = new QuickEntryProvider(server, 'item');
    let context: { subscriptions: vscode.Disposable[] };

    setup(() => {
      context = { subscriptions: [] };
    });

    teardown(() => {
      context.subscriptions.forEach(d => d.dispose());
    });

    // Spec 037 FR-001, FR-006, FR-009, FR-014
    test('package.json declares the three settings for workspace use', () => {
      const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
      const section = manifest.contributes.configuration.find((s: { title: string }) => s.title === 'Quick Entry');
      const defaults = { valueLists: {}, dateTimeFields: [], suggestUsedValues: true };
      for (const [key, value] of Object.entries(defaults)) {
        const property = section.properties[`doorstop.quickEntry.${key}`];
        assert.deepStrictEqual(property.default, value, key);
        assert.ok(!['machine', 'application', 'machine-overridable'].includes(property.scope), key);
        assert.ok(property.markdownDescription.includes('.vscode/settings.json'), key);
      }
    });

    // Spec 037 FR-013
    test('a changed value list applies to the next request', async () => {
      const root = doorstopFolder({ 'REQ-001.yml': 'status: \n' });
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(root, 'REQ-001.yml')));
      await set('valueLists', { status: ['A'] });
      assert.deepStrictEqual(labels(await complete(item, document, 0, 8)), ['A']);
      await set('valueLists', { status: ['B'] });
      assert.deepStrictEqual(labels(await complete(item, document, 0, 8)), ['B']);
    });

    // Spec 037 FR-015, FR-016
    test('ignored and invalid settings are reported once per change', async () => {
      const messages: string[] = [];
      registerQuickEntry(context as unknown as vscode.ExtensionContext, server, m => messages.push(m));
      assert.strictEqual(messages.length, 0);

      await set('dateTimeFields', ['links']);
      await set('valueLists', { status: 'x' });
      await waitFor(() => messages.some(m => m.includes('links') && m.includes('valueLists.status')));
      const count = messages.length;
      await set('valueLists', { status: STATUS });
      await waitFor(() => messages.length > count);
      assert.ok(messages[messages.length - 1].includes('links') && !messages[messages.length - 1].includes('valueLists'));
    });
  });
});

async function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error('timed out');
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}
