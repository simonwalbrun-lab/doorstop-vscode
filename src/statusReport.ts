import { execFile } from 'node:child_process';
import * as path from 'node:path';

import { DocumentNode, ValidationIssue } from './doorstopTypes';

/**
 * The project status report (spec 021 US3). Everything except `readGitLog` is
 * pure, so the Markdown can be tested without a server or a git repository.
 * Layout: specs/021-project-status-report/contracts/status-report-format.md.
 */

export const VOLATILITY_WEEKS = 26;

export interface GitCommit {
  date: Date;
  /** Workspace-relative, `/`-separated. */
  files: string[];
}

export interface WeekCount {
  /** Monday 00:00 local time. */
  weekStart: Date;
  changedItemFiles: number;
}

export interface StatusReportInput {
  projectName: string;
  generatedAt: Date;
  documents: DocumentNode[];
  issues: ValidationIssue[];
  volatility: WeekCount[] | { unavailable: string };
}

/** Raw `git log --format=%x00%aI --name-only --relative` for the last 26 weeks. */
export function readGitLog(cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      ['log', `--since=${VOLATILITY_WEEKS} weeks ago`, '--format=%x00%aI', '--name-only', '--relative'],
      { cwd, maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(String(stderr).trim() || error.message));
        } else {
          resolve(stdout);
        }
      }
    );
  });
}

/** Each NUL-separated record is an ISO author date followed by the files it changed. */
export function parseGitLog(output: string): GitCommit[] {
  return output.split('\0').flatMap(record => {
    const lines = record.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (lines.length === 0) {return [];}
    return [{ date: new Date(lines[0]), files: lines.slice(1).map(file => file.replace(/\\/g, '/')) }];
  });
}

function weekStartOf(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - ((date.getDay() + 6) % 7));
}

/**
 * Item files are recognised by name, not by the current tree, so items deleted
 * since still count: a `.yml`/`.md` file directly in a document's folder whose
 * name starts with that document's prefix.
 */
function itemFileMatcher(documents: DocumentNode[], workspaceRoot: string): (file: string) => boolean {
  const folders = documents.map(document => ({
    folder: path.relative(workspaceRoot, path.dirname(document.markerPath)).split(path.sep).join('/') || '.',
    prefix: document.prefix.toLowerCase()
  }));
  return file => {
    const extension = path.posix.extname(file).toLowerCase();
    if (extension !== '.yml' && extension !== '.md') {return false;}
    const folder = path.posix.dirname(file);
    const name = path.posix.basename(file).toLowerCase();
    return folders.some(entry => entry.folder === folder && name.startsWith(entry.prefix));
  };
}

export function weeklyVolatility(
  commits: GitCommit[],
  documents: DocumentNode[],
  workspaceRoot: string,
  now: Date
): WeekCount[] {
  const current = weekStartOf(now);
  const weeks: WeekCount[] = [];
  for (let back = VOLATILITY_WEEKS - 1; back >= 0; back--) {
    weeks.push({
      weekStart: new Date(current.getFullYear(), current.getMonth(), current.getDate() - 7 * back),
      changedItemFiles: 0
    });
  }
  const byWeek = new Map(weeks.map(week => [week.weekStart.getTime(), week]));
  const isItemFile = itemFileMatcher(documents, workspaceRoot);
  for (const commit of commits) {
    const week = byWeek.get(weekStartOf(commit.date).getTime());
    if (week) {
      week.changedItemFiles += commit.files.filter(isItemFile).length;
    }
  }
  return weeks;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function day(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function quoted(label: string): string {
  return `"${label.replace(/"/g, '')}"`;
}

function barChart(title: string, yLabel: string, labels: string[], values: number[]): string[] {
  return [
    '```mermaid',
    '---',
    'config:',
    '  xyChart:',
    '    height: 200',
    '---',
    'xychart',
    `    title ${quoted(title)}`,
    `    x-axis [${labels.map(quoted).join(', ')}]`,
    `    y-axis ${quoted(yLabel)}`,
    `    bar [${values.join(', ')}]`,
    '```'
  ];
}

/** One issue counts once, however many items it names - as in the Problems view. */
function problemsByType(prefix: string, issues: ValidationIssue[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const issue of issues) {
    if (issue.documentPrefix === prefix) {
      counts.set(issue.check, (counts.get(issue.check) ?? 0) + 1);
    }
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export function buildStatusReport(input: StatusReportInput): string {
  const { generatedAt: at, documents } = input;
  const lines: string[] = [
    `# Doorstop Project Status — ${input.projectName}`,
    '',
    `Generated: ${day(at)} ${pad(at.getHours())}:${pad(at.getMinutes())}`,
    '',
    '## Items per Document',
    ''
  ];
  if (documents.length === 0) {
    lines.push('No documents.');
  } else {
    lines.push(...barChart(
      'Items per document',
      'Items',
      documents.map(document => document.prefix),
      documents.map(document => document.items.length)
    ));
  }

  lines.push('', '## Problems per Document', '');
  if (documents.length === 0) {
    lines.push('No documents.');
  }
  for (const document of documents) {
    const problems = problemsByType(document.prefix, input.issues);
    lines.push(`### ${document.prefix}`, '');
    if (problems.length === 0) {
      lines.push('No problems.');
    } else {
      lines.push(...barChart(
        `Problems in ${document.prefix}`,
        'Problems',
        problems.map(([check]) => check),
        problems.map(([, count]) => count)
      ));
    }
    lines.push('');
  }

  lines.push('## Requirement Volatility', '');
  if ('unavailable' in input.volatility) {
    lines.push(`Version history unavailable: ${input.volatility.unavailable}.`);
  } else {
    lines.push(...barChart(
      `Changed item files per week (last ${VOLATILITY_WEEKS} weeks)`,
      'Changed item files',
      input.volatility.map(week => day(week.weekStart)),
      input.volatility.map(week => week.changedItemFiles)
    ));
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}
