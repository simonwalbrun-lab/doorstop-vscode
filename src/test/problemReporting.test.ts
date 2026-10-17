import * as assert from 'assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

import * as vscode from 'vscode';

import { DoorstopApiError, DoorstopServer } from '../doorstopServer';
import { ValidationIssue, ValidationResponse } from '../doorstopTypes';
import {
  ProblemReportingMode,
  ProblemsProvider,
  ProblemsRefresh,
  registerProblemsProvider,
  watchProblemReportingMode
} from '../problemsProvider';
import { setProgressForTest } from '../progress';

// Background checking and reporting modes (spec 032), against a stub server whose
// /validate answers only when the test says so. Real timers: the 1 s progress
// threshold and the 300 ms debounce are part of the behaviour under test.

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));
const tick = (): Promise<void> => sleep(0);

interface Check {
  signal?: AbortSignal;
  resolve(value: ValidationResponse): void;
  reject(error: unknown): void;
}

const ISSUE: ValidationIssue = {
  severity: 'warning', check: 'no_text', message: 'no text', documentPrefix: 'REQ', uids: [], relatedUid: null, field: null
};

interface Harness {
  provider: ProblemsProvider;
  checks: Check[];
  failures: string[];
  dispose(): void;
}

function harness(): Harness {
  const checks: Check[] = [];
  const server = {
    request: (_method: string, pathName: string, _body?: unknown, options: { signal?: AbortSignal } = {}) => {
      if (pathName === '/tree') {
        return Promise.resolve({ documents: [] });
      }
      return new Promise((resolve, reject) => {
        checks.push({ signal: options.signal, resolve, reject });
        options.signal?.addEventListener('abort', () => {
          const aborted = new Error('aborted');
          aborted.name = 'AbortError';
          reject(aborted);
        });
      });
    }
  } as unknown as DoorstopServer;
  const subscriptions: vscode.Disposable[] = [];
  const failures: string[] = [];
  const provider = registerProblemsProvider(
    { subscriptions } as unknown as vscode.ExtensionContext,
    { server, workspaceFolder: vscode.workspace.workspaceFolders![0], reportFailure: message => failures.push(message) }
  );
  return { provider, checks, failures, dispose: () => subscriptions.forEach(subscription => subscription.dispose()) };
}

/** A provider that already shows one successful result. */
async function withResult(): Promise<Harness & { first: ProblemsRefresh }> {
  const h = harness();
  const pass = h.provider.refreshNow();
  await tick();
  h.checks[0].resolve({ issues: [ISSUE] });
  await pass;
  return { ...h, first: h.provider.getLastRefresh()! };
}

suite('Background problem checking (032 US1, US3)', function () {
  this.timeout(10_000);
  let shown: vscode.ProgressOptions[];
  let cancelShown: boolean;

  setup(() => {
    shown = [];
    cancelShown = false;
    setProgressForTest(async (options, task) => {
      shown.push(options);
      const source = new vscode.CancellationTokenSource();
      const result = task({ report: () => undefined }, source.token);
      if (cancelShown) {
        source.cancel();
      }
      return result;
    });
  });
  teardown(() => setProgressForTest(undefined));

  // Spec 032 FR-004
  test('the previous result stays until a new one replaces it in one step', async () => {
    const h = await withResult();
    try {
      const events: (ProblemsRefresh | undefined)[] = [];
      h.provider.onDidRefresh(event => events.push(event));
      const pass = h.provider.refreshNow();
      await tick();
      assert.strictEqual(h.provider.getLastRefresh(), h.first, 'unchanged while the check runs');
      h.checks[1].resolve({ issues: [] });
      await pass;
      assert.deepStrictEqual(h.provider.getLastRefresh()?.unfiltered, { issues: [] });
      assert.strictEqual(events.length, 1, 'one update, not a partial one first');
    } finally {
      h.dispose();
    }
  });

  // Spec 032 FR-002
  test('a newer check aborts the request of the older one', async () => {
    const h = harness();
    try {
      void h.provider.refreshNow();
      await tick();
      void h.provider.refreshNow();
      await tick();
      assert.strictEqual(h.checks[0].signal?.aborted, true);
      assert.strictEqual(h.checks[1].signal?.aborted, false);
      h.checks[1].resolve({ issues: [] });
    } finally {
      h.dispose();
    }
  });

  // Spec 032 FR-009
  test('a cancelled or aborted check keeps the problems and reports nothing', async () => {
    const h = await withResult();
    try {
      for (const error of [new DoorstopApiError('CANCELLED', 'superseded', 409), Object.assign(new Error('x'), { name: 'AbortError' })]) {
        const pass = h.provider.refreshNow();
        await tick();
        h.checks[h.checks.length - 1].reject(error);
        await pass;
        assert.strictEqual(h.provider.getLastRefresh(), h.first);
      }
      assert.deepStrictEqual(h.failures, []);
    } finally {
      h.dispose();
    }
  });

  // Spec 032 FR-003
  test('a check the server stopped because of a change is run again', async () => {
    const h = await withResult();
    try {
      const pass = h.provider.refreshNow();
      await tick();
      h.checks[1].reject(new DoorstopApiError('CANCELLED', 'changed', 409));
      await pass;
      await sleep(400);
      assert.strictEqual(h.checks.length, 3, 'one more check after the debounce');
      h.checks[2].resolve({ issues: [] });
    } finally {
      h.dispose();
    }
  });

  // Spec 032 FR-007
  test('an automatic check over 1 s shows the status-bar spinner, a fast one nothing', async () => {
    const h = await withResult();
    try {
      assert.strictEqual(shown.length, 0, 'the fast first check showed nothing');
      const pass = h.provider.refreshNow();
      await sleep(1200);
      h.checks[1].resolve({ issues: [] });
      await pass;
      assert.strictEqual(shown.length, 1);
      assert.strictEqual(shown[0].location, vscode.ProgressLocation.Window);
    } finally {
      h.dispose();
    }
  });

  // Spec 032 FR-008, FR-009
  test('an explicit check shows a cancellable notification; Cancel keeps the problems', async () => {
    const h = await withResult();
    try {
      cancelShown = true;
      await h.provider.checkExplicitly();
      assert.strictEqual(shown.length, 1);
      assert.strictEqual(shown[0].location, vscode.ProgressLocation.Notification);
      assert.strictEqual(shown[0].cancellable, true);
      assert.strictEqual(h.checks[1].signal?.aborted, true, 'Cancel aborted the request');
      assert.strictEqual(h.provider.getLastRefresh(), h.first);
      assert.deepStrictEqual(h.failures, []);
    } finally {
      h.dispose();
    }
  });
});

