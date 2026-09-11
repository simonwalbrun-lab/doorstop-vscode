import * as assert from 'assert';
import { EventEmitter } from 'node:events';

import {
  installServerPackage,
  isServerPackageInstalled,
  MinimalChildProcess,
  SpawnFn
} from '../doorstopServer';

// Covers feature 016's package-presence check and install primitives. Both
// take an injectable spawn function so this suite needs no real Python
// interpreter, no network access, and no fixed port - constitution principle
// VI requires it to run deterministically and unattended in CI. See
// specs/016-install-server-package/research.md section 4.

class FakeChildProcess extends EventEmitter implements MinimalChildProcess {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
}

/** A spawn stand-in that immediately schedules the given exit code/output on the next tick. */
function fakeSpawn(exitCode: number | null, stdout = '', stderr = ''): { spawnFn: SpawnFn; calls: number[] } {
  const callArgsList: number[] = [];
  const spawnFn: SpawnFn = (_command, _args) => {
    const child = new FakeChildProcess();
    callArgsList.push(callArgsList.length);
    setImmediate(() => {
      if (stdout) {
        child.stdout.emit('data', stdout);
      }
      if (stderr) {
        child.stderr.emit('data', stderr);
      }
      child.emit('exit', exitCode, null);
    });
    return child;
  };
  return { spawnFn, calls: callArgsList };
}

/** A spawn stand-in that fires the process-level 'error' event instead of exiting. */
function erroringSpawn(): SpawnFn {
  return (_command, _args) => {
    const child = new FakeChildProcess();
    setImmediate(() => child.emit('error', new Error('spawn ENOENT')));
    return child;
  };
}

/** A spawn stand-in whose child never settles until the test resolves it manually. */
function controllableSpawn(): { spawnFn: SpawnFn; children: FakeChildProcess[] } {
  const children: FakeChildProcess[] = [];
  const spawnFn: SpawnFn = () => {
    const child = new FakeChildProcess();
    children.push(child);
    return child;
  };
  return { spawnFn, children };
}

suite('Server package install (feature 016)', () => {

  suite('isServerPackageInstalled', () => {
    test('resolves true when the interpreter reports the module importable', async () => {
      const { spawnFn } = fakeSpawn(0);
      const result = await isServerPackageInstalled('/fake/python', spawnFn);
      assert.strictEqual(result, true);
    });

    test('resolves false (not a rejection) when the interpreter exits non-zero', async () => {
      const { spawnFn } = fakeSpawn(1);
      const result = await isServerPackageInstalled('/fake/python', spawnFn);
      assert.strictEqual(result, false);
    });

    test('resolves false when the spawn itself errors (e.g. bad interpreter path)', async () => {
      const result = await isServerPackageInstalled('/does/not/exist', erroringSpawn());
      assert.strictEqual(result, false);
    });
  });

  suite('installServerPackage', () => {
    test('resolves success with captured output when the install exits zero', async () => {
      const { spawnFn } = fakeSpawn(0, 'Successfully installed doorstop-vscode-server\n');
      const outcome = await installServerPackage('/fake/python-a', { spawnFn });
      assert.strictEqual(outcome.success, true);
      assert.ok(outcome.output.includes('Successfully installed'));
    });

    test('resolves failure (not a rejection) with captured output when the install exits non-zero', async () => {
      const { spawnFn } = fakeSpawn(1, '', 'ERROR: Could not find a version that satisfies the requirement\n');
      const outcome = await installServerPackage('/fake/python-b', { spawnFn });
      assert.strictEqual(outcome.success, false);
      assert.ok(outcome.output.includes('Could not find a version'));
    });

    test('streams output chunks to onOutput as they arrive', async () => {
      const { spawnFn } = fakeSpawn(0, 'Collecting doorstop-vscode-server\n');
      const chunks: string[] = [];
      await installServerPackage('/fake/python-c', { spawnFn, onOutput: chunk => chunks.push(chunk) });
      assert.ok(chunks.some(chunk => chunk.includes('Collecting')));
    });

    test('two concurrent calls for the same interpreter share one underlying spawn', async () => {
      const { spawnFn, children } = controllableSpawn();

      const first = installServerPackage('/fake/python-shared', { spawnFn });
      const second = installServerPackage('/fake/python-shared', { spawnFn });

      assert.strictEqual(children.length, 1, 'a second concurrent call must not spawn again');

      children[0].emit('exit', 0, null);
      const [firstOutcome, secondOutcome] = await Promise.all([first, second]);
      assert.strictEqual(firstOutcome.success, true);
      assert.strictEqual(secondOutcome.success, true);
    });

    test('concurrent calls for two different interpreters spawn independently', async () => {
      const { spawnFn, children } = controllableSpawn();

      const first = installServerPackage('/fake/python-x', { spawnFn });
      const second = installServerPackage('/fake/python-y', { spawnFn });

      assert.strictEqual(children.length, 2, 'different interpreters must each get their own spawn');

      children[0].emit('exit', 0, null);
      children[1].emit('exit', 0, null);
      await Promise.all([first, second]);
    });

    test('a call after a prior call has settled spawns again rather than reusing the old result', async () => {
      const { spawnFn: firstSpawnFn } = fakeSpawn(1);
      const first = await installServerPackage('/fake/python-retry', { spawnFn: firstSpawnFn });
      assert.strictEqual(first.success, false);

      const { spawnFn: secondSpawnFn, calls } = fakeSpawn(0);
      const second = await installServerPackage('/fake/python-retry', { spawnFn: secondSpawnFn });
      assert.strictEqual(second.success, true);
      assert.strictEqual(calls.length, 1, 'the retry must spawn a fresh process');
    });
  });
});
