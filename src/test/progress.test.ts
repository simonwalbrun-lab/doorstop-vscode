import * as assert from 'assert';

import * as vscode from 'vscode';

import { setProgressForTest, withDelayedProgress } from '../progress';

// Progress notifications by run time (spec 026). The editor offers no way to read
// open notifications, so a recording fake stands in for withProgress. Real timers:
// the 1 s threshold is the behaviour under test.

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

interface Shown {
  atMs: number;
  options: vscode.ProgressOptions;
  settled: boolean;
}

suite('Delayed progress (026)', function () {
  this.timeout(10_000);
  let shown: Shown[];
  let start: number;

  setup(() => {
    shown = [];
    start = Date.now();
    setProgressForTest(async (options, task) => {
      const call: Shown = { atMs: Date.now() - start, options, settled: false };
      shown.push(call);
      try {
        return await task({ report: () => undefined }, new vscode.CancellationTokenSource().token);
      } finally {
        call.settled = true;
      }
    });
  });

  teardown(() => setProgressForTest(undefined));

  test('slow work shows one notification by 1.2 s that closes with the work', async () => {
    const result = await withDelayedProgress('Doorstop: Slow…', async () => {
      await sleep(1500);
      return 42;
    });
    assert.strictEqual(result, 42);
    await sleep(0);
    assert.strictEqual(shown.length, 1);
    assert.ok(shown[0].atMs >= 1000 && shown[0].atMs <= 1200, `shown at ${shown[0].atMs} ms`);
    assert.strictEqual(shown[0].options.location, vscode.ProgressLocation.Notification);
    assert.strictEqual(shown[0].options.title, 'Doorstop: Slow…');
    assert.ok(shown[0].settled);
  });

  test('fast work shows no notification', async () => {
    await withDelayedProgress('Doorstop: Fast…', () => sleep(100));
    await sleep(1200);
    assert.strictEqual(shown.length, 0);
  });

  test('overlapping runs with the same title share one notification', async () => {
    const slow = (title: string): Promise<void> => withDelayedProgress(title, () => sleep(1500));
    await Promise.all([slow('Doorstop: Refresh…'), slow('Doorstop: Refresh…'), slow('Doorstop: Other…')]);
    await sleep(0);
    assert.deepStrictEqual(shown.map(call => call.options.title).sort(), ['Doorstop: Other…', 'Doorstop: Refresh…']);
  });

  test('slow failing work shows one notification and rethrows the original error', async () => {
    const boom = new Error('boom');
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => { unhandled.push(reason); };
    process.on('unhandledRejection', onUnhandled);
    try {
      await assert.rejects(
        withDelayedProgress('Doorstop: Failing…', async () => {
          await sleep(1500);
          throw boom;
        }),
        error => error === boom
      );
      await sleep(50);
      assert.strictEqual(shown.length, 1);
      assert.ok(shown[0].settled);
      assert.deepStrictEqual(unhandled, []);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});
