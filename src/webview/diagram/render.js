(function () {
  // Light backgrounds throughout, so black text (NODE_FONT) always reads clearly.
  const NODE_COLOR = { background: '#e9ecef', border: '#495057' };
  const NODE_FONT = { color: '#000000' };

  // Stable, deterministic per-document colors regardless of discovery order. Light
  // tints (not the earlier medium-saturation shades) so black text has good contrast.
  const DOCUMENT_PALETTE = [
    '#A5D8FF', '#96F2D7', '#FFD8A8', '#EEBEFA', '#99E9F2',
    '#FFE066', '#FFC9DE', '#B2F2BB', '#D0BFFF', '#CED4DA'
  ];

  function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 31 + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
  }

  function colorForDocument(prefix) {
    if (!prefix) {
      return { background: NODE_COLOR.background, border: NODE_COLOR.border };
    }
    const background = DOCUMENT_PALETTE[hashString(prefix) % DOCUMENT_PALETTE.length];
    return { background, border: NODE_COLOR.border };
  }

  // Blends a #rrggbb color toward white by `amount` (0-1), for ghost items: same
  // per-document color as their body counterparts, at a visibly reduced intensity.
  function lighten(hexColor, amount) {
    const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hexColor);
    if (!match) {
      return hexColor;
    }
    const blend = (component) => {
      const value = parseInt(component, 16);
      return Math.round(value + (255 - value) * amount);
    };
    const [r, g, b] = [match[1], match[2], match[3]].map(blend);
    return `rgb(${r}, ${g}, ${b})`;
  }

  function setDropHintVisible(visible) {
    const hint = document.getElementById('drop-hint');
    if (hint) {
      hint.style.display = visible ? 'block' : 'none';
    }
  }

  // Identifier is always shown; the heading/title line is shown only while the
  // heading-display toggle is on (shared by body and ghost labels alike - FR-010).
  // No status icons (spec 025 FR-020): the label is the identifier plus, when shown,
  // the wrapped heading - nothing else.
  function buildLabel(id, headingText) {
    const headingDisplayEnabled = window.DoorstopDiagram.state.headingDisplayEnabled;
    const lines = [id];
    if (headingDisplayEnabled && headingText) {
      lines.push(window.DoorstopDiagram.layout.wrapHeading(headingText));
    }
    return lines.join('\n');
  }

  function toVisNode(item) {
    const id = item.id ?? item.uid;
    const hasMeta = item.documentPrefix !== undefined && item.documentPrefix !== null;
    const color = hasMeta ? colorForDocument(item.documentPrefix) : { ...NODE_COLOR };
    const heading = item.header || item.title || '';
    const label = buildLabel(id, heading);
    return {
      id,
      label,
      shape: 'box',
      x: item.x || 0,
      y: item.y || 0,
      margin: 10,
      color,
      font: NODE_FONT
    };
  }

  // Ghost items: smaller and in a lightened version of their own source document's
  // color (FR-003). Fixed/physics-driven behavior is applied by main.js after these
  // are added to the shared node DataSet (tracked separately via `state.ghostMeta`).
  function toVisGhostNode(item) {
    const baseColor = colorForDocument(item.documentPrefix);
    // Lightened further than a first pass would suggest - ghosts should read as
    // clearly less present than body items, not just a slightly paler variant.
    const color = {
      background: lighten(baseColor.background, 0.8),
      border: lighten(baseColor.border, 0.65)
    };
    const label = buildLabel(item.uid, item.header);
    return {
      id: item.uid,
      label,
      shape: 'box',
      margin: 4,
      color,
      font: { color: NODE_FONT.color, size: 11 }
    };
  }

  window.DoorstopDiagram = window.DoorstopDiagram || {};
  window.DoorstopDiagram.render = {
    setDropHintVisible,
    toVisNode,
    toVisGhostNode,
    buildLabel,
    colorForDocument,
    DOCUMENT_PALETTE
  };
})();
