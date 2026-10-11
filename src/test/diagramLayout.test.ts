import * as assert from 'assert';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import * as vscode from 'vscode';

import { DoorstopDiagramPanel } from '../diagrammPanel';

// Covers the two pieces of feature 015 that are testable without a browser:
// the pure layout geometry, and diagram-document persistence after a node is
// removed from a diagram. See specs/015-diagram-context-menu-layouts/research.md
// section 5 for why layout.js is written dual-mode instead of standing up a DOM
// harness for the rest of the webview.
//
// Deliberately needs no fixture workspace, no Doorstop server and no network -
// constitution principle VI requires this to run unattended in CI.

const REPO_ROOT = path.resolve(__dirname, '..', '..');

// The built copy, not the source: esbuild.js copies src/webview/** verbatim into
// dist/, and requiring the artifact CI actually ships is the point.
const layout = require(path.join(REPO_ROOT, 'dist', 'webview', 'diagram', 'layout.js'));

const CELL_W = 180;
const CELL_H = 90;

function uids(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `REQ${String(i + 1).padStart(3, '0')}`);
}

type Extent = { id: string; width: number; height: number };

function uniform(ids: string[]): Extent[] {
  return ids.map(id => ({ id, width: CELL_W, height: CELL_H }));
}

/** Every pair of placed boxes that overlaps, as readable strings (empty = none). */
function overlaps(extents: Extent[], points: Array<{ id: string; x: number; y: number }>): string[] {
  const size = new Map(extents.map(e => [e.id, e]));
  const found: string[] = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const a = points[i], b = points[j];
      const ea = size.get(a.id)!, eb = size.get(b.id)!;
      if (Math.abs(a.x - b.x) * 2 < ea.width + eb.width && Math.abs(a.y - b.y) * 2 < ea.height + eb.height) {
        found.push(`${a.id}/${b.id}`);
      }
    }
  }
  return found;
}

/** Distinct x values = column count, distinct y values = row count. */
function shapeOf(points: Array<{ x: number; y: number }>): { cols: number; rows: number } {
  return {
    cols: new Set(points.map(p => p.x)).size,
    rows: new Set(points.map(p => p.y)).size
  };
}

