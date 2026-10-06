import { AsyncLocalStorage } from 'node:async_hooks';

import * as vscode from 'vscode';

// Execution timing for developing the extension (spec 023). Off by default;
// everything lives in memory for the session. Server requests nest under the
// operation that issued them via AsyncLocalStorage, so overlapping commands
// keep their own children without threading a context through every call.

export type TimingOutcome = 'ok' | 'failed' | 'cancelled';

export interface Stage {
  name: string;
  durationMs: number;
}

export interface TimingEntry {
  name: string;
  source: 'extension' | 'server';
  /** Epoch ms. */
  start: number;
  durationMs: number;
  outcome: TimingOutcome;
  stages: Stage[];
  children: TimingEntry[];
}

export interface SummaryRow {
  name: string;
  count: number;
  totalMs: number;
  minMs: number;
  avgMs: number;
  p95Ms: number;
  maxMs: number;
}

interface Aggregate {
  count: number;
  totalMs: number;
  minMs: number;
  maxMs: number;
}

let enabled = false;
let maxEntries = 10_000;
/** Top-level entries only, oldest first. */
const entries: TimingEntry[] = [];
/** Exact per-name figures; never decremented when entries are evicted (FR-010). */
const summaries = new Map<string, Aggregate>();
const als = new AsyncLocalStorage<TimingEntry>();
/** Entries still running: a child only nests under a parent that has not finished yet. */
const running = new WeakSet<TimingEntry>();
let channel: vscode.OutputChannel | undefined;
let warned = false;

export function setTimingEnabled(value: boolean): void {
  enabled = value;
}

export function timingActive(): boolean {
  return enabled;
}

export function getEntries(): readonly TimingEntry[] {
  return entries;
}

export function setMaxEntriesForTest(value: number): void {
  maxEntries = value;
}

export function resetTiming(): void {
  entries.length = 0;
  summaries.clear();
}

/** Timing must never change what it measures (FR-012): bookkeeping errors are swallowed. */
function guard(fn: () => void): void {
  try {
    fn();
  } catch (error) {
    if (!warned) {
      warned = true;
      console.warn('[Doorstop][timing] bookkeeping failed:', error);
    }
  }
}

function complete(entry: TimingEntry, parent: TimingEntry | undefined): void {
  guard(() => {
    const aggregate = summaries.get(entry.name);
    if (aggregate) {
      aggregate.count++;
      aggregate.totalMs += entry.durationMs;
      aggregate.minMs = Math.min(aggregate.minMs, entry.durationMs);
      aggregate.maxMs = Math.max(aggregate.maxMs, entry.durationMs);
    } else {
      summaries.set(entry.name, { count: 1, totalMs: entry.durationMs, minMs: entry.durationMs, maxMs: entry.durationMs });
    }

    // Late work whose parent already finished (e.g. a debounced re-check a command
    // scheduled) is logged on its own rather than vanishing under a printed parent.
    if (parent && running.has(parent)) {
      parent.children.push(entry);
      return;
    }
    entries.push(entry);
    while (entries.length > maxEntries) {
      entries.shift();
    }
    channel?.appendLine(formatEntry(entry, 0).join('\n'));
  });
}

function isCancellation(error: unknown): boolean {
  return error instanceof vscode.CancellationError || (error instanceof Error && error.name === 'Canceled');
}

/**
 * Runs `fn` and records how long it took. Whether it is recorded is decided once,
 * at the start, so toggling the setting mid-run never leaves a partial entry.
 */
export async function measure<T>(name: string, fn: () => T | PromiseLike<T>): Promise<T> {
  if (!enabled) {
    return await fn();
  }
  const parent = als.getStore();
  const entry: TimingEntry = {
    name, source: 'extension', start: Date.now(), durationMs: 0, outcome: 'ok', stages: [], children: []
  };
  running.add(entry);
  const t0 = performance.now();
  try {
    return await als.run(entry, fn);
  } catch (error) {
    entry.outcome = isCancellation(error) ? 'cancelled' : 'failed';
    throw error;
  } finally {
    entry.durationMs = performance.now() - t0;
    running.delete(entry);
    complete(entry, parent);
  }
}

/** Every command goes through here so each one is timed (SC-002; enforced by a source scan test). */
export function registerCommand(id: string, handler: (...args: any[]) => unknown): vscode.Disposable {
  return vscode.commands.registerCommand(id, (...args: unknown[]) => measure(id, () => handler(...args)));
}

/**
 * Records one server round trip under the current operation. `header` is the
 * response's Server-Timing value; its route template replaces `fallbackName`.
 */
export function recordServer(fallbackName: string, durationMs: number, outcome: TimingOutcome, header?: string | null): void {
  guard(() => {
    const parsed = parseServerTiming(header);
    complete({
      name: parsed.route ?? fallbackName,
      source: 'server',
      start: Date.now() - durationMs,
      durationMs,
      outcome,
      stages: parsed.stages,
      children: []
    }, als.getStore());
  });
}

/** Parses a W3C Server-Timing header; anything unparseable is skipped, never thrown. */
export function parseServerTiming(header: string | null | undefined): { stages: Stage[]; route?: string } {
  const stages: Stage[] = [];
  let route: string | undefined;
  for (const metric of (header ?? '').split(',')) {
    const [name, ...params] = metric.split(';').map(part => part.trim());
    if (!name) {
      continue;
    }
    let dur: number | undefined;
    let desc: string | undefined;
    for (const param of params) {
      const eq = param.indexOf('=');
      if (eq < 0) {
        continue;
      }
      const key = param.slice(0, eq).trim();
      let value = param.slice(eq + 1).trim();
      if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1).replace(/\\(.)/g, '$1');
      }
      if (key === 'dur' && value !== '' && Number.isFinite(Number(value))) {
        dur = Number(value);
      } else if (key === 'desc') {
        desc = value;
      }
    }
    if (name === 'route') {
      route = desc || route;
    } else if (dur !== undefined) {
      stages.push({ name, durationMs: dur });
    }
  }
  return { stages, route };
}

