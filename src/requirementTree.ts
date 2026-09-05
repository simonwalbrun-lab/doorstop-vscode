import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'js-yaml';

/**
 * Extrahiert den Namen/Header aus dem Markdown-Textkörper,
 * falls 'header' nicht direkt im YAML-Frontmatter definiert ist.
 */
function extractTitle(itemData: any, rawContent: string): string {
  // 1. Falls explizit ein 'header' im YAML definiert ist
  if (itemData.header) {
    return itemData.header;
  }

  // 2. Suche nach einer Markdown-Überschrift (z. B. # some name 4)
  const h1Match = rawContent.match(/^#\s+(.+)$/m);
  if (h1Match) {
    return h1Match[1].trim();
  }

  // 3. Fallback: Erste Zeile des Fließtexts nach dem Frontmatter
  const textWithoutFrontmatter = rawContent.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();
  const firstLine = textWithoutFrontmatter.split('\n')[0]?.trim();

  return firstLine || 'Unbenanntes Requirement';
}


export class RequirementTreeItem extends vscode.TreeItem {
  private readonly baseLabel: string;

  constructor(
    public label: string,
    public collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly resourceUri: vscode.Uri,
    public readonly itemData: any,
    public readonly title: string
  ) {
    super(label, collapsibleState);

    // 4 Icons für Status aufbauen (z. B. Active, Normative, Derived, Reviewed)
    const iconActive = itemData.active !== false ? '🟢' : '⚪';
    const iconNormative = itemData.normative !== false ? '📜' : '📄';
    const iconDerived = itemData.derived ? '🔀' : '🔹';
    const iconReviewed = itemData.reviewed ? '✅' : '⚠️';

    // Titel mit Icons und Requirement-Header
    
    
    // Label und Beschreibung im Tree:
    this.baseLabel = `${iconActive}${iconNormative}${iconDerived}${iconReviewed} ${title}`;
    this.label = this.baseLabel;
    this.description = itemData.uid || path.basename(resourceUri.fsPath);

    // Klick öffnet die Datei
    this.command = {
      command: 'vscode.open',
      title: 'Open File',
      arguments: [this.resourceUri]
    };
  }

  setActive(active: boolean): void {
    this.label = active ? `${this.baseLabel}` : this.baseLabel;
  }
}

export class DoorstopTreeProvider implements vscode.TreeDataProvider<RequirementTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<RequirementTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private items = new Map<string, RequirementTreeItem>();
  private childrenByItem = new Map<RequirementTreeItem, RequirementTreeItem[]>();
  private roots: RequirementTreeItem[] = [];
  private loaded = false;

  refresh(): void {
    this.loaded = false;
    this.items.clear();
    this.childrenByItem.clear();
    this.roots = [];
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: RequirementTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: RequirementTreeItem): Promise<RequirementTreeItem[]> {
    await this.loadItems();
    return element ? this.childrenByItem.get(element) || [] : this.roots;
  }

  

  async setActiveResource(resourceUri: vscode.Uri | undefined): Promise<RequirementTreeItem | undefined> {
    await this.loadItems();
    const activePath = resourceUri?.fsPath;

    for (const item of this.items.values()) {
      item.setActive(item.resourceUri.fsPath === activePath);
    }

    this._onDidChangeTreeData.fire();
    return activePath ? [...this.items.values()].find(item => item.resourceUri.fsPath === activePath) : undefined;
  }

  private async loadItems(): Promise<void> {
    if (this.loaded) return;

    if (!vscode.workspace.workspaceFolders?.length) {
      this.loaded = true;
      return;
    }

    const markers = await vscode.workspace.findFiles('**/.doorstop{,.yml}', '**/node_modules/**');
    const requirementFiles = await vscode.workspace.findFiles('**/*.{yml,md}', '**/node_modules/**');
    const markerPaths = markers.map(marker => marker.fsPath);
    const markerPathSet = new Set(markerPaths);
    const scopedItems = new Map<string, RequirementTreeItem[]>();

    for (const marker of markers) {
      const root = new RequirementTreeItem(
        path.basename(path.dirname(marker.fsPath)),
        vscode.TreeItemCollapsibleState.Collapsed,
        marker,
        { uid: marker.fsPath, isDoorstopRoot: true },
        path.basename(path.dirname(marker.fsPath))
      );
      this.roots.push(root);
      this.childrenByItem.set(root, []);
      scopedItems.set(marker.fsPath, []);
    }

    for (const file of requirementFiles) {
      if (markerPathSet.has(file.fsPath)) continue;

      const owner = markerPaths
        .filter(markerPath => {
          const relative = path.relative(path.dirname(markerPath), file.fsPath);
          return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
        })
        .sort((a, b) => path.dirname(b).length - path.dirname(a).length)[0];
      if (!owner) continue;

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
        // label is first matching line of the header or the first line of the file
        

        const data: any = yaml.load(yamlHeader) || {};
        data.uid = uid;
        const title = extractTitle(data, content);;
        const item = new RequirementTreeItem(
            uid,
            vscode.TreeItemCollapsibleState.None,
            file,
            data,
            title
          );
        scopedItems.get(owner)?.push(item);
        this.items.set(file.fsPath, item);
      } catch (e) {
        // Ignorieren bei Nicht-Doorstop YAMLs
      }
    }

    for (const [markerPath, items] of scopedItems) {
      
      this.sortItems(items);
      const assignedItems = new Set<RequirementTreeItem>();
      const itemsByLevel = new Map<string, RequirementTreeItem>();
      for (const item of items) {
        const level = String(item.itemData.level || '').trim();
        if (level) itemsByLevel.set(level, item);
      }

      // Level is the fallback for documents that do not contain links.
      for (const item of items) {
        if (assignedItems.has(item)) continue;

        const levelParts = String(item.itemData.level || '').trim().split('.');
        const parentLevel = levelParts.length > 1 ? levelParts.slice(0, -1).join('.') : '';
        const parent = parentLevel ? itemsByLevel.get(parentLevel) : undefined;
        if (parent) {
          const children = this.childrenByItem.get(parent) || [];
          children.push(item);
          this.childrenByItem.set(parent, children);
          assignedItems.add(item);
        }
      }

      const topLevelItems = items.filter(item => !assignedItems.has(item));
      const root = this.roots.find(rootItem => rootItem.resourceUri.fsPath === markerPath);
      if (root) this.childrenByItem.set(root, topLevelItems);
    }

    for (const item of this.items.values()) {
      item.collapsibleState = this.childrenByItem.has(item)
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None;
    }

    this.sortItems(this.roots);

    this.loaded = true;
  }

  private sortItems(items: RequirementTreeItem[]): void {
    items.sort((a, b) => {
      const levelA = String(a.itemData.level || '').split('.').map(Number);
      const levelB = String(b.itemData.level || '').split('.').map(Number);
      for (let index = 0; index < Math.max(levelA.length, levelB.length); index++) {
        const difference = (levelA[index] || 0) - (levelB[index] || 0);
        if (difference !== 0) return difference;
      }
      return String(a.itemData.uid).localeCompare(String(b.itemData.uid));
    });
  }

}