suite('Diagram layout geometry (feature 015)', () => {

  test('layout.js loads under Node and exports its functions', () => {
    assert.strictEqual(typeof layout.gridPositions, 'function');
    assert.strictEqual(typeof layout.findFreeSlot, 'function');
    assert.strictEqual(typeof layout.wrapHeading, 'function');
    assert.strictEqual(typeof layout.hierarchicalSpacing, 'function');
  });

  // FR-018 / SC-004: the grid must be as close to square as the count allows.
  test('gridPositions produces a grid whose columns and rows differ by at most one', () => {
    for (const n of [1, 2, 3, 5, 7, 9, 10, 50]) {
      const points = layout.gridPositions({
        extents: uniform(uids(n)), center: { x: 0, y: 0 }
      });
      assert.strictEqual(points.length, n, `expected ${n} placements`);
      const { cols, rows } = shapeOf(points);
      assert.ok(
        Math.abs(cols - rows) <= 1,
        `n=${n}: grid is ${cols}x${rows}, which is not within one of square`
      );
    }
  });

  // FR-018 "no two nodes overlapping". With uniform extents every cell is one node
  // plus a gap wide, so no two boxes of that size can overlap.
  test('gridPositions never places two nodes closer than the cell pitch', () => {
    for (const n of [2, 5, 9, 50]) {
      const points = layout.gridPositions({
        extents: uniform(uids(n)), center: { x: 0, y: 0 }
      });
      for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
          const dx = Math.abs(points[i].x - points[j].x);
          const dy = Math.abs(points[i].y - points[j].y);
          assert.ok(
            dx >= CELL_W || dy >= CELL_H,
            `n=${n}: ${points[i].id} and ${points[j].id} overlap (dx=${dx}, dy=${dy})`
          );
        }
      }
    }
  });

  // FR-023: a layout command on an empty canvas does nothing and shows no error.
  test('gridPositions on an empty id list returns [] and throws nothing', () => {
    assert.deepStrictEqual(
      layout.gridPositions({ extents: [], center: { x: 0, y: 0 } }),
      []
    );
  });

  // SC-004 depends on the same diagram arranging the same way twice.
  test('gridPositions is deterministic and independent of input order', () => {
    const ids = uids(7);
    const first = layout.gridPositions({ extents: uniform(ids), center: { x: 0, y: 0 } });
    const second = layout.gridPositions({ extents: uniform(ids), center: { x: 0, y: 0 } });
    const shuffled = layout.gridPositions({
      extents: uniform([...ids].reverse()), center: { x: 0, y: 0 }
    });
    assert.deepStrictEqual(second, first);
    assert.deepStrictEqual(shuffled, first, 'placement must not depend on input order');
  });

  test('gridPositions centres the finished grid on the supplied centre', () => {
    const center = { x: 400, y: -250 };
    const points = layout.gridPositions({ extents: uniform(uids(9)), center });
    const xs = points.map((p: { x: number }) => p.x);
    const ys = points.map((p: { y: number }) => p.y);
    assert.strictEqual((Math.min(...xs) + Math.max(...xs)) / 2, center.x);
    assert.strictEqual((Math.min(...ys) + Math.max(...ys)) / 2, center.y);
  });

  // FR-015: an item added without a drop point lands somewhere free.
  test('findFreeSlot returns the centre when nothing is in the way', () => {
    const center = { x: 12, y: -34 };
    assert.deepStrictEqual(
      layout.findFreeSlot({ occupied: [], width: CELL_W, height: CELL_H, center }),
      center
    );
  });

  test('findFreeSlot avoids every occupied box', () => {
    const center = { x: 0, y: 0 };
    const occupied = [
      { x: 0, y: 0, width: CELL_W, height: CELL_H },
      { x: CELL_W, y: 0, width: CELL_W, height: CELL_H },
      { x: -CELL_W, y: 0, width: CELL_W, height: CELL_H }
    ];
    const slot = layout.findFreeSlot({ occupied, width: CELL_W, height: CELL_H, center });

    for (const box of occupied) {
      const overlaps =
        Math.abs(slot.x - box.x) * 2 < CELL_W + box.width &&
        Math.abs(slot.y - box.y) * 2 < CELL_H + box.height;
      assert.ok(!overlaps, `slot ${JSON.stringify(slot)} overlaps ${JSON.stringify(box)}`);
    }
  });

  test('findFreeSlot is deterministic for the same occupancy', () => {
    const args = {
      occupied: [{ x: 0, y: 0, width: CELL_W, height: CELL_H }],
      width: CELL_W,
      height: CELL_H,
      center: { x: 0, y: 0 }
    };
    assert.deepStrictEqual(layout.findFreeSlot(args), layout.findFreeSlot(args));
  });
});

