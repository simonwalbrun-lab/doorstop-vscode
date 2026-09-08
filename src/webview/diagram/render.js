(function () {
  const NODE_COLOR = { background: '#2d2d2d', border: '#007acc' };
  const NODE_FONT = { color: '#ffffff' };

  function setDropHintVisible(visible) {
    const hint = document.getElementById('drop-hint');
    if (hint) {
      hint.style.display = visible ? 'block' : 'none';
    }
  }

  function toVisNode(item) {
    const id = item.id ?? item.uid;
    return {
      id,
      label: id + '\n' + (item.title || ''),
      shape: 'box',
      x: item.x || 0,
      y: item.y || 0,
      margin: 10,
      color: NODE_COLOR,
      font: NODE_FONT
    };
  }

  window.DoorstopDiagram = window.DoorstopDiagram || {};
  window.DoorstopDiagram.render = { setDropHintVisible, toVisNode };
})();
