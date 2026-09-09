import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'js-yaml';

import { DoorstopServer } from './doorstopServer';
import { DoorstopTreeProvider } from './requirementTree';
import { choosePrefix, AddedItem } from './doorstopCommands';
import { LinkInfo, TreeResponse } from './doorstopTypes';

interface NodeMeta {
    documentPrefix: string;
    active: boolean;
    normative: boolean;
    derived: boolean;
    reviewed: boolean;
    cleared: boolean;
    links: LinkInfo[];
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

export class DoorstopDiagramPanel {
    public static currentPanel: DoorstopDiagramPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private readonly _initialDiagram?: any;
    private readonly _onDiagramChanged?: (diagram: any) => void;
    private readonly _server?: DoorstopServer;
    private readonly _treeProvider?: DoorstopTreeProvider;
    private _itemMeta: Record<string, NodeMeta> = {};
    private _metaWarningShown = false;
    private _disposables: vscode.Disposable[] = [];

      public static async createForCustomEditor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        diagram: any,
        onDiagramChanged: (diagram: any) => void,
        server: DoorstopServer,
        treeProvider: DoorstopTreeProvider
      ) {
        DoorstopDiagramPanel.currentPanel = new DoorstopDiagramPanel(panel, extensionUri, diagram, onDiagramChanged, server, treeProvider);
      }