const ms = (value: number): string => value.toFixed(1);
const pad2 = (value: number): string => String(value).padStart(2, '0');

function clock(epochMs: number): string {
  const d = new Date(epochMs);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

function formatEntry(entry: TimingEntry, depth: number): string[] {
  const prefix = depth === 0 ? clock(entry.start) : ' '.repeat(12 + 2 * depth) + '└';
  let line = `${prefix}  ${entry.outcome.padEnd(9)} ${entry.name.padEnd(32)} ${ms(entry.durationMs).padStart(8)} ms`;
  if (entry.stages.length > 0) {
    const covered = entry.stages.reduce((sum, stage) => sum + stage.durationMs, 0);
    const parts = entry.stages.map(stage => `${stage.name} ${ms(stage.durationMs)}`);
    parts.push(`other ${ms(Math.max(0, entry.durationMs - covered))}`);
    line += `  ${parts.join(' · ')}`;
  }
  return [line, ...entry.children.flatMap(child => formatEntry(child, depth + 1))];
}

/** One row per operation name, by total time descending. p95 uses retained entries (nearest rank). */
export function getSummary(): SummaryRow[] {
  const samples = new Map<string, number[]>();
  const collect = (entry: TimingEntry): void => {
    const list = samples.get(entry.name) ?? [];
    list.push(entry.durationMs);
    samples.set(entry.name, list);
    entry.children.forEach(collect);
  };
  entries.forEach(collect);

  return [...summaries].map(([name, aggregate]) => {
    const sorted = (samples.get(name) ?? []).sort((a, b) => a - b);
    return {
      name,
      count: aggregate.count,
      totalMs: aggregate.totalMs,
      minMs: aggregate.minMs,
      avgMs: aggregate.totalMs / aggregate.count,
      p95Ms: sorted.length ? sorted[Math.ceil(0.95 * sorted.length) - 1] : aggregate.maxMs,
      maxMs: aggregate.maxMs
    };
  }).sort((a, b) => b.totalMs - a.totalMs);
}

function formatSummary(rows: SummaryRow[]): string {
  if (rows.length === 0) {
    return 'No timing data recorded.';
  }
  const width = Math.max(9, ...rows.map(row => row.name.length));
  const header = ['operation'.padEnd(width), 'count', 'total', 'min', 'avg', 'p95', 'max'];
  const lines = [header.map((cell, i) => i === 0 ? cell : cell.padStart(10)).join(' ')];
  for (const row of rows) {
    lines.push([
      row.name.padEnd(width),
      String(row.count).padStart(10),
      ...[row.totalMs, row.minMs, row.avgMs, row.p95Ms, row.maxMs].map(value => ms(value).padStart(10))
    ].join(' '));
  }
  return lines.join('\n');
}

interface ExportedEntry extends Omit<TimingEntry, 'start' | 'children'> {
  start: string;
  children: ExportedEntry[];
}

/** The export file's content (contracts/timing-export.schema.json), or undefined when there is nothing to export. */
export function buildExport(): { exportedAt: string; entries: ExportedEntry[]; summary: SummaryRow[] } | undefined {
  if (entries.length === 0) {
    return undefined;
  }
  const toJson = (entry: TimingEntry): ExportedEntry => ({
    name: entry.name,
    source: entry.source,
    start: new Date(entry.start).toISOString(),
    durationMs: entry.durationMs,
    outcome: entry.outcome,
    stages: entry.stages,
    children: entry.children.map(toJson)
  });
  return { exportedAt: new Date().toISOString(), entries: entries.map(toJson), summary: getSummary() };
}

async function exportTiming(): Promise<void> {
  const data = buildExport();
  if (!data) {
    void vscode.window.showInformationMessage('Doorstop: no timing data to export.');
    return;
  }
  const d = new Date();
  const fileName = `doorstop-timing-${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`
    + `-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}.json`;
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
  const uri = await vscode.window.showSaveDialog({
    defaultUri: folder ? vscode.Uri.joinPath(folder, fileName) : undefined,
    filters: { JSON: ['json'] }
  });
  if (!uri) {
    return;
  }
  try {
    await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(data, null, 2)));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(`Doorstop: could not write timing export (${message}).`);
  }
}

/**
 * Reads the setting (live), creates the output channel and registers the
 * timing commands. The timing commands use the raw registerCommand: timing
 * them would only add noise to the data they report.
 */
export function initTiming(context: vscode.ExtensionContext): void {
  channel = vscode.window.createOutputChannel('Doorstop Timing');
  const readSetting = (): void => {
    enabled = vscode.workspace.getConfiguration('doorstop.timing').get<boolean>('enabled', false);
  };
  readSetting();

  context.subscriptions.push(
    channel,
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('doorstop.timing.enabled')) {
        readSetting();
      }
    }),
    vscode.commands.registerCommand('doorstop.timing.showSummary', () => {
      channel?.appendLine(formatSummary(getSummary()));
      channel?.show(true);
    }),
    vscode.commands.registerCommand('doorstop.timing.reset', () => {
      resetTiming();
      channel?.appendLine('Timing data reset.');
    }),
    vscode.commands.registerCommand('doorstop.timing.export', exportTiming)
  );
}
