import * as assert from 'assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

import * as vscode from 'vscode';

import {
  buildExport, getEntries, getSummary, measure, parseServerTiming, recordServer,
  resetTiming, setMaxEntriesForTest, setTimingEnabled, TimingEntry
} from '../timing';

// Pure in-memory checks of the timing module (spec 023). No workspace, no server:
// server round trips are simulated with recordServer() and a canned header.

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const HEADER = 'wait;dur=0.1, load;dur=0.5, work;dur=0.3, route;desc="GET /tree"';

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));
const topLevel = (name: string): TimingEntry | undefined => getEntries().find(entry => entry.name === name);

suite('Execution Timing (023)', () => {
  setup(() => {
    resetTiming();
    setTimingEnabled(true);
  });

  teardown(() => {
    setTimingEnabled(false);
    setMaxEntriesForTest(10_000);
    resetTiming();
  });

  suite('US1 - per-operation timing', () => {
    test('a successful operation is recorded with its result untouched', async () => {
      assert.strictEqual(await measure('x', async () => 1), 1);
      assert.deepStrictEqual(getEntries().map(entry => [entry.name, entry.outcome]), [['x', 'ok']]);
      assert.ok(getEntries()[0].durationMs >= 0);
    });

    test('a failing operation re-throws the same error and is marked failed', async () => {
      const error = new Error('boom');
      await assert.rejects(measure('x', () => Promise.reject(error)), thrown => thrown === error);
      assert.strictEqual(topLevel('x')?.outcome, 'failed');
    });

    test('a cancelled operation is marked cancelled', async () => {
      await assert.rejects(measure('x', () => { throw new vscode.CancellationError(); }));
      assert.strictEqual(topLevel('x')?.outcome, 'cancelled');
    });

    test('nothing is recorded while timing is disabled', async () => {
      setTimingEnabled(false);
      await measure('x', () => undefined);
      assert.strictEqual(getEntries().length, 0);
    });

    test('overlapping operations each keep their own children', async () => {
      await Promise.all([
        measure('a', async () => {
          await sleep(10);
          await measure('inner-a', () => sleep(5));
        }),
        measure('b', async () => {
          await sleep(5);
          await measure('inner-b', () => sleep(10));
          recordServer('GET /validate', 1, 'ok', null);
        })
      ]);
      assert.deepStrictEqual(topLevel('a')?.children.map(child => child.name), ['inner-a']);
      assert.deepStrictEqual(topLevel('b')?.children.map(child => child.name), ['inner-b', 'GET /validate']);
      assert.deepStrictEqual(getEntries().map(entry => entry.name).sort(), ['a', 'b']);
    });

    test('enabling during an operation that started disabled records nothing for it', async () => {
      setTimingEnabled(false);
      await measure('x', () => setTimingEnabled(true));
      assert.strictEqual(getEntries().length, 0);
    });

    test('work finishing after its parent is logged on its own', async () => {
      await measure('parent', () => {
        setTimeout(() => void measure('late', () => undefined), 20);
      });
      await sleep(60);
      assert.deepStrictEqual(topLevel('parent')?.children, []);
      assert.ok(topLevel('late'), 'late work should be a top-level entry');
    });

    test('10,000 measured no-ops stay well inside the overhead budget (SC-004)', async () => {
      const t0 = performance.now();
      for (let i = 0; i < 10_000; i++) {
        await measure('noop', () => undefined);
      }
      const elapsed = performance.now() - t0;
      // Generous bound against gross regressions only; the < 1 ms target is checked by hand.
      assert.ok(elapsed < 10_000, `10,000 calls took ${elapsed.toFixed(0)} ms`);
    });

    test('every command is registered through the timed wrapper (SC-002)', () => {
      const offenders: string[] = [];
      const scan = (dir: string): void => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name !== 'test') {
              scan(full);
            }
          } else if (entry.name.endsWith('.ts') && entry.name !== 'timing.ts'
            && fs.readFileSync(full, 'utf8').includes('vscode.commands.registerCommand(')) {
            offenders.push(path.relative(REPO_ROOT, full));
          }
        }
      };
      scan(path.join(REPO_ROOT, 'src'));
      assert.deepStrictEqual(offenders, [], `use registerCommand from ./timing in: ${offenders.join(', ')}`);
    });
  });

  suite('US2 - summary', () => {
    test('counts and statistics per operation, sorted by total', async () => {
      for (let i = 0; i < 3; i++) {
        await measure('slow', () => sleep(5));
      }
      await measure('fast', () => undefined);
      const rows = getSummary();
      assert.deepStrictEqual(rows.map(row => row.name), ['slow', 'fast']);
      const slow = rows[0];
      assert.strictEqual(slow.count, 3);
      assert.ok(slow.minMs <= slow.avgMs && slow.avgMs <= slow.maxMs, JSON.stringify(slow));
      assert.ok(slow.minMs <= slow.p95Ms && slow.p95Ms <= slow.maxMs, JSON.stringify(slow));
    });

    test('evicted entries still count in the summary (FR-010)', async () => {
      setMaxEntriesForTest(5);
      for (let i = 0; i < 10; i++) {
        await measure('x', () => undefined);
      }
      assert.strictEqual(getEntries().length, 5);
      assert.strictEqual(getSummary()[0].count, 10);
    });

    test('reset clears entries and summary', async () => {
      await measure('x', () => undefined);
      resetTiming();
      assert.strictEqual(getEntries().length, 0);
      assert.deepStrictEqual(getSummary(), []);
    });

    test('a full buffer stays under 10 MB (SC-006)', async () => {
      for (let i = 0; i < 10_000; i++) {
        await measure('doorstop.refresh', () => recordServer('GET /tree', 1, 'ok', HEADER));
      }
      const bytes = Buffer.byteLength(JSON.stringify(getEntries()));
      assert.ok(bytes < 10 * 1024 * 1024, `${bytes} bytes`);
    });
  });

  suite('US3 - server stages', () => {
    test('parses wait/load/work and the route template', () => {
      assert.deepStrictEqual(parseServerTiming('wait;dur=1.5, load;dur=80, work;dur=12.25, route;desc="GET /tree"'), {
        stages: [
          { name: 'wait', durationMs: 1.5 },
          { name: 'load', durationMs: 80 },
          { name: 'work', durationMs: 12.25 }
        ],
        route: 'GET /tree'
      });
    });

    test('a missing or garbled header yields no stages', () => {
      for (const header of [null, undefined, '', 'garbage;;dur=x', ';;;,,,']) {
        assert.deepStrictEqual(parseServerTiming(header), { stages: [], route: undefined }, String(header));
      }
    });

    test('the route from the header names the server entry; without it the fallback is used', async () => {
      await measure('op', () => {
        recordServer('GET /tree', 1, 'ok', 'wait;dur=0, route;desc="GET /items/{uid}"');
        recordServer('DELETE /items/REQ-001', 1, 'failed', null);
      });
      assert.deepStrictEqual(
        topLevel('op')?.children.map(child => [child.name, child.source, child.outcome]),
        [['GET /items/{uid}', 'server', 'ok'], ['DELETE /items/REQ-001', 'server', 'failed']]
      );
    });
  });

  suite('US4 - export', () => {
    test('nothing to export without data', () => {
      assert.strictEqual(buildExport(), undefined);
    });

    test('export matches the schema shape', async () => {
      await measure('doorstop.refresh', () => recordServer('GET /tree', 1, 'ok', HEADER));
      const data = buildExport()!;
      assert.ok(!Number.isNaN(Date.parse(data.exportedAt)));
      assert.strictEqual(data.summary.length, 2);
      const check = (entry: Record<string, unknown>): void => {
        for (const key of ['name', 'source', 'start', 'durationMs', 'outcome', 'stages', 'children']) {
          assert.ok(key in entry, `missing ${key}`);
        }
        assert.ok(!Number.isNaN(Date.parse(entry.start as string)), 'start is an ISO date-time');
        (entry.children as Record<string, unknown>[]).forEach(check);
      };
      data.entries.forEach(entry => check(entry as unknown as Record<string, unknown>));
      assert.strictEqual(data.entries[0].children[0].stages.length, 3);
    });
  });
});
