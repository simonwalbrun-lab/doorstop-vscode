(function () {
  const { state, render, interactions, messaging } = window.DoorstopDiagram;

  const container = document.getElementById('mynetwork');
  const data = { nodes: state.visNodes, edges: state.visEdges };
  const options = {
    physics: { enabled: true, barnesHut: { gravitationalConstant: -2000 } },
    interaction: { dragNodes: true, dragView: true, zoomView: true }
  };
  const network = new vis.Network(container, data, options);

  interactions.init(network, container);

  messaging.on('loadDiagram', (message) => {
    state.visNodes.clear();
    state.visEdges.clear();
    state.nodeMap.clear();

    message.diagram.nodes.forEach(item => {
      state.nodeMap.set(item.id, item.fileUri);
      state.visNodes.add(render.toVisNode(item));
    });

    state.visEdges.add(message.diagram.edges);
    render.setDropHintVisible(state.visNodes.length === 0);
    state.saveGraphState(network);
  });

  messaging.on('addNode', (message) => {
    const { uid, fileUri, title, links, pointer } = message.node;
    render.setDropHintVisible(false);

    if (state.visNodes.get(uid)) {
      return;
    }

    state.nodeMap.set(uid, fileUri);
    state.visNodes.add(render.toVisNode({ id: uid, title, x: pointer.x, y: pointer.y }));

    links.forEach(targetUid => {
      if (state.visNodes.get(targetUid)) {
        state.visEdges.add({ from: uid, to: targetUid, arrows: 'to' });
      }
    });

    network.redraw();
    state.saveGraphState(network);
    messaging.send('diagramChanged', { diagram: state.getDiagramData(network) });
  });

  messaging.init(network);
  messaging.send('ready');

  const previousState = state.getPreviousState();
  if (previousState && previousState.savedNodes && previousState.savedNodes.length > 0) {
    render.setDropHintVisible(false);
    previousState.savedNodes.forEach(item => {
      messaging.send('resolveDroppedItem', {
        droppedText: item.fileUri || item.uid,
        pointer: { x: item.x || 0, y: item.y || 0 }
      });
    });
  }
})();
