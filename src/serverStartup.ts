import * as vscode from 'vscode';

import { DoorstopServer, installServerPackage, isServerPackageInstalled, SERVER_PACKAGE_NAME } from './doorstopServer';
import { withDelayedProgress } from './progress';
import { getActiveInterpreter, PythonEnvironmentsApi, sameInterpreter, watchInterpreter } from './pythonEnvironment';
import { registerCommand } from './timing';

export interface ServerStartupHooks {
  /** After every successful start or restart. */
  onStarted(): void;
  /** After "Doorstop: Restart Extension", whether or not the server came up. */
  onRestartCommand(): void;
}

/**
 * Starts the Doorstop server with the interpreter of the Python environment VS
 * Code has activated, offers to install the server package when it is missing,
 * and restarts on an environment switch or "Doorstop: Restart Extension".
 * Resolves once the first start attempt is over, so activation can check
 * `server.isRunning` afterwards.
 */
export async function registerServerStartup(
  context: vscode.ExtensionContext,
  server: DoorstopServer,
  workspaceFolder: vscode.WorkspaceFolder | undefined,
  hooks: ServerStartupHooks
): Promise<void> {
  // Spec 029 FR-011/FR-012: only the interpreter of the Python environment VS Code
  // has activated is ever used; no fallback. undefined while the extension is missing.
  const getPythonApi = async (): Promise<PythonEnvironmentsApi | undefined> => {
    const pythonExtension = vscode.extensions.getExtension('ms-python.python');
    if (!pythonExtension) {
      return undefined;
    }
    if (!pythonExtension.isActive) {
      await pythonExtension.activate();
    }
    const exports = pythonExtension.exports as { ready?: Promise<void>; environments?: PythonEnvironmentsApi };
    await exports.ready;
    return exports.environments;
  };
  const getActivePythonPath = async (): Promise<string | undefined> => {
    const api = await getPythonApi();
    return api ? getActiveInterpreter(api, workspaceFolder?.uri) : undefined;
  };

  // Spawns the server process and reports the outcome; split out of
  // startDoorstopServer so the missing-package install flow below can call it
  // again once the package has just been installed (FR-006), without
  // duplicating the spawn/report logic.
  const spawnServerProcess = async (folder: vscode.WorkspaceFolder, pythonPath: string, restart: boolean): Promise<void> => {
    try {
      await withDelayedProgress(
        restart ? 'Restarting Doorstop server…' : 'Starting Doorstop server…',
        () => restart
          ? server.restart(folder.uri.fsPath, pythonPath)
          : server.start(folder.uri.fsPath, pythonPath)
      );
      void vscode.window.showInformationMessage('Doorstop server is ready.');
      hooks.onStarted();
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
  const promptToInstallServerPackage = async (folder: vscode.WorkspaceFolder, pythonPath: string, restart: boolean): Promise<void> => {
    const selection = await vscode.window.showWarningMessage(
      `The ${SERVER_PACKAGE_NAME} Python package is not installed in the selected interpreter. ` +
      'Doorstop server features will not work until it is installed.',
      'Install',
      'Dismiss'
    );
    if (selection !== 'Install') {
      return;
    }

    // FR-013: the prompt may have been open while the environment changed. Install
    // nothing into the old one; the environment watcher below restarts the check
    // for the new one.
    if (!sameInterpreter(await getActivePythonPath(), pythonPath)) {
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
      await spawnServerProcess(folder, pythonPath, restart);
    } else {
      console.error('[Doorstop][server] Package install failed:', outcome.output);
      // Nothing is recorded here beyond this call returning, so the next
      // server-start or "Doorstop: Restart Extension" attempt re-checks and
      // re-prompts rather than remembering this as a permanent failure (FR-007).
      void vscode.window.showErrorMessage(
        `Failed to install ${SERVER_PACKAGE_NAME}: ${outcome.output.trim() || 'unknown error'}`
      );
    }
  };

  const startDoorstopServer = async (pythonPath: string, restart = false): Promise<void> => {
    if (!workspaceFolder) {
      return;
    }

    // Re-checked on every attempt (initial activation and manual restart),
    // never cached, so switching interpreters is always reflected (FR-010).
    if (!(await isServerPackageInstalled(pythonPath))) {
      await promptToInstallServerPackage(workspaceFolder, pythonPath, restart);
      return;
    }

    await spawnServerProcess(workspaceFolder, pythonPath, restart);
  };

  let waitingNoticeShown = false;
  const notifyWaitingForPython = (): void => {
    if (!waitingNoticeShown) {
      waitingNoticeShown = true;
      void vscode.window.showInformationMessage(
        'Doorstop: waiting for the Python environment to be activated. The server starts as soon as it is.'
      );
    }
  };

  // Spec 029 FR-014: re-resolve the environment, re-check the package, restart the
  // server and refresh the views.
  context.subscriptions.push(registerCommand('doorstop.restartExtension', async () => {
    const pythonPath = await getActivePythonPath();
    if (pythonPath) {
      await startDoorstopServer(pythonPath, true);
    } else {
      notifyWaitingForPython();
    }
    hooks.onRestartCommand();
  }));

  if (!workspaceFolder) {
    return;
  }
  // Starts now if an environment is active, otherwise as soon as one becomes
  // active (FR-011, FR-012); a later switch restarts with the new interpreter.
  // The first start (and any install prompt) is awaited, so activate() registers
  // this last; later switches are not awaited by anyone.
  let started = false;
  const api = await getPythonApi();
  if (!api) {
    void vscode.window.showWarningMessage('Doorstop server unavailable: The Python extension is not installed.');
    return;
  }
  context.subscriptions.push(await watchInterpreter(api, workspaceFolder.uri, async pythonPath => {
    const restart = started;
    started = true;
    await startDoorstopServer(pythonPath, restart);
  }, notifyWaitingForPython));
}
