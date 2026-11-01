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
import { isRequirementFile, ProblemsProvider, registerProblemsProvider, watchProblemReportingMode } from './problemsProvider';
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

  // Stays undefined without a workspace folder, so the optional calls on it are no-ops.
  let problemsProvider: ProblemsProvider | undefined;
  let documentView: DocumentViewHandle | undefined;

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

  // Last, so every command and view above exists while the server is still
  // starting or the install prompt is open (bug activation-blocks-server-start).
  // Each successful start refreshes the views; the problems check that brings
  // runs in Automatic mode only, and only once a server came up (spec 032 FR-011).
  await registerServerStartup(context, doorstopServer, workspaceFolder, {
    onStarted: () => refreshViews(),
    onRestartCommand: () => refreshViews()
  });

  // Exported purely for extension-host tests (src/test/extension.test.ts) to
  // observe internal state that has no other public surface; not used by the
  // extension itself or intended for other extensions to depend on.
  return { treeProvider, problemsProvider, documentView, server: doorstopServer };
}

export function deactivate() {}
