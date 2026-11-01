import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

import { DoorstopServer } from './doorstopServer';
import { loadDoorstopIndex } from './doorstopIndex';
import { measure, registerCommand } from './timing';
import { withDelayedProgress } from './progress';
import { DoorstopTreeProvider, RequirementTreeItem } from './requirementTree';
import { choosePrefix, AddedItem } from './doorstopCommands';
import { LinkInfo } from './doorstopTypes';

/** A canvas node as the webview's `getDiagramData` saves it; `uid` is only a fallback for older files. */
export interface DiagramNode {
  id: string;
  uid?: string;
  fileUri?: string;
  title?: string;
  x?: number;
  y?: number;
  [key: string]: unknown;
}

export interface DiagramEdge {
  from: string;
  to: string;
  [key: string]: unknown;
}

/** A `*.doorstop.json` document. Unknown fields are kept so they survive a save. */
export interface Diagram {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  [key: string]: unknown;
}

type Pointer = { x: number; y: number };

/** Every message the webview sends (src/webview/diagram/*.js, `messaging.send`). */
type WebviewMessage =
  | { command: 'openFile'; fileUri?: string; preview?: boolean }
  | { command: 'activateNode'; fileUri?: string }
  | { command: 'resolveDroppedItem'; droppedText?: unknown; pointer: Pointer }
  | { command: 'diagramChanged'; diagram: Diagram }
  | { command: 'ready' }
  | { command: 'addLink'; from?: string; to?: string }
  | { command: 'removeLink'; from?: string; to?: string }
  | { command: 'createLinkedItem'; sourceUid?: string; pointer?: Pointer }
  | { command: 'requestGhostPreview'; enabled: boolean; bodyUids?: string[] }
  | { command: 'promoteGhost'; uid?: string; fileUri?: unknown; pointer?: Pointer };

interface NodeMeta {
  path: string;
  documentPrefix: string;
  links: LinkInfo[];
  header: string | null;
}

/**
 * One connection between a ghost item and a body item on the canvas. `ghostIsParent`
 * records which way the underlying doorstop link runs, so the rendered edge can point
 * the same way body-to-body edges already do (child -> parent, arrowhead at the parent)
 * instead of always pointing at the ghost.
 */
interface GhostTether {
  bodyUid: string;
  ghostIsParent: boolean;
}

interface GhostNode {
  uid: string;
  fileUri: string;
  header: string | null;
  documentPrefix: string;
  tethers: GhostTether[];
}

interface DocMeta {
  prefix: string;
  parentPrefix?: string;
}

function getNonce(): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Turns dropped text (a file: URI, a plain path or a bare UID; first line only) into an item UID.
 */
export function droppedTextToUid(droppedText: string): string {
  const cleanText = droppedText.trim().split(/\r?\n/)[0];
  const parsedUri = cleanText.startsWith('file:') ? vscode.Uri.parse(cleanText) : undefined;
  let localPath = cleanText;
  if (parsedUri) {
    localPath = parsedUri.fsPath;
  } else {
    // Plain paths are usually not URI-encoded; a literal '%' (e.g. "reqs 100%") would throw URIError.
    try { localPath = decodeURIComponent(cleanText); } catch { /* keep the raw text */ }
  }
  const isPath = fs.existsSync(localPath) || localPath.includes('/') || localPath.includes('\\');
  return isPath ? path.basename(path.normalize(localPath)).replace(/\.(yml|md)$/, '') : cleanText;
}

export class DoorstopDiagramPanel {
  /** Every diagram editor currently open; any number of them can be. */
  private static readonly open = new Set<DoorstopDiagramPanel>();
  private static lastActive: DoorstopDiagramPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private readonly _getDiagram: () => Diagram | undefined;
  private readonly _onDiagramChanged: (diagram: Diagram) => void;
  private readonly _server: DoorstopServer;
  private readonly _treeProvider: DoorstopTreeProvider;
  private _itemMeta: Record<string, NodeMeta> = {};
  private _metaWarningShown = false;
  private _unresolvedWarningShown = false;
  private _disposables: vscode.Disposable[] = [];

  /**
   * The diagram "Add to Diagram" goes to: the one that became active last, else any
   * open one. Not a scan of `panel.active`: another panel's flag can still read true
   * for a moment after the new one's view-state event.
   */
  public static get target(): DoorstopDiagramPanel | undefined {
    return DoorstopDiagramPanel.lastActive ?? DoorstopDiagramPanel.open.values().next().value;
  }