suite('Size-aware layout and heading wrap (spec 025)', () => {

  // FR-014: columns/rows sized to their own nodes - one wide heading must not
  // overlap its neighbours, whatever the mix of sizes.
  test('gridPositions with mixed extents places no two boxes on top of each other', () => {
    const extents: Extent[] = [
      { id: 'A', width: 80, height: 40 },
      { id: 'B', width: 300, height: 90 },
      { id: 'C', width: 120, height: 40 },
      { id: 'D', width: 60, height: 120 },
      { id: 'E', width: 250, height: 30 }
    ];
    const points = layout.gridPositions({ extents, gap: layout.GAP, center: { x: 0, y: 0 } });
    assert.strictEqual(points.length, extents.length);
    assert.deepStrictEqual(overlaps(extents, points), []);
    const shuffled = layout.gridPositions({ extents: [...extents].reverse(), gap: layout.GAP, center: { x: 0, y: 0 } });
    assert.deepStrictEqual(shuffled, points, 'placement must not depend on input order');
  });

  // SC-003 scale: 50 nodes with widths 60-400 and heights 30-120.
  test('gridPositions keeps 50 mixed-size nodes free of overlap', () => {
    const extents: Extent[] = uids(50).map((id, i) => ({
      id,
      width: 60 + ((i * 37) % 341),
      height: 30 + ((i * 53) % 91)
    }));
    const points = layout.gridPositions({ extents, gap: layout.GAP, center: { x: 0, y: 0 } });
    assert.deepStrictEqual(overlaps(extents, points), []);
  });

  // FR-015: vis spaces hierarchical nodes centre to centre, so spacing must be at
  // least the largest node plus a gap - and never below vis's own defaults.
  test('hierarchicalSpacing keeps vis defaults as a floor and grows with the largest node', () => {
    const defaults = { nodeSpacing: 100, levelSeparation: 150, treeSpacing: 200 };
    assert.deepStrictEqual(layout.hierarchicalSpacing([]), defaults);
    assert.deepStrictEqual(layout.hierarchicalSpacing([{ id: 'A', width: 50, height: 30 }]), defaults);
    assert.deepStrictEqual(
      layout.hierarchicalSpacing([{ id: 'A', width: 400, height: 40 }, { id: 'B', width: 90, height: 200 }]),
      { nodeSpacing: 400 + layout.GAP, levelSeparation: 200 + layout.GAP, treeSpacing: 400 + layout.GAP }
    );
  });

  // FR-017/018: break at the first space after the first 30 characters, never mid-word.
  test('wrapHeading leaves short or empty headings alone', () => {
    assert.strictEqual(layout.wrapHeading('Short heading'), 'Short heading');
    assert.strictEqual(layout.wrapHeading('x'.repeat(30)), 'x'.repeat(30));
    assert.strictEqual(layout.wrapHeading(''), '');
    assert.strictEqual(layout.wrapHeading(null), '');
    assert.strictEqual(layout.wrapHeading(undefined), '');
  });

  test('wrapHeading breaks at the first space after 30 characters, repeatedly', () => {
    const heading = 'The system shall export every requirement document as HTML on demand';
    assert.strictEqual(
      layout.wrapHeading(heading),
      'The system shall export every requirement\ndocument as HTML on demand'
    );
    const longer = 'aaaa bbbb cccc dddd eeee ffff gggg hhhh iiii jjjj kkkk llll mmmm nnnn oooo pppp';
    assert.strictEqual(
      layout.wrapHeading(longer),
      'aaaa bbbb cccc dddd eeee ffff gggg\nhhhh iiii jjjj kkkk llll mmmm nnnn\noooo pppp'
    );
  });

  test('wrapHeading never breaks a word and never loses text', () => {
    const noSpaceAfter30 = 'one ' + 'x'.repeat(41);
    assert.strictEqual(layout.wrapHeading(noSpaceAfter30), noSpaceAfter30);

    const heading = 'Requirements traceability across documents must survive renames moves and reorganisations of folders';
    const wrapped: string = layout.wrapHeading(heading);
    const longestWord = Math.max(...heading.split(' ').map(w => w.length));
    for (const line of wrapped.split('\n')) {
      assert.ok(line.length <= 30 + longestWord, `line too long: "${line}"`);
    }
    assert.strictEqual(wrapped.replace(/[\n ]/g, ''), heading.replace(/ /g, ''));
  });
});

// The canvas surface itself can't be rendered headlessly (vis loads from a CDN), so
// the built webview files are the only artifact these two requirements can be
// checked against.
suite('Canvas surface cleanup (spec 025)', () => {
  const builtFile = (name: string) =>
    require('node:fs').readFileSync(path.join(REPO_ROOT, 'dist', 'webview', 'diagram', name), 'utf8') as string;

  test('canvas has no manipulation toolbar (FR-012)', () => {
    assert.doesNotMatch(builtFile('main.js'), /manipulation\s*:/);
  });

  test('canvas renders no status badges (FR-020-022)', () => {
    const render = builtFile('render.js');
    for (const marker of ['buildBadge', 'SUSPECT_BORDER', '✅', '❓', '⚠️', '🔹', '🚫', '📄']) {
      assert.ok(!render.includes(marker), `render.js still contains ${marker}`);
    }
    const html = builtFile('diagram.html');
    assert.ok(!html.includes('Suspect link'));
    assert.ok(!html.includes('<strong>Status</strong>'));
    assert.ok(html.includes('legend-documents'), 'the document colour legend must stay');
  });
});

