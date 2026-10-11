import * as assert from 'assert';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { copyTooling } from '../pdfExport';

// Copying the PDF tooling into a workspace (spec 027 FR-009a/b). Real files in
// temp folders; no fixture workspace, no server, no browser.

const SOURCE = path.resolve(__dirname, '..', '..', 'media', 'pdf-export');
const SHIPPED = ['.gitignore', 'export-pdf.mjs', 'logo.svg', 'package-lock.json', 'package.json'];

suite('PDF tooling copy (027)', () => {
  const temps: string[] = [];
  const tempDir = async (): Promise<string> => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'doorstop-pdf-test-'));
    temps.push(dir);
    return dir;
  };

  teardown(async () => {
    await Promise.all(temps.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })));
  });

  test('copies every shipped file and renames gitignore', async () => {
    const target = path.join(await tempDir(), 'doorstop-pdf');
    const copied = await copyTooling(SOURCE, target);
    assert.deepStrictEqual(copied.sort(), SHIPPED);
    assert.deepStrictEqual((await fs.readdir(target)).sort(), SHIPPED);
  });

  test('never overwrites files the user changed', async () => {
    const target = await tempDir();
    await copyTooling(SOURCE, target);
    await fs.writeFile(path.join(target, 'export-pdf.mjs'), 'edited script');
    await fs.writeFile(path.join(target, 'logo.svg'), 'edited logo');

    assert.deepStrictEqual(await copyTooling(SOURCE, target), []);
    assert.strictEqual(await fs.readFile(path.join(target, 'export-pdf.mjs'), 'utf8'), 'edited script');
    assert.strictEqual(await fs.readFile(path.join(target, 'logo.svg'), 'utf8'), 'edited logo');
  });

  test('restores only what is missing', async () => {
    const target = await tempDir();
    await copyTooling(SOURCE, target);
    await fs.rm(path.join(target, 'logo.svg'));
    assert.deepStrictEqual(await copyTooling(SOURCE, target), ['logo.svg']);
  });

  test('skips installed modules in the source', async () => {
    const source = await tempDir();
    await fs.writeFile(path.join(source, 'export-pdf.mjs'), '');
    await fs.mkdir(path.join(source, 'node_modules', 'playwright'), { recursive: true });
    const target = await tempDir();
    assert.deepStrictEqual(await copyTooling(source, target), ['export-pdf.mjs']);
    assert.deepStrictEqual(await fs.readdir(target), ['export-pdf.mjs']);
  });
});