      private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        initialDiagram?: any,
        onDiagramChanged?: (diagram: any) => void,
        server?: DoorstopServer,
        treeProvider?: DoorstopTreeProvider
      ) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._initialDiagram = initialDiagram;
        this._onDiagramChanged = onDiagramChanged;
        this._server = server;
        this._treeProvider = treeProvider;
        this._panel.webview.options = {
          enableScripts: true,
          localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist', 'webview')]
        };
        this._panel.webview.html = this._getHtmlForWebview();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'openFile':
                        return this.handleOpenFile(message);
                    case 'activateNode':
                        return this.handleActivateNode(message);
                    case 'resolveDroppedItem':
                        return this.handleResolveDroppedItem(message);
                    case 'diagramChanged':
                        return this.handleDiagramChanged(message);
                    case 'ready':
                        return this.handleReady();
                    case 'addLink':
                        return this.handleAddLink(message);
                    case 'removeLink':
                        return this.handleRemoveLink(message);
                    case 'createLinkedItem':
                        return this.handleCreateLinkedItem(message);
                }
            },
            null,
            this._disposables
        );
    }

    private async handleOpenFile(message: any): Promise<void> {
        if (!message.fileUri) {
            return;
        }
        const uri = vscode.Uri.file(message.fileUri);
        const preview = Boolean(message.preview);
        await vscode.window.showTextDocument(uri, {
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

    private async handleActivateNode(message: any): Promise<void> {
        console.log('[Doorstop][webview] activateNode:', JSON.stringify(message.fileUri));
        if (message.fileUri) {
            await vscode.commands.executeCommand('doorstop.activateRequirement', message.fileUri);
        }
    }

    private async handleResolveDroppedItem(message: any): Promise<void> {
        console.log('[Doorstop][webview] resolveDroppedItem:', JSON.stringify(message.droppedText));
        // Löst gezogene IDs oder Datei-Pfade serverseitig in VS Code auf
        if (typeof message.droppedText === 'string' && message.droppedText.trim().length > 0) {
            await this.handleDroppedData(message.droppedText, message.pointer);
        } else {
            console.warn('[Doorstop][webview] Ignoring empty drop payload');
        }
    }

    private handleDiagramChanged(message: any): void {
        this._onDiagramChanged?.(message.diagram);
    }

    private async handleReady(): Promise<void> {
        if (!this._initialDiagram) {
            return;
        }
        // Metadata enrichment (status/colors/authoritative edges) must never prevent the
        // diagram from loading: if the server is unreachable, unhealthy, or running an
        // older/mismatched response shape (e.g. not yet restarted after a server update),
        // fall back to rendering exactly what is on disk rather than showing nothing.
        let meta: Record<string, NodeMeta> = {};
        let documents: Record<string, DocMeta> = {};
        let diagram = this._initialDiagram;
        try {
            ({ meta, documents } = await this.fetchTreeMeta());
            diagram = this.withAuthoritativeEdges(this._initialDiagram, meta);
        } catch (e) {
            console.warn('[Doorstop][diagram] Falling back to on-disk diagram without server metadata:', e);
            if (!this._metaWarningShown) {
                this._metaWarningShown = true;
                vscode.window.showWarningMessage(
                    'Doorstop diagram: could not load link/status data from the server (colors, badges and edges may be incomplete). ' +
                    'If you recently updated the extension, try "Doorstop: Restart Server".'
                );
            }
        }
        this._panel.webview.postMessage({ command: 'loadDiagram', diagram, meta, documents });
    }

    /**
     * Loads the live document/item hierarchy from the doorstop server (status flags,
     * owning document, real links) and caches it for reuse by drag-and-drop and the
     * canvas's add-link/create-item flows within this panel's lifetime.
     */
    private async fetchTreeMeta(): Promise<{ meta: Record<string, NodeMeta>; documents: Record<string, DocMeta> }> {
        if (!this._server) {
            return { meta: {}, documents: {} };
        }
        try {
            const tree = await this._server.request<TreeResponse>('GET', '/tree');
            const meta: Record<string, NodeMeta> = {};
            const documents: Record<string, DocMeta> = {};
            for (const document of tree.documents) {
                documents[document.prefix] = { prefix: document.prefix, parentPrefix: document.parentPrefix };
                for (const item of document.items) {
                    meta[item.uid] = {
                        documentPrefix: document.prefix,
                        active: item.active,
                        normative: item.normative,
                        derived: item.derived,
                        reviewed: item.reviewed,
                        cleared: item.cleared,
                        // Defensive default: an older/mismatched server response (e.g. before
                        // a server restart picked up a schema change) may omit this field.
                        links: Array.isArray(item.links) ? item.links : []
                    };
                }
            }
            this._itemMeta = meta;
            return { meta, documents };
        } catch (e) {
            console.warn('[Doorstop][diagram] Failed to fetch /tree metadata:', e);
            return { meta: {}, documents: {} };
        }
    }

    /**
     * Recomputes edges for every node the server knows about from its real `links`
     * data (so canvas edges never drift from the actual doorstop traceability data),
     * while preserving any persisted edge touching a node the server doesn't know
     * about (e.g. an orphaned/malformed file) so drag-and-drop history isn't lost.
     */
    private withAuthoritativeEdges(diagram: any, meta: Record<string, NodeMeta>): any {
        const nodes: any[] = Array.isArray(diagram?.nodes) ? diagram.nodes : [];
        const nodeIds = new Set(nodes.map((n: any) => n.id ?? n.uid));
        const edges: any[] = [];
        const seen = new Set<string>();

        for (const nodeId of nodeIds) {
            const nodeMeta = meta[nodeId];
            if (!nodeMeta || !Array.isArray(nodeMeta.links)) {
                continue;
            }
            for (const link of nodeMeta.links) {
                if (nodeIds.has(link.uid)) {
                    const key = `${nodeId}->${link.uid}`;
                    if (!seen.has(key)) {
                        seen.add(key);
                        edges.push({ from: nodeId, to: link.uid, arrows: 'to', suspect: link.suspect });
                    }
                }
            }
        }

        for (const edge of Array.isArray(diagram?.edges) ? diagram.edges : []) {
            if (!meta[edge.from]) {
                const key = `${edge.from}->${edge.to}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    edges.push(edge);
                }
            }
        }

        return { ...diagram, edges };
    }

    private async handleAddLink(message: any): Promise<void> {
        const { from, to } = message;
        if (!this._server || !from || !to) {
            this._panel.webview.postMessage({ command: 'linkAddResult', from, to, success: false, error: 'Doorstop server is not available.' });
            return;
        }
        try {
            await this._server.request('POST', `/items/${encodeURIComponent(from)}/links`, { parentUid: to });
            this._panel.webview.postMessage({ command: 'linkAddResult', from, to, success: true });
            await vscode.commands.executeCommand('doorstop.refresh');
        } catch (e) {
            const error = e instanceof Error ? e.message : String(e);
            vscode.window.showErrorMessage(`Could not add link: ${error}`);
            this._panel.webview.postMessage({ command: 'linkAddResult', from, to, success: false, error });
        }
    }

    private async handleRemoveLink(message: any): Promise<void> {
        const { from, to } = message;
        if (!this._server || !from || !to) {
            this._panel.webview.postMessage({ command: 'linkRemoveResult', from, to, success: false, error: 'Doorstop server is not available.' });
            return;
        }
        try {
            await this._server.request('DELETE', `/items/${encodeURIComponent(from)}/links/${encodeURIComponent(to)}`);
            this._panel.webview.postMessage({ command: 'linkRemoveResult', from, to, success: true });
            await vscode.commands.executeCommand('doorstop.refresh');
        } catch (e) {
            const error = e instanceof Error ? e.message : String(e);
            vscode.window.showErrorMessage(`Could not remove link: ${error}`);
            this._panel.webview.postMessage({ command: 'linkRemoveResult', from, to, success: false, error });
        }
    }

    /**
     * Right-click-on-node "add linked item" flow: quickselect a target document,
     * create a new item there, link it to the source item, place it on the canvas,
     * and jump to it.
     */
    private async handleCreateLinkedItem(message: any): Promise<void> {
        const { sourceUid, pointer } = message;
        if (!this._server || !this._treeProvider || !sourceUid) {
            return;
        }
        const prefix = await choosePrefix(this._treeProvider);
        if (!prefix) {
            return;
        }
        try {
            const created = await this._server.request<AddedItem>('POST', `/documents/${encodeURIComponent(prefix)}/items`, {});
            await this._server.request('POST', `/items/${encodeURIComponent(created.uid)}/links`, { parentUid: sourceUid });

            this._panel.webview.postMessage({
                command: 'addNode',
                node: {
                    uid: created.uid,
                    fileUri: created.path,
                    title: '',
                    links: [sourceUid],
                    pointer: pointer || { x: 0, y: 0 },
                    documentPrefix: prefix,
                    active: true,
                    normative: true,
                    derived: false,
                    reviewed: false,
                    cleared: true
                }
            });

            await vscode.commands.executeCommand('doorstop.refresh');
            await vscode.commands.executeCommand('doorstop.activateRequirement', created.path);
            await vscode.window.showTextDocument(vscode.Uri.file(created.path));
        } catch (e) {
            const error = e instanceof Error ? e.message : String(e);
            vscode.window.showErrorMessage(`Could not create linked item: ${error}`);
        }
    }

    /**
     * Fügt ein Requirement über einen Befehl (z. B. Kontextmenü der TreeView) statt per Drag&Drop hinzu.
     * Notwendig, weil VS Code Drag-Payloads aus einem TreeDragAndDropController nicht zuverlässig
     * als DataTransfer im Webview ankommen (bekannte Plattform-Einschränkung).
     */
    public async addRequirementToDiagram(fileUri: string): Promise<void> {
        this._panel.reveal();
        const pointer = {
            x: Math.round((Math.random() - 0.5) * 300),
            y: Math.round((Math.random() - 0.5) * 300)
        };
        await this.handleDroppedData(fileUri, pointer);
    }

            public static async readDiagram(uri: vscode.Uri): Promise<any> {
              const content = await vscode.workspace.fs.readFile(uri);
              const rawContent = Buffer.from(content).toString('utf8').trim();
              if (rawContent.length === 0) {
                return { nodes: [], edges: [] };
              }

              const diagram = JSON.parse(rawContent);
              if (!diagram || !Array.isArray(diagram.nodes) || !Array.isArray(diagram.edges)) {
                throw new Error('Invalid diagram format');
              }

              const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
              if (!workspaceRoot) {
                return diagram;
              }

              return {
                ...diagram,
                nodes: diagram.nodes.map((node: any) => ({
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
                nodes: diagram.nodes.map((node: any) => ({
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
     * Löst gedroppten Text/URI auf und schickt die vollständigen Node-Daten an den Webview
     */
    private async handleDroppedData(droppedText: string, pointer: { x: number; y: number }) {
      console.log('[Doorstop][drop] Received:', JSON.stringify(droppedText), 'at', pointer);
        let targetFilePath: string | undefined = undefined;
        let uid: string | undefined = undefined;

        if (typeof droppedText !== 'string' || droppedText.trim().length === 0) {
          console.warn('[Doorstop][drop] Ignoring invalid payload');
          return;
        }

        const cleanText = droppedText.trim().split(/\r?\n/)[0];
        const parsedUri = cleanText.startsWith('file:') ? vscode.Uri.parse(cleanText) : undefined;
        const localPath = parsedUri ? parsedUri.fsPath : decodeURIComponent(cleanText);
        console.log('[Doorstop][drop] Parsed local path:', JSON.stringify(localPath));

        // 1. Fall: Pfad aus Dateireiter oder URI-List
        if (fs.existsSync(localPath) || localPath.includes('/') || localPath.includes('\\')) {
          targetFilePath = path.normalize(localPath);
            uid = path.basename(targetFilePath).replace(/\.(yml|md)$/, '');
          console.log('[Doorstop][drop] Resolved file path and UID:', JSON.stringify(targetFilePath), JSON.stringify(uid));
        } else {
            // 2. Fall: Nur UID/Text aus Editor markiert (z. B. "REQ-002")
            uid = cleanText;
            const excludePattern = '**/{node_modules,.git,out,dist,.venv,venv}/**';
            const files = await vscode.workspace.findFiles(`**/${uid}.{yml,md}`, excludePattern);
            if (files.length > 0) {
                targetFilePath = files[0].fsPath;
            }
        }

        if (!targetFilePath || !fs.existsSync(targetFilePath)) {
          console.warn('[Doorstop][drop] Requirement file not found:', JSON.stringify(targetFilePath));
            vscode.window.showWarningMessage(`Konnte Requirement für "${droppedText}" nicht finden.`);
            return;
        }

        // Details & Links auslesen: bevorzugt aus den vom Server geladenen Metadaten,
        // sonst Fallback auf direktes Parsen der YAML/Markdown-Frontmatter.
        const knownMeta = uid ? this._itemMeta[uid] : undefined;
        try {
            let title: string;
            let links: string[];

            if (knownMeta) {
                const content = fs.readFileSync(targetFilePath, 'utf8');
                let yamlContent = content;
                if (content.startsWith('---')) {
                    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
                    if (match) {yamlContent = match[1];}
                }
                const data: any = yaml.load(yamlContent) || {};
                title = data.header || data.title || '';
                links = knownMeta.links.map(l => l.uid);
            } else {
                const content = fs.readFileSync(targetFilePath, 'utf8');
              console.log('[Doorstop][drop] Read requirement bytes:', content.length);
                let yamlContent = content;

                if (content.startsWith('---')) {
                    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
                    if (match) {yamlContent = match[1];}
                }

                const data: any = yaml.load(yamlContent) || {};
                title = data.header || data.title || '';
                links = [];

                if (Array.isArray(data.links)) {
                    for (const l of data.links) {
                        const targetId = typeof l === 'string' ? l : l.item;
                        if (targetId) {links.push(String(targetId));}
                    }
                }
            }

            // Knotendaten zurück an Webview schicken
            const delivered = await this._panel.webview.postMessage({
                command: 'addNode',
                node: {
                    uid,
                    fileUri: targetFilePath,
                    title,
                    links,
                    pointer,
                    documentPrefix: knownMeta?.documentPrefix,
                    active: knownMeta?.active,
                    normative: knownMeta?.normative,
                    derived: knownMeta?.derived,
                    reviewed: knownMeta?.reviewed,
                    cleared: knownMeta?.cleared
                }
            });
              console.log('[Doorstop][drop] addNode delivered:', delivered);
        } catch (e) {
              console.error('[Doorstop][drop] Failed to read or deliver requirement:', e);
            vscode.window.showErrorMessage(`Fehler beim Lesen der Requirement-Datei.`);
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
            stateJsUri: assetUri('state.js'),
            renderJsUri: assetUri('render.js'),
            interactionsJsUri: assetUri('interactions.js'),
            messagingJsUri: assetUri('messaging.js'),
            mainJsUri: assetUri('main.js')
        };

        return template.replace(/\{\{(\w+)\}\}/g, (_match, key) => values[key] ?? '');
    }
    public dispose() {
        DoorstopDiagramPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {x.dispose();}
        }
    }
}