// state.js assumes a webview (window, vis, acquireVsCodeApi); the few stubs below are
// all getDiagramData touches, so the real built file runs under Node unchanged.
suite('Saved title survives heading wrap (spec 025 T025)', () => {
  function loadState() {
    class DataSet {
      private items: any[];
      constructor(items: any[]) { this.items = items; }
      add(item: any) { this.items.push(item); }
      get(options?: { filter?: (item: any) => boolean }) {
        return options?.filter ? this.items.filter(options.filter) : this.items.slice();
      }
    }
    const sandbox: any = { window: {}, vis: { DataSet }, acquireVsCodeApi: () => ({ setState() { } }) };
    const source = require('node:fs').readFileSync(path.join(REPO_ROOT, 'dist', 'webview', 'diagram', 'state.js'), 'utf8');
    require('node:vm').runInNewContext(source, sandbox);
    return sandbox.window.DoorstopDiagram.state;
  }

  test('a wrapped heading is saved whole when no cached header exists', () => {
    const state = loadState();
    const heading = 'The system shall export every requirement document as HTML on demand';
    state.visNodes.add({ id: 'REQ-001', label: `REQ-001\n${layout.wrapHeading(heading)}` });
    state.nodeMap.set('REQ-001', 'reqs/REQ-001.yml');

    const saved = state.getDiagramData({ getPositions: () => ({ 'REQ-001': { x: 1, y: 2 } }) });
    assert.strictEqual(saved.nodes[0].title, heading);
  });
});

suite('Diagram document persistence after node removal (feature 015)', () => {
  let tempDir: string;

  suiteSetup(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'doorstop-diagram-'));
  });

  suiteTeardown(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  // FR-002 / FR-004: removing a node drops it and every edge touching it, and the
  // removal survives a save/reopen. Everything else must come back untouched.
  test('a removed node and its incident edges are gone after a round trip', async () => {
    const before = {
      nodes: [
        { id: 'REQ001', fileUri: 'reqs/REQ001.yml', title: 'One', x: 0, y: 0 },
        { id: 'REQ002', fileUri: 'reqs/REQ002.yml', title: 'Two', x: 100, y: 0 },
        { id: 'REQ003', fileUri: 'reqs/REQ003.yml', title: 'Three', x: 200, y: 0 }
      ],
      edges: [
        { from: 'REQ001', to: 'REQ002', arrows: 'to' },
        { from: 'REQ002', to: 'REQ003', arrows: 'to' },
        { from: 'REQ003', to: 'REQ001', arrows: 'to' }
      ]
    };

    // Exactly what removeBodyNode leaves behind in state before getDiagramData runs.
    const removed = 'REQ002';
    const after = {
      nodes: before.nodes.filter(n => n.id !== removed),
      edges: before.edges.filter(e => e.from !== removed && e.to !== removed)
    };

    const file = vscode.Uri.file(path.join(tempDir, 'removal.doorstop.json'));
    await vscode.workspace.fs.writeFile(file, DoorstopDiagramPanel.serializeDiagram(after));
    const reloaded = await DoorstopDiagramPanel.readDiagram(file);

    assert.deepStrictEqual(
      reloaded.nodes.map((n: { id: string }) => n.id),
      ['REQ001', 'REQ003'],
      'the removed node must not come back'
    );
    assert.strictEqual(reloaded.edges.length, 1, 'both edges touching the removed node must be gone');
    assert.deepStrictEqual(
      { from: reloaded.edges[0].from, to: reloaded.edges[0].to },
      { from: 'REQ003', to: 'REQ001' },
      'the edge that did not touch the removed node must survive unchanged'
    );

    // Positions of the surviving nodes are untouched by the removal (FR-014).
    const survivor = reloaded.nodes.find((n: { id: string }) => n.id === 'REQ003');
    assert.strictEqual(survivor.x, 200);
    assert.strictEqual(survivor.y, 0);
  });

  test('removing the last node leaves a readable, empty diagram', async () => {
    const file = vscode.Uri.file(path.join(tempDir, 'empty.doorstop.json'));
    await vscode.workspace.fs.writeFile(
      file,
      DoorstopDiagramPanel.serializeDiagram({ nodes: [], edges: [] })
    );
    const reloaded = await DoorstopDiagramPanel.readDiagram(file);
    assert.deepStrictEqual(reloaded.nodes, []);
    assert.deepStrictEqual(reloaded.edges, []);
  });
});
