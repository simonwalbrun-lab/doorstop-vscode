import * as assert from 'assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { inDoorstopDocument, metadataRange, textRange, uidFromItemPath } from '../itemFile';

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

  suite('textRange (035)', () => {
    // Spec 035 FR-005, FR-009
    test('a YAML item\'s text is its block scalar, ending at the next key', () => {
      const lines = ['active: true', 'links: []', 'text: |', '  - [ ] one', '', '  two', 'level: 1'];
      assert.deepStrictEqual(textRange(lines, false), { start: 3, end: 6, indent: '  ' });
      assert.deepStrictEqual(textRange(['text: |-', '    deep'], false), { start: 1, end: 2, indent: '    ' });
      assert.deepStrictEqual(textRange(['text: >', ''], false), { start: 1, end: 2, indent: '  ' });
    });

    // Spec 035 FR-005, FR-009
    test('a YAML text that is no block has no range', () => {
      assert.strictEqual(textRange(["text: ''"], false), undefined);
      assert.strictEqual(textRange(['level: 1'], false), undefined);
    });

    // Spec 035 FR-005, FR-009
    test('a markdown item\'s text is everything below closed frontmatter', () => {
      assert.deepStrictEqual(textRange(['---', 'level: 1', '---', '# H', 'body'], true), { start: 3, end: 5, indent: '' });
      assert.strictEqual(textRange(['---', 'level: 1'], true), undefined);
      assert.strictEqual(textRange(['# H'], true), undefined);
    });
  });

  // Spec 035 FR-009
  test('inDoorstopDocument looks for .doorstop.yml in the folder and its ancestors', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'doorstop-035-doc-'));
    fs.mkdirSync(path.join(root, 'DOC', 'sub'), { recursive: true });
    fs.mkdirSync(path.join(root, 'notes'));
    fs.writeFileSync(path.join(root, 'DOC', '.doorstop.yml'), 'settings:\n  prefix: DOC\n');
    assert.strictEqual(inDoorstopDocument(path.join(root, 'DOC', 'DOC-001.yml')), true);
    assert.strictEqual(inDoorstopDocument(path.join(root, 'DOC', 'sub', 'DOC-002.md')), true);
    assert.strictEqual(inDoorstopDocument(path.join(root, 'notes', 'post.md')), false);
  });
});
