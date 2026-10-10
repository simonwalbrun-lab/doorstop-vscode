/**
 * Pure layout geometry for the diagram canvas.
 *
 * Deliberately free of DOM and of any `vis` reference: every measurement is
 * supplied by the caller. That keeps this file loadable under plain Node, which is
 * what lets `src/test/diagramLayout.test.ts` assert it headlessly in CI
 * (constitution principle VI) - the rest of the webview is IIFEs that assume a
 * `window` and are unreachable from a test.
 *
 * Dual-mode on purpose: attaches to `window.DoorstopDiagram.layout` in the webview,
 * and exports via `module.exports` under Node. Same file, same code path, one
 * implementation (constitution principle II).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.DoorstopDiagram = root.DoorstopDiagram || {};
    root.DoorstopDiagram.layout = api;
  }
})(typeof window !== 'undefined' ? window : null, function () {
  // Breathing room between adjacent nodes, shared by the grid pitch and the
  // free-slot search so both space nodes the same way.
  const GAP = 20;

  /**
   * Places nodes on a rectangular grid as close to square as the count allows.
   *
   * `extents` are the measured { id, width, height } of each node. Every column is
   * as wide as its widest node and every row as tall as its tallest, with `gap`
   * between neighbours - so one long heading widens only its own column instead of
   * spreading the whole grid apart, and no two boxes can overlap (spec 025 FR-014).
   *
   * Returns [{ id, x, y }], row-major over ids sorted ascending so the same diagram
   * always arranges the same way, with the grid's bounding box centred on `center`.
   */
  function gridPositions({ extents, gap = GAP, center }) {
    const list = Array.isArray(extents)
      ? extents.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      : [];
    const n = list.length;
    if (n === 0) {
      return [];
    }

    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    const origin = center || { x: 0, y: 0 };

    const colWidth = new Array(cols).fill(0);
    const rowHeight = new Array(rows).fill(0);
    list.forEach((e, index) => {
      const c = index % cols;
      const r = Math.floor(index / cols);
      colWidth[c] = Math.max(colWidth[c], e.width);
      rowHeight[r] = Math.max(rowHeight[r], e.height);
    });

    // Cell centres measured from the grid's top-left corner.
    const colCenter = [];
    let x = 0;
    colWidth.forEach(w => { colCenter.push(x + w / 2); x += w + gap; });
    const rowCenter = [];
    let y = 0;
    rowHeight.forEach(h => { rowCenter.push(y + h / 2); y += h + gap; });
    const totalWidth = x - gap;
    const totalHeight = y - gap;

    return list.map((e, index) => ({
      id: e.id,
      x: origin.x - totalWidth / 2 + colCenter[index % cols],
      y: origin.y - totalHeight / 2 + rowCenter[Math.floor(index / cols)]
    }));
  }

  /**
   * Spacing options for vis-network's hierarchical layout. vis spaces nodes by
   * centre distance and ignores label size, so the spacing must cover the largest
   * node plus a gap (spec 025 FR-015). vis's own defaults stay the floor, so
   * short-label diagrams look as they did before.
   */
  function hierarchicalSpacing(extents) {
    const list = Array.isArray(extents) ? extents : [];
    const maxWidth = Math.max(0, ...list.map(e => e.width));
    const maxHeight = Math.max(0, ...list.map(e => e.height));
    return {
      nodeSpacing: Math.max(100, maxWidth + GAP),
      levelSeparation: Math.max(150, maxHeight + GAP),
      treeSpacing: Math.max(200, maxWidth + GAP)
    };
  }

  /**
   * Wraps a heading at the first space after the first `limit` characters,
   * repeatedly; a segment with no later space stays whole (spec 025 FR-017/018).
   */
  function wrapHeading(text, limit = 30) {
    if (typeof text !== 'string' || text.length === 0) {
      return '';
    }
    const lines = [];
    let rest = text;
    while (rest.length > limit) {
      const index = rest.indexOf(' ', limit);
      if (index === -1) {
        break;
      }
      lines.push(rest.slice(0, index));
      rest = rest.slice(index + 1);
    }
    lines.push(rest);
    return lines.join('\n');
  }

  function boxesOverlap(a, b) {
    return (
      Math.abs(a.x - b.x) * 2 < a.width + b.width &&
      Math.abs(a.y - b.y) * 2 < a.height + b.height
    );
  }

  /**
   * First position on an outward square spiral from `center` at which a
   * `width` x `height` box overlaps nothing in `occupied` (spec FR-015).
   *
   * `occupied` entries are center-based boxes: { x, y, width, height }. With
   * `occupied` empty this returns `center` unchanged.
   *
   * The step is the candidate box's own size plus a small gap, so a ring never
   * lands a node half-on-top of one placed on the previous ring. The ring cap is a
   * safety valve, not an expected path: at ~40 rings the search has covered far
   * more slots than any realistic diagram has nodes, and returning the last
   * candidate beats looping forever.
   */
  function findFreeSlot({ occupied, width, height, center }) {
    const origin = center || { x: 0, y: 0 };
    const boxes = Array.isArray(occupied) ? occupied : [];
    const candidate = { x: origin.x, y: origin.y, width, height };

    const fits = (point) =>
      !boxes.some((box) => boxesOverlap({ ...candidate, x: point.x, y: point.y }, box));

    if (fits(origin)) {
      return { x: origin.x, y: origin.y };
    }

    const stepX = width + GAP;
    const stepY = height + GAP;
    const MAX_RINGS = 40;

    let last = { x: origin.x, y: origin.y };
    for (let ring = 1; ring <= MAX_RINGS; ring++) {
      // Walk the perimeter of the ring only - interior cells were covered by
      // earlier rings and re-testing them would be wasted work.
      for (let dy = -ring; dy <= ring; dy++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.abs(dx) !== ring && Math.abs(dy) !== ring) {
            continue;
          }
          const point = { x: origin.x + dx * stepX, y: origin.y + dy * stepY };
          last = point;
          if (fits(point)) {
            return point;
          }
        }
      }
    }
    return last;
  }

  return { gridPositions, hierarchicalSpacing, wrapHeading, findFreeSlot, GAP };
});
