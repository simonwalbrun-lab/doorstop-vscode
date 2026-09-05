import * as vscode from 'vscode';

import { DoorstopTreeProvider,RequirementTreeItem } from './requirementTree';
import { DoorstopDiagramPanel } from './diagrammPanel';
import { registerHoverProvider } from './hoverProvider';
import { recordViewedRequirement, registerCompletionProvider } from './completionProvider';
interface DoorstopDiagramDocument extends vscode.CustomDocument {
  diagram: unknown;
}
export function activate(context: vscode.ExtensionContext) {
  console.log('[Doorstop][activate] Extension activation started');
  vscode.window.showInformationMessage('Doorstop VS Code Extension is active!');

  const treeProvider = new DoorstopTreeProvider();
  const openDiagramCmd = vscode.commands.registerCommand('doorstop.openDiagram', () => {
    DoorstopDiagramPanel.createOrShow(context.extensionUri);
  });
  const documentChangeEvent = new vscode.EventEmitter<vscode.CustomDocumentContentChangeEvent<DoorstopDiagramDocument>>();
  const diagramEditorProvider: vscode.CustomEditorProvider<DoorstopDiagramDocument> = {
    onDidChangeCustomDocument: documentChangeEvent.event,
    async openCustomDocument(uri) {
      return {
        uri,
        diagram: await DoorstopDiagramPanel.readDiagram(uri),
        dispose() { }
      };
    },
    async resolveCustomEditor(document, webviewPanel) {
      await DoorstopDiagramPanel.createForCustomEditor(
        webviewPanel,
        context.extensionUri,
        document.diagram,
        diagram => {
          document.diagram = diagram;
          documentChangeEvent.fire({ document });
        }
      );
    },
    async saveCustomDocument(document) {
      await vscode.workspace.fs.writeFile(
        document.uri,
        DoorstopDiagramPanel.serializeDiagram(document.diagram)
      );
    },
    async saveCustomDocumentAs(document, destination) {
      await vscode.workspace.fs.writeFile(
        destination,
        DoorstopDiagramPanel.serializeDiagram(document.diagram)
      );
    },
    async revertCustomDocument(document) {
      document.diagram = await DoorstopDiagramPanel.readDiagram(document.uri);
    },
    async backupCustomDocument(document, context) {
      await vscode.workspace.fs.writeFile(
        context.destination,
        DoorstopDiagramPanel.serializeDiagram(document.diagram)
      );
      return {
        id: context.destination.toString(),
        delete: () => vscode.workspace.fs.delete(context.destination)
      };
    }
  };
  const customEditor = vscode.window.registerCustomEditorProvider(
    'doorstop.diagram',
    diagramEditorProvider
  );
  // ------------------------------------------------------------------
  // STELLE A: DragAndDropController definieren & TreeView erstellen
  // ------------------------------------------------------------------
  const dndController: vscode.TreeDragAndDropController<RequirementTreeItem> = {
    dragMimeTypes: [
      'application/vnd.code.tree.doorstop.treeView',
      'text/plain',
      'text/uri-list'
    ],
    dropMimeTypes: [],
    handleDrag(source, dataTransfer) {
      const item = source[0];
      console.log('[Doorstop][drag] Started:', item?.label ?? '<no item>');
      if (item && item.resourceUri) {
        console.log('[Doorstop][drag] File URI:', item.resourceUri.toString());
        const payload = JSON.stringify({
          uid: item.itemData?.uid || item.label,
          fileUri: item.resourceUri.fsPath,
          title: item.title
        });
        dataTransfer.set(
          'application/vnd.code.tree.doorstop.treeView',
          new vscode.DataTransferItem(payload)
        );
        dataTransfer.set('text/plain', new vscode.DataTransferItem(item.resourceUri.fsPath));
        dataTransfer.set('text/uri-list', new vscode.DataTransferItem(item.resourceUri.toString()));
      }
    }
  };

  context.subscriptions.push(openDiagramCmd, customEditor);


  const treeView = vscode.window.createTreeView('doorstop.treeView', {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
    dragAndDropController: dndController
  });

  const activateRequirementCommand = vscode.commands.registerCommand(
    'doorstop.activateRequirement',
    async (filePath: string) => {
      console.log('[Doorstop][activateRequirement] Command received:', JSON.stringify(filePath));
      const item = await treeProvider.setActiveResource(vscode.Uri.file(filePath));
      console.log('[Doorstop][activateRequirement] Tree item:', item?.label ?? '<not found>');
      if (item) {
        try {
          await prepareTreeItemForReveal(treeProvider, item);
          console.log('[Doorstop][activateRequirement] Revealing tree item');
          await treeView.reveal(item, { select: true, focus: true, expand: true });
          console.log('[Doorstop][activateRequirement] Reveal completed');
        } catch (error) {
          console.warn('[Doorstop][activateRequirement] Initial reveal failed, retrying:', error);
          try {
            await treeProvider.getChildren();
            const refreshedItem = await treeProvider.setActiveResource(vscode.Uri.file(filePath));
            if (refreshedItem) {
              await prepareTreeItemForReveal(treeProvider, refreshedItem);
              console.log('[Doorstop][activateRequirement] Revealing refreshed tree item');
              await treeView.reveal(refreshedItem, { select: true, focus: true, expand: true });
              console.log('[Doorstop][activateRequirement] Retry reveal completed');
            }
          } catch (retryError) {
            console.error('[Doorstop][activateRequirement] Retry reveal failed:', retryError);
            return;
          }
        }
      } else {
        console.warn('[Doorstop][activateRequirement] No tree item matched path');
      }
    }
  );

  const showDiagramCommand = vscode.commands.registerCommand('doorstop.showDiagram', () => {
    // Ruft das Diagramm-Panel auf und übergibt die Extension-URI
    DoorstopDiagramPanel.createOrShow(context.extensionUri);
  });

  context.subscriptions.push(
    treeView,
    showDiagramCommand,
    activateRequirementCommand
  );

  const syncActiveRequirement = async (editor: vscode.TextEditor | undefined) => {
    console.log('[Doorstop][syncActiveRequirement] Editor:', editor?.document.uri.toString() ?? '<none>');
    recordViewedRequirement(editor?.document.uri);
    const item = await treeProvider.setActiveResource(editor?.document.uri);
    console.log('[Doorstop][syncActiveRequirement] Tree item:', item?.label ?? '<not found>');
    if (item) {
      try {
        await prepareTreeItemForReveal(treeProvider, item);
        console.log('[Doorstop][syncActiveRequirement] Revealing tree item');
        await treeView.reveal(item, { select: true, focus: false, expand: true });
        console.log('[Doorstop][syncActiveRequirement] Reveal completed');
      } catch (error) {
        console.warn('[Doorstop][syncActiveRequirement] Initial reveal failed, retrying:', error);
        try {
          await treeProvider.getChildren();
          const refreshedItem = await treeProvider.setActiveResource(editor?.document.uri);
          if (refreshedItem) {
            await prepareTreeItemForReveal(treeProvider, refreshedItem);
            console.log('[Doorstop][syncActiveRequirement] Revealing refreshed tree item');
            await treeView.reveal(refreshedItem, { select: true, focus: false, expand: true });
            console.log('[Doorstop][syncActiveRequirement] Retry reveal completed');
          }
        } catch (retryError) {
          console.error('[Doorstop][syncActiveRequirement] Retry reveal failed:', retryError);
          return;
        }
      }
    } else {
      console.log('[Doorstop][syncActiveRequirement] No tree item matched editor');
    }
  };

  context.subscriptions.push(treeView);
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => {
    console.log('[Doorstop][event] Active editor changed');
    void syncActiveRequirement(editor).catch(() => undefined);
  }));

  void syncActiveRequirement(vscode.window.activeTextEditor);

  async function prepareTreeItemForReveal(
    provider: DoorstopTreeProvider,
    item: RequirementTreeItem
  ): Promise<void> {
    const ancestors: RequirementTreeItem[] = [];
    let current: RequirementTreeItem | undefined = item;
    while (current) {
      ancestors.unshift(current);
      current = provider.getParent(current) as RequirementTreeItem | undefined;
    }

    console.log('[Doorstop][tree] Reveal path:', ancestors.map(element => element.id));
    for (const ancestor of ancestors) {
      await provider.getChildren(ancestor);
    }
  }

  registerHoverProvider(context);
  registerCompletionProvider(context);
}

export function deactivate() {}

