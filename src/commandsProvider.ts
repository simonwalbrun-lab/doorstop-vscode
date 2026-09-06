import * as vscode from 'vscode';

interface UtilityNodeData {
  command: string;
}

export class DoorstopCommandsProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changeEmitter.event;

  private readonly nodes: vscode.TreeItem[] = [
    this.createNode('$(file-add)  Add Item', 'doorstop.add'),
    this.createNode('$(list-ordered)  Reorder Document', 'doorstop.reorder'),
    this.createNode('$(link)  Link Items', 'doorstop.link'),
    this.createNode('$(call-incoming)  Clear Suspect Status', 'doorstop.clear'),
    this.createNode('$(unverified)  Review Item / Document', 'doorstop.review'),
    this.createNode('$(folder-opened)  Import Document / Item', 'doorstop.import'),
    this.createNode('$(save)  Export Document', 'doorstop.export'),
    this.createNode('$(rocket)  Publish Document', 'doorstop.publish')
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

  private createNode(label: string, command: string): vscode.TreeItem {
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
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
