import * as vscode from 'vscode';
import * as path from 'path';

import { DoorstopServer } from './doorstopServer';
import { measure, registerCommand } from './timing';
import { ItemNode, TreeResponse } from './doorstopTypes';

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
  return firstLine || 'Unnamed requirement';
}

/**
 * Outline depth of a dotted level string, matching Doorstop's own `Item.depth`
 * (`len(self.level)`): the number of segments once a trailing ".0" (a heading
 * marker) is stripped. E.g. "1" / "1.0" -> 1, "1.2" -> 2, "1.14.0" -> 2, "1.14.1" -> 3.
 */
export function levelDepth(level: string): number {
  const parts = level.split('.').filter(part => part.length > 0);
  if (parts.length > 1 && parts[parts.length - 1] === '0') {
    return parts.length - 1;
  }
  return parts.length || 1;
}

/** Doorstop order: numeric level parts, then UID. Shared by the explorer and section views. */
export function compareItemLevels(a: { level?: string; uid?: string }, b: { level?: string; uid?: string }): number {
  const levelA = String(a.level || '').split('.').map(Number);
  const levelB = String(b.level || '').split('.').map(Number);
  for (let index = 0; index < Math.max(levelA.length, levelB.length); index++) {
    const difference = (levelA[index] || 0) - (levelB[index] || 0);
    if (difference !== 0) {return difference;}
  }
  return String(a.uid).localeCompare(String(b.uid));
}

/**
 * Index of each item's parent in `sorted` (level order), or -1 for the document
 * root: the nearest preceding item with a shallower outline depth. The one nesting
 * rule of the explorer and of section views.
 */
export function outlineParents(sorted: { level?: string }[]): number[] {
  const ancestors: { depth: number; index: number }[] = [];
  return sorted.map((item, index) => {
    const depth = levelDepth(String(item.level || ''));
    while (ancestors.length > 0 && ancestors[ancestors.length - 1].depth >= depth) {
      ancestors.pop();
    }
    const parent = ancestors.length > 0 ? ancestors[ancestors.length - 1].index : -1;
    ancestors.push({ depth, index });
    return parent;
  });
}

/** UIDs of a section (spec 030): the item `rootUid` plus every item nested below it, in level order. */
export function sectionUids(items: { uid: string; level: string }[], rootUid: string): string[] {
  const ordered = [...items].sort(compareItemLevels);
  const parents = outlineParents(ordered);
  const members = new Set<number>([ordered.findIndex(item => item.uid === rootUid)]);
  if (members.has(-1)) {
    return [];
  }
  // A parent always precedes its children, so one pass collects the whole subtree.
  parents.forEach((parent, index) => {
    if (members.has(parent)) {
      members.add(index);
    }
  });
  return ordered.filter((_, index) => members.has(index)).map(item => item.uid);
}

/**
 * What a tree row stands for. A document row has `prefix` and `isDoorstopRoot`
 * (its `uid` is the marker path), an item row `uid`, `level` and `header`, and a
 * disabled document `prefix`, `markerPath` and `skipped`.
 */
export interface TreeItemData {
  uid?: string;
  prefix?: string;
  level?: string;
  header?: string;
  isDoorstopRoot?: boolean;
  markerPath?: string;
  skipped?: boolean;
}

export class RequirementTreeItem extends vscode.TreeItem {
  constructor(
    public label: string,
    public collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly resourceUri: vscode.Uri,
    public readonly itemData: TreeItemData,
    public readonly title: string
  ) {
    super(label, collapsibleState);
    this.id = resourceUri.toString();
    this.contextValue = itemData.isDoorstopRoot ? 'doorstop.root' : 'doorstop.item';
    this.label = title;
    this.description = itemData.uid || path.basename(resourceUri.fsPath);
    if (itemData.isDoorstopRoot) {
      this.iconPath = vscode.ThemeIcon.Folder;
    } else {
      this.setTreeIcon('file');
    }
    this.command = {
      command: 'vscode.open',
      title: 'Open File',
      arguments: [this.resourceUri]
    };
  }

  setTreeIcon(icon: 'folder' | 'file' | 'files'): void {
    this.iconPath = new vscode.ThemeIcon(icon);
  }
}

