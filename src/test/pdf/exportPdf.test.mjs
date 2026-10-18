// End-to-end PDF export (spec 027): real Doorstop HTML publish, real headless
// Chromium, real PDFs. Runs under `node --test` in the CI job `pdf-export`, which
// installs Doorstop, the tooling's npm packages and Chromium beforehand - the
// test itself needs no network. Default Doorstop HTML, no template (FR-007a).

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const TOOLING = join(REPO, "media", "pdf-export");
const SCRIPT = join(TOOLING, "export-pdf.mjs");
const { PDFDocument } = createRequire(join(TOOLING, "package.json"))("pdf-lib");

const temps = [];
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), "doorstop-pdf-e2e-"));
  temps.push(dir);
  return dir;
};
after(() => temps.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

const exportPdf = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });

// Spec 028 FR-005
test("publish all as HTML, then one PDF per document plus traceability.pdf", async () => {
  const tmp = tempDir();
  const project = join(tmp, "project");
  cpSync(join(REPO, "testdata", "regression"), project, { recursive: true });
  // Doorstop looks for a VCS root above the documents.
  execFileSync("git", ["init", "-q"], { cwd: project });
  execFileSync("doorstop", ["publish", "all", join(tmp, "out"), "--html"], { cwd: project, stdio: "pipe" });

  const result = exportPdf(join(tmp, "out"), join(tmp, "pdf"));
  assert.equal(result.status, 0, result.stderr);

  const expected = readdirSync(join(tmp, "out", "documents"))
    .filter((name) => name.endsWith(".html"))
    .map((name) => name.replace(/\.html$/, ".pdf"))
    .concat("traceability.pdf")
    .sort();
  assert.deepEqual(readdirSync(join(tmp, "pdf")).sort(), expected);

  for (const name of expected) {
    const bytes = readFileSync(join(tmp, "pdf", name));
    assert.equal(bytes.subarray(0, 4).toString(), "%PDF", name);
    assert.ok((await PDFDocument.load(bytes)).getPageCount() >= 1, name);
  }

  const trace = await PDFDocument.load(readFileSync(join(tmp, "pdf", "traceability.pdf")));
  const { width, height } = trace.getPage(0).getSize();
  assert.ok(width > height, `traceability.pdf is ${width}x${height}, expected landscape`);
});

test("an empty publish folder fails and writes nothing", () => {
  const input = join(tempDir(), "out");
  mkdirSync(input);
  const result = exportPdf(input);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no published HTML found/);
  assert.equal(existsSync(join(input, "pdf")), false);
});
