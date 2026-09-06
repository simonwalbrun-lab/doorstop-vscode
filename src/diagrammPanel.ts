import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'js-yaml';

export class DoorstopDiagramPanel {
    public static currentPanel: DoorstopDiagramPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _initialDiagram?: any;
    private readonly _onDiagramChanged?: (diagram: any) => void;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri) {
        if (DoorstopDiagramPanel.currentPanel) {
            DoorstopDiagramPanel.currentPanel._panel.reveal(vscode.ViewColumn.One);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'doorstopDiagram',
            'Doorstop Traceability Graph',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
                retainContextWhenHidden: true // <--- DIESE ZEILE HINZUFÜGEN
            }
        );
        DoorstopDiagramPanel.currentPanel = new DoorstopDiagramPanel(panel, extensionUri);
    }

      public static async createForCustomEditor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        diagram: any,
        onDiagramChanged: (diagram: any) => void
      ) {
        DoorstopDiagramPanel.currentPanel = new DoorstopDiagramPanel(panel, extensionUri, diagram, onDiagramChanged);
      }

      private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        initialDiagram?: any,
        onDiagramChanged?: (diagram: any) => void
      ) {
        this._panel = panel;
        this._initialDiagram = initialDiagram;
        this._onDiagramChanged = onDiagramChanged;
        this._panel.webview.options = {
          enableScripts: true,
          localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
        };
        this._panel.webview.html = this._getHtmlForWebview();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'openFile': {
                        if (message.fileUri) {
                            const uri = vscode.Uri.file(message.fileUri);
                            await vscode.window.showTextDocument(uri);
                        }
                        return;
                    }
                    case 'activateNode': {
                      console.log('[Doorstop][webview] activateNode:', JSON.stringify(message.fileUri));
                      if (message.fileUri) {
                        await vscode.commands.executeCommand('doorstop.activateRequirement', message.fileUri);
                      }
                      return;
                    }
                    case 'resolveDroppedItem': {
                      console.log('[Doorstop][webview] resolveDroppedItem:', JSON.stringify(message.droppedText));
                        // Löst gezogene IDs oder Datei-Pfade serverseitig in VS Code auf
                        if (typeof message.droppedText === 'string' && message.droppedText.trim().length > 0) {
                          await this.handleDroppedData(message.droppedText, message.pointer);
                        } else {
                          console.warn('[Doorstop][webview] Ignoring empty drop payload');
                        }
                        return;
                    }
                    case 'diagramChanged': {
                      this._onDiagramChanged?.(message.diagram);
                      return;
                    }
                    case 'ready': {
                      if (this._initialDiagram) {
                        this._panel.webview.postMessage({
                          command: 'loadDiagram',
                          diagram: this._initialDiagram
                        });
                      }
                      return;
                    }
                }
            },
            null,
            this._disposables
        );
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

        // Details & Links auslesen
        try {
            const content = fs.readFileSync(targetFilePath, 'utf8');
          console.log('[Doorstop][drop] Read requirement bytes:', content.length);
            let yamlContent = content;

            if (content.startsWith('---')) {
                const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
                if (match) {yamlContent = match[1];}
            }

            const data: any = yaml.load(yamlContent) || {};
            const title = data.header || data.title || '';
            const links: string[] = [];

            if (Array.isArray(data.links)) {
                for (const l of data.links) {
                    const targetId = typeof l === 'string' ? l : l.item;
                    if (targetId) {links.push(String(targetId));}
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
                    pointer
                }
            });
              console.log('[Doorstop][drop] addNode delivered:', delivered);
        } catch (e) {
              console.error('[Doorstop][drop] Failed to read or deliver requirement:', e);
            vscode.window.showErrorMessage(`Fehler beim Lesen der Requirement-Datei.`);
        }
    }

    private _getHtmlForWebview(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Doorstop Graph</title>
  <script type="text/javascript" src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
  <style>
    html, body {
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 0;
      overflow: hidden;
      background-color: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-font-family);
    }
    #mynetwork {
      width: 100vw;
      height: 100vh;
    }
    #drop-hint {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 1.2rem;
      color: var(--vscode-descriptionForeground);
      pointer-events: none;
      border: 2px dashed var(--vscode-descriptionForeground);
      padding: 20px 40px;
      border-radius: 8px;
    }
  </style>
