(function () {
  function handleDrop(e, network, container) {
    e.preventDefault();
    e.stopPropagation();

    const { messaging } = window.DoorstopDiagram;
    console.log('[Doorstop][drop] Transfer types:', Array.from(e.dataTransfer?.types || []));

    const treeData = e.dataTransfer.getData('application/vnd.code.tree.doorstop.treeView');
    const plainText = e.dataTransfer.getData('text/plain');
    const uriList = e.dataTransfer.getData('text/uri-list');
    console.log('[Doorstop][drop] Transfer values:', { treeData, plainText, uriList });

    const bounds = container.getBoundingClientRect();
    const pointer = network.DOMtoCanvas({
      x: e.clientX - bounds.left,
      y: e.clientY - bounds.top
    });

    if (treeData) {
      try {
        const item = JSON.parse(treeData);
        const droppedText = typeof item === 'string' ? item : item?.fileUri || item?.uid;
        if (typeof droppedText === 'string' && droppedText.trim().length > 0) {
          messaging.send('resolveDroppedItem', { droppedText, pointer });
          return;
        }
      } catch (error) {
        console.warn('[Doorstop][drop] Invalid TreeView payload:', error);
      }
    }

    const droppedValue = plainText || uriList;
    if (typeof droppedValue === 'string' && droppedValue.trim().length > 0) {
      messaging.send('resolveDroppedItem', { droppedText: droppedValue, pointer });
    } else {
      console.warn('[Doorstop][drop] No usable data on this drop (see Transfer values above). Use the tree item\'s "Add to Diagram" context menu entry instead.');
    }
  }

  function init(network, container) {
    const { state, messaging } = window.DoorstopDiagram;

    // Capture the event before vis-network or its canvas can consume it.
    window.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
    }, true);
    window.addEventListener('drop', (e) => handleDrop(e, network, container), true);

    network.on('dragEnd', (params) => {
      if (params.nodes.length > 0) {
        state.saveGraphState(network);
        messaging.send('diagramChanged', { diagram: state.getDiagramData(network) });
      }
    });

    network.on('click', (params) => {
      if (params.nodes.length > 0) {
        const fileUri = state.nodeMap.get(params.nodes[0]);
        if (fileUri) {
          messaging.send('activateNode', { fileUri });
        }
      }
    });

    network.on('doubleClick', (params) => {
      if (params.nodes.length > 0) {
        const fileUri = state.nodeMap.get(params.nodes[0]);
        if (fileUri) {
          messaging.send('openFile', { fileUri });
        }
      }
    });
  }

  window.DoorstopDiagram = window.DoorstopDiagram || {};
  window.DoorstopDiagram.interactions = { init };
})();
