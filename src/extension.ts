import * as vscode from 'vscode';

import { DoorstopTreeProvider,RequirementTreeItem } from './requirementTree';
import { DoorstopDiagramPanel } from './diagrammPanel';
import { registerHoverProvider } from './hoverProvider';
import { recordViewedRequirement, registerCompletionProvider } from './completionProvider';
import { DoorstopServer, installServerPackage, isServerPackageInstalled, SERVER_PACKAGE_NAME } from './doorstopServer';
import { registerDeriveProvider } from './deriveProvider';
import { registerReviewLensProvider } from './reviewLensProvider';
import { registerDefinitionProvider } from './definitionProvider';
import { DoorstopCommandsProvider } from './commandsProvider';
import { registerDoorstopCommands } from './doorstopCommands';
import { ProblemsProvider, registerProblemsProvider } from './problemsProvider';
interface DoorstopDiagramDocument extends vscode.CustomDocument {
  diagram: unknown;
}
export async function activate(context: vscode.ExtensionContext) {
  console.log('[Doorstop][activate] Extension activation started');
  vscode.window.showInformationMessage('Doorstop VS Code Extension is active!');

  const doorstopServer = new DoorstopServer();
  context.subscriptions.push(doorstopServer);

  // Persisted per-user preference (not workspace config): whether the Explorer
  // tree automatically reveals the active requirement. Defaults to true (today's
  // existing behavior) if unset or unreadable. Mirrored into a when-clause
  // context key so the two view/title toggle buttons can react to it.
  let autoRevealEnabled = context.globalState.get<boolean>('doorstop.autoRevealEnabled', true);
  void vscode.commands.executeCommand('setContext', 'doorstop.autoRevealEnabled', autoRevealEnabled);

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

  // Declared before every closure that uses it. It stays undefined until the
  // workspaceFolder block below assigns it, so the optional calls on it are
  // genuine no-ops during the first server start rather than a dead-zone error.
  let problemsProvider: ProblemsProvider | undefined;

  // Spawns the server process and reports the outcome; split out of
  // startDoorstopServer so the missing-package install flow below can call it
  // again once the package has just been installed (FR-006), without
  // duplicating the spawn/report logic.
  const spawnServerProcess = async (pythonPath: string, restart: boolean): Promise<void> => {
    try {
      if (restart) {
        await doorstopServer.restart(workspaceFolder!.uri.fsPath, pythonPath);
      } else {
        await doorstopServer.start(workspaceFolder!.uri.fsPath, pythonPath);
      }
      console.log('[Doorstop][server] Server is ready at 127.0.0.1:7867');
      void vscode.window.showInformationMessage('Doorstop server is ready.');
      // A restart means the tree may have changed underneath us; on the first
      // start this is a no-op and the initial check runs at registration.
      problemsProvider?.scheduleRefresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[Doorstop][server] Failed to start:', message);
      void vscode.window.showWarningMessage(`Doorstop server unavailable: ${message}`);
    }
  };

  // Shown instead of the generic startup failure when the interpreter is
  // resolved but doesn't have the server package (spec 016). Dismissing (or
  // not choosing "Install") leaves the server stopped, same as today's
  // failure state (FR-009) - no install is attempted and no retry loop spams
  // further prompts.
  const promptToInstallServerPackage = async (pythonPath: string, restart: boolean): Promise<void> => {
    const selection = await vscode.window.showWarningMessage(
      `The ${SERVER_PACKAGE_NAME} Python package is not installed in the selected interpreter. ` +
      'Doorstop server features will not work until it is installed.',
      'Install',
      'Dismiss'
    );
    if (selection !== 'Install') {
      return;
    }

    const outcome = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        cancellable: false,
        title: `Installing ${SERVER_PACKAGE_NAME}...`
      },
      () => installServerPackage(pythonPath)
    );

    if (outcome.success) {
      void vscode.window.showInformationMessage(`${SERVER_PACKAGE_NAME} installed successfully.`);
      await spawnServerProcess(pythonPath, restart);
    } else {
      console.error('[Doorstop][server] Package install failed:', outcome.output);
      // Nothing is recorded here beyond this call returning, so the next
      // server-start or "Doorstop: Restart Server" attempt re-checks and
      // re-prompts rather than remembering this as a permanent failure (FR-007).
      void vscode.window.showErrorMessage(
        `Failed to install ${SERVER_PACKAGE_NAME}: ${outcome.output.trim() || 'unknown error'}`
      );
    }
  };

  const startDoorstopServer = async (restart = false): Promise<void> => {
    if (!workspaceFolder || !(await findDoorstopMarker())) {
      void vscode.window.showWarningMessage('No .doorstop.yml project was found in the workspace.');
      return;
    }

    let pythonPath: string;
    try {
      pythonPath = await getActivePythonPath();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      void vscode.window.showWarningMessage(`Doorstop server unavailable: ${message}`);
      return;
    }

    // Re-checked on every attempt (initial activation and manual restart),
    // never cached, so switching interpreters is always reflected (FR-010).
    if (!(await isServerPackageInstalled(pythonPath))) {
      await promptToInstallServerPackage(pythonPath, restart);
      return;
    }

    await spawnServerProcess(pythonPath, restart);
  };

  const restartServerCommand = vscode.commands.registerCommand(
    'doorstop.restartServer',
    () => startDoorstopServer(true)
  );
  context.subscriptions.push(restartServerCommand);

  if (workspaceFolder) {
    await startDoorstopServer();
  }

  const treeProvider = new DoorstopTreeProvider(doorstopServer);
  const commandsProvider = new DoorstopCommandsProvider();
  context.subscriptions.push(...registerDoorstopCommands({
    context,
    server: doorstopServer,
    tree: treeProvider,
    utilities: {
      refresh: () => {
        commandsProvider.refresh();
        problemsProvider?.scheduleRefresh();
      }
    },
    workspaceFolder: workspaceFolder || vscode.workspace.workspaceFolders?.[0] as vscode.WorkspaceFolder
  }));
  if (workspaceFolder) {
    // Registered first so the providers below can ask it to re-check after a
    // mutation they caused.
    problemsProvider = registerProblemsProvider(context, {
      server: doorstopServer,
      workspaceFolder
    });
    // Only worth a first pass if a server actually came up; when it did not,
    // startDoorstopServer has already told the user why, and a second warning
    // about problems would just be noise.
    if (doorstopServer.isRunning) {
      void problemsProvider.refreshNow();
    }
    // Forces a full re-check, bypassing the debounce (FR-013).
    context.subscriptions.push(vscode.commands.registerCommand(
      'doorstop.recheckProblems',
      () => problemsProvider?.refreshNow()
    ));
    const onChanged = (): void => {
      treeProvider.refresh();
      problemsProvider?.scheduleRefresh();
    };
    registerDeriveProvider(context, { server: doorstopServer, onChanged });
    registerReviewLensProvider(context, { server: doorstopServer, onChanged });
    registerDefinitionProvider(context, {
      server: doorstopServer,
      workspaceFolder
    });
  }
  const newDiagramCmd = vscode.commands.registerCommand('doorstop.newDiagram', async () => {
    const defaultUri = workspaceFolder
      ? vscode.Uri.joinPath(workspaceFolder.uri, 'diagram.doorstop.json')
      : undefined;
    const target = await vscode.window.showSaveDialog({
      defaultUri,
      filters: { 'Doorstop Diagram': ['doorstop.json'] },
      saveLabel: 'Create Diagram'
    });
    if (!target) {
      return;
    }
    // showSaveDialog does not reliably append compound extensions; the CustomEditor
    // only activates for files matching the "*.doorstop.json" filenamePattern.
    const uri = target.fsPath.endsWith('.doorstop.json')
      ? target
      : vscode.Uri.file(target.fsPath.replace(/\.json$/i, '') + '.doorstop.json');
    try {
      await vscode.workspace.fs.writeFile(uri, DoorstopDiagramPanel.serializeDiagram({ nodes: [], edges: [] }));
      await vscode.commands.executeCommand('vscode.openWith', uri, 'doorstop.diagram');
    } catch (e) {
      vscode.window.showErrorMessage(`Failed to create diagram: ${e instanceof Error ? e.message : String(e)}`);
    }
  });
  const documentChangeEvent = new vscode.EventEmitter<vscode.CustomDocumentContentChangeEvent<DoorstopDiagramDocument>>();
  const diagramEditorProvider: vscode.CustomEditorProvider<DoorstopDiagramDocument> = {
    onDidChangeCustomDocument: documentChangeEvent.event,
    async openCustomDocument(uri, openContext) {
      // After a crash or reload VS Code hands back the backup it last took, and the
      // editor must reopen from that hot-exit copy rather than from the (stale)
      // file on disk - otherwise every unsaved diagram edit is silently lost.
      // backupCustomDocument returns the destination URI as the backup id.
      const backupUri = openContext.backupId ? vscode.Uri.parse(openContext.backupId) : undefined;
      let diagram;
      if (backupUri) {
        try {
          diagram = await DoorstopDiagramPanel.readDiagram(backupUri);
        } catch (e) {
          console.warn('[Doorstop][diagram] Backup could not be read, falling back to the saved file:', e);
        }
      }
      return {
        uri,
        diagram: diagram ?? await DoorstopDiagramPanel.readDiagram(uri),
        dispose() { }
      };
    },
    async resolveCustomEditor(document, webviewPanel) {
      await DoorstopDiagramPanel.createForCustomEditor(
        webviewPanel,
        context.extensionUri,
        // Getter, not a snapshot: the webview reloads whenever its tab is hidden and
        // shown again, and must be handed the document's content as it is *now*.
        () => document.diagram,
        diagram => {
          document.diagram = diagram;
          documentChangeEvent.fire({ document });
        },
        doorstopServer,
        treeProvider
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

  context.subscriptions.push(newDiagramCmd, customEditor, addToDiagramCmd);


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
      if (!autoRevealEnabled) {
        console.log('[Doorstop][activateRequirement] Auto-reveal disabled, skipping');
        return;
      }
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

  const toggleAutoRevealCommand = vscode.commands.registerCommand('doorstop.toggleAutoReveal', async () => {
    autoRevealEnabled = false;
    await context.globalState.update('doorstop.autoRevealEnabled', false);
    await vscode.commands.executeCommand('setContext', 'doorstop.autoRevealEnabled', false);
  });

  const enableAutoRevealCommand = vscode.commands.registerCommand('doorstop.enableAutoReveal', async () => {
    autoRevealEnabled = true;
    await context.globalState.update('doorstop.autoRevealEnabled', true);
    await vscode.commands.executeCommand('setContext', 'doorstop.autoRevealEnabled', true);
  });

  const showDiagramCommand = vscode.commands.registerCommand('doorstop.showDiagram', async () => {
    const [uri] = (await vscode.window.showOpenDialog({
      defaultUri: workspaceFolder?.uri,
      filters: { 'Doorstop Diagram': ['json'] },
      canSelectMany: false,
      openLabel: 'Open Diagram'
    })) ?? [];
    if (!uri) {
      return;
    }
    await vscode.commands.executeCommand('vscode.openWith', uri, 'doorstop.diagram');
  });

  context.subscriptions.push(
    treeView,
    commandsView,
    showDiagramCommand,
    activateRequirementCommand,
    toggleAutoRevealCommand,
    enableAutoRevealCommand
  );

  const syncActiveRequirement = async (editor: vscode.TextEditor | undefined) => {
    console.log('[Doorstop][syncActiveRequirement] Editor:', editor?.document.uri.toString() ?? '<none>');
    recordViewedRequirement(editor?.document.uri);
    if (!autoRevealEnabled) {
      console.log('[Doorstop][syncActiveRequirement] Auto-reveal disabled, skipping');
      return;
    }
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

  registerHoverProvider(context, { server: doorstopServer });
  registerCompletionProvider(context, { server: doorstopServer });

  // Exported purely for extension-host tests (src/test/extension.test.ts) to
  // observe internal state that has no other public surface; not used by the
  // extension itself or intended for other extensions to depend on.
  return { treeProvider, problemsProvider };
}

export function deactivate() {}