  public static createForCustomEditor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    getDiagram: () => Diagram | undefined,
    onDiagramChanged: (diagram: Diagram) => void,
    server: DoorstopServer,
    treeProvider: DoorstopTreeProvider
  ): DoorstopDiagramPanel {
    return new DoorstopDiagramPanel(panel, extensionUri, getDiagram, onDiagramChanged, server, treeProvider);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    getDiagram: () => Diagram | undefined,
    onDiagramChanged: (diagram: Diagram) => void,
    server: DoorstopServer,
    treeProvider: DoorstopTreeProvider
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._getDiagram = getDiagram;
    this._onDiagramChanged = onDiagramChanged;
    this._server = server;
    this._treeProvider = treeProvider;
    this._panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist', 'webview')]
    };
    this._panel.webview.html = this._getHtmlForWebview();

    DoorstopDiagramPanel.open.add(this);
    DoorstopDiagramPanel.lastActive = this;
    this._panel.onDidChangeViewState(event => {
      if (event.webviewPanel.active) {
        DoorstopDiagramPanel.lastActive = this;
      }
    }, null, this._disposables);
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async (message: WebviewMessage) => {
        switch (message.command) {
          case 'openFile':
            return this.handleOpenFile(message.fileUri, Boolean(message.preview));
          case 'activateNode':
            if (message.fileUri) {
              await vscode.commands.executeCommand('doorstop.activateRequirement', message.fileUri);
            }
            return;
          case 'resolveDroppedItem':
            if (typeof message.droppedText === 'string' && message.droppedText.trim().length > 0) {
              await this.handleDroppedData(message.droppedText, message.pointer);
            }
            return;
          case 'diagramChanged':
            return this._onDiagramChanged(message.diagram);
          case 'ready':
            return this.handleReady();
          case 'addLink':
          case 'removeLink':
            return this.handleLinkChange(message.command, message.from, message.to);
          case 'createLinkedItem':
            return this.handleCreateLinkedItem(message.sourceUid, message.pointer);
          case 'requestGhostPreview':
            return this.handleRequestGhostPreview(message.enabled, message.bodyUids);
          case 'promoteGhost':
            return this.handlePromoteGhost(message.fileUri, message.pointer);
        }
      },
      null,
      this._disposables
    );
  }

  private async handleOpenFile(fileUri: string | undefined, preview: boolean): Promise<void> {
    if (!fileUri) {
      return;
    }
    await vscode.window.showTextDocument(vscode.Uri.file(fileUri), {
      viewColumn: this.getOrCreateSideColumn(),
      preview,
      // Preview clicks keep the diagram focused for continued browsing; a
      // double-click (locking the tab in) is treated as intent to switch to it.
      preserveFocus: preview
    });
  }

  /**
   * Resolves the column to open a clicked node's file into: an already-open editor
   * group other than the diagram's own, if one exists (reused as-is, closest to the
   * diagram first), otherwise `ViewColumn.Beside` to create one. Using an explicit
   * existing column - rather than always relying on `Beside`, which resolves relative
   * to whichever editor is currently active - keeps reusing the same second editor
   * even after it has stolen focus away from the diagram at some point.
   */
  private getOrCreateSideColumn(): vscode.ViewColumn {
    const diagramColumn = this._panel.viewColumn;
    const otherColumns = vscode.window.tabGroups.all
      .map(group => group.viewColumn)
      .filter(column => column !== diagramColumn)
      .sort((a, b) => a - b);
    const closestToTheRight = otherColumns.find(column => diagramColumn === undefined || column > diagramColumn);
    return closestToTheRight ?? otherColumns[0] ?? vscode.ViewColumn.Beside;
  }

  private async handleReady(): Promise<void> {
    // `ready` arrives on every webview load, not just the first one: VS Code tears
    // the webview down when its tab is hidden and rebuilds it when it comes back.
    // So this must read the document's content as it is *now* - serving a snapshot
    // taken when the editor was opened would roll the canvas back to that state,
    // and the next edit on the rolled-back canvas would then be what gets saved.
    const currentDiagram = this._getDiagram();
    if (!currentDiagram) {
      return;
    }
    // Metadata enrichment (colors/authoritative edges/path repair) must never prevent the
    // diagram from loading: if the server is unreachable, unhealthy, or running an
    // older/mismatched response shape (e.g. not yet restarted after a server update),
    // fall back to rendering exactly what is on disk rather than showing nothing.
    // A failed fetch must stay distinguishable from an empty tree: treating it as
    // empty would report every node as unresolved.
    const loaded = await withDelayedProgress('Doorstop: Loading diagram…', () => this.refreshItemMeta());
    if (!loaded) {
      if (!this._metaWarningShown) {
        this._metaWarningShown = true;
        void vscode.window.showWarningMessage(
          'Doorstop diagram: could not load link data from the server (colors and edges may be incomplete). ' +
          'Item paths were not verified. If you recently updated the extension, try "Doorstop: Restart Extension".'
        );
      }
      void this._panel.webview.postMessage({ command: 'loadDiagram', diagram: currentDiagram, meta: {}, documents: {} });
      return;
    }
    const { meta, documents } = loaded;

    // Spec 025: an item moved on disk is found again by its UID. The correction only
    // dirties the document - it is persisted by the normal Save, never written here.
    const { diagram: reconciled, corrected, unresolved } = DoorstopDiagramPanel.reconcilePaths(currentDiagram, meta);
    if (corrected.length > 0) {
      this._onDiagramChanged(reconciled);
      void vscode.window.showInformationMessage(
        `Doorstop diagram: updated ${corrected.length} moved item path(s). Save to keep the changes.`
      );
    }
    // `ready` fires on every tab re-show; nagging about the same UIDs each time helps nobody.
    if (unresolved.length > 0 && !this._unresolvedWarningShown) {
      this._unresolvedWarningShown = true;
      void vscode.window.showWarningMessage(
        `Doorstop diagram: could not find item(s) ${unresolved.join(', ')} in the project; kept as stored.`
      );
    }

    const diagram = this.withAuthoritativeEdges(reconciled, meta);
    void this._panel.webview.postMessage({ command: 'loadDiagram', diagram, meta, documents });
  }

  /**
   * Matches every node's stored `fileUri` against the server's current path for its
   * UID. `path.relative`, not `===`: on Windows it ignores case, and the server and
   * `path.resolve` can disagree on the drive letter's (`c:` vs `C:`). Returns the
   * input object itself when nothing changed, so callers can skip dirtying the document.
   */
  public static reconcilePaths(
    diagram: Diagram,
    meta: Record<string, { path: string }>
  ): { diagram: Diagram; corrected: { uid: string; from: string | undefined; to: string }[]; unresolved: string[] } {
    const corrected: { uid: string; from: string | undefined; to: string }[] = [];
    const unresolved: string[] = [];
    const nodes = Array.isArray(diagram?.nodes) ? diagram.nodes : [];
    const reconciledNodes = nodes.map(node => {
      const uid = node?.id ?? node?.uid;
      if (typeof uid !== 'string') {
        return node;
      }
      const current = meta[uid]?.path;
      if (typeof current !== 'string') {
        unresolved.push(uid);
        return node;
      }
      if (typeof node.fileUri === 'string' && path.relative(node.fileUri, current) === '') {
        return node;
      }
      corrected.push({ uid, from: node.fileUri, to: current });
      return { ...node, fileUri: current };
    });
    return {
      diagram: corrected.length > 0 ? { ...diagram, nodes: reconciledNodes } : diagram,
      corrected,
      unresolved
    };
  }

  /**
   * Loads the live document/item hierarchy from the doorstop server (status flags,
   * owning document, real links) and caches it for reuse by drag-and-drop and the
   * canvas's add-link/create-item/ghost-preview flows within this panel's lifetime.
   * Returns `undefined` (rather than throwing) on any failure, so callers can tell
   * "server unreachable" apart from "server reachable, tree is empty".
   */
  private async refreshItemMeta(): Promise<{ meta: Record<string, NodeMeta>; documents: Record<string, DocMeta> } | undefined> {
    const index = await measure('diagram.load', () => loadDoorstopIndex(this._server));
    if (!index) {
      return undefined;
    }
    const meta: Record<string, NodeMeta> = {};
    const documents: Record<string, DocMeta> = {};
    for (const document of index.documents) {
      documents[document.prefix] = { prefix: document.prefix, parentPrefix: document.parentPrefix };
    }
    for (const item of index.items) {
      meta[item.uid] = {
        path: item.path,
        documentPrefix: item.documentPrefix,
        // Defensive default: an older/mismatched server response (e.g. before
        // a server restart picked up a schema change) may omit this field.
        links: Array.isArray(item.links) ? item.links : [],
        header: item.header ?? null
      };
    }
    this._itemMeta = meta;
    return { meta, documents };
  }

  /**
   * One-hop ghost adjacency over the already-cached `/tree` data (`this._itemMeta`,
   * refreshed by `refreshItemMeta` just before this is called): for every body item,
   * every item it links to (its parents) and every item that links to it (its
   * children) becomes a ghost candidate. An item related to several body items is
   * folded into a single ghost with multiple tethers (FR-006), never duplicated.
   */
  private computeGhostItems(bodyUids: string[]): GhostNode[] {
    const bodySet = new Set(bodyUids);
    const ghosts = new Map<string, GhostNode>();

    const addTether = (ghostUid: string, bodyUid: string, ghostIsParent: boolean) => {
      if (bodySet.has(ghostUid)) {
        return;
      }
      const meta = this._itemMeta[ghostUid];
      if (!meta) {
        return;
      }
      const existing = ghosts.get(ghostUid);
      if (existing) {
        // Deduplicated per (body item, direction): two items that link to each
        // other are genuinely tethered twice, once each way.
        const alreadyTethered = existing.tethers.some(
          tether => tether.bodyUid === bodyUid && tether.ghostIsParent === ghostIsParent
        );
        if (!alreadyTethered) {
          existing.tethers.push({ bodyUid, ghostIsParent });
        }
        return;
      }
      ghosts.set(ghostUid, {
        uid: ghostUid,
        fileUri: meta.path,
        header: meta.header,
        documentPrefix: meta.documentPrefix,
        tethers: [{ bodyUid, ghostIsParent }],
      });
    };

    for (const bodyUid of bodyUids) {
      const bodyMeta = this._itemMeta[bodyUid];
      if (!bodyMeta) {
        continue;
      }
      // The body item's own links point up to its parents.
      for (const link of bodyMeta.links) {
        addTether(link.uid, bodyUid, true);
      }
      // Anything whose links point back at this body item is one of its children.
      for (const [otherUid, otherMeta] of Object.entries(this._itemMeta)) {
        if (bodySet.has(otherUid)) {
          continue;
        }
        if (otherMeta.links.some(link => link.uid === bodyUid)) {
          addTether(otherUid, bodyUid, false);
        }
      }
    }

    return Array.from(ghosts.values());
  }

  /**
   * Enable: refreshes the tree cache and replies with every ghost item tethered to
   * the given on-canvas body items, or `incomplete: true` if the server couldn't be
   * reached (FR-012 — the webview must leave existing body items untouched in that
   * case). Disable: acknowledged implicitly; the webview clears its own ghost state
   * without a round trip since nothing about ghosts is ever persisted (FR-011).
   */
  private async handleRequestGhostPreview(enabled: boolean, requested: string[] | undefined): Promise<void> {
    if (!enabled) {
      return;
    }
    const bodyUids = Array.isArray(requested) ? requested : [];
    // Reuse the existing cache on the happy path (it's already populated by
    // `handleReady` on diagram load, and kept current by every mutating command's
    // own refresh) - only pay for a fresh `/tree` fetch when the cache is empty,
    // per research.md §1 / the "no new server call on the happy path" contract.
    const isCacheEmpty = Object.keys(this._itemMeta).length === 0;
    if (isCacheEmpty) {
      const refreshed = await this.refreshItemMeta();
      if (!refreshed) {
        void this._panel.webview.postMessage({ command: 'ghostPreviewData', nodes: [], edges: [], incomplete: true });
        return;
      }
    }
    const nodes = this.computeGhostItems(bodyUids);
    // Same orientation as the body-to-body edges built by `withAuthoritativeEdges`:
    // the edge runs child -> parent, so the arrowhead lands on the parent whichever
    // side of the link the ghost happens to be on.
    const edges = nodes.flatMap(node =>
      node.tethers.map(tether => tether.ghostIsParent
        ? { from: tether.bodyUid, to: node.uid, ephemeral: true }
        : { from: node.uid, to: tether.bodyUid, ephemeral: true })
    );
    void this._panel.webview.postMessage({ command: 'ghostPreviewData', nodes, edges, incomplete: false });
  }

  /**
   * Promotes a ghost item to a real body item by reusing the same resolution path
   * as drag-and-drop / "Add to Diagram" (`handleDroppedData`), then opens its file
   * in the diagram's secondary editor column - the same place clicking any other
   * node already opens its file - matching this extension's existing "jump to new
   * items" convention (FR-015).
   */
  private async handlePromoteGhost(fileUri: unknown, pointer: Pointer | undefined): Promise<void> {
    if (typeof fileUri !== 'string' || fileUri.length === 0) {
      return;
    }
    try {
      await this.handleDroppedData(fileUri, pointer || { x: 0, y: 0 });
      await vscode.window.showTextDocument(vscode.Uri.file(fileUri), {
        viewColumn: this.getOrCreateSideColumn(),
        preview: false
      });
    } catch (e) {
      void vscode.window.showErrorMessage(`Could not add ghost item to diagram: ${errorMessage(e)}`);
    }
  }

  /**
   * Recomputes edges for every node the server knows about from its real `links`
   * data (so canvas edges never drift from the actual doorstop traceability data),
   * while preserving any persisted edge touching a node the server doesn't know
   * about (e.g. an orphaned/malformed file) so drag-and-drop history isn't lost.
   */
  private withAuthoritativeEdges(diagram: Diagram, meta: Record<string, NodeMeta>): Diagram {
    const nodes = Array.isArray(diagram?.nodes) ? diagram.nodes : [];
    const nodeIds = new Set(nodes.map(n => n.id ?? n.uid));
    const edges: DiagramEdge[] = [];
    const seen = new Set<string>();

    for (const nodeId of nodeIds) {
      const nodeMeta = nodeId === undefined ? undefined : meta[nodeId];
      if (!nodeId || !nodeMeta || !Array.isArray(nodeMeta.links)) {
        continue;
      }
      for (const link of nodeMeta.links) {
        if (nodeIds.has(link.uid)) {
          const key = `${nodeId}->${link.uid}`;
          if (!seen.has(key)) {
            seen.add(key);
            edges.push({ from: nodeId, to: link.uid, arrows: 'to' });
          }
        }
      }
    }

    // FR-007: keep a persisted edge whenever *either* endpoint is unknown to the
    // server (an orphaned or renamed file). Checking only `from` silently dropped
    // edges whose `to` had gone missing - exactly the case the rule exists for.
    for (const edge of Array.isArray(diagram?.edges) ? diagram.edges : []) {
      if (!meta[edge.from] || !meta[edge.to]) {
        const key = `${edge.from}->${edge.to}`;
        if (!seen.has(key)) {
          seen.add(key);
          edges.push(edge);
        }
      }
    }

    return { ...diagram, edges };
  }

  /** Add or remove one link from the canvas, and tell the webview how it went. */
  private async handleLinkChange(kind: 'addLink' | 'removeLink', from: string | undefined, to: string | undefined): Promise<void> {
    const adding = kind === 'addLink';
    const resultCommand = adding ? 'linkAddResult' : 'linkRemoveResult';
    if (!from || !to) {
      void this._panel.webview.postMessage({ command: resultCommand, from, to, success: false, error: 'Doorstop server is not available.' });
      return;
    }
    try {
      await withDelayedProgress(adding ? 'Doorstop: Add Link…' : 'Doorstop: Remove Link…', () => adding
        ? this._server.request('POST', `/items/${encodeURIComponent(from)}/links`, { parentUid: to })
        : this._server.request('DELETE', `/items/${encodeURIComponent(from)}/links/${encodeURIComponent(to)}`));
      void this._panel.webview.postMessage({ command: resultCommand, from, to, success: true });
      await vscode.commands.executeCommand('doorstop.refresh');
    } catch (e) {
      const error = errorMessage(e);
      void vscode.window.showErrorMessage(`Could not ${adding ? 'add' : 'remove'} link: ${error}`);
      void this._panel.webview.postMessage({ command: resultCommand, from, to, success: false, error });
    }
  }

  /**
   * Right-click-on-node "add linked item" flow: quickselect a target document,
   * create a new item there, link it to the source item, place it on the canvas,
   * and jump to it.
   */
  private async handleCreateLinkedItem(sourceUid: string | undefined, pointer: Pointer | undefined): Promise<void> {
    if (!sourceUid) {
      return;
    }
    const prefix = await choosePrefix(this._treeProvider);
    if (!prefix) {
      return;
    }
    try {
      const server = this._server;
      const created = await withDelayedProgress('Doorstop: Create Linked Item…', async () => {
        const item = await server.request<AddedItem>('POST', `/documents/${encodeURIComponent(prefix)}/items`, {});
        await server.request('POST', `/items/${encodeURIComponent(item.uid)}/links`, { parentUid: sourceUid });
        return item;
      });

      void this._panel.webview.postMessage({
        command: 'addNode',
        node: {
          uid: created.uid,
          fileUri: created.path,
          title: '',
          links: [sourceUid],
          pointer: pointer || { x: 0, y: 0 },
          documentPrefix: prefix,
        }
      });

      await vscode.commands.executeCommand('doorstop.refresh');
      await vscode.commands.executeCommand('doorstop.activateRequirement', created.path);
      await vscode.window.showTextDocument(vscode.Uri.file(created.path), {
        viewColumn: this.getOrCreateSideColumn(),
        preview: false
      });
    } catch (e) {
      void vscode.window.showErrorMessage(`Could not create linked item: ${errorMessage(e)}`);
    }
  }

  /**
   * Adds a requirement through a command (the tree view's context menu) instead of
   * drag-and-drop: VS Code does not reliably hand a TreeDragAndDropController's
   * payload to a webview as a DataTransfer (a known platform limitation).
   */
  public async addRequirementToDiagram(fileUri: string): Promise<void> {
    this._panel.reveal();
    // There is no real drop point on this path. Rather than scattering the node
    // to a random position (which could land it on top of an existing one), the
    // webview searches for a slot that overlaps nothing (spec 015 FR-015) -
    // only it can, since node extents don't exist on this side.
    await this.handleDroppedData(fileUri, { x: 0, y: 0 }, true);
  }

  /**
   * After a crash or reload VS Code hands back the backup it last took, and the
   * editor must reopen from that hot-exit copy rather than from the (stale)
   * file on disk - otherwise every unsaved diagram edit is silently lost.
   * backupCustomDocument returns the destination URI as the backup id.
   * A missing or unreadable backup falls back to the saved file.
   */
  public static async readDiagramOrBackup(uri: vscode.Uri, backupId?: string): Promise<Diagram> {
    if (backupId) {
      try {
        return await DoorstopDiagramPanel.readDiagram(vscode.Uri.parse(backupId));
      } catch (e) {
        console.warn('[Doorstop][diagram] Backup could not be read, falling back to the saved file:', e);
      }
    }
    return DoorstopDiagramPanel.readDiagram(uri);
  }

  public static async readDiagram(uri: vscode.Uri): Promise<Diagram> {
    const content = await vscode.workspace.fs.readFile(uri);
    const rawContent = Buffer.from(content).toString('utf8').trim();
    if (rawContent.length === 0) {
      return { nodes: [], edges: [] };
    }

    const diagram = JSON.parse(rawContent) as Diagram;
    if (!diagram || !Array.isArray(diagram.nodes) || !Array.isArray(diagram.edges)) {
      throw new Error('Invalid diagram format');
    }

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      return diagram;
    }

    return {
      ...diagram,
      nodes: diagram.nodes.map(node => ({
        ...node,
        fileUri: typeof node.fileUri === 'string' && !path.isAbsolute(node.fileUri)
          ? path.resolve(workspaceRoot, node.fileUri)
          : node.fileUri
      }))
    };
  }

  public static serializeDiagram(diagram: unknown): Uint8Array {
    return Buffer.from(JSON.stringify(DoorstopDiagramPanel.makePathsRelative(diagram), null, 2), 'utf8');
  }

  private static makePathsRelative(diagram: unknown): unknown {
    if (!diagram || typeof diagram !== 'object' || !('nodes' in diagram) || !Array.isArray(diagram.nodes)) {
      return diagram;
    }

    return {
      ...diagram,
      nodes: (diagram.nodes as DiagramNode[]).map(node => ({
        ...node,
        fileUri: typeof node.fileUri === 'string'
          ? DoorstopDiagramPanel.toWorkspaceRelativePath(node.fileUri)
          : node.fileUri
      }))
    };
  }

  private static toWorkspaceRelativePath(filePath: string): string {
    const workspaceFolder = vscode.workspace.workspaceFolders?.find(folder => {
      const relativePath = path.relative(folder.uri.fsPath, filePath);
      return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
    });

    if (!workspaceFolder) {
      return filePath;
    }

    return path.relative(workspaceFolder.uri.fsPath, filePath).replace(/\\/g, '/');
  }

  /**
   * Resolves dropped text - a file path or URI (editor tab, URI list) or a bare UID
   * (text selected in an editor) - and sends the full node data to the webview.
   * Path, title and links come only from the server's metadata (GET /tree); a bare
   * UID is never looked up by globbing for files (see src/doorstopIndex.ts).
   */
  private async handleDroppedData(droppedText: string, pointer: Pointer, autoPlace = false): Promise<void> {
    if (typeof droppedText !== 'string' || droppedText.trim().length === 0) {
      return;
    }

    const uid = droppedTextToUid(droppedText);

    const knownMeta = this._itemMeta[uid];
    if (!knownMeta) {
      console.warn('[Doorstop][drop] No server metadata for UID:', JSON.stringify(uid));
      void vscode.window.showWarningMessage(
        `Doorstop diagram: the Doorstop server does not know "${uid}". Refresh the tree ` +
        'or run "Doorstop: Restart Extension".'
      );
      return;
    }
    try {
      const title = knownMeta.header ?? '';
      await this._panel.webview.postMessage({
        command: 'addNode',
        node: {
          uid,
          fileUri: knownMeta.path,
          title,
          header: title,
          links: knownMeta.links.map(link => link.uid),
          pointer,
          autoPlace,
          documentPrefix: knownMeta.documentPrefix,
        }
      });
    } catch (e) {
      console.error('[Doorstop][drop] Failed to deliver requirement:', e);
      void vscode.window.showErrorMessage(`Doorstop diagram: could not add "${uid}" to the diagram.`);
    }
  }

  private _getHtmlForWebview(): string {
    const webview = this._panel.webview;
    const assetRoot = vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'diagram');
    const templatePath = vscode.Uri.joinPath(assetRoot, 'diagram.html').fsPath;
    const template = fs.readFileSync(templatePath, 'utf8');

    const assetUri = (file: string) => webview.asWebviewUri(vscode.Uri.joinPath(assetRoot, file)).toString();

    const values: Record<string, string> = {
      cspSource: webview.cspSource,
      nonce: getNonce(),
      styleUri: assetUri('diagram.css'),
      visCssUri: assetUri('vendor/vis-network.min.css'),
      visJsUri: assetUri('vendor/vis-network.min.js'),
      stateJsUri: assetUri('state.js'),
      layoutJsUri: assetUri('layout.js'),
      renderJsUri: assetUri('render.js'),
      interactionsJsUri: assetUri('interactions.js'),
      messagingJsUri: assetUri('messaging.js'),
      mainJsUri: assetUri('main.js')
    };

    return template.replace(/\{\{(\w+)\}\}/g, (_match, key) => values[key] ?? '');
  }

  public dispose(): void {
    DoorstopDiagramPanel.open.delete(this);
    if (DoorstopDiagramPanel.lastActive === this) {
      DoorstopDiagramPanel.lastActive = undefined;
    }
    this._panel.dispose();
    while (this._disposables.length) {
      this._disposables.pop()?.dispose();
    }
  }
}

