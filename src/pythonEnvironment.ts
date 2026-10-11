import type * as vscode from 'vscode';

// Spec 029 FR-011..FR-013: the server runs only with the interpreter of the
// Python environment VS Code has activated. No PATH or setting fallback.

/** The slice of the Python extension's `environments` API used here. */
export interface PythonEnvironmentsApi {
  getActiveEnvironmentPath(uri?: vscode.Uri): Promise<{ path?: string } | undefined>;
  onDidChangeActiveEnvironmentPath?: vscode.Event<unknown>;
}

/** The active interpreter path, or undefined while none is active. */
export async function getActiveInterpreter(
  api: PythonEnvironmentsApi,
  uri?: vscode.Uri
): Promise<string | undefined> {
  const environment = await api.getActiveEnvironmentPath(uri);
  return environment?.path || undefined;
}

/** True when the install target is still the active interpreter (FR-013). */
export function sameInterpreter(current: string | undefined, offered: string): boolean {
  return current !== undefined && current === offered;
}

/**
 * Calls `onPath` with the active interpreter now (awaited) and again whenever it
 * changes to a different path. If none is active, calls `onWaiting` once and
 * waits for the change event (FR-011, FR-012, SC-005).
 */
export async function watchInterpreter(
  api: PythonEnvironmentsApi,
  uri: vscode.Uri | undefined,
  onPath: (path: string) => Promise<void> | void,
  onWaiting: () => void
): Promise<vscode.Disposable> {
  let last: string | undefined;
  let waitingShown = false;
  const check = async (): Promise<void> => {
    const path = await getActiveInterpreter(api, uri);
    if (!path) {
      if (!waitingShown) {
        waitingShown = true;
        onWaiting();
      }
      return;
    }
    if (path !== last) {
      last = path;
      await onPath(path);
    }
  };
  // Subscribe before the first read so a change in between is not lost.
  const subscription = api.onDidChangeActiveEnvironmentPath?.(() => { void check(); });
  await check();
  return { dispose: () => subscription?.dispose() };
}
