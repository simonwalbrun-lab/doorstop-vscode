import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'js-yaml';

export interface GraphNode {
  id: string;
  label: string;
  fileUri: string;
}

export interface GraphEdge {
  from: string;
  to: string;
}

export class DoorstopDiagramPanel {
  public static currentPanel: DoorstopDiagramPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  public static async createOrShow(extensionUri: vscode.Uri) {
    if (DoorstopDiagramPanel.currentPanel) {
      DoorstopDiagramPanel.currentPanel._panel.reveal(vscode.ViewColumn.One);
      await DoorstopDiagramPanel.currentPanel.refreshGraph();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'doorstopDiagram',
      'Doorstop Traceability Graph',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
      }
    );

    DoorstopDiagramPanel.currentPanel = new DoorstopDiagramPanel(panel, extensionUri);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._panel.webview.html = this._getHtmlForWebview();

    // 1. Cleanup-Event beim Schließen des Panels
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // 2. Nachrichten aus dem Webview empfangen (z. B. Klick auf Knoten -> Datei öffnen)
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
          case 'addLink': {
            vscode.window.showInformationMessage(`Link von ${message.source} zu ${message.target} hinzugefügt.`);
            return;
          }
        }
      },
      null,
      this._disposables
    );

    // Erstes Laden der Daten
    this.refreshGraph();
  }

  // 3. Durchsucht den Workspace, baut den Graphen und schickt ihn ans Webview
  public async refreshGraph(): Promise<void> {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    const excludePattern = '**/{node_modules,.git,out,dist,.venv,venv}/**';
    const files = await vscode.workspace.findFiles('**/*.{yml,md}', excludePattern);

    for (const file of files) {
      const fileName = path.basename(file.fsPath);
      if (fileName.startsWith('.doorstop')) continue;

      try {
        const content = fs.readFileSync(file.fsPath, 'utf8');
        let yamlContent = content;

        if (content.startsWith('---')) {
          const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
          if (match) yamlContent = match[1];
        }

        const data: any = yaml.load(yamlContent) || {};
        const uid = fileName.replace(/\.(yml|md)$/, '');

        // Knoten hinzufügen
        nodes.push({
          id: uid,
          label: `${uid}: ${data.header || data.title || ''}`.trim(),
          fileUri: file.fsPath
        });

        // Verknüpfungen (Links) auflösen
        if (Array.isArray(data.links)) {
          for (const link of data.links) {
            const targetId = typeof link === 'string' ? link : link.item;
            if (targetId) {
              edges.push({ from: uid, to: String(targetId) });
            }
          }
        }
      } catch (e) {
        // Fehlerhafte Yaml-Dateien überspringen
      }
    }

    // Daten per PostMessage an den HTML/JS-Code im Webview senden
    this._panel.webview.postMessage({
      command: 'setData',
      nodes,
      edges
    });
  }

  private _getHtmlForWebview(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Doorstop Graph</title>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <style>
    body {
      background-color: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-font-family);
      margin: 0;
      padding: 16px;
      overflow: auto;
    }
    #graph {
      display: flex;
      justify-content: center;
    }
    .node {
      cursor: pointer;
    }
  </style>
</head>
<body>
  <h3>Doorstop Traceability Map</h3>
  <div id="graph">Lade Diagramm...</div>

  <script>
    const vscode = acquireVsCodeApi();
    mermaid.initialize({ startOnLoad: false, theme: 'dark' });

    let nodeMap = new Map();

    window.addEventListener('message', async (event) => {
      const message = event.data;

      if (message.command === 'setData') {
        const nodes = message.nodes;
        const edges = message.edges;
        nodeMap.clear();

        if (nodes.length === 0) {
          document.getElementById('graph').innerText = 'Keine Requirements gefunden.';
          return;
        }

        // Mermaid-Syntax (Flowchart LR) generieren
        let mermaidCode = 'graph LR\\n';

        nodes.forEach(node => {
          nodeMap.set(node.id, node.fileUri);
          // Sonderzeichen im Label für Mermaid escapen
          const cleanLabel = node.label.replace(/["'()]/g, '');
          mermaidCode += \`  \${node.id}["\${cleanLabel}"]\\n\`;
        });

        edges.forEach(edge => {
          mermaidCode += \`  \${edge.from} --> \${edge.to}\\n\`;
        });

        const graphContainer = document.getElementById('graph');
        graphContainer.innerHTML = '';

        try {
          const { svg } = await mermaid.render('mermaidSvg', mermaidCode);
          graphContainer.innerHTML = svg;

          // Event-Listener für Klicks auf Knoten hinzufügen
          document.querySelectorAll('.node').forEach(nodeEl => {
            nodeEl.style.cursor = 'pointer';
            nodeEl.addEventListener('click', () => {
              // Node-ID aus der Mermaid-Struktur auslesen
              const id = nodeEl.id.replace(/^flowchart-/, '').split('-')[0];
              const fileUri = nodeMap.get(id);
              if (fileUri) {
                vscode.postMessage({ command: 'openFile', fileUri });
              }
            });
          });
        } catch (err) {
          graphContainer.innerText = 'Fehler beim Rendern des Graphen: ' + err;
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
      if (x) x.dispose();
    }
  }
}