export class DoorstopTreeProvider implements vscode.TreeDataProvider<RequirementTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<RequirementTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  /** Item rows by file path. */
  private items = new Map<string, RequirementTreeItem>();
  // Keyed by row id, not by object: after a refresh VS Code may still hand in a
  // row object from before it, which must resolve to the rebuilt row's relatives.
  private childrenById = new Map<string, RequirementTreeItem[]>();
  private parentById = new Map<string, RequirementTreeItem>();
  private roots: RequirementTreeItem[] = [];
  /** Disabled documents, listed after the enabled ones (spec 031). */
  private skipped: RequirementTreeItem[] = [];
  private loaded = false;
  /** The running load, shared by every caller that arrives meanwhile (getChildren, reveal, ...). */
  private loading: Promise<void> | undefined;
  /** Bumped by refresh(): a load started before it must not fill the cleared tree with old data. */
  private generation = 0;
  private serverErrorShown = false;

  constructor(private readonly server: DoorstopServer) {}

  refresh(): void {
    this.generation++;
    this.loading = undefined;
    this.loaded = false;
    this.items.clear();
    this.childrenById.clear();
    this.parentById.clear();
    this.roots = [];
    this.skipped = [];
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: RequirementTreeItem): vscode.TreeItem {
    return element;
  }

  /** Required for `treeView.reveal()`: the parent row of a row, undefined for a document. */
  getParent(element: RequirementTreeItem): vscode.ProviderResult<RequirementTreeItem> {
    return element.id ? this.parentById.get(element.id) : undefined;
  }

  async getChildren(element?: RequirementTreeItem): Promise<RequirementTreeItem[]> {
    await this.loadItems();
    if (!element) {
      return [...this.roots, ...this.skipped];
    }
    return (element.id ? this.childrenById.get(element.id) : undefined) || [];
  }

  /** The item row of the file at `resourceUri`, once the tree has loaded. */
  async setActiveResource(resourceUri: vscode.Uri | undefined): Promise<RequirementTreeItem | undefined> {
    await this.loadItems();
    return resourceUri ? this.items.get(resourceUri.fsPath) : undefined;
  }

  /** Starts (or joins) the load of the tree; resolves when it is over, whether or not it worked. */
  loadItems(): Promise<void> {
    if (this.loaded) {return Promise.resolve();}
    return this.loading ??= this.fetchItems();
  }

  private async fetchItems(): Promise<void> {
    if (!vscode.workspace.workspaceFolders?.length) {
      this.loaded = true;
      return;
    }

    // No port yet = still starting (activation no longer waits for it): nothing to ask and
    // nothing to report. Stays unloaded; the refresh after a successful start loads for
    // real, and a failed start already shows its own warning.
    if (!this.server.port) {return;}

    const generation = this.generation;
    let response: TreeResponse;
    try {
      response = await measure('tree.load', () => this.server.request<TreeResponse>('GET', '/tree'));
    } catch (error) {
      if (generation !== this.generation) {return;}
      const message = error instanceof Error ? error.message : String(error);
      console.error('[Doorstop][tree] Failed to load tree from server:', message);
      if (!this.serverErrorShown) {
        this.serverErrorShown = true;
        void vscode.window.showErrorMessage(`Doorstop tree view: could not reach the Doorstop server (${message}).`);
      }
      this.loaded = true;
      return;
    }
    if (generation !== this.generation) {return;}
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
      if (this.roots.some(existing => existing.resourceUri.path === root.resourceUri.path)) {
        continue;
      }

      this.roots.push(root);
      this.childrenById.set(root.id as string, []);

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

    // Disabled documents (spec 031): not `isDoorstopRoot`, so pickers never offer them.
    for (const document of response.skippedDocuments ?? []) {
      const label = path.basename(path.dirname(document.markerPath));
      const node = new RequirementTreeItem(
        label,
        vscode.TreeItemCollapsibleState.None,
        vscode.Uri.file(document.markerPath),
        { prefix: document.prefix, markerPath: document.markerPath, skipped: true },
        label
      );
      node.contextValue = 'doorstop.root.skipped';
      node.description = `${document.prefix} (disabled)`;
      node.iconPath = new vscode.ThemeIcon('eye-closed', new vscode.ThemeColor('disabledForeground'));
      node.command = undefined;
      this.skipped.push(node);
    }

    for (const item of this.items.values()) {
      const hasChildren = this.childrenById.has(item.id as string);
      item.collapsibleState = hasChildren
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None;
      item.setTreeIcon(hasChildren ? 'files' : 'file');
      // Only nodes with sub-elements offer "Open as document" for their section (spec 030 FR-001).
      item.contextValue = hasChildren ? 'doorstop.item.parent' : 'doorstop.item';
    }

    for (const root of this.roots) {
      root.iconPath = vscode.ThemeIcon.Folder;
    }

    this.sortItems(this.roots);

    this.loaded = true;
  }

  /**
   * Nests items purely by outline depth (like the indentation in Doorstop's own
   * generated index.yml) instead of reconstructing a level-string tree: each
   * item's parent is the nearest preceding item (in level order) with a shallower
   * depth, or the document root. No synthetic nodes for skipped intermediate levels.
   */
  private attachHierarchy(root: RequirementTreeItem, items: RequirementTreeItem[]): void {
    this.sortItems(items);

    const parents = outlineParents(items.map(item => item.itemData));
    for (const [index, item] of items.entries()) {
      const parent = parents[index] >= 0 ? items[parents[index]] : root;
      const parentId = parent.id as string;
      const children = this.childrenById.get(parentId) || [];
      children.push(item);
      this.childrenById.set(parentId, children);
      this.parentById.set(item.id as string, parent);
    }

    for (const children of this.childrenById.values()) {
      this.sortItems(children);
    }
  }

  private sortItems(items: RequirementTreeItem[]): void {
    items.sort((a, b) => compareItemLevels(a.itemData, b.itemData));
  }
}

