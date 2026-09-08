import * as vscode from 'vscode';
import * as path from 'path';

import { DoorstopServer } from './doorstopServer';

interface ItemNode {
  uid: string;
  path: string;
  level: string;
  header?: string;
  text?: string;
}

interface DocumentNode {
  prefix: string;
  markerPath: string;
  parentPrefix?: string;
  items: ItemNode[];
}

interface TreeResponse {
  documents: DocumentNode[];
}

/**
 * Resolves a display title from a server-provided item node: explicit header,
 * then a markdown H1 in the text, then the first non-empty line, then a fallback.
 */
function extractTitle(node: ItemNode): string {
  if (node.header) {
    return node.header;
  }

  const text = node.text || '';
  const h1Match = text.match(/^#\s+(.+)$/m);
  if (h1Match) {
    return h1Match[1].trim();
  }

  const firstLine = text.split('\n')[0]?.trim();
  return firstLine || 'Unbenanntes Requirement';
}

/**
 * Outline depth of a dotted level string, matching Doorstop's own `Item.depth`
 * (`len(self.level)`): the number of segments once a trailing ".0" (a heading
 * marker) is stripped. E.g. "1" / "1.0" -> 1, "1.2" -> 2, "1.14.0" -> 2, "1.14.1" -> 3.
 */
function levelDepth(level: string): number {
  const parts = level.split('.').filter(part => part.length > 0);
  if (parts.length > 1 && parts[parts.length - 1] === '0') {
    return parts.length - 1;
  }
  return parts.length || 1;
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
    this.id = resourceUri.toString();
    this.contextValue = itemData.isDoorstopRoot ? 'doorstop.root' : 'doorstop.item';

    // Label und Beschreibung im Tree:
    this.baseLabel = title;
    this.label = this.baseLabel;
    this.description = itemData.uid || path.basename(resourceUri.fsPath);
    if (itemData.isDoorstopRoot) {
      this.iconPath = vscode.ThemeIcon.Folder;
    } else {
      this.setTreeIcon('file');
    }

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

  setTreeIcon(icon: 'folder' | 'file' | 'files'): void {
    this.iconPath = new vscode.ThemeIcon(icon);
  }
}

export class DoorstopTreeProvider implements vscode.TreeDataProvider<RequirementTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<RequirementTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private items = new Map<string, RequirementTreeItem>();
  private childrenByItem = new Map<RequirementTreeItem, RequirementTreeItem[]>();
  private childrenById = new Map<string, RequirementTreeItem[]>();
  private parentByItem = new Map<RequirementTreeItem, RequirementTreeItem>(); // Neu: Speichert Eltern-Elemente
  private parentById = new Map<string, RequirementTreeItem>();
  private roots: RequirementTreeItem[] = [];
  private loaded = false;
  private serverErrorShown = false;

  constructor(private readonly server: DoorstopServer) {}

  refresh(): void {
    this.loaded = false;
    this.items.clear();
    this.childrenByItem.clear();
    this.childrenById.clear();
    this.parentByItem.clear(); // Neu: Parent-Lookup leeren
    this.parentById.clear();
    this.roots = [];
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: RequirementTreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * ZWINGEND ERFORDERLICH FÜR treeView.reveal():
   * Gibt das Eltern-Element eines Items zurück.
   */
  getParent(element: RequirementTreeItem): vscode.ProviderResult<RequirementTreeItem> {
    const parent = this.parentByItem.get(element)
      || (element.id ? this.parentById.get(element.id) : undefined);
    console.log('[Doorstop][tree] Parent:', element.id, '->', parent?.id ?? '<root>');
    return parent;
  }

  async getChildren(element?: RequirementTreeItem): Promise<RequirementTreeItem[]> {
    await this.loadItems();
    if (!element) {
      return this.roots;
    }
    return this.childrenByItem.get(element)
      || (element.id ? this.childrenById.get(element.id) : undefined)
      || [];
  }

  async setActiveResource(resourceUri: vscode.Uri | undefined): Promise<RequirementTreeItem | undefined> {
    await this.loadItems();
    const activePath = resourceUri?.fsPath;
    console.log('[Doorstop][tree] Looking up resource:', JSON.stringify(activePath));
    console.log('[Doorstop][tree] Loaded item count:', this.items.size);

    for (const item of this.items.values()) {
      item.setActive(item.resourceUri.fsPath === activePath);
    }

    const item = activePath ? [...this.items.values()].find(item => item.resourceUri.fsPath === activePath) : undefined;
    console.log('[Doorstop][tree] Lookup result:', item?.resourceUri.fsPath ?? '<not found>');
    return item;
  }

  private async loadItems(): Promise<void> {
    if (this.loaded) {return;}

    if (!vscode.workspace.workspaceFolders?.length) {
      this.loaded = true;
      return;
    }

    const start = Date.now();
    let response: TreeResponse;
    try {
      response = await this.server.request<TreeResponse>('GET', '/tree');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[Doorstop][tree] Failed to load tree from server:', message);
      if (!this.serverErrorShown) {
        this.serverErrorShown = true;
        void vscode.window.showErrorMessage(`Doorstop tree view: could not reach the Doorstop server (${message}).`);
      }
      this.loaded = true;
      return;
    }
    this.serverErrorShown = false;

    for (const document of response.documents) {
      const label = path.basename(path.dirname(document.markerPath));
      const root = new RequirementTreeItem(
        label,
        vscode.TreeItemCollapsibleState.Collapsed,
        vscode.Uri.file(document.markerPath),
        { uid: document.markerPath, prefix: document.prefix, isDoorstopRoot: true },
        label
      );

      let existing = false;
      for (const existingRoot of this.roots) {
        if (root.resourceUri.path === existingRoot.resourceUri.path) {
          existing = true;
        }
      }
      if (existing) {
        continue;
      }

      this.roots.push(root);
      this.childrenByItem.set(root, []);

      const items = document.items.map(node => {
        const item = new RequirementTreeItem(
          node.uid,
          vscode.TreeItemCollapsibleState.None,
          vscode.Uri.file(node.path),
          { uid: node.uid, level: node.level, header: node.header },
          extractTitle(node)
        );
        this.items.set(item.resourceUri.fsPath, item);
        return item;
      });

      this.attachHierarchy(root, items);
    }

    for (const item of this.items.values()) {
      item.collapsibleState = this.childrenByItem.has(item)
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None;
      item.setTreeIcon(this.childrenByItem.has(item) ? 'files' : 'file');
    }

    for (const root of this.roots) {
      root.iconPath = vscode.ThemeIcon.Folder;
    }

    this.sortItems(this.roots);

    this.loaded = true;
    console.log(`[Doorstop][tree] loadItems via server took ${Date.now() - start}ms`);
  }

  /**
   * Nests items purely by outline depth (like the indentation in Doorstop's own
   * generated index.yml) instead of reconstructing a level-string tree: each
   * item's parent is the nearest preceding item (in level order) with a shallower
   * depth, or the document root. No synthetic nodes for skipped intermediate levels.
   */
  private attachHierarchy(root: RequirementTreeItem, items: RequirementTreeItem[]): void {
    this.sortItems(items);

    const ancestors: { depth: number; node: RequirementTreeItem }[] = [];
    for (const item of items) {
      const depth = levelDepth(String(item.itemData.level || ''));
      while (ancestors.length > 0 && ancestors[ancestors.length - 1].depth >= depth) {
        ancestors.pop();
      }
      const parent = ancestors.length > 0 ? ancestors[ancestors.length - 1].node : root;

      const children = this.childrenByItem.get(parent) || [];
      children.push(item);
      this.childrenByItem.set(parent, children);
      this.childrenById.set(parent.id || parent.resourceUri.toString(), children);
      this.parentByItem.set(item, parent);
      this.parentById.set(item.id || item.resourceUri.toString(), parent);

      ancestors.push({ depth, node: item });
    }

    for (const children of this.childrenByItem.values()) {
      this.sortItems(children);
    }
  }

  private sortItems(items: RequirementTreeItem[]): void {
    items.sort((a, b) => {
      const levelA = String(a.itemData.level || '').split('.').map(Number);
      const levelB = String(b.itemData.level || '').split('.').map(Number);
      for (let index = 0; index < Math.max(levelA.length, levelB.length); index++) {
        const difference = (levelA[index] || 0) - (levelB[index] || 0);
        if (difference !== 0) {return difference;}
      }
      return String(a.itemData.uid).localeCompare(String(b.itemData.uid));
    });
  }
}