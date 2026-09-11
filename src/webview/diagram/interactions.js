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

  function dismissContextMenu() {
    document.getElementById('doorstop-context-menu')?.remove();
  }

  /**
   * A small floating context menu at (x, y). `items` is a list of {label, onClick}.
   * Used for right-click actions that must be an explicit, separate step rather than
   * firing immediately on right-click - e.g. destructive actions (Remove Link) that
   * must stay distinct from vis-network's own delete gesture (canvas-only removal),
   * and multi-step flows (Add Linked Item) that shouldn't jump straight into a picker.
   */
  function showContextMenu(x, y, items) {
    dismissContextMenu();
    const menu = document.createElement('div');
    menu.id = 'doorstop-context-menu';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    items.forEach(({ label, onClick }) => {
      const item = document.createElement('div');
      item.className = 'doorstop-context-menu-item';
      item.textContent = label;
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        dismissContextMenu();
        onClick();
      });
      menu.appendChild(item);
    });
    document.body.appendChild(menu);

    const dismiss = () => {
      dismissContextMenu();
      window.removeEventListener('click', dismiss, true);
      window.removeEventListener('keydown', onKey, true);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { dismiss(); }
    };
    setTimeout(() => {
      window.addEventListener('click', dismiss, true);
      window.addEventListener('keydown', onKey, true);
    }, 0);
  }

  function init(network, container) {
    const { state, messaging, commands } = window.DoorstopDiagram;

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

    // Ghost nodes aren't in `nodeMap` (only real, on-canvas body items are), so click
    // and double-click fall back to `ghostMeta`'s `fileUri` - clicking/double-clicking
    // a ghost behaves the same as a body item (spec.md Assumptions).
    function fileUriFor(nodeId) {
      return state.nodeMap.get(nodeId) ?? state.ghostMeta.get(nodeId)?.fileUri;
    }

    function beginLinkSelection(sourceUid) {
      state.pendingLinkSource = sourceUid;
      commands.setDiagramStatus(`Adding a link from ${sourceUid}: click the item to link to. Esc to cancel.`);
    }

    function cancelLinkSelection() {
      if (state.pendingLinkSource) {
        state.pendingLinkSource = null;
        commands.clearDiagramStatus();
      }
    }

    /**
     * Consumes a click as the target of a pending "Add Link to..." instead of the
     * usual open-the-file behaviour. Returns true when it handled the click.
     *
     * Ghosts are rejected as targets even though they're on the canvas: a link to a
     * ghost is a real Doorstop link whose edge is drawn `ephemeral` and vanishes the
     * moment Ghost Preview is turned off, which is indistinguishable from the write
     * having failed. Promoting it first makes the intent explicit.
     */
    function handleLinkTargetClick(params) {
      const source = state.pendingLinkSource;
      if (!source) {
        return false;
      }
      const target = params.nodes.length > 0 ? params.nodes[0] : null;

      if (!target) {
        cancelLinkSelection();
        return true;
      }
      state.pendingLinkSource = null;
      if (target === source) {
        commands.setDiagramStatus('An item cannot be linked to itself.', 4000);
        return true;
      }
      if (state.ghostMeta.has(target)) {
        commands.setDiagramStatus(
          'Add that item to the diagram first, then link to it.', 5000
        );
        return true;
      }
      commands.requestLink(source, target);
      return true;
    }

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        cancelLinkSelection();
      }
    });

    network.on('click', (params) => {
      // Must run before the open-file path below: jumping the editor to a file
      // mid-gesture would steal focus in the middle of picking a link target.
      if (handleLinkTargetClick(params)) {
        return;
      }
      if (params.nodes.length > 0) {
        const fileUri = fileUriFor(params.nodes[0]);
        if (fileUri) {
          messaging.send('activateNode', { fileUri });
          // Preview tab beside the diagram: updates as you click around instead of
          // piling up tabs, and never replaces the diagram itself in its own column.
          messaging.send('openFile', { fileUri, preview: true });
        }
      }
    });

    network.on('doubleClick', (params) => {
      if (params.nodes.length > 0) {
        const fileUri = fileUriFor(params.nodes[0]);
        if (fileUri) {
          // Locks the preview tab into a permanent one, still beside the diagram.
          messaging.send('openFile', { fileUri, preview: false });
        }
      }
    });

    network.on('oncontext', (params) => {
      params.event.preventDefault();
      const nodeId = network.getNodeAt(params.pointer.DOM);
      if (nodeId) {
        const ghost = state.ghostMeta.get(nodeId);
        if (ghost) {
          showContextMenu(params.event.clientX, params.event.clientY, [
            {
              label: 'Add to Diagram',
              onClick: () => messaging.send('promoteGhost', {
                uid: ghost.uid,
                fileUri: ghost.fileUri,
                pointer: params.pointer.canvas
              })
            }
          ]);
          return;
        }
        showContextMenu(params.event.clientX, params.event.clientY, [
          {
            label: 'Add Linked Item...',
            onClick: () => messaging.send('createLinkedItem', { sourceUid: nodeId, pointer: params.pointer.canvas })
          },
          {
            label: 'Add Link to...',
            onClick: () => beginLinkSelection(nodeId)
          },
          // Last on purpose: a destructive action shouldn't sit where the pointer
          // lands when the menu opens.
          {
            label: 'Remove from Diagram',
            onClick: () => commands.removeBodyNode(nodeId)
          }
        ]);
        return;
      }
      const edgeId = network.getEdgeAt(params.pointer.DOM);
      if (edgeId) {
        const edge = state.visEdges.get(edgeId);
        if (edge) {
          showContextMenu(params.event.clientX, params.event.clientY, [
            {
              label: 'Remove Link',
              onClick: () => messaging.send('removeLink', { from: edge.from, to: edge.to })
            }
          ]);
        }
      }
    });
  }

  window.DoorstopDiagram = window.DoorstopDiagram || {};
  window.DoorstopDiagram.interactions = { init };
})();
