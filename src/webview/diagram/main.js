(function () {
  const { state, render, interactions, messaging, layout } = window.DoorstopDiagram;

  const container = document.getElementById('mynetwork');
  const data = { nodes: state.visNodes, edges: state.visEdges };
  // The solver exists solely to settle ghost items around the body items they're
  // tethered to. Body items are never eligible for it (see BODY_NODE_DEFAULTS), so
  // it stays off entirely unless Ghost Preview is on - running a solver over a graph
  // in which no node participates is pure waste.
  const PHYSICS_ON = { enabled: true, barnesHut: { gravitationalConstant: -2000 } };
  const PHYSICS_OFF = { enabled: false };
  const pendingLinkOps = new Map();

  // Every body item carries physics:false for its entire life (FR-013): nothing but
  // a user drag or an explicit layout command may ever move it. Deliberately NOT
  // `fixed: {x, y}` - that would also block the user's own drag, which FR-021
  // requires to keep working.
  const BODY_NODE_DEFAULTS = { physics: false };

  // Fallback extent for a node vis-network can't measure yet (not drawn, or removed
  // mid-flight). Returning a sane box beats letting undefined propagate into NaN
  // coordinates that would place the node nowhere.
  const DEFAULT_NODE_EXTENT = { width: 160, height: 60 };

  function currentPhysicsOptions() {
    return state.ghostPreviewEnabled ? PHYSICS_ON : PHYSICS_OFF;
  }

  function bodyNodeIds() {
    return state.visNodes.getIds().filter(id => !state.ghostMeta.has(id));
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
    const currentIds = new Set(bodyNodeIds());
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
    physics: PHYSICS_OFF,
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

  // ---------------------------------------------------------------------------
  // Status banner
  // ---------------------------------------------------------------------------

  let statusTimer = null;

  /** Shows a transient canvas prompt. `timeoutMs` auto-clears it; omit to keep it up. */
  function setDiagramStatus(text, timeoutMs) {
    const el = document.getElementById('diagram-status');
    if (!el) {
      return;
    }
    if (statusTimer) {
      clearTimeout(statusTimer);
      statusTimer = null;
    }
    el.textContent = text;
    el.hidden = false;
    if (timeoutMs) {
      statusTimer = setTimeout(clearDiagramStatus, timeoutMs);
    }
  }

  function clearDiagramStatus() {
    const el = document.getElementById('diagram-status');
    if (statusTimer) {
      clearTimeout(statusTimer);
      statusTimer = null;
    }
    if (el) {
      el.hidden = true;
      el.textContent = '';
    }
  }

  // ---------------------------------------------------------------------------
  // Geometry helpers (shared by the layout commands and by auto-placement)
  // ---------------------------------------------------------------------------

  /** Measured extents of the given nodes, falling back to a default when unmeasurable. */
  function nodeExtents(ids) {
    return ids.map(id => {
      const box = network.getBoundingBox(id);
      if (!box || !Number.isFinite(box.left) || !Number.isFinite(box.top)) {
        return { id, ...DEFAULT_NODE_EXTENT };
      }
      const width = Math.abs(box.right - box.left);
      const height = Math.abs(box.bottom - box.top);
      return {
        id,
        width: width > 0 ? width : DEFAULT_NODE_EXTENT.width,
        height: height > 0 ? height : DEFAULT_NODE_EXTENT.height
      };
    });
  }

  /** Center-based occupancy boxes for the given nodes, for findFreeSlot. */
  function occupancyBoxes(ids) {
    const positions = network.getPositions(ids);
    return nodeExtents(ids).map(extent => ({
      x: positions[extent.id]?.x ?? 0,
      y: positions[extent.id]?.y ?? 0,
      width: extent.width,
      height: extent.height
    }));
  }

  /**
   * Writes computed coordinates onto nodes and persists them.
   *
   * `moveNode` as well as the DataSet update on purpose: the DataSet write is what
   * getDiagramData falls back to, but only moveNode updates the live body so that
   * `network.getPositions()` - which getDiagramData reads first - returns the new
   * coordinates rather than the pre-layout ones.
   */
  function applyPositions(updates) {
    if (!Array.isArray(updates) || updates.length === 0) {
      return;
    }
    state.visNodes.update(updates.map(({ id, x, y }) => ({ id, x, y })));
    updates.forEach(({ id, x, y }) => network.moveNode(id, x, y));
    network.redraw();
    state.saveGraphState(network);
    messaging.send('diagramChanged', { diagram: state.getDiagramData(network) });
  }

  // ---------------------------------------------------------------------------
  // Canvas commands driven from the context menu
  // ---------------------------------------------------------------------------

  /**
   * Removes a body item from the diagram - canvas and document only. The underlying
   * requirement and every link it holds are deliberately untouched (FR-003), which
   * is why this needs no round trip to the extension host and therefore has no
   * failure mode to handle.
   */
  function removeBodyNode(uid) {
    if (!uid || !state.visNodes.get(uid) || state.ghostMeta.has(uid)) {
      return;
    }

    // A pending link that started from this node can no longer be completed.
    if (state.pendingLinkSource === uid) {
      state.pendingLinkSource = null;
      clearDiagramStatus();
    }

    const touchingEdgeIds = state.visEdges
      .get({ filter: edge => edge.from === uid || edge.to === uid })
      .map(edge => edge.id);
    if (touchingEdgeIds.length > 0) {
      state.visEdges.remove(touchingEdgeIds);
    }
    state.visNodes.remove([uid]);
    state.nodeMap.delete(uid);
    state.nodeMeta.delete(uid);

    render.setDropHintVisible(bodyNodeIds().length === 0);
    state.saveGraphState(network);
    messaging.send('diagramChanged', { diagram: state.getDiagramData(network) });

    // FR-005: a ghost that was only on screen because of the removed item must go
    // too. Same recompute the promotion path already does.
    if (state.ghostPreviewEnabled) {
      messaging.send('requestGhostPreview', { enabled: true, bodyUids: bodyNodeIds() });
    }
  }

  /**
   * Context-menu counterpart to the drag-to-link gesture. Registers into the same
   * `pendingLinkOps` map so success and failure both flow through the one existing
   * `linkAddResult` handler - one result path, not two.
   */
  function requestLink(from, to) {
    pendingLinkOps.set(`${from}->${to}`, (edgeData) => {
      if (edgeData) {
        state.visEdges.add(edgeData);
      }
    });
    setDiagramStatus(`Linking ${from} → ${to}…`);
    messaging.send('addLink', { from, to });
  }

  // ---------------------------------------------------------------------------
  // Extension messages
  // ---------------------------------------------------------------------------

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
      state.visNodes.add({ ...render.toVisNode(merged), ...BODY_NODE_DEFAULTS });
    });

    state.visEdges.add(message.diagram.edges);
    syncEdgesFromMeta();
    render.setDropHintVisible(state.visNodes.length === 0);
    renderLegend(message.documents);
    state.saveGraphState(network);
  });

  messaging.on('addNode', (message) => {
    const { uid, fileUri, title, pointer, autoPlace } = message.node;
    render.setDropHintVisible(false);

    // A ghost being promoted (spec 011 FR-013): drop its ghost representation first
    // so the real body node added below is the only one left - no leftover duplicate.
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

    // FR-015: an item added without a drop point (the tree's "Add to Diagram") lands
    // somewhere free rather than potentially on top of an existing node. Only the
    // webview knows node extents, so the search has to happen here.
    let position = pointer || { x: 0, y: 0 };
    if (autoPlace) {
      const existing = bodyNodeIds();
      const extents = nodeExtents(existing);
      position = layout.findFreeSlot({
        occupied: occupancyBoxes(existing),
        width: extents.length > 0
          ? Math.max(...extents.map(e => e.width))
          : DEFAULT_NODE_EXTENT.width,
        height: extents.length > 0
          ? Math.max(...extents.map(e => e.height))
          : DEFAULT_NODE_EXTENT.height,
        center: network.getViewPosition()
      });
    }

    state.nodeMap.set(uid, fileUri);
    state.nodeMeta.set(uid, message.node);
    state.visNodes.add({
      ...render.toVisNode({ id: uid, title, x: position.x, y: position.y, ...message.node }),
      ...BODY_NODE_DEFAULTS
    });

    syncEdgesFromMeta();

    network.redraw();
    state.saveGraphState(network);
    messaging.send('diagramChanged', { diagram: state.getDiagramData(network) });

    // spec 011 FR-016: promoting a ghost keeps Ghost Preview on and immediately
    // recomputes the ghost set, so anything newly linked to the promoted item shows
    // up right away instead of only after toggling Ghost Preview off and back on.
    if (state.ghostPreviewEnabled) {
      messaging.send('requestGhostPreview', { enabled: true, bodyUids: bodyNodeIds() });
    }
  });

  messaging.on('ghostPreviewData', (message) => {
    const statusEl = document.getElementById('ghost-preview-status');
    if (message.incomplete) {
      if (statusEl) { statusEl.hidden = false; }
      // Only roll the toggle all the way back if this was the initial "turning it
      // on" attempt (no ghosts shown yet). A failed *refresh* of an already-active
      // preview (e.g. the recompute after a promotion) should leave the
      // still-displayed ghosts alone rather than tearing down a working preview
      // over one bad request (spec 011 FR-012).
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

    // Body items need no pinning here - they carry physics:false from insertion
    // onward (FR-013). Only the engine itself has to come on, so the ghosts just
    // added can settle around them and follow a dragged body item.
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
      clearDiagramStatus();
      state.saveGraphState(network);
      messaging.send('diagramChanged', { diagram: state.getDiagramData(network) });
    } else {
      callback(null);
      // The extension host has already shown the error notification with the real
      // reason (FR-011); this just clears the "Linking..." prompt off the canvas.
      setDiagramStatus('Link could not be created.', 4000);
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

  // ---------------------------------------------------------------------------
  // Layout commands
  //
  // Both are one-shot: they compute coordinates, write them onto the body items,
  // and return. Neither is a mode, nothing is left running, and nothing re-applies
  // on a later event - so the canvas afterwards is exactly as static and draggable
  // as it was before (FR-021), and neither command has any bearing on what the
  // other toolbar controls are allowed to do (FR-024).
  // ---------------------------------------------------------------------------

  function setupHierarchicalLayout() {
    const button = document.getElementById('layout-toggle');
    if (!button) {
      return;
    }
    button.addEventListener('click', () => {
      const ids = bodyNodeIds();
      if (ids.length === 0) {
        return;
      }

      // vis-network's hierarchical layout is a persistent mode that owns positioning
      // and overrides dragging while it's on. Turn it on only long enough to read the
      // coordinates it computes, then turn it off and bake those coordinates in as
      // ordinary node positions.
      network.setOptions({
        layout: { hierarchical: { enabled: true, direction: 'UD', sortMethod: 'directed' } }
      });
      const positions = network.getPositions(ids);
      network.setOptions({ layout: { hierarchical: { enabled: false } } });
      // Enabling hierarchical layout swaps vis-network's solver; put ours back.
      network.setOptions({ physics: currentPhysicsOptions() });

      const updates = ids
        .map(id => ({ id, x: positions[id]?.x, y: positions[id]?.y }))
        .filter(u => Number.isFinite(u.x) && Number.isFinite(u.y));

      // Guard against a degenerate result (nothing measurable, or everything stacked
      // on one point) rather than writing a collapsed layout over positions the user
      // arranged by hand.
      const collapsed = updates.length > 1 &&
        updates.every(u => u.x === updates[0].x && u.y === updates[0].y);
      if (updates.length !== ids.length || collapsed) {
        setDiagramStatus('Could not compute a hierarchical layout; positions left unchanged.', 5000);
        network.redraw();
        return;
      }

      applyPositions(updates);
    });
  }

  function setupGridLayout() {
    const button = document.getElementById('grid-layout');
    if (!button) {
      return;
    }
    button.addEventListener('click', () => {
      const ids = bodyNodeIds();
      // FR-023: nothing to arrange is a silent no-op, not an error.
      if (ids.length === 0) {
        return;
      }
      const extents = nodeExtents(ids);
      // Pitch comes from the *largest* node, which is what keeps the no-overlap
      // guarantee true once the heading toggle widens every label (FR-018).
      const cellWidth = Math.max(...extents.map(e => e.width)) + layout.GAP;
      const cellHeight = Math.max(...extents.map(e => e.height)) + layout.GAP;
      applyPositions(layout.gridPositions({
        ids,
        cellWidth,
        cellHeight,
        center: network.getViewPosition()
      }));
    });
  }

  /**
   * Reverts what Ghost Preview's "on" state does: the button label, the displayed
   * ghosts, and the running solver. Body items are NOT un-pinned - they are static
   * for their entire life now (FR-013), Ghost Preview or not. Shared by the toggle's
   * own "turn off" click and by the `ghostPreviewData` rollback when turning it on
   * failed outright - callers decide separately whether to touch
   * `#ghost-preview-status` and whether the extension needs telling
   * (`notifyExtension`; the rollback case is reacting to a message the extension
   * already sent, so it does not need an answer).
   */
  function exitGhostPreview({ notifyExtension }) {
    const button = document.getElementById('ghost-preview-toggle');

    state.ghostPreviewEnabled = false;
    if (button) { button.textContent = 'Ghost Preview'; }
    state.clearGhosts();
    network.setOptions({ physics: PHYSICS_OFF });
    network.redraw();
    if (notifyExtension) {
      messaging.send('requestGhostPreview', { enabled: false });
    }
  }

  function setupGhostPreviewToggle() {
    const button = document.getElementById('ghost-preview-toggle');
    const statusEl = document.getElementById('ghost-preview-status');
    if (!button) {
      return;
    }
    button.addEventListener('click', () => {
      if (!state.ghostPreviewEnabled) {
        state.ghostPreviewEnabled = true;
        button.textContent = 'Exit Ghost Preview';
        // Ghost positioning has no meaning without a running simulation. Body items
        // are already pinned from insertion, so there's no window in which the
        // engine can nudge them before the reply arrives.
        network.setOptions({ physics: PHYSICS_ON });
        messaging.send('requestGhostPreview', { enabled: true, bodyUids: bodyNodeIds() });
      } else {
        if (statusEl) { statusEl.hidden = true; }
        exitGhostPreview({ notifyExtension: true });
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
   * just-flipped heading-display toggle (spec 011 FR-009/FR-010 - same rule for both).
   */
  function relabelAllNodes() {
    // Only `label` is recomputed here - position/color/font are untouched, since
    // vis-network's DataSet doesn't track live drag positions, and passing stale
    // x/y through an update would snap nodes back to their original spot.
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

  setupHierarchicalLayout();
  setupGridLayout();
  setupGhostPreviewToggle();
  setupHeadingToggle();
  setupLegendToggle();

  // What the context menu in interactions.js is allowed to drive. Assigned before
  // interactions.init so it can capture them.
  window.DoorstopDiagram.commands = {
    removeBodyNode,
    requestLink,
    setDiagramStatus,
    clearDiagramStatus
  };

  interactions.init(network, container);

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
