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

  async request<T>(method: 'GET' | 'POST' | 'DELETE', pathName: string, body?: unknown): Promise<T> {
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
