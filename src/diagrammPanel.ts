import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'js-yaml';

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
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist', 'webview')],
                retainContextWhenHidden: true
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
        this._extensionUri = extensionUri;
        this._initialDiagram = initialDiagram;
        this._onDiagramChanged = onDiagramChanged;
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
                }
            },
            null,
            this._disposables
        );
    }

    private async handleOpenFile(message: any): Promise<void> {
        if (message.fileUri) {
            const uri = vscode.Uri.file(message.fileUri);
            await vscode.window.showTextDocument(uri);
        }
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

    private handleReady(): void {
        if (this._initialDiagram) {
            this._panel.webview.postMessage({
                command: 'loadDiagram',
                diagram: this._initialDiagram
            });
        }
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