</head>
<body>
  <div id="drop-hint">Ziehe Requirements aus der TreeView oder dem Editor hierher</div>
  <div id="mynetwork"></div>

  <script>
    const vscode = acquireVsCodeApi();
    
    const visNodes = new vis.DataSet([]);
    const visEdges = new vis.DataSet([]);
    const nodeMap = new Map();

    const container = document.getElementById('mynetwork');
    const data = { nodes: visNodes, edges: visEdges };
    
    const options = {
      physics: { enabled: true, barnesHut: { gravitationalConstant: -2000 } },
      interaction: { dragNodes: true, dragView: true, zoomView: true }
    };

    const network = new vis.Network(container, data, options);

    vscode.postMessage({ command: 'ready' });

    // -------------------------------------------------------------
    // STATE MANAGEMENT (PERSISTENZ)
    // -------------------------------------------------------------
    
    // Hilfsfunktion: Speichert den aktuellen Graph-Zustand in VS Code
    function saveGraphState() {
      const rawNodes = visNodes.get();
      const positions = network.getPositions();
      const stateData = rawNodes.map(node => ({
        uid: node.id,
        fileUri: nodeMap.get(node.id),
        title: node.label.split('\\n')[1] || '',
        x: positions[node.id]?.x ?? node.x ?? 0,
        y: positions[node.id]?.y ?? node.y ?? 0
      }));
      
      vscode.setState({ savedNodes: stateData });
    }

    function getDiagramData() {
      const positions = network.getPositions();
      return {
        nodes: visNodes.get().map(node => ({
          id: node.id,
          fileUri: nodeMap.get(node.id),
          title: node.label.split('\\n')[1] || '',
          x: positions[node.id]?.x ?? node.x ?? 0,
          y: positions[node.id]?.y ?? node.y ?? 0
        })),
        edges: visEdges.get()
      };
    }

    // Beim Laden: Vorhandenen Zustand wiederherstellen
    const previousState = vscode.getState();
    if (previousState && previousState.savedNodes && previousState.savedNodes.length > 0) {
      document.getElementById('drop-hint').style.display = 'none';

      previousState.savedNodes.forEach(item => {
        vscode.postMessage({
          command: 'resolveDroppedItem',
          droppedText: item.fileUri || item.uid,
          pointer: { x: item.x || 0, y: item.y || 0 }
        });
      });
    }

    function handleDrop(e) {
      e.preventDefault();
      e.stopPropagation();
      console.log('[Doorstop][drop] Transfer types:', Array.from(e.dataTransfer?.types || []));
      
      const treeData = e.dataTransfer.getData('application/vnd.code.tree.doorstop.treeView');
      const plainText = e.dataTransfer.getData('text/plain');
      const uriList = e.dataTransfer.getData('text/uri-list');

      const bounds = container.getBoundingClientRect();
      const pointer = network.DOMtoCanvas({
        x: e.clientX - bounds.left,
        y: e.clientY - bounds.top
      });
      console.log('[Doorstop][drop] Canvas pointer:', pointer);

      if (treeData) {
        try {
          const item = JSON.parse(treeData);
          console.log('[Doorstop][drop] TreeView payload:', item);
          const droppedText = typeof item === 'string' ? item : item?.fileUri || item?.uid;
          if (typeof droppedText === 'string' && droppedText.trim().length > 0) {
            vscode.postMessage({
              command: 'resolveDroppedItem',
              droppedText,
              pointer
            });
            return;
          }
        } catch (error) {
          console.warn('[Doorstop][drop] Invalid TreeView payload:', error);
        }
      }

      const droppedValue = plainText || uriList;
      if (typeof droppedValue === 'string' && droppedValue.trim().length > 0) {
        vscode.postMessage({
          command: 'resolveDroppedItem',
          droppedText: droppedValue,
          pointer
        });
      }
    }

    // Capture the event before vis-network or its canvas can consume it.
    window.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    }, true);
    window.addEventListener('drop', handleDrop, true);

    // Knoten zeichnen & Zustand sichern
    window.addEventListener('message', event => {
      const message = event.data;
      if (message.command === 'loadDiagram') {
        visNodes.clear();
        visEdges.clear();
        nodeMap.clear();

        message.diagram.nodes.forEach(item => {
          nodeMap.set(item.id, item.fileUri);
          visNodes.add({
            id: item.id,
            label: item.id + '\\n' + (item.title || ''),
            shape: 'box',
            x: item.x || 0,
            y: item.y || 0,
            margin: 10,
            color: { background: '#2d2d2d', border: '#007acc' },
            font: { color: '#ffffff' }
          });
        });

        visEdges.add(message.diagram.edges);
        document.getElementById('drop-hint').style.display = visNodes.length > 0 ? 'none' : 'block';
        saveGraphState();
        return;
      }
      if (message.command === 'addNode') {
        const { uid, fileUri, title, links, pointer } = message.node;
        console.log('[Doorstop][webview] addNode received:', {
          uid,
          fileUri,
          pointer,
          existing: Boolean(visNodes.get(uid))
        });

        document.getElementById('drop-hint').style.display = 'none';

        if (!visNodes.get(uid)) {
          nodeMap.set(uid, fileUri);

          visNodes.add({
            id: uid,
            label: uid + '\\n' + (title || ''),
            shape: 'box',
            x: pointer.x,
            y: pointer.y,
            margin: 10,
            color: { background: '#2d2d2d', border: '#007acc' },
            font: { color: '#ffffff' }
          });

          links.forEach(targetUid => {
            if (visNodes.get(targetUid)) {
              visEdges.add({ from: uid, to: targetUid, arrows: 'to' });
            }
          });

          network.redraw();

          // Zustand nach dem Hinzufügen speichern
          saveGraphState();
          vscode.postMessage({ command: 'diagramChanged', diagram: getDiagramData() });
        }
      }
    });

    // Speichert Positionen auch beim Verschieben per Maus
    network.on("dragEnd", function (params) {
      if (params.nodes.length > 0) {
        saveGraphState();
        vscode.postMessage({ command: 'diagramChanged', diagram: getDiagramData() });
      }
    });

    // Doppelklick öffnet Datei
    network.on("click", function (params) {
      if (params.nodes.length > 0) {
        const fileUri = nodeMap.get(params.nodes[0]);
        if (fileUri) {
          vscode.postMessage({ command: 'activateNode', fileUri });
        }
      }
    });

    network.on("doubleClick", function (params) {
      if (params.nodes.length > 0) {
        const nodeId = params.nodes[0];
        const fileUri = nodeMap.get(nodeId);
        if (fileUri) {
          vscode.postMessage({ command: 'openFile', fileUri });
        }
      }
    });
  </script>
</body>
</html>`;
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