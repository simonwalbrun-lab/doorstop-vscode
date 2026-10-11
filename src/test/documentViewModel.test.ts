import * as assert from 'assert';

import * as vscode from 'vscode';

import {
  DOCUMENT_MARKER_REGEX,
  checkStructure,
  decorationLines,
  documentMarker,
  documentScope,
  filterScope,
  insertionPointAfterBlock,
  itemSeparator,
  normaliseFieldList,
  parse,
  placeholderBlockText,
  planSave,
  render,
  scopeKeyFromViewUri,
  sectionScope,
  viewTitle,
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
  // Spec 019 FR-006 FR-007 FR-008 FR-009
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

  // Spec 019 FR-007 FR-010 FR-045
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

  // Spec 019 FR-006 FR-045
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

  // Spec 019 FR-011 FR-018
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

  // Spec 019 FR-029 FR-031
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

  // Spec 019 FR-003
  test('view URI carries the prefix and a "(document)" title', () => {
    const uri = viewUriFor('SYS');
    assert.strictEqual(uri.scheme, 'doorstop-document');
    assert.strictEqual(uri.path, '/SYS (document)');
    assert.strictEqual(scopeKeyFromViewUri(uri), 'doc:SYS');
    assert.strictEqual(scopeKeyFromViewUri(vscode.Uri.file('/tmp/SYS (document)')), undefined);
  });

  suite('planSave', () => {
    const rendered = render(THREE_ITEMS);
    const plan = (text: string) => planSave(parse(text), THREE_ITEMS, rendered.issues);

    // Spec 019 FR-019
    test('unchanged document changes nothing', () => {
      const result = plan(rendered.text);
      assert.deepStrictEqual(result.errors, []);
      assert.deepStrictEqual(result.updates, []);
      assert.deepStrictEqual(result.creations, []);
      assert.deepStrictEqual(result.deletions, []);
      assert.deepStrictEqual(result.unchanged, ['SYS-0001', 'SYS-0006', 'SYS-0009']);
    });

    // Spec 019 FR-017
    test('depth changes and trailing blank lines are not changes', () => {
      const text = rendered.text
        .replace('## Sensor input', '#### Sensor input')
        .replace('Second paragraph.', 'Second paragraph.\n\n\n');
      assert.deepStrictEqual(plan(text).updates, []);
    });

    // Spec 019 FR-015 FR-016 FR-028
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

    // Spec 019 FR-015
    test('a blank or non-heading line after the separator still becomes the header', () => {
      const blank = plan(rendered.text.replace('## Sensor input', ''));
      assert.deepStrictEqual(blank.updates.map(update => [update.uid, update.header, update.headerOnly]), [['SYS-0006', '', true]]);
      const plain = plan(rendered.text.replace('## Sensor input', 'Sensor input'));
      assert.deepStrictEqual(plain.updates, []);
    });

    // Spec 019 FR-022 FR-024 FR-031 FR-032
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

    // Spec 019 FR-019 FR-042
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

    // Spec 019 FR-025
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

    // Spec 019 FR-026
    test('clean text has no issues', () => {
      assert.deepStrictEqual(check(rendered.text), []);
    });

    // Spec 019 FR-026 FR-027
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

  // Spec 019 FR-030
  test('placeholder insertion point and text', () => {
    const blocks = parse(render(THREE_ITEMS).text);
    assert.deepStrictEqual(insertionPointAfterBlock(blocks, 9), { insertAtLine: 11, depth: 2, afterUid: 'SYS-0006' });
    assert.deepStrictEqual(insertionPointAfterBlock(blocks, 0), { insertAtLine: 1, depth: 1, afterUid: undefined });
    assert.deepStrictEqual(insertionPointAfterBlock(blocks, 14), { insertAtLine: 15, depth: 3, afterUid: 'SYS-0009' });
    assert.strictEqual(placeholderBlockText(2), '\n<!-- new item -->\n## \n');
  });

  // Spec 019 FR-012 FR-039
  test('managed lines are dimmed and every second item block is tinted, following the text', () => {
    const text = render(THREE_ITEMS).text;
    assert.deepStrictEqual(decorationLines(parse(text)), {
      separators: [0, 2, 6, 12],
      tinted: [{ start: 6, end: 10 }]
    });
    // Two lines added to the first block shift later ranges with the text.
    const shifted = decorationLines(parse(text.replace('Top level text.', 'Top level text.\nmore\nlines')));
    assert.deepStrictEqual(shifted.tinted, [{ start: 8, end: 12 }]);
  });
});


suite('Document View scopes and fields model (030)', () => {
  // Spec 030 FR-003 FR-005
  test('every scope kind has its own title, URI and key, and the URI maps back to the key', () => {
    const scopes = [documentScope('SYS'), sectionScope('SYS-0006'), filterScope(2, ['SYS-0001'])];
    assert.deepStrictEqual(scopes.map(viewTitle), ['SYS (document)', 'SYS-0006 (section)', 'Filter 2 (filter)']);
    assert.deepStrictEqual(scopes.map(scope => scopeKeyFromViewUri(viewUriFor(scope))), ['doc:SYS', 'sec:SYS-0006', 'flt:2']);
    assert.strictEqual(scopeKeyFromViewUri(vscode.Uri.file('/x/SYS (document)')), undefined);
  });

  // Spec 030 FR-002
  test('the marker line accepts document, section and filter labels and the document marker is unchanged', () => {
    assert.strictEqual(documentMarker('SYS'), '<!-- doorstop document SYS · keep this line -->');
    for (const label of ['SYS', 'SYS-0006 section', 'Filter 2']) {
      assert.strictEqual(DOCUMENT_MARKER_REGEX.exec(documentMarker(label))?.groups?.prefix, label);
    }
    const rendered = render(doc(THREE_ITEMS.items.slice(1), 'SYS-0006 section'));
    assert.strictEqual(rendered.text.split('\n')[0], '<!-- doorstop document SYS-0006 section · keep this line -->');
    assert.strictEqual(parse(rendered.text)[0].kind, 'document');
  });

  const WITH_FIELDS = doc([
    item({ uid: 'SYS-0001', level: '1.0', text: 'Top.', fields: { ref: 'a.py', status: 'draft' } }),
    item({ uid: 'SYS-0006', level: '1.1', text: 'Only status.', fields: { status: 'open' } }),
    item({ uid: 'SYS-0009', level: '1.2', text: 'None.' })
  ]);

  // Spec 030 FR-014
  test('with no configured field the text is byte-identical to the 019 rendering', () => {
    assert.strictEqual(render(WITH_FIELDS).text, render(WITH_FIELDS, []).text);
    assert.ok(!render(WITH_FIELDS).text.includes('doorstop-fields'));
  });

  // Spec 030 FR-015 FR-016
  test('configured fields are rendered per item in setting order, omitted where absent', () => {
    const lines = render(WITH_FIELDS, ['status', 'ref', 'missing']).text.split('\n');
    const first = lines.indexOf('# SYS-0001');
    assert.deepStrictEqual(lines.slice(first + 1, first + 6), ['```doorstop-fields', 'status: draft', 'ref: a.py', '```', 'Top.']);
    const second = lines.indexOf('## SYS-0006');
    assert.deepStrictEqual(lines.slice(second + 1, second + 5), ['```doorstop-fields', 'status: open', '```', 'Only status.']);
    assert.strictEqual(lines[lines.indexOf('## SYS-0009') + 1], 'None.');
    assert.deepStrictEqual(decorationLines(parse(lines.join('\n'))).separators.includes(first + 1), true, 'fence lines are dimmed');
  });

  // Spec 030 FR-015
  test('a changed field value becomes an update; text after the block is still the item text', () => {
    const names = ['status', 'ref'];
    const text = render(WITH_FIELDS, names).text.replace('status: draft', 'status: done');
    const plan = planSave(parse(text), WITH_FIELDS, [], WITH_FIELDS, names);
    assert.deepStrictEqual(plan.errors, []);
    assert.deepStrictEqual(plan.updates.map(update => [update.uid, update.fields, update.text, update.headerOnly]), [['SYS-0001', { status: 'done' }, undefined, false]]);
    const untouched = planSave(parse(render(WITH_FIELDS, names).text), WITH_FIELDS, [], WITH_FIELDS, names);
    assert.deepStrictEqual([untouched.updates.length, untouched.errors.length], [0, 0]);
  });

  // Spec 030 FR-015 FR-016
  test('a damaged fields block is a structural error and refuses the save', () => {
    const names = ['status', 'ref'];
    const good = render(WITH_FIELDS, names).text;
    const damaged: Record<string, string> = {
      'removed line': good.replace('ref: a.py\n', ''),
      'renamed field': good.replace('ref: a.py', 'xref: a.py'),
      'not name: value': good.replace('ref: a.py', 'just words'),
      'unclosed block': good.replace('```\nTop.', 'Top.'),
      'removed block': good.replace('```doorstop-fields\nstatus: open\n```\n', '')
    };
    for (const [what, text] of Object.entries(damaged)) {
      const plan = planSave(parse(text), WITH_FIELDS, [], WITH_FIELDS, names);
      assert.ok(plan.errors.some(error => error.code === 'fields-structure'), what);
    }
    assert.ok(checkStructure(parse(damaged['unclosed block']), damaged['unclosed block'].split('\n'), render(WITH_FIELDS, names).blocks).some(issue => issue.code === 'fields-structure'));
  });

  test('item text that merely looks like a fields fence is never parsed as one', () => {
    const lookalike = doc([item({ uid: 'SYS-0001', level: '1.0', text: '```doorstop-fields\nstatus: x\n```' })]);
    const rendered = render(lookalike, ['status']);
    assert.ok(rendered.issues.some(issue => issue.code === 'separator-lookalike'));
    assert.ok(planSave(parse(rendered.text), lookalike, rendered.issues, lookalike, ['status']).errors.some(error => error.code === 'separator-lookalike'), 'the save is refused');
  });

  // Spec 030 FR-013 FR-016
  test('the setting list is trimmed, de-duplicated, and protected names are returned apart', () => {
    assert.deepStrictEqual(normaliseFieldList([' status ', 'ref', 'status', '', 'level', 'Links', 'two words', 'a:b', 7]), {
      fields: ['status', 'ref'],
      protectedNames: ['level', 'Links']
    });
    assert.deepStrictEqual(normaliseFieldList(undefined), { fields: [], protectedNames: [] });
  });
});
