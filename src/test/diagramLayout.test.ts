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

/** Distinct x values = column count, distinct y values = row count. */
function shapeOf(points: Array<{ x: number; y: number }>): { cols: number; rows: number } {
  return {
    cols: new Set(points.map(p => p.x)).size,
    rows: new Set(points.map(p => p.y)).size
  };
}

suite('Diagram layout geometry (feature 015)', () => {

  test('layout.js loads under Node and exports both functions', () => {
    assert.strictEqual(typeof layout.gridPositions, 'function');
    assert.strictEqual(typeof layout.findFreeSlot, 'function');
  });

  // FR-018 / SC-004: the grid must be as close to square as the count allows.
  test('gridPositions produces a grid whose columns and rows differ by at most one', () => {
    for (const n of [1, 2, 3, 5, 7, 9, 10, 50]) {
      const points = layout.gridPositions({
        ids: uids(n), cellWidth: CELL_W, cellHeight: CELL_H, center: { x: 0, y: 0 }
      });
      assert.strictEqual(points.length, n, `expected ${n} placements`);
      const { cols, rows } = shapeOf(points);
      assert.ok(
        Math.abs(cols - rows) <= 1,
        `n=${n}: grid is ${cols}x${rows}, which is not within one of square`
      );
    }
  });

  // FR-018 "no two nodes overlapping". Cell pitch is derived by the caller from the
  // widest node, so at pitch distance no two boxes of that width can overlap.
  test('gridPositions never places two nodes closer than the cell pitch', () => {
    for (const n of [2, 5, 9, 50]) {
      const points = layout.gridPositions({
        ids: uids(n), cellWidth: CELL_W, cellHeight: CELL_H, center: { x: 0, y: 0 }
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
      layout.gridPositions({ ids: [], cellWidth: CELL_W, cellHeight: CELL_H, center: { x: 0, y: 0 } }),
      []
    );
  });

  // SC-004 depends on the same diagram arranging the same way twice.
  test('gridPositions is deterministic and independent of input order', () => {
    const ids = uids(7);
    const first = layout.gridPositions({ ids, cellWidth: CELL_W, cellHeight: CELL_H, center: { x: 0, y: 0 } });
    const second = layout.gridPositions({ ids, cellWidth: CELL_W, cellHeight: CELL_H, center: { x: 0, y: 0 } });
    const shuffled = layout.gridPositions({
      ids: [...ids].reverse(), cellWidth: CELL_W, cellHeight: CELL_H, center: { x: 0, y: 0 }
    });
    assert.deepStrictEqual(second, first);
    assert.deepStrictEqual(shuffled, first, 'placement must not depend on input order');
  });

  test('gridPositions centres the finished grid on the supplied centre', () => {
    const center = { x: 400, y: -250 };
    const points = layout.gridPositions({ ids: uids(9), cellWidth: CELL_W, cellHeight: CELL_H, center });
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
