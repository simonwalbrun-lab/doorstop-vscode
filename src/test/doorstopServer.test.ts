import * as assert from 'assert';
import * as fs from 'node:fs/promises';
import * as http from 'node:http';
import { AddressInfo } from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';

import { DoorstopServer } from '../doorstopServer';

// The fixed port may already be held by another window's server. start() must
// only report ready when /health names our project (audit-fixes-2026-10, finding 1).

/** A stand-in for another window's server: answers /health for `projectRoot`. */
async function fakeHealthServer(projectRoot: string): Promise<{ port: number; close(): Promise<void> }> {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ status: 'ok', projectRoot }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    port: (server.address() as AddressInfo).port,
    close: () => new Promise(resolve => server.close(() => resolve()))
  };
}

suite('Doorstop server startup', () => {
  // Must exist: it is the spawned process's cwd, and a missing cwd fails the spawn itself.
  let ourProject = '';

  suiteSetup(async function () {
    // The extension host's own binary runs as Node only with this set; without it,
    // spawning it would open a VS Code window.
    if (!process.env.ELECTRON_RUN_AS_NODE) {
      this.skip();
    }
    ourProject = await fs.mkdtemp(path.join(os.tmpdir(), 'doorstop-our-project-'));
  });

  suiteTeardown(async () => {
    if (ourProject) {
      await fs.rm(ourProject, { recursive: true, force: true });
    }
  });

  test('does not adopt a server that serves another project', async function () {
    this.timeout(10000);
    const other = await fakeHealthServer(path.join(os.tmpdir(), 'doorstop-other-project'));
    const server = new DoorstopServer({ port: other.port, startupTimeoutMs: 1000, retryIntervalMs: 10 });
    try {
      // Node rejects `-m doorstop_server` and exits: our own server never comes up.
      await assert.rejects(server.start(ourProject, process.execPath));
    } finally {
      await server.dispose();
      await other.close();
    }
  });

  test('is ready once the server on the port serves our project', async function () {
    this.timeout(10000);
    const own = await fakeHealthServer(ourProject);
    const server = new DoorstopServer({ port: own.port, startupTimeoutMs: 1000, retryIntervalMs: 10 });
    try {
      await server.start(ourProject, process.execPath);
    } finally {
      await server.dispose();
      await own.close();
    }
  });
});
