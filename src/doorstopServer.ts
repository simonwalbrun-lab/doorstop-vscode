import { ChildProcess, spawn } from 'node:child_process';
import * as path from 'node:path';

export const DOORSTOP_SERVER_HOST = '127.0.0.1';
export const DOORSTOP_SERVER_PORT = 7867;

interface DoorstopServerOptions {
  host?: string;
  port?: number;
  startupTimeoutMs?: number;
  retryIntervalMs?: number;
}

export class DoorstopApiError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number) {
    super(message);
  }
}

/**
 * Matches how the OS reports a taken port across platforms: Python surfaces
 * `[Errno 98] Address already in use` on Linux, `[Errno 48]` on macOS and
 * `[WinError 10048]` on Windows.
 */
export const PORT_IN_USE_REGEX = /address already in use|EADDRINUSE|WinError 10048|Errno 48|Errno 98/i;

/** Exported so a test can assert the exact wording the user is shown. */
export function portInUseHint(port: number): string {
  return `\n\nPort ${port} is already in use. Another Doorstop server (perhaps from a `
    + 'second VS Code window, or a previous session that did not shut down) is still '
    + 'bound to it. Close it, then run "Doorstop: Restart Server".';
}

interface ErrorPayload {
  error?: { code?: string; message?: string };
}

export class DoorstopServer {
  private readonly host: string;
  private readonly port: number;
  private readonly startupTimeoutMs: number;
  private readonly retryIntervalMs: number;
  private process: ChildProcess | undefined;
  private startPromise: Promise<void> | undefined;
  private disposed = false;
  private recentStderr = '';

  constructor(options: DoorstopServerOptions = {}) {
    this.host = options.host || DOORSTOP_SERVER_HOST;
    this.port = options.port || DOORSTOP_SERVER_PORT;
    this.startupTimeoutMs = options.startupTimeoutMs || 15000;
    this.retryIntervalMs = options.retryIntervalMs || 100;
  }

  get isRunning(): boolean {
    return this.process !== undefined && this.process.exitCode === null && !this.process.killed;
  }

