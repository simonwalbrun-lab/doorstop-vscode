(function () {
  const vscode = acquireVsCodeApi();
  const visNodes = new vis.DataSet([]);
  const visEdges = new vis.DataSet([]);
  // Ghost items live in the same DataSets vis-network is bound to (a Network only
  // renders one nodes/edges DataSet pair, so a second DataSet would never appear on
  // canvas) - `ghostMeta` is what distinguishes a ghost node from a body node, and
  // every ghost edge carries `ephemeral: true`. Both are excluded from persistence
  // (FR-011) via the filters in getDiagramData/saveGraphState below.
  const ghostMeta = new Map();
  const nodeMap = new Map();
  const nodeMeta = new Map();
  let manualPositions = null;
  let hierarchical = false;
  let physicsEnabled = true;
  let ghostPreviewEnabled = false;
  let headingDisplayEnabled = false;
  let physicsToggleSuspended = false;

  // Title is read from cached metadata (unaffected by the heading-display toggle's
  // effect on the rendered label) rather than parsed out of `label`, so persistence
  // stays correct regardless of whether headings are currently shown on the canvas.
  function titleFor(node) {
    const meta = nodeMeta.get(node.id);
    if (meta && typeof meta.header === 'string') {
      return meta.header;
    }
    return node.label.split('\n')[1] || '';
  }

  function getDiagramData(network) {
    const positions = network.getPositions();
    return {
      nodes: visNodes.get()
        .filter(node => !ghostMeta.has(node.id))
        .map(node => ({
          id: node.id,
          fileUri: nodeMap.get(node.id),
          title: titleFor(node),
          x: positions[node.id]?.x ?? node.x ?? 0,
          y: positions[node.id]?.y ?? node.y ?? 0
        })),
      edges: visEdges.get({ filter: edge => edge.ephemeral !== true })
    };
  }

  function saveGraphState(network) {
    const positions = network.getPositions();
    const savedNodes = visNodes.get()
      .filter(node => !ghostMeta.has(node.id))
      .map(node => ({
        uid: node.id,
        fileUri: nodeMap.get(node.id),
        title: titleFor(node),
        x: positions[node.id]?.x ?? node.x ?? 0,
        y: positions[node.id]?.y ?? node.y ?? 0
      }));
    vscode.setState({ savedNodes });
  }

  // Removes every currently-rendered ghost node/edge and clears their metadata.
  // Used both when the user turns Ghost Preview off and just before re-populating
  // it with a fresh set (so toggling never leaves stale/duplicated ghosts behind).
  function clearGhosts() {
    const ghostNodeIds = Array.from(ghostMeta.keys());
    if (ghostNodeIds.length > 0) {
      visNodes.remove(ghostNodeIds);
    }
    const ghostEdgeIds = visEdges.get({ filter: edge => edge.ephemeral === true }).map(edge => edge.id);
    if (ghostEdgeIds.length > 0) {
      visEdges.remove(ghostEdgeIds);
    }
    ghostMeta.clear();
  }

  window.DoorstopDiagram = window.DoorstopDiagram || {};
  window.DoorstopDiagram.state = {
    vscode,
    visNodes,
    visEdges,
    ghostMeta,
    clearGhosts,
    nodeMap,
    nodeMeta,
    getDiagramData,
    saveGraphState,
    get manualPositions() { return manualPositions; },
    set manualPositions(value) { manualPositions = value; },
    get hierarchical() { return hierarchical; },
    set hierarchical(value) { hierarchical = value; },
    get physicsEnabled() { return physicsEnabled; },
    set physicsEnabled(value) { physicsEnabled = value; },
    get ghostPreviewEnabled() { return ghostPreviewEnabled; },
    set ghostPreviewEnabled(value) { ghostPreviewEnabled = value; },
    get headingDisplayEnabled() { return headingDisplayEnabled; },
    set headingDisplayEnabled(value) { headingDisplayEnabled = value; },
    get physicsToggleSuspended() { return physicsToggleSuspended; },
    set physicsToggleSuspended(value) { physicsToggleSuspended = value; }
  };
})();