/**
 * The Doorstop explorer and commands views, and auto-reveal: the tree follows the
 * active editor unless the user switched that off. The preference is per user
 * (globalState, not workspace config), defaults to on, and is mirrored into a
 * when-clause context key for the two view/title toggle buttons.
 */
export function registerTreeViews(
  context: vscode.ExtensionContext,
  treeProvider: DoorstopTreeProvider,
  commandsProvider: vscode.TreeDataProvider<vscode.TreeItem>,
  dragAndDropController: vscode.TreeDragAndDropController<RequirementTreeItem>
): void {
  let autoRevealEnabled = context.globalState.get<boolean>('doorstop.autoRevealEnabled', true);
  void vscode.commands.executeCommand('setContext', 'doorstop.autoRevealEnabled', autoRevealEnabled);

  const treeView = vscode.window.createTreeView('doorstop.treeView', {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
    dragAndDropController
  });
  const commandsView = vscode.window.createTreeView('doorstop.commandsView', {
    treeDataProvider: commandsProvider,
    showCollapseAll: false
  });

  /** Loads every ancestor's children first, so VS Code can expand down to `item`. */
  const prepareTreeItemForReveal = async (item: RequirementTreeItem): Promise<void> => {
    const ancestors: RequirementTreeItem[] = [];
    let current: RequirementTreeItem | undefined = item;
    while (current) {
      ancestors.unshift(current);
      current = treeProvider.getParent(current) as RequirementTreeItem | undefined;
    }
    for (const ancestor of ancestors) {
      await treeProvider.getChildren(ancestor);
    }
  };

  /** Selects the tree item of `uri`, retrying once on a freshly loaded tree. */
  const revealInTree = async (uri: vscode.Uri | undefined, focus: boolean): Promise<void> => {
    const reveal = async (): Promise<void> => {
      const item = await treeProvider.setActiveResource(uri);
      if (item) {
        await prepareTreeItemForReveal(item);
        await treeView.reveal(item, { select: true, focus, expand: true });
      }
    };
    try {
      await reveal();
    } catch (error) {
      console.warn('[Doorstop][reveal] Initial reveal failed, retrying:', error);
      try {
        await treeProvider.getChildren();
        await reveal();
      } catch (retryError) {
        console.error('[Doorstop][reveal] Retry reveal failed:', retryError);
      }
    }
  };

  const setAutoReveal = async (enabled: boolean): Promise<void> => {
    autoRevealEnabled = enabled;
    await context.globalState.update('doorstop.autoRevealEnabled', enabled);
    await vscode.commands.executeCommand('setContext', 'doorstop.autoRevealEnabled', enabled);
  };

  context.subscriptions.push(
    treeView,
    commandsView,
    registerCommand('doorstop.activateRequirement', async (filePath: string) => {
      if (autoRevealEnabled) {
        await revealInTree(vscode.Uri.file(filePath), true);
      }
    }),
    registerCommand('doorstop.toggleAutoReveal', () => setAutoReveal(false)),
    registerCommand('doorstop.enableAutoReveal', () => setAutoReveal(true)),
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (autoRevealEnabled) {
        void revealInTree(editor?.document.uri, false).catch(() => undefined);
      }
    })
  );

  if (autoRevealEnabled) {
    void revealInTree(vscode.window.activeTextEditor?.document.uri, false).catch(() => undefined);
  }
}
