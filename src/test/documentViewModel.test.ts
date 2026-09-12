import * as assert from 'assert';

import * as vscode from 'vscode';

import {
  checkStructure,
  documentMarker,
  insertionPointAfterBlock,
  itemSeparator,
  parse,
  placeholderBlockText,
  planSave,
  prefixFromViewUri,
  render,
  viewUriFor
} from '../documentViewModel';
import { DocumentNode, ItemNode } from '../doorstopTypes';

// Pure model tests (spec 019): no workspace, no server. The shapes below mirror
// specs/019-document-view/contracts/document-view-format.md.

function item(overrides: Partial<ItemNode> & { uid: string; level: string }): ItemNode {
  return {
    path: `/reqs/SYS/${overrides.uid}.yml`,
    active: true,
    normative: true,
    derived: false,
    reviewed: true,
    cleared: false,
    links: [],
    ...overrides
  };
}

function doc(items: ItemNode[], prefix = 'SYS'): DocumentNode {
  return { prefix, markerPath: `/reqs/${prefix}/.doorstop.yml`, items };
}

const THREE_ITEMS = doc([
  item({ uid: 'SYS-0001', level: '1.0', text: 'Top level text.' }),
  item({ uid: 'SYS-0006', level: '1.1', header: 'Sensor input', text: 'The system shall sense.\n\nSecond paragraph.' }),
  item({ uid: 'SYS-0009', level: '1.1.1', text: 'Text of an item without header.' })
]);

