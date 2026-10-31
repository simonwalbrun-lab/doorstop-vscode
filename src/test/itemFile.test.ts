import * as assert from 'assert';

import { metadataRange, uidFromItemPath } from '../itemFile';

// The shared item-file text helpers (rework-codebase R3). Pure functions: no
// workspace, no server.

suite('Item file helpers (rework-codebase)', () => {
  suite('uidFromItemPath', () => {
    test('strips .yml and .md, in any case', () => {
      assert.strictEqual(uidFromItemPath('/reqs/REQ-001.yml'), 'REQ-001');
      assert.strictEqual(uidFromItemPath('/reqs/MD-001.md'), 'MD-001');
      assert.strictEqual(uidFromItemPath('/reqs/REQ-002.YML'), 'REQ-002');
    });

    test('is undefined for any other file', () => {
      assert.strictEqual(uidFromItemPath('/reqs/diagram.doorstop.json'), undefined);
      assert.strictEqual(uidFromItemPath('/reqs/REQ-001'), undefined);
    });
  });

  suite('metadataRange', () => {
    test('a YAML item is metadata throughout', () => {
      assert.deepStrictEqual(metadataRange(['level: 1', 'text: x'], false), { start: 0, end: 2, closed: true });
    });

    test('a markdown item is metadata only inside its frontmatter', () => {
      const lines = ['---', 'level: 1', 'links: []', '---', '# Heading', 'links: in prose'];
      assert.deepStrictEqual(metadataRange(lines, true), { start: 1, end: 3, closed: true });
    });

    test('a markdown item without frontmatter has no metadata', () => {
      assert.strictEqual(metadataRange(['# Heading', 'text'], true), undefined);
      assert.strictEqual(metadataRange([], true), undefined);
    });

    test('an unclosed fence runs to the end and says so', () => {
      assert.deepStrictEqual(metadataRange(['---', 'level: 1'], true), { start: 1, end: 2, closed: false });
    });
  });
});