  start(projectPath: string, pythonPath: string): Promise<void> {
    if (this.disposed) {
      return Promise.reject(new Error('Doorstop server service has been disposed.'));
    }
    if (this.startPromise) {
      return this.startPromise;
    }

    this.recentStderr = '';

    this.startPromise = new Promise<void>((resolve, reject) => {
      const child = spawn(pythonPath, [
        '-m', 'doorstop_server',
        '--project', path.resolve(projectPath),
        '--host', this.host,
        '--port', String(this.port)
      ], {
        cwd: projectPath,
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      this.process = child;

      child.stdout?.on('data', data => {
        console.log(`[Doorstop][server] ${String(data).trimEnd()}`);
      });
      child.stderr?.on('data', data => {
        const text = String(data);
        console.warn(`[Doorstop][server] ${text.trimEnd()}`);
        this.recentStderr = (this.recentStderr + text).slice(-2000);
      });

      let settled = false;
      const settleReject = (error: Error): void => {
        if (settled) {
          return;
        }
        settled = true;
        this.process = undefined;
        reject(error);
      };

      child.on('error', error => {
        settleReject(new Error(`Unable to start ${pythonPath} -m doorstop_server: ${error.message}`));
      });
      child.on('exit', (code, signal) => {
        if (!settled) {
          settleReject(new Error(
            `doorstop_server exited before becoming ready (code ${code ?? 'none'}, `
            + `signal ${signal ?? 'none'}).${this.outputSuffix()}`
          ));
        }
      });

      void this.waitForHealthy().then(() => {
        if (settled) {
          return;
        }
        settled = true;
        resolve();
      }).catch(settleReject);
    });

    return this.startPromise;
  }

  restart(projectPath: string, pythonPath: string): Promise<void> {
    this.stopProcess();
    this.disposed = false;
    this.startPromise = undefined;
    return this.start(projectPath, pythonPath);
  }

  async request<T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', pathName: string, body?: unknown): Promise<T> {
    const response = await fetch(`http://${this.host}:${this.port}${pathName}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => undefined) as ErrorPayload | undefined;
      throw new DoorstopApiError(
        payload?.error?.code ?? 'UNKNOWN',
        payload?.error?.message ?? response.statusText,
        response.status
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }
    return response.json() as Promise<T>;
  }

  dispose(): void {
    this.disposed = true;
    this.stopProcess();
  }

  private stopProcess(): void {
    const child = this.process;
    this.process = undefined;
    if (child && child.exitCode === null && !child.killed) {
      child.kill();
    }
  }

  private async waitForHealthy(): Promise<void> {
    const deadline = Date.now() + this.startupTimeoutMs;
    while (Date.now() < deadline) {
      if (this.disposed) {
        throw new Error('Doorstop server startup was cancelled.');
      }
      if (await this.isHealthy()) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, this.retryIntervalMs));
    }
    // FR-006 applies to every startup failure, not just a process exit: without the
    // captured stderr a timeout gave the user a bare message and nothing to act on.
    throw new Error(
      `Timed out waiting for Doorstop server at ${this.host}:${this.port}.${this.outputSuffix()}`
    );
  }

  /**
   * The recent server output appended to a startup error (FR-006), plus an explicit
   * hint when that output shows the fixed port is already taken - the single most
   * common startup failure, and unrecognisable from a raw OSError traceback.
   */
  private outputSuffix(): string {
    const detail = this.recentStderr.trim();
    if (!detail) {
      return '';
    }
    const hint = PORT_IN_USE_REGEX.test(detail) ? portInUseHint(this.port) : '';
    return `\n${detail}${hint}`;
  }

  private async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`http://${this.host}:${this.port}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }
}

/** The PyPI distribution this repo publishes (server/pyproject.toml, server/.github/workflows/publish.yml). */
export const SERVER_PACKAGE_NAME = 'doorstop-vscode-server';

/** The importable module name `-m doorstop_server` (DoorstopServer.start) actually needs. */
const SERVER_MODULE_NAME = 'doorstop_server';

/**
 * The subset of node:child_process's ChildProcess this file relies on, kept
 * narrow so tests can hand in a fake process without constructing a real one.
 */
export interface MinimalChildProcess {
  stdout?: { on(event: 'data', listener: (chunk: unknown) => void): void } | null;
  stderr?: { on(event: 'data', listener: (chunk: unknown) => void): void } | null;
  on(event: 'error', listener: (error: Error) => void): void;
  on(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): void;
}

export type SpawnFn = (command: string, args: string[], options?: Record<string, unknown>) => MinimalChildProcess;

/**
 * Checks whether `doorstop_server` is importable in the given interpreter,
 * without actually importing it (find_spec has no import-time side effects)
 * and without the cost of starting the FastAPI app just to find out
 * (spec 016, research.md §1).
 *
 * Resolves `false` — never rejects — for every "not installed" reason (wrong
 * exit code or a spawn failure), so callers have exactly one boolean branch.
 */
export function isServerPackageInstalled(pythonPath: string, spawnFn: SpawnFn = spawn): Promise<boolean> {
  return new Promise<boolean>(resolve => {
    let settled = false;
    const settle = (value: boolean): void => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
    };

    let child: MinimalChildProcess;
    try {
      child = spawnFn(pythonPath, [
        '-c',
        `import importlib.util, sys; sys.exit(0 if importlib.util.find_spec('${SERVER_MODULE_NAME}') else 1)`
      ], { shell: false, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore'] });
    } catch {
      settle(false);
      return;
    }

    child.on('error', () => settle(false));
    child.on('exit', code => settle(code === 0));
  });
}

export interface InstallOutcome {
  success: boolean;
  /** Captured stdout+stderr, tail-truncated to the same 2000 characters as DoorstopServer.recentStderr. */
  output: string;
}

export interface InstallOptions {
  onOutput?: (chunk: string) => void;
  spawnFn?: SpawnFn;
}

/** At most one install per interpreter at a time (FR-008); cleared once that install settles. */
const inFlightInstalls = new Map<string, Promise<InstallOutcome>>();

/**
 * Installs the server package from PyPI into the given interpreter
 * (spec 016, research.md §2). Resolves `{ success: false, output }` on
 * failure rather than rejecting, so callers have one place to branch on the
 * outcome. A second call for the same `pythonPath` while one is already
 * running returns the same in-flight promise instead of spawning again.
 */
export function installServerPackage(pythonPath: string, options: InstallOptions = {}): Promise<InstallOutcome> {
  const existing = inFlightInstalls.get(pythonPath);
  if (existing) {
    return existing;
  }

  const spawnFn = options.spawnFn ?? spawn;
  const onOutput = options.onOutput;

  const promise = new Promise<InstallOutcome>(resolve => {
    let settled = false;
    let output = '';
    const appendOutput = (chunk: string): void => {
      output = (output + chunk).slice(-2000);
      onOutput?.(chunk);
    };
    const settle = (success: boolean): void => {
      if (settled) {
        return;
      }
      settled = true;
      resolve({ success, output });
    };

    let child: MinimalChildProcess;
    try {
      child = spawnFn(pythonPath, ['-m', 'pip', 'install', SERVER_PACKAGE_NAME], {
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });
    } catch (error) {
      appendOutput(error instanceof Error ? error.message : String(error));
      settle(false);
      return;
    }

    child.stdout?.on('data', data => appendOutput(String(data)));
    child.stderr?.on('data', data => appendOutput(String(data)));
    child.on('error', error => {
      appendOutput(error.message);
      settle(false);
    });
    child.on('exit', code => settle(code === 0));
  });

  inFlightInstalls.set(pythonPath, promise);
  void promise.finally(() => {
    inFlightInstalls.delete(pythonPath);
  });

  return promise;
}
