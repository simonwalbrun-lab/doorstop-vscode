(function () {
  const { state, render, interactions, messaging } = window.DoorstopDiagram;

  const container = document.getElementById('mynetwork');
  const data = { nodes: state.visNodes, edges: state.visEdges };
  const PHYSICS_ON = { enabled: true, barnesHut: { gravitationalConstant: -2000 } };
  const PHYSICS_OFF = { enabled: false };
  const pendingLinkOps = new Map();

  function currentPhysicsOptions() {
    return state.physicsEnabled ? PHYSICS_ON : PHYSICS_OFF;
  }

  function mergeMeta(node, meta) {
    const nodeMeta = meta && meta[node.id ?? node.uid];
    return nodeMeta ? { ...node, ...nodeMeta } : node;
  }

  /**
   * Recomputes edges from each currently-present node's known links, checked against
   * every other currently-present node. Runs after any node addition rather than only
   * inspecting the newly added node's own outgoing links, so an edge appears regardless
   * of which of the two related items was dropped onto the canvas first.
   */
  function syncEdgesFromMeta() {
    const currentIds = new Set(state.visNodes.getIds());
    currentIds.forEach(id => {
      const meta = state.nodeMeta.get(id);
      if (!meta || !Array.isArray(meta.links)) {
        return;
      }
      meta.links.forEach(link => {
        const targetUid = typeof link === 'string' ? link : link?.uid;
        if (!targetUid || !currentIds.has(targetUid)) {
          return;
        }
        const exists = state.visEdges.get({
          filter: edge => edge.from === id && edge.to === targetUid
        });
        if (exists.length === 0) {
          state.visEdges.add({ from: id, to: targetUid, arrows: 'to' });
        }
      });
    });
  }

  const options = {
    physics: currentPhysicsOptions(),
    interaction: { dragNodes: true, dragView: true, zoomView: true },
    manipulation: {
      enabled: true,
      addNode: false,
      editNode: false,
      editEdge: false,
      deleteNode: function (data, callback) {
        callback(data);
        state.saveGraphState(network);
        messaging.send('diagramChanged', { diagram: state.getDiagramData(network) });
      },
      deleteEdge: function (data, callback) {
        callback(data);
        state.saveGraphState(network);
        messaging.send('diagramChanged', { diagram: state.getDiagramData(network) });
      },
      addEdge: function (edgeData, callback) {
        const { from, to } = edgeData;
        if (from === to) {
          callback(null);
          return;
        }
        pendingLinkOps.set(`${from}->${to}`, callback);
        messaging.send('addLink', { from, to });
      }
    }
  };
  const network = new vis.Network(container, data, options);

  interactions.init(network, container);

  messaging.on('loadDiagram', (message) => {
    state.visNodes.clear();
    state.visEdges.clear();
    state.nodeMap.clear();
    state.nodeMeta.clear();

    message.diagram.nodes.forEach(item => {
      state.nodeMap.set(item.id, item.fileUri);
      const merged = mergeMeta(item, message.meta);
      if (message.meta && message.meta[item.id]) {
        state.nodeMeta.set(item.id, message.meta[item.id]);
      }
      state.visNodes.add(render.toVisNode(merged));
    });

    state.visEdges.add(message.diagram.edges);
    syncEdgesFromMeta();
    render.setDropHintVisible(state.visNodes.length === 0);
    renderLegend(message.documents);
    state.saveGraphState(network);
  });

  messaging.on('addNode', (message) => {
    const { uid, fileUri, title, pointer } = message.node;
    render.setDropHintVisible(false);

    if (state.visNodes.get(uid)) {
      return;
    }

    state.nodeMap.set(uid, fileUri);
    state.nodeMeta.set(uid, message.node);
    state.visNodes.add(render.toVisNode({ id: uid, title, x: pointer.x, y: pointer.y, ...message.node }));

    syncEdgesFromMeta();

    network.redraw();
    state.saveGraphState(network);
    messaging.send('diagramChanged', { diagram: state.getDiagramData(network) });
  });

  messaging.on('linkAddResult', (message) => {
    const key = `${message.from}->${message.to}`;
    const callback = pendingLinkOps.get(key);
    pendingLinkOps.delete(key);
    if (!callback) {
      return;
    }
    if (message.success) {
      callback({ from: message.from, to: message.to, arrows: 'to' });
      state.saveGraphState(network);
      messaging.send('diagramChanged', { diagram: state.getDiagramData(network) });
    } else {
      callback(null);
    }
  });

  messaging.on('linkRemoveResult', (message) => {
    if (!message.success) {
      return;
    }
    const matches = state.visEdges.get({
      filter: edge => edge.from === message.from && edge.to === message.to
    });
    if (matches.length > 0) {
      state.visEdges.remove(matches.map(edge => edge.id));
      state.saveGraphState(network);
      messaging.send('diagramChanged', { diagram: state.getDiagramData(network) });
    }
  });

  function renderLegend(documents) {
    const container = document.getElementById('legend-documents');
    if (!container || !documents) {
      return;
    }
    container.innerHTML = '';
    Object.keys(documents).sort().forEach(prefix => {
      const row = document.createElement('div');
      row.className = 'legend-row';
      const swatch = document.createElement('span');
      swatch.className = 'legend-swatch';
      swatch.style.background = render.colorForDocument(prefix).background;
      row.appendChild(swatch);
      row.appendChild(document.createTextNode(prefix));
      container.appendChild(row);
    });
  }

  function setupLayoutToggle() {
    const button = document.getElementById('layout-toggle');
    const physicsButton = document.getElementById('physics-toggle');
    if (!button) {
      return;
    }
    button.addEventListener('click', () => {
      if (!state.hierarchical) {
        state.manualPositions = network.getPositions();
        network.setOptions({
          physics: { enabled: false },
          layout: { hierarchical: { enabled: true, direction: 'UD', sortMethod: 'directed' } }
        });
        state.hierarchical = true;
        button.textContent = 'Manual Layout';
        // Auto-arrange only applies to the free-form layout; hierarchical positions
        // are always computed directly, so the physics toggle is moot while active.
        if (physicsButton) { physicsButton.disabled = true; }
      } else {
        network.setOptions({
          layout: { hierarchical: { enabled: false } },
          physics: currentPhysicsOptions()
        });
        if (state.manualPositions) {
          state.visNodes.update(
            Object.entries(state.manualPositions).map(([id, pos]) => ({ id, x: pos.x, y: pos.y }))
          );
        }
        network.redraw();
        state.hierarchical = false;
        button.textContent = 'Hierarchical Layout';
        if (physicsButton) { physicsButton.disabled = false; }
      }
    });
  }

  function setupPhysicsToggle() {
    const button = document.getElementById('physics-toggle');
    if (!button) {
      return;
    }
    button.addEventListener('click', () => {
      state.physicsEnabled = !state.physicsEnabled;
      button.textContent = state.physicsEnabled ? 'Disable Auto-Arrange' : 'Enable Auto-Arrange';
      if (!state.hierarchical) {
        network.setOptions({ physics: currentPhysicsOptions() });
      }
    });
  }

  function setupLegendToggle() {
    const toggle = document.getElementById('legend-toggle');
    const legend = document.getElementById('legend');
    toggle?.addEventListener('click', () => {
      legend?.classList.toggle('collapsed');
    });
  }

  setupLayoutToggle();
  setupPhysicsToggle();
  setupLegendToggle();

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