suite('Problem reporting modes (032 US4)', function () {
  this.timeout(10_000);

  // Spec 032 FR-011
  test('On demand checks only when asked; Off never checks', async () => {
    const h = harness();
    try {
      h.provider.setMode('onDemand');
      h.provider.scheduleRefresh();
      await sleep(400);
      assert.strictEqual(h.checks.length, 0, 'no automatic check in On demand');
      const explicit = h.provider.checkExplicitly();
      await tick();
      assert.strictEqual(h.checks.length, 1, 'Refresh checks in On demand');
      h.checks[0].resolve({ issues: [] });
      await explicit;

      h.provider.setMode('off');
      h.provider.scheduleRefresh();
      await h.provider.refreshNow();
      await h.provider.checkExplicitly();
      await sleep(400);
      assert.strictEqual(h.checks.length, 1, 'nothing checks in Off');
    } finally {
      h.dispose();
    }
  });

  // Spec 032 FR-012
  test('switching to Off aborts the check and clears the problems', async () => {
    const h = await withResult();
    try {
      const events: (ProblemsRefresh | undefined)[] = [];
      h.provider.onDidRefresh(event => events.push(event));
      void h.provider.refreshNow();
      await tick();
      h.provider.setMode('off');
      assert.strictEqual(h.checks[1].signal?.aborted, true);
      assert.strictEqual(h.provider.getLastRefresh(), undefined);
      assert.deepStrictEqual(events, [undefined], 'the document view is told to clear');
    } finally {
      h.dispose();
    }
  });

  // Spec 032 FR-013
  test('Automatic starts a check; On demand neither starts nor cancels one', async () => {
    const h = harness();
    try {
      h.provider.setMode('onDemand');
      assert.strictEqual(h.checks.length, 0);
      h.provider.setMode('automatic');
      await tick();
      assert.strictEqual(h.checks.length, 1, 'switching to Automatic checks');
      h.provider.setMode('onDemand');
      assert.strictEqual(h.checks[0].signal?.aborted, false, 'the running check finishes');
      h.checks[0].resolve({ issues: [] });
    } finally {
      h.dispose();
    }
  });

  // Spec 032 FR-015
  test('changing the per-kind settings re-filters without a new check', async () => {
    const h = await withResult();
    try {
      const events: (ProblemsRefresh | undefined)[] = [];
      h.provider.onDidRefresh(event => events.push(event));
      await h.provider.refilter();
      assert.strictEqual(h.checks.length, 1, 'no request');
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0]?.unfiltered, h.first.unfiltered);
    } finally {
      h.dispose();
    }
  });
});

suite('Problem reporting button (032 US4)', function () {
  this.timeout(20_000);
  const settingsFolder = path.join(vscode.workspace.workspaceFolders![0].uri.fsPath, '.vscode');
  const hadSettingsFolder = fs.existsSync(settingsFolder);
  const config = (): vscode.WorkspaceConfiguration => vscode.workspace.getConfiguration('doorstop');

  suiteSetup(async () => {
    await vscode.extensions.getExtension('SimonWalbrun.doorstop')?.activate();
  });

  suiteTeardown(async () => {
    await config().update('problemReporting', undefined, vscode.ConfigurationTarget.Workspace);
    if (!hadSettingsFolder) {
      fs.rmSync(settingsFolder, { recursive: true, force: true });
    }
  });

  // Spec 032 FR-017
  test('the button command writes the next mode to the workspace settings', async () => {
    await vscode.commands.executeCommand('doorstop.problemReporting.toOnDemand');
    assert.strictEqual(config().inspect('problemReporting')?.workspaceValue, 'onDemand');
    await vscode.commands.executeCommand('doorstop.problemReporting.toOff');
    assert.strictEqual(config().inspect('problemReporting')?.workspaceValue, 'off');
    await vscode.commands.executeCommand('doorstop.problemReporting.toAutomatic');
    assert.strictEqual(config().inspect('problemReporting')?.workspaceValue, 'automatic');
  });

  // Spec 032 FR-019
  test('a setting changed elsewhere moves the button and the provider', async () => {
    const shownModes: ProblemReportingMode[] = [];
    const providerModes: ProblemReportingMode[] = [];
    const watcher = watchProblemReportingMode(
      () => ({ setMode: (mode: ProblemReportingMode) => providerModes.push(mode) }) as unknown as ProblemsProvider,
      mode => shownModes.push(mode)
    );
    try {
      await config().update('problemReporting', 'off', vscode.ConfigurationTarget.Workspace);
      for (let i = 0; i < 50 && !providerModes.includes('off'); i++) {
        await sleep(20);
      }
      assert.strictEqual(shownModes.at(-1), 'off', 'the context key follows');
      assert.deepStrictEqual(providerModes, ['off']);
    } finally {
      watcher.dispose();
    }
  });
});
