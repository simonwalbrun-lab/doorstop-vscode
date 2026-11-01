import * as vscode from 'vscode';

import { DoorstopTreeProvider, registerTreeViews } from './requirementTree';
import { registerAttachments } from './attachments';
import { registerDiagramEditor } from './diagrammPanel';
import { registerHoverProvider } from './hoverProvider';
import { recordViewedRequirement, registerCompletionProvider } from './completionProvider';
import { registerQuickEntry } from './quickEntry';
import { DoorstopServer } from './doorstopServer';
import { initTiming, registerCommand } from './timing';
import { registerDeriveProvider } from './deriveProvider';
import { registerReviewCodeActionProvider } from './reviewCodeActionProvider';
import { registerReviewCommands } from './reviewLensProvider';
import { registerDefinitionProvider } from './definitionProvider';
import { registerCallHierarchyProvider } from './callHierarchyProvider';
import { DoorstopCommandsProvider } from './commandsProvider';
import { registerDoorstopCommands } from './doorstopCommands';
import { isRequirementFile, ProblemsProvider, problemReportingMode, registerProblemsProvider, watchProblemReportingMode } from './problemsProvider';
import { DocumentViewHandle, registerDocumentView } from './documentViewProvider';
import { registerDocumentViewLanguage } from './documentViewLanguage';
import { registerFilterNotebook } from './filterNotebook';
import { registerHeaderFolding } from './headerFolding';
import { registerServerStartup } from './serverStartup';
import { registerTaskToggle } from './taskToggle';

export async function activate(context: vscode.ExtensionContext) {
  initTiming(context);

  const doorstopServer = new DoorstopServer();
  context.subscriptions.push(doorstopServer);

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  let refreshViews: () => void = () => undefined;

  // Declared before every closure that uses it. It stays undefined until the
  // workspaceFolder block below assigns it, so the optional calls on it are
  // genuine no-ops during the first server start rather than a dead-zone error.
  let problemsProvider: ProblemsProvider | undefined;
  let documentView: DocumentViewHandle | undefined;

  await registerServerStartup(context, doorstopServer, workspaceFolder, {
    // A restart means the tree may have changed underneath us; on the first
    // start this is a no-op and the initial check runs at registration.
    onStarted: () => problemsProvider?.scheduleRefresh(),
    onRestartCommand: () => refreshViews()
  });

  const treeProvider = new DoorstopTreeProvider(doorstopServer);
  const commandsProvider = new DoorstopCommandsProvider();
  refreshViews = () => {
    treeProvider.refresh();
    commandsProvider.refresh();
    problemsProvider?.scheduleRefresh();
  };
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
    workspaceFolder,
    problems: () => problemsProvider
  }));
  // The tree view's eye button cycles the problem-reporting mode (spec 032
  // FR-017..019): one command per target mode, each with its own icon.
  for (const mode of ['onDemand', 'off', 'automatic'] as const) {
    const id = `doorstop.problemReporting.to${mode[0].toUpperCase()}${mode.slice(1)}`;
    context.subscriptions.push(registerCommand(id, () =>
      vscode.workspace.getConfiguration('doorstop').update('problemReporting', mode, vscode.ConfigurationTarget.Workspace)
    ));
  }
  context.subscriptions.push(watchProblemReportingMode(() => problemsProvider));
  registerHeaderFolding(context);
  registerTaskToggle(context);
  // Filter notebooks (spec 022). Registered even without a server: a run then
  // reports "server not available" in the cell instead of the notebook failing to open.
  // A batch edit (spec 036) refreshes like the other mutations once onChanged exists below.
  let refreshAfterBatch: (() => void) | undefined;
  registerFilterNotebook(context, doorstopServer, () => refreshAfterBatch?.());
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
    // Only in Automatic mode: On demand and Off never check at startup (spec 032 FR-011).
    if (doorstopServer.isRunning && problemReportingMode() === 'automatic') {
      void problemsProvider.refreshNow();
    }
    // A problem kind switched on or off in the settings shows at once (spec 020
    // FR-004), re-filtering the last result rather than checking again (spec 032 FR-015).
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('doorstop.problems')) {
        void problemsProvider?.refilter();
      }
    }));
    const onChanged = (): void => {
      treeProvider.refresh();
      problemsProvider?.scheduleRefresh();
    };
    refreshAfterBatch = onChanged;
    // A `.doorstop.skip` added or removed outside the extension (spec 031 FR-007).
    const skipWatcher = vscode.workspace.createFileSystemWatcher('**/.doorstop.skip');
    skipWatcher.onDidCreate(onChanged);
    skipWatcher.onDidDelete(onChanged);
    context.subscriptions.push(skipWatcher);
    // A hand edit saved in the editor can change titles and order. Ids stay the
    // same, so VS Code keeps expanded nodes open across the reload.
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(document => {
      if (isRequirementFile(document, workspaceFolder)) {
        treeProvider.refresh();
      }
    }));
    registerDeriveProvider(context, { server: doorstopServer, onChanged });
    registerReviewCommands(context, { server: doorstopServer, onChanged });
    // Offers those commands as Quick Fixes on the problems registered above.
    registerReviewCodeActionProvider(context);
    registerDefinitionProvider(context, {
      server: doorstopServer,
      workspaceFolder
    });
    registerCallHierarchyProvider(context, { server: doorstopServer });
    // One Doorstop document as a single editable markdown text (spec 019).
    documentView = registerDocumentView(context, {
      server: doorstopServer,
      tree: treeProvider,
      onChanged
    });
    registerDocumentViewLanguage(context, {
      documentView,
      problems: problemsProvider,
      server: doorstopServer
    });
  }

  const dragAndDropController = registerDiagramEditor(context, doorstopServer, treeProvider);
  registerTreeViews(context, treeProvider, commandsProvider, dragAndDropController);

  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => {
    recordViewedRequirement(editor?.document.uri);
  }));
  recordViewedRequirement(vscode.window.activeTextEditor?.document.uri);

  registerHoverProvider(context, { server: doorstopServer });
  registerCompletionProvider(context, { server: doorstopServer });
  registerQuickEntry(context, doorstopServer);
  registerAttachments(context, { server: doorstopServer });

  // Exported purely for extension-host tests (src/test/extension.test.ts) to
  // observe internal state that has no other public surface; not used by the
  // extension itself or intended for other extensions to depend on.
  return { treeProvider, problemsProvider, documentView };
}

export function deactivate() {}
