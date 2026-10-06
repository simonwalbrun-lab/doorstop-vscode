import * as assert from 'assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { DocumentNode, ValidationIssue } from '../doorstopTypes';
import { buildStatusReport, parseGitLog, weeklyVolatility } from '../statusReport';

// Pure report tests (spec 021 US3): no workspace, no server, no git. Expected
// output follows specs/021-project-status-report/contracts/status-report-format.md.

const ROOT = path.resolve('/ws');

function documentNode(prefix: string, itemCount: number, folder = prefix.toLowerCase()): DocumentNode {
  return {
    prefix,
    markerPath: path.join(ROOT, folder, '.doorstop.yml'),
    items: Array.from({ length: itemCount }, (_, index) => ({
      uid: `${prefix}00${index + 1}`,
      path: path.join(ROOT, folder, `${prefix}00${index + 1}.yml`),
      level: `1.${index + 1}`,
      active: true,
      normative: true,
      derived: false,
      reviewed: true,
      cleared: false,
      links: []
    }))
  };
}

function issue(documentPrefix: string, check: string, uids: string[] = ['X']): ValidationIssue {
  return { severity: 'warning', check, message: check, documentPrefix, uids, relatedUid: null, field: null };
}

function report(overrides: Partial<Parameters<typeof buildStatusReport>[0]> = {}): string {
  return buildStatusReport({
    projectName: 'demo',
    generatedAt: new Date(2026, 9, 7, 9, 5),
    documents: [documentNode('REQ', 3), documentNode('TST', 0)],
    issues: [],
    volatility: { unavailable: 'not a git repository' },
    ...overrides
  });
}

suite('Status Report (021 US3)', () => {
  test('items chart has one bar per document', () => {
    const markdown = report();
    assert.ok(markdown.includes('x-axis ["REQ", "TST"]'), markdown);
    assert.ok(markdown.includes('bar [3, 0]'), markdown);
    assert.ok(markdown.includes('Generated: 2026-10-07 09:05'), markdown);
  });

  test('problems chart counts one issue once, grouped by type', () => {
    const markdown = report({
      issues: [
        issue('REQ', 'unreviewed'),
        issue('REQ', 'unreviewed'),
        issue('REQ', 'suspect-link', ['REQ001', 'REQ002'])
      ]
    });
    assert.ok(markdown.includes('title "Problems in REQ"'), markdown);
    assert.ok(markdown.includes('x-axis ["unreviewed", "suspect-link"]'), markdown);
    assert.ok(markdown.includes('bar [2, 1]'), markdown);
    assert.ok(markdown.includes('### TST\n\nNo problems.'), markdown);
  });

  test('no documents gives sentences instead of empty charts', () => {
    const markdown = report({ documents: [] });
    assert.strictEqual(markdown.match(/No documents\./g)?.length, 2, markdown);
    assert.ok(!markdown.includes('xychart'), markdown);
  });

  test('missing history is reported, not charted', () => {
    const markdown = report();
    assert.ok(markdown.includes('Version history unavailable: not a git repository.'), markdown);
    assert.ok(!markdown.includes('Changed item files per week'), markdown);
  });

  test('double quotes are stripped from labels', () => {
    const markdown = report({ issues: [issue('REQ', 'say "hi"')] });
    assert.ok(markdown.includes('x-axis ["say hi"]'), markdown);
  });

  test('parseGitLog splits NUL-separated records', () => {
    const output = '\0' + '2026-10-06T10:00:00+02:00\n\nreqs\\REQ001.yml\nsrc/a.ts\n'
      + '\0' + '2026-09-01T08:00:00+02:00\n\nreqs/REQ002.yml\n';
    const commits = parseGitLog(output);
    assert.strictEqual(commits.length, 2);
    assert.deepStrictEqual(commits[0].files, ['reqs/REQ001.yml', 'src/a.ts']);
    assert.strictEqual(commits[1].date.toISOString(), '2026-09-01T06:00:00.000Z');
  });

  test('weeklyVolatility gives 26 Monday weeks and counts item files only', () => {
    const documents = [documentNode('REQ', 0, 'reqs')];
    const commits = [
      {
        date: new Date(2026, 9, 6, 12),
        files: ['reqs/REQ001.yml', 'reqs/REQ002.yml', 'reqs/.doorstop.yml', 'src/a.ts']
      },
      { date: new Date(2026, 9, 6, 13), files: ['reqs/REQ001.yml'] },
      { date: new Date(2020, 0, 1), files: ['reqs/REQ001.yml'] }
    ];
    const weeks = weeklyVolatility(commits, documents, ROOT, new Date(2026, 9, 7, 15));
    assert.strictEqual(weeks.length, 26);
    assert.deepStrictEqual(weeks[25].weekStart, new Date(2026, 9, 5));
    assert.deepStrictEqual(weeks[0].weekStart, new Date(2026, 3, 13));
    assert.strictEqual(weeks[25].changedItemFiles, 3, 'two files in one commit + one in another');
    assert.ok(weeks.slice(0, 25).every(week => week.changedItemFiles === 0));

    const markdown = report({ volatility: weeks });
    assert.ok(markdown.includes('"2026-10-05"]'), markdown);
  });

  test('package.json contributes the status report command', () => {
    const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', 'package.json'), 'utf8'));
    const command = manifest.contributes.commands.find((entry: { command: string }) => entry.command === 'doorstop.statusReport');
    assert.strictEqual(command?.title, 'Doorstop: Generate Status Report');
  });
});
