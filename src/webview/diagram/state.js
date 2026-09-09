(function () {
  const vscode = acquireVsCodeApi();
  const visNodes = new vis.DataSet([]);
  const visEdges = new vis.DataSet([]);
  const nodeMap = new Map();
  const nodeMeta = new Map();
  let manualPositions = null;
  let hierarchical = false;

  function getDiagramData(network) {
    const positions = network.getPositions();
    return {
      nodes: visNodes.get().map(node => ({
        id: node.id,
        fileUri: nodeMap.get(node.id),
        title: node.label.split('\n')[1] || '',
        x: positions[node.id]?.x ?? node.x ?? 0,
        y: positions[node.id]?.y ?? node.y ?? 0
      })),
      edges: visEdges.get()
    };
  }

  function saveGraphState(network) {
    const positions = network.getPositions();
    const savedNodes = visNodes.get().map(node => ({
      uid: node.id,
      fileUri: nodeMap.get(node.id),
      title: node.label.split('\n')[1] || '',
      x: positions[node.id]?.x ?? node.x ?? 0,
      y: positions[node.id]?.y ?? node.y ?? 0
    }));
    vscode.setState({ savedNodes });
  }

  function getPreviousState() {
    return vscode.getState();
  }

  window.DoorstopDiagram = window.DoorstopDiagram || {};
  window.DoorstopDiagram.state = {
    vscode,
    visNodes,
    visEdges,
    nodeMap,
    nodeMeta,
    getDiagramData,
    saveGraphState,
    getPreviousState,
    get manualPositions() { return manualPositions; },
    set manualPositions(value) { manualPositions = value; },
    get hierarchical() { return hierarchical; },
    set hierarchical(value) { hierarchical = value; }
  };
})();
