import * as assert from 'assert';
import * as path from 'node:path';

import * as vscode from 'vscode';

import { scanRequirementDocument } from '../reviewLensProvider';

// Deliberately server-less: this suite starts no Doorstop server and makes no
// request. That is the property under test as much as the anchoring itself -
// lens provision is a pure text scan, so lenses keep rendering while the server
// is down or still booting (spec SC-005, research.md section 2).

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE_ROOT = path.join(REPO_ROOT, 'testdata', 'regression');

function fixtureUri(name: string): vscode.Uri {
  return vscode.Uri.file(path.join(FIXTURE_ROOT, name));
}

function openFixture(name: string): Thenable<vscode.TextDocument> {
  return vscode.workspace.openTextDocument(fixtureUri(name));
}

/** All lenses any provider contributes for the document, as {title, line} pairs. */
async function lensesFor(name: string): Promise<{ title: string; line: number; args: unknown[] }[]> {
  const document = await openFixture(name);
  const lenses = await vscode.commands.executeCommand<vscode.CodeLens[]>(
    'vscode.executeCodeLensProvider',
    document.uri
  );
  return (lenses ?? []).map(lens => ({
    title: lens.command?.title ?? '',
    line: lens.range.start.line,
    args: lens.command?.arguments ?? []
  }));
}

function titled(
  lenses: { title: string; line: number; args: unknown[] }[],
  title: string
): { title: string; line: number; args: unknown[] }[] {
  return lenses.filter(lens => lens.title === title);
}

suite('Review Lens Scan Suite', () => {
  suiteSetup(async function () {
    this.timeout(20000);
    const ext = vscode.extensions.getExtension('SimonWalbrun.doorstop');
    assert.ok(ext, 'Doorstop extension should be discoverable');
    await ext!.activate();
  });

  test('scan reports no link entries for an item with an empty links list', async () => {
    const scan = scanRequirementDocument(await openFixture('REQ-001.yml'));

    assert.ok(scan, 'REQ-001 should be recognised as a requirement');
    assert.strictEqual(scan!.uid, 'REQ-001');
    assert.strictEqual(scan!.linkEntries.length, 0, 'links: [] must yield no entries');
    assert.notStrictEqual(scan!.reviewedLine, undefined, 'reviewed: line should be found');
    assert.notStrictEqual(scan!.linksLine, undefined, 'links: line should be found');
  });

  test('scan reports a single link entry with its parent UID', async () => {
    const scan = scanRequirementDocument(await openFixture('REQ-007.yml'));

    assert.ok(scan);
    assert.strictEqual(scan!.linkEntries.length, 1);
    assert.strictEqual(scan!.linkEntries[0].parentUid, 'REQ-001');
  });

  test('scan reports both link entries of a two-link item, in document order', async () => {
    const scan = scanRequirementDocument(await openFixture('REQ-010.yml'));

    assert.ok(scan);
    assert.deepStrictEqual(
      scan!.linkEntries.map(entry => entry.parentUid),
      ['REQ-001', 'REQ-002'],
      'entries must follow document order so each lens anchors to its own line'
    );
    assert.ok(
      scan!.linkEntries[0].line < scan!.linkEntries[1].line,
      'entry lines must be distinct and ascending'
    );
  });

  test('scan ignores a document marker, which is not a requirement', async () => {
    const scan = scanRequirementDocument(await openFixture('.doorstop.yml'));

    assert.strictEqual(scan, undefined, '.doorstop.yml has no item metadata to anchor to');
  });

  test('a reviewed: field yields exactly one Do Review lens', async () => {
    const document = await openFixture('REQ-007.yml');
    const scan = scanRequirementDocument(document)!;
    const lenses = await lensesFor('REQ-007.yml');

    const doReview = titled(lenses, 'Do Review');
    assert.strictEqual(doReview.length, 1, 'exactly one Do Review lens');
    assert.strictEqual(doReview[0].line, scan.reviewedLine, 'anchored on the reviewed: line');
    assert.deepStrictEqual(doReview[0].args[0], {
      uid: 'REQ-007',
      documentUri: document.uri.toString()
    });
  });

  test('a document marker yields no Doorstop lenses at all', async () => {
    const lenses = await lensesFor('.doorstop.yml');

    assert.strictEqual(titled(lenses, 'Do Review').length, 0);
    assert.strictEqual(titled(lenses, 'Clear All Suspicions').length, 0);
    assert.strictEqual(titled(lenses, 'Clear the Suspicion').length, 0);
  });

  test('Clear All Suspicions appears above links: only when links exist', async () => {
    const withLinks = scanRequirementDocument(await openFixture('REQ-007.yml'))!;
    const lenses = await lensesFor('REQ-007.yml');

    const clearAll = titled(lenses, 'Clear All Suspicions');
    assert.strictEqual(clearAll.length, 1, 'REQ-007 has one link, so the lens must appear');
    assert.strictEqual(clearAll[0].line, withLinks.linksLine, 'anchored on the links: line');

    const empty = await lensesFor('REQ-001.yml');
    assert.strictEqual(
      titled(empty, 'Clear All Suspicions').length,
      0,
      'REQ-001 has links: [] so no clear-all lens may appear'
    );
    assert.strictEqual(
      titled(empty, 'Clear the Suspicion').length,
      0,
      'REQ-001 has no link entries so no per-link lens may appear'
    );
  });

  test('each link entry of a two-link item gets its own Clear the Suspicion lens', async () => {
    const document = await openFixture('REQ-010.yml');
    const scan = scanRequirementDocument(document)!;
    const lenses = await lensesFor('REQ-010.yml');

    const clearOne = titled(lenses, 'Clear the Suspicion');
    assert.strictEqual(clearOne.length, 2, 'one lens per link entry');
    assert.deepStrictEqual(
      clearOne.map(lens => (lens.args[0] as { parentUid: string }).parentUid),
      ['REQ-001', 'REQ-002']
    );
    assert.deepStrictEqual(
      clearOne.map(lens => lens.line),
      scan.linkEntries.map(entry => entry.line),
      'each lens must sit on its own entry line'
    );
  });

  test('a markdown item scans its frontmatter only, never its prose body', async () => {
    // MD-001.md carries real metadata in frontmatter and a deliberate decoy
    // "links:/- REQ-002" pair further down in the prose.
    const name = path.join('children', 'MD', 'MD-001.md');
    const scan = scanRequirementDocument(await openFixture(name))!;

    assert.deepStrictEqual(
      scan.linkEntries.map(entry => entry.parentUid),
      ['REQ-001'],
      'the prose decoy must not be picked up as a link entry'
    );

    const lenses = await lensesFor(name);
    assert.strictEqual(titled(lenses, 'Do Review').length, 1);
    assert.strictEqual(titled(lenses, 'Clear All Suspicions').length, 1);

    const clearOne = titled(lenses, 'Clear the Suspicion');
    assert.strictEqual(clearOne.length, 1, 'exactly one lens, for the frontmatter link');
    assert.strictEqual((clearOne[0].args[0] as { parentUid: string }).parentUid, 'REQ-001');
  });

  test('the existing Derive Requirement lens still renders alongside the new ones', async () => {
    const lenses = await lensesFor('REQ-010.yml');

    assert.strictEqual(
      titled(lenses, '+ Derive Requirement').length,
      1,
      'the derive lens must not be suppressed by the review/suspect provider'
    );
    assert.strictEqual(titled(lenses, 'Do Review').length, 1);
    assert.strictEqual(titled(lenses, 'Clear All Suspicions').length, 1);
  });
});
