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
          const detail = this.recentStderr.trim();
          const suffix = detail ? `\n${detail}` : '';
          settleReject(new Error(
            `doorstop_server exited before becoming ready (code ${code ?? 'none'}, signal ${signal ?? 'none'}).${suffix}`
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
    throw new Error(`Timed out waiting for Doorstop server at ${this.host}:${this.port}.`);
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
