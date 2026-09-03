import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'js-yaml';

export class RequirementTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly resourceUri: vscode.Uri,
    public readonly itemData: any
  ) {
    super(label, collapsibleState);

    // 4 Icons für Status aufbauen (z. B. Active, Normative, Derived, Reviewed)
    const iconActive = itemData.active !== false ? '🟢' : '⚪';
    const iconNormative = itemData.normative !== false ? '📜' : '📄';
    const iconDerived = itemData.derived ? '🔀' : '🔹';
    const iconReviewed = itemData.reviewed ? '✅' : '⚠️';

    // Titel mit Icons und Requirement-Header
    const title = itemData.header || itemData.text?.split('\n')[0] || 'Untitled';
    
    // Label und Beschreibung im Tree:
    this.label = `${iconActive}${iconNormative}${iconDerived}${iconReviewed} ${itemData.uid || label}`;
    this.description = title;

    // Klick öffnet die Datei
    this.command = {
      command: 'vscode.open',
      title: 'Open File',
      arguments: [this.resourceUri]
    };
  }
}

export class DoorstopTreeProvider implements vscode.TreeDataProvider<RequirementTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<RequirementTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: RequirementTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: RequirementTreeItem): Promise<RequirementTreeItem[]> {
    if (element) {
      // Wenn verschachtelte Kinder gewünscht sind (über links oder level):
      return []; 
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceFolder) return [];

    // Alle yml/md Dateien suchen
    const files = await vscode.workspace.findFiles('**/*.{yml,md}', '**/node_modules/**');
    const items: RequirementTreeItem[] = [];

    for (const file of files) {
      try {
        const content = fs.readFileSync(file.fsPath, 'utf8');
        const fileName = path.basename(file.fsPath);
        const uid = fileName.replace(/\.(yml|md)$/, '');

        // Standard-Frontmatter Parser
        let yamlHeader = content;
        if (content.startsWith('---')) {
          const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
          if (match) yamlHeader = match[1];
        }

        const data: any = yaml.load(yamlHeader) || {};
        data.uid = uid;

        items.push(
          new RequirementTreeItem(
            uid,
            vscode.TreeItemCollapsibleState.None,
            file,
            data
          )
        );
      } catch (e) {
        // Ignorieren bei Nicht-Doorstop YAMLs
      }
    }

    // Nach Level sortieren (z. B. 1.0, 1.1, 2.0)
    return items.sort((a, b) => {
      const levelA = parseFloat(a.itemData.level || '0');
      const levelB = parseFloat(b.itemData.level || '0');
      return levelA - levelB;
    });
  }
}