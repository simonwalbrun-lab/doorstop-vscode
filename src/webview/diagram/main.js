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
    // Ghost nodes are excluded here: they're synced onto the canvas via their own
    // `ephemeral: true` edges in the `ghostPreviewData` handler, not this path. If a
    // newly-added body item happened to link to a currently-shown ghost, letting it
    // through here would create a persisted-looking edge pointing at a node that
    // disappears the moment Ghost Preview is turned off.
    const currentIds = new Set(
      state.visNodes.getIds().filter(id => !state.ghostMeta.has(id))
    );
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
    state.ghostMeta.clear();

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

    // A ghost being promoted (FR-013): drop its ghost representation first so the
    // real body node added below is the only one left - no leftover ghost duplicate.
    if (state.ghostMeta.has(uid)) {
      state.visNodes.remove([uid]);
      // Either end: a ghost tethered to one of its children is the `from` of its edge,
      // a ghost tethered to one of its parents is the `to`.
      const ghostEdgeIds = state.visEdges
        .get({ filter: edge => edge.ephemeral === true && (edge.to === uid || edge.from === uid) })
        .map(edge => edge.id);
      if (ghostEdgeIds.length > 0) {
        state.visEdges.remove(ghostEdgeIds);
      }
      state.ghostMeta.delete(uid);
    } else if (state.visNodes.get(uid)) {
      return;
    }

    state.nodeMap.set(uid, fileUri);
    state.nodeMeta.set(uid, message.node);
    state.visNodes.add(render.toVisNode({ id: uid, title, x: pointer.x, y: pointer.y, ...message.node }));

    // Every body item present while Ghost Preview is on must stay fixed (FR-004),
    // not only the ones that were already there when it was turned on - covers both
    // ghost promotion and a fresh drag-and-drop while Ghost Preview stays active.
    if (state.ghostPreviewEnabled) {
      state.visNodes.update({ id: uid, physics: false });
    }

    syncEdgesFromMeta();

    network.redraw();
    state.saveGraphState(network);
    messaging.send('diagramChanged', { diagram: state.getDiagramData(network) });

    // FR-016: promoting a ghost keeps Ghost Preview on and immediately recomputes
    // the ghost set, so anything newly linked to the promoted item shows up right
    // away instead of only after the user toggles Ghost Preview off and back on.
    if (state.ghostPreviewEnabled) {
      messaging.send('requestGhostPreview', {
        enabled: true,
        bodyUids: state.visNodes.getIds().filter(id => !state.ghostMeta.has(id))
      });
    }
  });

  messaging.on('ghostPreviewData', (message) => {
    const statusEl = document.getElementById('ghost-preview-status');
    if (message.incomplete) {
      if (statusEl) { statusEl.hidden = false; }
      // Only roll the toggle all the way back if this was the initial "turning it
      // on" attempt (no ghosts shown yet). A failed *refresh* of an already-active
      // preview (e.g. the recompute after a promotion, FR-016) should leave the
      // still-displayed ghosts alone rather than tearing down a working preview
      // over one bad request (FR-012).
      if (state.ghostPreviewEnabled && state.ghostMeta.size === 0) {
        exitGhostPreview({ notifyExtension: false });
      }
      return;
    }
    if (statusEl) { statusEl.hidden = true; }

    state.clearGhosts();
    message.nodes.forEach(node => {
      state.ghostMeta.set(node.uid, node);
      state.visNodes.add(render.toVisGhostNode(node));
    });
    message.edges.forEach(edge => {
      state.visEdges.add({ from: edge.from, to: edge.to, arrows: 'to', dashes: true, ephemeral: true });
    });

    // Body items stay fixed while Ghost Preview is on; ghost items are physics-driven
    // and tethered to them, so a dragged body item pulls its ghosts along (FR-004).
    state.visNodes.update(
      state.visNodes.getIds()
        .filter(id => !state.ghostMeta.has(id))
        .map(id => ({ id, physics: false }))
    );
    network.setOptions({ physics: PHYSICS_ON });
    network.redraw();
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
    const ghostButton = document.getElementById('ghost-preview-toggle');
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
        // Ghost Preview and Hierarchical Layout are mutually exclusive (FR-014):
        // Hierarchical Layout already takes over positioning/physics entirely, which
        // directly conflicts with Ghost Preview's fixed-body/physics-driven-ghost model.
        if (ghostButton) { ghostButton.disabled = true; }
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
        if (ghostButton) { ghostButton.disabled = false; }
      }
    });
  }

  /**
   * Reverts every side effect Ghost Preview's "on" state has on the toolbar/canvas:
   * button label, the mutual-exclusion locks on Hierarchical Layout/Auto-Arrange,
   * and the fixed-in-place override on body items. Shared by the toggle's own
   * "turn off" click and by the `ghostPreviewData` handler's rollback when turning
   * it on failed outright (see the `incomplete` branch above) - callers decide
   * separately whether to touch `#ghost-preview-status` and whether the extension
   * needs telling (`notifyExtension`; the rollback case is reacting to a message
   * the extension already sent, so it does not need an answer).
   */
  function exitGhostPreview({ notifyExtension }) {
    const button = document.getElementById('ghost-preview-toggle');
    const layoutButton = document.getElementById('layout-toggle');
    const physicsButton = document.getElementById('physics-toggle');

    state.ghostPreviewEnabled = false;
    if (button) { button.textContent = 'Ghost Preview'; }
    state.clearGhosts();
    // Release the fixed-in-place override so remaining nodes follow the network's
    // own physics setting again (restored just below).
    state.visNodes.update(state.visNodes.getIds().map(id => ({ id, physics: true })));
    if (layoutButton) { layoutButton.disabled = false; }
    if (physicsButton && state.physicsToggleSuspended) {
      physicsButton.disabled = false;
      state.physicsToggleSuspended = false;
    }
    if (!state.hierarchical) {
      network.setOptions({ physics: currentPhysicsOptions() });
    }
    network.redraw();
    if (notifyExtension) {
      messaging.send('requestGhostPreview', { enabled: false });
    }
  }

  function setupGhostPreviewToggle() {
    const button = document.getElementById('ghost-preview-toggle');
    const layoutButton = document.getElementById('layout-toggle');
    const physicsButton = document.getElementById('physics-toggle');
    const statusEl = document.getElementById('ghost-preview-status');
    if (!button) {
      return;
    }
    button.addEventListener('click', () => {
      if (!state.ghostPreviewEnabled) {
        state.ghostPreviewEnabled = true;
        button.textContent = 'Exit Ghost Preview';
        // Mutually exclusive with Hierarchical Layout (FR-014, see setupLayoutToggle).
        if (layoutButton) { layoutButton.disabled = true; }
        // Ghost positioning has no meaning without a running simulation, so force it
        // on for the duration regardless of the user's Auto-Arrange preference, and
        // make that button inert so it can't fight the forced-on state.
        if (physicsButton && !physicsButton.disabled) {
          state.physicsToggleSuspended = true;
          physicsButton.disabled = true;
        }
        // Pin every current body item BEFORE the physics engine is forced on and
        // BEFORE the (async) request is even sent - otherwise there's a window,
        // however short, where the engine is running with no per-node override yet
        // and body items visibly drift/jump until the `ghostPreviewData` reply
        // arrives and pins them. Order matters: pin first, then flip physics on.
        const bodyUids = state.visNodes.getIds().filter(id => !state.ghostMeta.has(id));
        state.visNodes.update(bodyUids.map(id => ({ id, physics: false })));
        network.setOptions({ physics: PHYSICS_ON });
        messaging.send('requestGhostPreview', { enabled: true, bodyUids });
      } else {
        if (statusEl) { statusEl.hidden = true; }
        exitGhostPreview({ notifyExtension: true });
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

  /**
   * Re-renders every current body and ghost node's label in place, respecting the
   * just-flipped heading-display toggle (FR-009/FR-010 - same rule for both kinds).
   */
  function relabelAllNodes() {
    // Only `label` is recomputed here - position/color/font are untouched, since
    // vis-network's DataSet doesn't track live drag/physics positions, and passing
    // stale x/y through an update would snap nodes back to their original spot.
    const bodyUpdates = state.visNodes.get()
      .filter(node => !state.ghostMeta.has(node.id))
      .map(node => {
        const meta = state.nodeMeta.get(node.id) || {};
        const badge = meta.documentPrefix !== undefined && meta.documentPrefix !== null ? render.buildBadge(meta) : '';
        return { id: node.id, label: render.buildLabel(node.id, meta.header, badge) };
      });
    const ghostUpdates = Array.from(state.ghostMeta.entries()).map(([id, item]) => ({
      id,
      label: render.buildLabel(id, item.header, render.buildBadge(item))
    }));
    if (bodyUpdates.length > 0) { state.visNodes.update(bodyUpdates); }
    if (ghostUpdates.length > 0) { state.visNodes.update(ghostUpdates); }
  }

  function setupHeadingToggle() {
    const button = document.getElementById('heading-toggle');
    if (!button) {
      return;
    }
    button.addEventListener('click', () => {
      state.headingDisplayEnabled = !state.headingDisplayEnabled;
      button.textContent = state.headingDisplayEnabled ? 'Hide Headings' : 'Show Headings';
      relabelAllNodes();
    });
  }

  setupLayoutToggle();
  setupPhysicsToggle();
  setupGhostPreviewToggle();
  setupHeadingToggle();
  setupLegendToggle();

  messaging.init(network);
  // `ready` is the single restore path: the extension answers it with `loadDiagram`
  // carrying the document's current nodes AND edges. There used to be a second,
  // competing restore here that replayed `vscode.getState().savedNodes` as individual
  // drops - it raced with `loadDiagram`, and since each replayed drop reports a
  // `diagramChanged` while `loadDiagram` deliberately does not, it could leave the
  // document holding a nodes-only copy of the diagram, so the next save wrote a file
  // with every edge stripped out.
  messaging.send('ready');
})();
