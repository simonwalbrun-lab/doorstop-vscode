import { ChildProcess, spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as path from 'node:path';

export const DOORSTOP_SERVER_HOST = '127.0.0.1';
export const DOORSTOP_SERVER_PORT = 7867;

interface DoorstopServerOptions {
  host?: string;
  port?: number;
  startupTimeoutMs?: number;
  retryIntervalMs?: number;
}

export interface DoorstopCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export class DoorstopServer {
  private readonly host: string;
  private readonly port: number;
  private readonly startupTimeoutMs: number;
  private readonly retryIntervalMs: number;
  private process: ChildProcess | undefined;
  private startPromise: Promise<void> | undefined;
  private disposed = false;

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

    const command = this.resolveServerCommand(pythonPath);

    this.startPromise = new Promise<void>((resolve, reject) => {
      const child = spawn(command, [
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
        console.warn(`[Doorstop][server] ${String(data).trimEnd()}`);
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
        settleReject(new Error(`Unable to start ${command}: ${error.message}`));
      });
      child.on('exit', (code, signal) => {
        if (!settled) {
          settleReject(new Error(`${command} exited before becoming ready (code ${code ?? 'none'}, signal ${signal ?? 'none'}).`));
        }
      });

      void this.waitForPort().then(() => {
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

  runCommand(projectPath: string, pythonPath: string, args: string[]): Promise<DoorstopCommandResult> {
    const command = this.resolveCliCommand(pythonPath);
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: projectPath,
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', data => stdout += String(data));
      child.stderr?.on('data', data => stderr += String(data));
      child.once('error', error => reject(new Error(`Unable to run ${command}: ${error.message}`)));
      child.once('close', (code, signal) => {
        if (signal) {
          reject(new Error(`${command} was terminated by signal ${signal}.`));
          return;
        }
        resolve({ stdout, stderr, exitCode: code ?? 1 });
      });
    });
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

  private resolveServerCommand(pythonPath: string): string {
    const pythonDirectory = path.dirname(pythonPath);
    const executableName = process.platform === 'win32' ? 'doorstop-server.exe' : 'doorstop-server';
    const command = path.join(pythonDirectory, executableName);
    if (!fs.existsSync(command)) {
      throw new Error(`No Doorstop installation found in the selected Python environment (${pythonPath}).`);
    }
    return command;
  }

  private resolveCliCommand(pythonPath: string): string {
    const pythonDirectory = path.dirname(pythonPath);
    const executableName = process.platform === 'win32' ? 'doorstop.exe' : 'doorstop';
    const command = path.join(pythonDirectory, executableName);
    if (!fs.existsSync(command)) {
      throw new Error(`No Doorstop CLI installation found in the selected Python environment (${pythonPath}).`);
    }
    return command;
  }

  private async waitForPort(): Promise<void> {
    const deadline = Date.now() + this.startupTimeoutMs;
    while (Date.now() < deadline) {
      if (this.disposed) {
        throw new Error('Doorstop server startup was cancelled.');
      }
      if (await this.canConnect()) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, this.retryIntervalMs));
    }
    throw new Error(`Timed out waiting for Doorstop server at ${this.host}:${this.port}.`);
  }

  private canConnect(): Promise<boolean> {
    return new Promise(resolve => {
      const socket = net.createConnection({ host: this.host, port: this.port });
      const finish = (available: boolean): void => {
        socket.destroy();
        resolve(available);
      };
      socket.once('connect', () => finish(true));
      socket.once('error', () => finish(false));
      socket.setTimeout(this.retryIntervalMs, () => finish(false));
    });
  }
}