suite('Document View model (019)', () => {
  test('render produces the contract shape', () => {
    const { text, blocks, issues } = render(THREE_ITEMS);
    assert.strictEqual(text, [
      '<!-- doorstop document SYS · keep this line -->',
      '',
      '<!-- SYS-0001 · 1.0 · item separator. keep this line -->',
      '# SYS-0001',
      'Top level text.',
      '',
      '<!-- SYS-0006 · 1.1 · item separator. keep this line -->',
      '## Sensor input',
      'The system shall sense.',
      '',
      'Second paragraph.',
      '',
      '<!-- SYS-0009 · 1.1.1 · item separator. keep this line -->',
      '### SYS-0009',
      'Text of an item without header.',
      ''
    ].join('\n'));
    assert.deepStrictEqual(blocks.map(block => [block.kind, block.uid, block.startLine, block.endLine]), [
      ['document', undefined, 0, 0],
      ['item', 'SYS-0001', 2, 4],
      ['item', 'SYS-0006', 6, 10],
      ['item', 'SYS-0009', 12, 14]
    ]);
    assert.deepStrictEqual(issues, []);
  });

  test('render: heading item shows heading only, non-normative text is never hidden, inactive skipped', () => {
    const { text } = render(doc([
      item({ uid: 'SYS-0001', level: '1.0', header: 'Introduction', normative: false }),
      item({ uid: 'SYS-0002', level: '1.1', header: 'Note', normative: false, text: 'Kept visible.' }),
      item({ uid: 'SYS-0003', level: '1.2', text: 'Gone.', active: false })
    ]));
    assert.strictEqual(text, [
      documentMarker('SYS'),
      '',
      itemSeparator('SYS-0001', '1.0'),
      '# Introduction',
      '',
      itemSeparator('SYS-0002', '1.1'),
      '## Note',
      'Kept visible.',
      ''
    ].join('\n'));
  });

  test('render: empty document is the marker only; a lookalike separator is reported', () => {
    assert.strictEqual(render(doc([], 'EMPTY')).text, `${documentMarker('EMPTY')}\n`);
    const lookalike = render(doc([
      item({ uid: 'SYS-0001', level: '1.0', text: `before\n${itemSeparator('SYS-0001', '1.0')}\nafter` })
    ]));
    assert.strictEqual(lookalike.issues.length, 1);
    assert.strictEqual(lookalike.issues[0].code, 'separator-lookalike');
    assert.strictEqual(lookalike.issues[0].line, 5);
    assert.strictEqual(lookalike.issues[0].uid, 'SYS-0001');
  });

  test('parse round-trips render, and headings inside a body never split a block', () => {
    const blocks = parse(render(THREE_ITEMS).text);
    assert.deepStrictEqual(blocks.map(block => [block.kind, block.uid, block.headerText, block.text]), [
      ['document', undefined, '', ''],
      ['item', 'SYS-0001', 'SYS-0001', 'Top level text.'],
      ['item', 'SYS-0006', 'Sensor input', 'The system shall sense.\n\nSecond paragraph.'],
      ['item', 'SYS-0009', 'SYS-0009', 'Text of an item without header.']
    ]);
    assert.ok(blocks.every(block => block.kind !== 'item' || block.headerLineIsHeading));

    const withHeading = render(THREE_ITEMS).text.replace('Top level text.', 'Top level text.\n\n## Typed heading\nmore');
    const parsed = parse(withHeading);
    assert.strictEqual(parsed.length, 4);
    assert.strictEqual(parsed[1].text, 'Top level text.\n\n## Typed heading\nmore');
  });

  test('parse: orphan text, placeholder blocks and non-heading header lines', () => {
    const text = `${documentMarker('SYS')}\nstray text\n\n${itemSeparator('SYS-0001', '1.0')}\nnot a heading\nbody\n\n<!-- new item -->\n## \n\n`;
    const blocks = parse(text);
    assert.deepStrictEqual(blocks.map(block => block.kind), ['document', 'orphan', 'item', 'placeholder']);
    assert.strictEqual(blocks[1].separatorLine, 1);
    assert.strictEqual(blocks[2].headerLineIsHeading, false);
    assert.strictEqual(blocks[2].headerText, 'not a heading');
    assert.strictEqual(blocks[2].text, 'body');
    assert.strictEqual(blocks[3].headerText, '');
    assert.strictEqual(blocks[3].text, '');
  });

  test('view URI carries the prefix and a "(document)" title', () => {
    const uri = viewUriFor('SYS');
    assert.strictEqual(uri.scheme, 'doorstop-document');
    assert.strictEqual(uri.path, '/SYS (document)');
    assert.strictEqual(prefixFromViewUri(uri), 'SYS');
    assert.strictEqual(prefixFromViewUri(vscode.Uri.file('/tmp/SYS (document)')), undefined);
  });

  suite('planSave', () => {
    const rendered = render(THREE_ITEMS);
    const plan = (text: string) => planSave(parse(text), THREE_ITEMS, rendered.issues);

    test('unchanged document changes nothing', () => {
      const result = plan(rendered.text);
      assert.deepStrictEqual(result.errors, []);
      assert.deepStrictEqual(result.updates, []);
      assert.deepStrictEqual(result.creations, []);
      assert.deepStrictEqual(result.deletions, []);
      assert.deepStrictEqual(result.unchanged, ['SYS-0001', 'SYS-0006', 'SYS-0009']);
    });

    test('depth changes and trailing blank lines are not changes', () => {
      const text = rendered.text
        .replace('## Sensor input', '#### Sensor input')
        .replace('Second paragraph.', 'Second paragraph.\n\n\n');
      assert.deepStrictEqual(plan(text).updates, []);
    });

    test('text edit, header-only edit, and UID heading means empty header', () => {
      const edited = plan(rendered.text.replace('Top level text.', 'Edited text.'));
      assert.deepStrictEqual(edited.updates, [{
        uid: 'SYS-0001', text: 'Edited text.', headerOnly: false, oldHeader: '', line: 2
      }]);

      const headerOnly = plan(rendered.text.replace('## Sensor input', '## Sensor output'));
      assert.deepStrictEqual(headerOnly.updates, [{
        uid: 'SYS-0006', header: 'Sensor output', headerOnly: true, oldHeader: 'Sensor input', line: 6
      }]);

      const uidHeading = plan(rendered.text.replace('## Sensor input', '## SYS-0006'));
      assert.strictEqual(uidHeading.updates[0].header, '');
    });

    test('a blank or non-heading line after the separator still becomes the header', () => {
      const blank = plan(rendered.text.replace('## Sensor input', ''));
      assert.deepStrictEqual(blank.updates.map(update => [update.uid, update.header, update.headerOnly]), [['SYS-0006', '', true]]);
      const plain = plan(rendered.text.replace('## Sensor input', 'Sensor input'));
      assert.deepStrictEqual(plain.updates, []);
    });

    test('missing blocks are deletions, placeholders are creations, empty placeholders are ignored', () => {
      const lines = rendered.text.split('\n');
      const withoutLast = lines.slice(0, 12).join('\n') + '\n';
      assert.deepStrictEqual(plan(withoutLast).deletions, ['SYS-0009']);

      const withPlaceholder = rendered.text.replace(
        'Second paragraph.\n',
        'Second paragraph.\n\n<!-- new item -->\n## Inserted\nBody of the new item.\n'
      );
      const created = plan(withPlaceholder);
      assert.deepStrictEqual(created.creations, [{ afterUid: 'SYS-0006', header: 'Inserted', text: 'Body of the new item.', line: 12 }]);
      assert.deepStrictEqual(created.updates, []);

      const bodyOnly = plan(rendered.text.replace('Second paragraph.\n', 'Second paragraph.\n\n<!-- new item -->\n## \nOnly a body.\n'));
      assert.deepStrictEqual(bodyOnly.creations[0].header, '');

      const empty = plan(rendered.text.replace('Second paragraph.\n', 'Second paragraph.\n\n<!-- new item -->\n## \n\n'));
      assert.deepStrictEqual(empty.creations, []);
      assert.deepStrictEqual(empty.errors, []);

      const atTop = plan(rendered.text.replace(`${documentMarker('SYS')}\n`, `${documentMarker('SYS')}\n\n<!-- new item -->\n# First\n`));
      assert.strictEqual(atTop.creations[0].afterUid, undefined);
    });

    test('untouched blocks are never written back over a newer disk state', () => {
      const fresh = doc([
        item({ uid: 'SYS-0001', level: '1.0', text: 'Changed on disk.' }),
        item({ uid: 'SYS-0006', level: '1.1', header: 'Sensor input', text: 'The system shall sense.\n\nSecond paragraph.' })
      ]);
      const edited = rendered.text.replace('Second paragraph.', 'Edited by the user.');
      const result = planSave(parse(edited), THREE_ITEMS, [], fresh);
      assert.deepStrictEqual(result.updates.map(update => [update.uid, update.text]), [['SYS-0006', 'The system shall sense.\n\nEdited by the user.']]);
      assert.deepStrictEqual(result.unchanged, ['SYS-0001']);
      assert.deepStrictEqual(result.deletions, [], 'an item gone from disk is not a deletion');
      assert.strictEqual(result.errors[0]?.code, 'separator-unknown');
      assert.ok(result.errors[0]?.message.includes('deleted on disk'));
    });

    test('duplicated, unknown and orphan structures refuse the save', () => {
      const duplicated = plan(rendered.text.replace('## Sensor input', `${itemSeparator('SYS-0001', '1.0')}\n## Sensor input`));
      assert.strictEqual(duplicated.errors[0].code, 'separator-duplicated');
      assert.strictEqual(duplicated.errors[0].line, 7);

      const unknown = plan(rendered.text.replace('SYS-0009 · 1.1.1', 'REQ-0001 · 1.1.1'));
      assert.strictEqual(unknown.errors[0].code, 'separator-unknown');
      assert.deepStrictEqual(unknown.deletions, ['SYS-0009']);

      const orphan = plan(rendered.text.replace(`${itemSeparator('SYS-0001', '1.0')}\n`, ''));
      assert.strictEqual(orphan.errors[0].code, 'text-before-first-separator');
      assert.strictEqual(orphan.errors[0].line, 2);

      const lookalike = render(doc([item({ uid: 'SYS-0001', level: '1.0', text: itemSeparator('SYS-0001', '1.0') })]));
      const refused = planSave(parse(lookalike.text), THREE_ITEMS, lookalike.issues);
      assert.ok(refused.errors.some(issue => issue.code === 'separator-lookalike'));
    });
  });

  suite('checkStructure', () => {
    const rendered = render(THREE_ITEMS);
    const check = (text: string) => checkStructure(parse(text), text.split('\n'), rendered.blocks);

    test('clean text has no issues', () => {
      assert.deepStrictEqual(check(rendered.text), []);
    });

    test('one issue per code, naming the UID', () => {
      const cases: Array<[string, string, number, string | undefined]> = [
        [rendered.text.replace(`${itemSeparator('SYS-0001', '1.0')}\n`, ''), 'text-before-first-separator', 2, undefined],
        [rendered.text.replace('## Sensor input', `${itemSeparator('SYS-0001', '1.0')}\n## Sensor input`), 'separator-duplicated', 7, 'SYS-0001'],
        [rendered.text.replace('SYS-0009 · 1.1.1', 'SYS-0099 · 1.1.1'), 'separator-unknown', 12, 'SYS-0099'],
        [rendered.text.replace('SYS-0006 · 1.1 · item', 'SYS-0006 · 1.1 · itemx'), 'separator-changed', 6, 'SYS-0006'],
        [rendered.text.replace('## Sensor input', ''), 'missing-header', 7, 'SYS-0006'],
        [rendered.text.replace('Second paragraph.\n', 'Second paragraph.\n\n<!-- new item -->\n## \n'), 'placeholder-empty-heading', 13, undefined]
      ];
      for (const [text, code, line, uid] of cases) {
        const issues = check(text).filter(issue => issue.code === code);
        assert.strictEqual(issues.length, 1, `${code}: ${JSON.stringify(check(text))}`);
        assert.strictEqual(issues[0].line, line, code);
        assert.strictEqual(issues[0].uid, uid, code);
        if (uid) {
          assert.ok(issues[0].message.includes(uid), code);
        }
      }
    });
  });

  test('placeholder insertion point and text', () => {
    const blocks = parse(render(THREE_ITEMS).text);
    assert.deepStrictEqual(insertionPointAfterBlock(blocks, 9), { insertAtLine: 11, depth: 2, afterUid: 'SYS-0006' });
    assert.deepStrictEqual(insertionPointAfterBlock(blocks, 0), { insertAtLine: 1, depth: 1, afterUid: undefined });
    assert.deepStrictEqual(insertionPointAfterBlock(blocks, 14), { insertAtLine: 15, depth: 3, afterUid: 'SYS-0009' });
    assert.strictEqual(placeholderBlockText(2), '\n<!-- new item -->\n## \n');
  });
});
