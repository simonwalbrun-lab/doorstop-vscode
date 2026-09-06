import * as vscode from 'vscode';

interface UtilityNodeData {
  command: string;
}

export class DoorstopCommandsProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changeEmitter.event;

  private readonly nodes: vscode.TreeItem[] = [
    this.createNode('Add Item', 'file-add', 'doorstop.add'),
    this.createNode('Reorder Document', 'list-ordered', 'doorstop.reorder'),
    this.createNode('Link Items', 'link', 'doorstop.link'),
    this.createNode('Clear Suspect Status', 'call-incoming', 'doorstop.clear'),
    this.createNode('Review Item / Document', 'unverified', 'doorstop.review'),
    this.createNode('Import Document / Item', 'folder-opened', 'doorstop.import'),
    this.createNode('Export Document', 'save', 'doorstop.export'),
    this.createNode('Publish Document', 'rocket', 'doorstop.publish')
  ];

  refresh(): void {
    this.changeEmitter.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): vscode.TreeItem[] {
    return this.nodes;
  }

  private createNode(label: string, icon: string, command: string): vscode.TreeItem {
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon(icon);
    item.contextValue = 'doorstop.utility';
    item.command = {
      command,
      title: label,
      arguments: []
    };
    (item as vscode.TreeItem & { utilityData?: UtilityNodeData }).utilityData = { command };
    return item;
  }
}
