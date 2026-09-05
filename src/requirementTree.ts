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
    this.id = resourceUri.toString();

    // 4 Icons für Status aufbauen (z. B. Active, Normative, Derived, Reviewed)
    const iconActive = itemData.active !== false ? '🟢' : '⚪';
    const iconNormative = itemData.normative !== false ? '📜' : '📄';
    const iconDerived = itemData.derived ? '🔀' : '🔹';
    const iconReviewed = itemData.reviewed ? '✅' : '⚠️';

    // Label und Beschreibung im Tree:
    this.baseLabel = `${iconActive}${iconNormative}${iconDerived}${iconReviewed} ${title}`;
    this.label = this.baseLabel;
    this.description = itemData.uid || path.basename(resourceUri.fsPath);

    // Klick öffnet die Datei
    if (!itemData.isPlaceholder) {
      this.command = {
        command: 'vscode.open',
        title: 'Open File',
        arguments: [this.resourceUri]
      };
    }

    if (itemData.isPlaceholder) {
      this.label = `${title} (placeholder)`;
      this.description = 'Missing level';
    }
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
  private childrenById = new Map<string, RequirementTreeItem[]>();
  private parentByItem = new Map<RequirementTreeItem, RequirementTreeItem>(); // Neu: Speichert Eltern-Elemente
  private parentById = new Map<string, RequirementTreeItem>();
  private roots: RequirementTreeItem[] = [];
  private loaded = false;

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

    const markers = await vscode.workspace.findFiles('**/.doorstop.yml', undefined);
    const requirementFiles = await vscode.workspace.findFiles('**/*.{yml,md}', undefined);
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
      var existing = false;
      for (const existing_roots of this.roots) {
        if (root.resourceUri.path === existing_roots.resourceUri.path) {
          existing = true;
        }
      }
      if (existing) {
        continue;
      }

      this.roots.push(root);
      this.childrenByItem.set(root, []);
      scopedItems.set(marker.fsPath, []);
    }

    for (const file of requirementFiles) {
      if (markerPathSet.has(file.fsPath)) {continue;}

      const owner = markerPaths
        .filter(markerPath => {
          const relative = path.relative(path.dirname(markerPath), file.fsPath);
          return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
        })
        .sort((a, b) => path.dirname(b).length - path.dirname(a).length)[0];
      if (!owner) {continue;}

      try {
        const content = fs.readFileSync(file.fsPath, 'utf8');
        const fileName = path.basename(file.fsPath);
        const uid = fileName.replace(/\.(yml|md)$/, '');

        // Standard-Frontmatter Parser
        let yamlHeader = content;
        if (content.startsWith('---')) {
          const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
          if (match) {yamlHeader = match[1];}
        }

        const data: any = yaml.load(yamlHeader) || {};
        data.uid = uid;
        const title = extractTitle(data, content);
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
      const root = this.roots.find(rootItem => rootItem.resourceUri.fsPath === markerPath);
      if (!root) {continue;}

      const canonicalLevel = (value: unknown): string => {
        const level = String(value || '').trim();
        return /^\d+$/.test(level) ? `${level}.0` : level;
      };

      const nodesByLevel = new Map<string, RequirementTreeItem>();
      for (const item of items) {
        const level = canonicalLevel(item.itemData.level);
        if (level) {nodesByLevel.set(level, item);}
      }

      const parentLevelFor = (level: string): string | undefined => {
        const parts = level.split('.');
        if (parts.length < 2 || (parts.length === 2 && parts[1] === '0')) {
          return undefined;
        }
        if (parts[parts.length - 1] === '0') {
          return `${parts[0]}.0`;
        }
        if (parts.length === 2) {
          return `${parts[0]}.0`;
        }
        return parts.slice(0, -1).join('.');
      };

      const ensureNode = (level: string): RequirementTreeItem => {
        const existing = nodesByLevel.get(level);
        if (existing) {return existing;}

        const placeholder = new RequirementTreeItem(
          level,
          vscode.TreeItemCollapsibleState.Collapsed,
          vscode.Uri.parse(`doorstop-placeholder:${encodeURIComponent(markerPath)}#${level}`),
          { uid: level, level, isPlaceholder: true },
          level
        );
        nodesByLevel.set(level, placeholder);

        const parentLevel = parentLevelFor(level);
        const parent = parentLevel ? ensureNode(parentLevel) : root;
        const children = this.childrenByItem.get(parent) || [];
        children.push(placeholder);
        this.childrenByItem.set(parent, children);
        this.childrenById.set(parent.id || parent.resourceUri.toString(), children);
        this.parentByItem.set(placeholder, parent);
        this.parentById.set(placeholder.id || placeholder.resourceUri.toString(), parent);
        return placeholder;
      };

      for (const item of items) {
        const level = canonicalLevel(item.itemData.level);
        if (!level) {
          const rootChildren = this.childrenByItem.get(root) || [];
          rootChildren.push(item);
          this.childrenByItem.set(root, rootChildren);
          this.childrenById.set(root.id || root.resourceUri.toString(), rootChildren);
          this.parentByItem.set(item, root);
          this.parentById.set(item.id || item.resourceUri.toString(), root);
          continue;
        }

        const parentLevel = parentLevelFor(level);
        const parent = parentLevel ? ensureNode(parentLevel) : root;
        const children = this.childrenByItem.get(parent) || [];
        children.push(item);
        this.childrenByItem.set(parent, children);
        this.childrenById.set(parent.id || parent.resourceUri.toString(), children);
        this.parentByItem.set(item, parent);
        this.parentById.set(item.id || item.resourceUri.toString(), parent);
      }

      for (const children of this.childrenByItem.values()) {
        this.sortItems(children);
      }
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
        if (difference !== 0) {return difference;}
      }
      return String(a.itemData.uid).localeCompare(String(b.itemData.uid));
    });
  }
}