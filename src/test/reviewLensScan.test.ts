import * as assert from 'assert';
import * as path from 'node:path';

import * as vscode from 'vscode';

import { scanRequirementDocument } from '../reviewLensProvider';

// Deliberately server-less: this suite starts no Doorstop server and makes no
// request. That is the property under test as much as the anchoring itself -
// the document scan is pure text, so it keeps working while the server is down
// or still booting (013 spec SC-005, 013 research.md section 2).
//
// The review / suspect-link actions are no longer CodeLenses; they are Quick
// Fixes on Doorstop's own problems, which require a running server to exist at
// all. Their availability is therefore asserted in regressionFixture.test.ts
// (which runs a real server); what stays here is the pure scan those fixes
// consume, plus proof that the retired lenses really are gone (017 FR-004).

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

  test('the retired review and suspect-link lenses no longer render', async () => {
    // 017 FR-004 / SC-003: each action now has exactly one entry point, the
    // Quick Fix, so none of these titles may appear above a field any more -
    // not on an unreviewed item with links (REQ-007), and not on the two-link
    // item (REQ-010) that used to carry three of them at once.
    for (const name of ['REQ-007.yml', 'REQ-010.yml']) {
      const lenses = await lensesFor(name);

      assert.strictEqual(titled(lenses, 'Do Review').length, 0, `${name}: Do Review lens must be gone`);
      assert.strictEqual(
        titled(lenses, 'Clear All Suspicions').length,
        0,
        `${name}: Clear All Suspicions lens must be gone`
      );
      assert.strictEqual(
        titled(lenses, 'Clear the Suspicion').length,
        0,
        `${name}: Clear the Suspicion lens must be gone`
      );
    }
  });

  test('a document marker yields no Doorstop lenses at all', async () => {
    const lenses = await lensesFor('.doorstop.yml');

    assert.strictEqual(titled(lenses, '+ Derive Requirement').length, 0);
    assert.strictEqual(titled(lenses, 'Do Review').length, 0);
  });

  test('a markdown item scans its frontmatter only, never its prose body', async function () {
    // The only test here that opens a markdown document, so it also pays for the
    // built-in markdown language service's first-open work. It runs in ~250ms but
    // has been seen to exceed mocha's 2s default when the machine is loaded (three
    // Electron launches plus a Python server, as in a full `npm test`). The
    // assertion is about anchoring, not speed - so use the same explicit timeout
    // the other suites' document-opening tests already set.
    this.timeout(10000);
    // MD-001.md carries real metadata in frontmatter and a deliberate decoy
    // "links:/- REQ-002" pair further down in the prose.
    const name = path.join('children', 'MD', 'MD-001.md');
    const scan = scanRequirementDocument(await openFixture(name))!;

    assert.deepStrictEqual(
      scan.linkEntries.map(entry => entry.parentUid),
      ['REQ-001'],
      'the prose decoy must not be picked up as a link entry'
    );
    assert.notStrictEqual(scan.reviewedLine, undefined, 'the frontmatter reviewed: line is found');
  });

  test('the Derive Requirement lens is unaffected by the move to Quick Fixes', async () => {
    // 017 FR-005: derive keeps its CodeLens; only the three review/suspect
    // actions moved. This is the guard against removing one lens too many.
    const lenses = await lensesFor('REQ-010.yml');

    assert.strictEqual(
      titled(lenses, '+ Derive Requirement').length,
      1,
      'the derive lens must still render'
    );
  });
});