interface DoorstopDiagramDocument extends vscode.CustomDocument {
  diagram: Diagram;
}

/**
 * The `*.doorstop.json` custom editor, the "New Diagram" and "Add to Diagram"
 * commands, and the tree's drag source. Returns the drag-and-drop controller the
 * Doorstop tree view is created with.
 */
export function registerDiagramEditor(
  context: vscode.ExtensionContext,
  server: DoorstopServer,
  treeProvider: DoorstopTreeProvider
): vscode.TreeDragAndDropController<RequirementTreeItem> {
  const newDiagramCmd = registerCommand('doorstop.newDiagram', async () => {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const defaultUri = workspaceFolder
      ? vscode.Uri.joinPath(workspaceFolder.uri, 'diagram.doorstop.json')
      : undefined;
    const target = await vscode.window.showSaveDialog({
      defaultUri,
      filters: { 'Doorstop Diagram': ['doorstop.json'] },
      saveLabel: 'Create Diagram'
    });
    if (!target) {
      return;
    }
    // showSaveDialog does not reliably append compound extensions; the CustomEditor
    // only activates for files matching the "*.doorstop.json" filenamePattern.
    const uri = target.fsPath.endsWith('.doorstop.json')
      ? target
      : vscode.Uri.file(target.fsPath.replace(/\.json$/i, '') + '.doorstop.json');
    try {
      await vscode.workspace.fs.writeFile(uri, DoorstopDiagramPanel.serializeDiagram({ nodes: [], edges: [] }));
      await vscode.commands.executeCommand('vscode.openWith', uri, 'doorstop.diagram');
    } catch (e) {
      void vscode.window.showErrorMessage(`Failed to create diagram: ${errorMessage(e)}`);
    }
  });

  const documentChangeEvent = new vscode.EventEmitter<vscode.CustomDocumentContentChangeEvent<DoorstopDiagramDocument>>();
  const diagramEditorProvider: vscode.CustomEditorProvider<DoorstopDiagramDocument> = {
    onDidChangeCustomDocument: documentChangeEvent.event,
    async openCustomDocument(uri, openContext) {
      return {
        uri,
        diagram: await DoorstopDiagramPanel.readDiagramOrBackup(uri, openContext.backupId),
        dispose() { }
      };
    },
    resolveCustomEditor(document, webviewPanel) {
      DoorstopDiagramPanel.createForCustomEditor(
        webviewPanel,
        context.extensionUri,
        // Getter, not a snapshot: the webview reloads whenever its tab is hidden and
        // shown again, and must be handed the document's content as it is *now*.
        () => document.diagram,
        diagram => {
          document.diagram = diagram;
          documentChangeEvent.fire({ document });
        },
        server,
        treeProvider
      );
    },
    async saveCustomDocument(document) {
      await vscode.workspace.fs.writeFile(document.uri, DoorstopDiagramPanel.serializeDiagram(document.diagram));
    },
    async saveCustomDocumentAs(document, destination) {
      await vscode.workspace.fs.writeFile(destination, DoorstopDiagramPanel.serializeDiagram(document.diagram));
    },
    async revertCustomDocument(document) {
      document.diagram = await DoorstopDiagramPanel.readDiagram(document.uri);
    },
    async backupCustomDocument(document, backupContext) {
      await vscode.workspace.fs.writeFile(backupContext.destination, DoorstopDiagramPanel.serializeDiagram(document.diagram));
      return {
        id: backupContext.destination.toString(),
        delete: () => vscode.workspace.fs.delete(backupContext.destination)
      };
    }
  };
  const customEditor = vscode.window.registerCustomEditorProvider('doorstop.diagram', diagramEditorProvider);

  const addToDiagramCmd = registerCommand('doorstop.addToDiagram', (item?: RequirementTreeItem) => {
    if (!item?.resourceUri) {
      return;
    }
    const panel = DoorstopDiagramPanel.target;
    if (!panel) {
      void vscode.window.showInformationMessage('Open a diagram file (*.doorstop.json) or create one with "New Diagram" first.');
      return;
    }
    void panel.addRequirementToDiagram(item.resourceUri.fsPath);
  });

  context.subscriptions.push(newDiagramCmd, documentChangeEvent, customEditor, addToDiagramCmd);

  return {
    dragMimeTypes: [
      'application/vnd.code.tree.doorstop.treeView',
      'text/plain',
      'text/uri-list'
    ],
    dropMimeTypes: [],
    handleDrag(source, dataTransfer) {
      const item = source[0];
      if (item && item.resourceUri) {
        const payload = JSON.stringify({
          uid: item.itemData?.uid || item.label,
          fileUri: item.resourceUri.fsPath,
          title: item.title
        });
        dataTransfer.set('application/vnd.code.tree.doorstop.treeView', new vscode.DataTransferItem(payload));
        dataTransfer.set('text/plain', new vscode.DataTransferItem(item.resourceUri.fsPath));
        dataTransfer.set('text/uri-list', new vscode.DataTransferItem(item.resourceUri.toString()));
      }
    }
  };
}
