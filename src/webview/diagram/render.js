(function () {
  const NODE_COLOR = { background: '#2d2d2d', border: '#007acc' };
  const SUSPECT_BORDER = '#f14c4c';
  const NODE_FONT = { color: '#ffffff' };

  // Stable, deterministic per-document colors regardless of discovery order.
  const DOCUMENT_PALETTE = [
    '#4C6EF5', '#12B886', '#E8590C', '#AE3EC9', '#1098AD',
    '#F08C00', '#E64980', '#2F9E44', '#7048E8', '#495057'
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

  // Combined status badge: reviewed/suspect + active + normative + derived.
  // Only flags deviations from the "normal" state so a clean item shows no badge at all.
  function buildBadge(item) {
    const parts = [];
    if (item.reviewed === true) { parts.push('✅'); }
    else if (item.reviewed === false) { parts.push('❓'); }
    if (item.cleared === false) { parts.push('⚠️'); }
    if (item.derived === true) { parts.push('🔹'); }
    if (item.active === false) { parts.push('🚫'); }
    if (item.normative === false) { parts.push('📄'); }
    return parts.join(' ');
  }

  function setDropHintVisible(visible) {
    const hint = document.getElementById('drop-hint');
    if (hint) {
      hint.style.display = visible ? 'block' : 'none';
    }
  }

  function toVisNode(item) {
    const id = item.id ?? item.uid;
    const hasMeta = item.documentPrefix !== undefined && item.documentPrefix !== null;
    const color = hasMeta ? colorForDocument(item.documentPrefix) : { ...NODE_COLOR };
    if (hasMeta && item.cleared === false) {
      color.border = SUSPECT_BORDER;
    }
    const badge = hasMeta ? buildBadge(item) : '';
    const label = id + '\n' + (item.title || '') + (badge ? '\n' + badge : '');
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

  window.DoorstopDiagram = window.DoorstopDiagram || {};
  window.DoorstopDiagram.render = {
    setDropHintVisible,
    toVisNode,
    colorForDocument,
    DOCUMENT_PALETTE
  };
})();
