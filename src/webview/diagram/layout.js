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
   * Places `ids` on a rectangular grid as close to square as the count allows.
   *
   * `cellWidth`/`cellHeight` are the pitch between adjacent cell centers, so the
   * caller is responsible for deriving them from the *largest* node extent plus a
   * gap - that is what makes the no-overlap guarantee hold when the heading-label
   * toggle widens every label (spec FR-018).
   *
   * Returns [{ id, x, y }], row-major over `ids` sorted ascending so the same
   * diagram always arranges the same way.
   */
  function gridPositions({ ids, cellWidth, cellHeight, center }) {
    const list = Array.isArray(ids) ? ids.slice().sort() : [];
    const n = list.length;
    if (n === 0) {
      return [];
    }

    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    const origin = center || { x: 0, y: 0 };

    // Center the whole grid on `origin`: offset by half the span between the first
    // and last cell center on each axis (not half the full box - the outer half-cell
    // of padding is not part of the span between centers).
    const offsetX = ((cols - 1) * cellWidth) / 2;
    const offsetY = ((rows - 1) * cellHeight) / 2;

    return list.map((id, index) => ({
      id,
      x: origin.x - offsetX + (index % cols) * cellWidth,
      y: origin.y - offsetY + Math.floor(index / cols) * cellHeight
    }));
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

  return { gridPositions, findFreeSlot, GAP };
});
