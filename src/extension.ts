import * as vscode from 'vscode';

import { DoorstopTreeProvider,RequirementTreeItem } from './requirementTree';
import { DoorstopDiagramPanel } from './diagrammPanel';
import { registerHoverProvider } from './hoverProvider';
import { recordViewedRequirement, registerCompletionProvider } from './completionProvider';
import { DoorstopServer } from './doorstopServer';
import { registerDeriveProvider } from './deriveProvider';
import { DoorstopCommandsProvider } from './commandsProvider';
import { registerDoorstopCommands } from './doorstopCommands';
interface DoorstopDiagramDocument extends vscode.CustomDocument {
  diagram: unknown;
}
export async function activate(context: vscode.ExtensionContext) {
  console.log('[Doorstop][activate] Extension activation started');
  vscode.window.showInformationMessage('Doorstop VS Code Extension is active!');

  const doorstopServer = new DoorstopServer();
  context.subscriptions.push(doorstopServer);

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  const findDoorstopMarker = async (): Promise<boolean> => {
    if (!workspaceFolder) {
      return false;
    }
    const markers = await vscode.workspace.findFiles(
      new vscode.RelativePattern(workspaceFolder, '**/.doorstop.yml'),
      '**/{node_modules,.git,out,dist,.venv,venv}/**',
      1
    );
    return markers.length > 0;
  };

  const getActivePythonPath = async (): Promise<string> => {
    const pythonExtension = vscode.extensions.getExtension('ms-python.python');
    if (!pythonExtension) {
      throw new Error('The Python extension is not installed.');
    }
    if (!pythonExtension.isActive) {
      await pythonExtension.activate();
    }

    const api = pythonExtension.exports as {
      environments?: {
        getActiveEnvironmentPath(uri?: vscode.Uri): Promise<{ path?: string } | undefined>;
      };
    };
    const environment = await api.environments?.getActiveEnvironmentPath(workspaceFolder?.uri);
    if (!environment?.path) {
      throw new Error('No active Python environment was selected for this workspace.');
    }
    return environment.path;
  };

  const startDoorstopServer = async (restart = false): Promise<void> => {
    if (!workspaceFolder || !(await findDoorstopMarker())) {
      void vscode.window.showWarningMessage('No .doorstop.yml project was found in the workspace.');
      return;
    }

    try {
      const pythonPath = await getActivePythonPath();
      if (restart) {
        await doorstopServer.restart(workspaceFolder.uri.fsPath, pythonPath);
      } else {
        await doorstopServer.start(workspaceFolder.uri.fsPath, pythonPath);
      }
      console.log('[Doorstop][server] Server is ready at 127.0.0.1:7867');
      void vscode.window.showInformationMessage('Doorstop server is ready.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[Doorstop][server] Failed to start:', message);
      void vscode.window.showWarningMessage(`Doorstop server unavailable: ${message}`);
    }
  };

  const restartServerCommand = vscode.commands.registerCommand(
    'doorstop.restartServer',
    () => startDoorstopServer(true)
  );
  context.subscriptions.push(restartServerCommand);

  if (workspaceFolder) {
    await startDoorstopServer();
  }

  const treeProvider = new DoorstopTreeProvider();
  const commandsProvider = new DoorstopCommandsProvider();
  context.subscriptions.push(...registerDoorstopCommands({
    context,
    server: doorstopServer,
    tree: treeProvider,
    utilities: commandsProvider,
    workspaceFolder: workspaceFolder || vscode.workspace.workspaceFolders?.[0] as vscode.WorkspaceFolder,
    getPythonPath: getActivePythonPath
  }));
  if (workspaceFolder) {
    registerDeriveProvider(context, {
      server: doorstopServer,
      workspaceFolder,
      getPythonPath: getActivePythonPath,
      onChanged: () => treeProvider.refresh()
    });
  }
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

  const addToDiagramCmd = vscode.commands.registerCommand('doorstop.addToDiagram', (item?: RequirementTreeItem) => {
    if (!item?.resourceUri) {
      return;
    }
    if (!DoorstopDiagramPanel.currentPanel) {
      vscode.window.showInformationMessage('Open the Doorstop Traceability Graph first (Doorstop: Open Traceability Graph).');
      return;
    }
    DoorstopDiagramPanel.currentPanel.addRequirementToDiagram(item.resourceUri.fsPath);
  });

  context.subscriptions.push(openDiagramCmd, customEditor, addToDiagramCmd);


  const treeView = vscode.window.createTreeView('doorstop.treeView', {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
    dragAndDropController: dndController
  });
  const commandsView = vscode.window.createTreeView('doorstop.commandsView', {
    treeDataProvider: commandsProvider,
    showCollapseAll: false
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
    commandsView,
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

