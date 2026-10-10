#!/usr/bin/env node
/**
 * Exports Doorstop-published HTML to paginated A4 PDFs with a running
 * header/footer, using a headless browser (Playwright Chromium).
 *
 * Works with HTML from any Doorstop template (the default one or your own).
 * The script adds only the page frame (paper size, margins, header/footer);
 * fonts, page breaks and styling come from the template's own (print) CSS.
 *
 * The running header/footer are injected here because mainstream browsers
 * don't support real per-page CSS running headers (the @page margin-box spec);
 * Playwright's native page.pdf({ displayHeaderFooter, headerTemplate,
 * footerTemplate }) does.
 *
 * Usage:
 *   node export-pdf.mjs <published.html> [output.pdf]
 *   node export-pdf.mjs <publish-folder> [output-folder]
 *
 * Folder mode renders every documents/*.html to <PREFIX>.pdf and
 * traceability.html to traceability.pdf (landscape, scaled to fit). Example
 * after `doorstop publish all out --html`:
 *   node export-pdf.mjs out out/pdf
 *
 * Exit code 0 when every PDF was written (warnings go to stderr as
 * "Warning: ..."), 1 otherwise; PDFs that did succeed stay written.
 */

import { chromium } from "playwright";
import { PDFDocument } from "pdf-lib";
import { readFileSync, existsSync, writeFileSync, statSync, readdirSync, mkdirSync } from "node:fs";
import { resolve, dirname, basename, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
// "Dezent" accent line: the brand red at low opacity, not full saturation.
const ACCENT_LINE = "rgba(180, 20, 18, 0.35)";
// Side margin for templates that don't size their own page, and the inset of
// the header/footer text from the paper edge.
const SIDE_MM = 16;
// Chromium's smallest print scale.
const MIN_SCALE = 0.1;

function escapeHtml(str) {
  return String(str).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

/** Inline logo.svg (preferred, crisp at any size) or logo.png (base64) next
 * to this script. Replace either file with your own, or delete it for no logo. */
function loadLogoHtml() {
  const svgPath = join(SCRIPT_DIR, "logo.svg");
  const pngPath = join(SCRIPT_DIR, "logo.png");
  if (existsSync(svgPath)) {
    return readFileSync(svgPath, "utf8").trim();
  }
  if (existsSync(pngPath)) {
    const b64 = readFileSync(pngPath).toString("base64");
    return `<img src="data:image/png;base64,${b64}" style="height:16px;width:auto;vertical-align:middle;" />`;
  }
  return "";
}

/** Shrinks the page just enough for its full width to fit the printable width. */
async function fitScale(page, sideMm, inputPath) {
  const printable = Math.floor(((297 - 2 * sideMm) * 96) / 25.4);
  await page.setViewportSize({ width: printable, height: 800 });
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  const scale = Math.min(1, printable / width);
  if (scale < MIN_SCALE) {
    console.error(
      `Warning: ${basename(inputPath)} is wider than the page even at ${MIN_SCALE * 100} % — columns may be clipped`,
    );
    return MIN_SCALE;
  }
  return scale;
}

async function exportFile(browser, inputPath, outputPath, { traceability = false } = {}) {
  const page = await browser.newPage();
  try {
    await page.goto(pathToFileURL(inputPath).href, { waitUntil: "networkidle" });

    // An A4-style template's title block, if the HTML has one; any other
    // template simply yields nothing here.
    // (A direct query, not a locator: a locator waits for a missing element.)
    const title = await page.evaluate(() => document.querySelector(".doctitle")?.textContent?.trim() ?? "");

    const meta = await page
      .locator(".native-meta span")
      .evaluateAll((spans) =>
        Object.fromEntries(
          spans.map((span) => {
            const label = span.querySelector("b")?.textContent?.trim() ?? "";
            const value = (span.textContent ?? "").replace(label, "").trim();
            return [label, value];
          }),
        ),
      )
      .catch(() => ({}));

    const headerText = traceability
      ? "Traceability"
      : [meta["Doc"], title].filter(Boolean).join(" — ") ||
        (await page.title()).trim() ||
        basename(inputPath, ".html");
    const footerLeft = meta["Issue"] ? `Rev ${meta["Issue"]}` : "";
    const logoHtml = loadLogoHtml();
    // A4-style templates size and inset their own page (.native-page); an
    // extra margin would double it. Everything else gets a side margin.
    const sideMm = (await page.locator(".native-page").count()) > 0 ? 0 : SIDE_MM;

    // No clickable links in the PDF: Chromium turns every <a href> into a
    // link annotation. Dropping href keeps the text and its styling.
    await page.evaluate(() => {
      document.querySelectorAll("a[href]").forEach((a) => a.removeAttribute("href"));
    });

    await page.emulateMedia({ media: "print" });

    // Header/footer templates run in an isolated context without the page's
    // own stylesheet, so use system fonts only. They span the full paper
    // width whatever the page margin is, hence the fixed inset.
    const headerTemplate = `
      <div style="width:100%;padding:0 ${SIDE_MM}mm 5px;box-sizing:border-box;border-bottom:1px solid ${ACCENT_LINE};display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:8px;color:#7c8f9c;font-family:Consolas,'SFMono-Regular',monospace;">
        <span>${escapeHtml(headerText)}</span>
        <span style="flex:none;line-height:0;">${logoHtml}</span>
      </div>`;
    const footerTemplate = `
      <div style="width:100%;padding:5px ${SIDE_MM}mm 0;box-sizing:border-box;border-top:1px solid ${ACCENT_LINE};display:flex;justify-content:space-between;font-size:8px;color:#7c8f9c;font-family:Consolas,'SFMono-Regular',monospace;">
        <span>${escapeHtml(footerLeft)}</span>
        <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
      </div>`;

    const pdfOptions = {
      format: "A4",
      landscape: traceability,
      printBackground: true,
      margin: { top: "20mm", bottom: "18mm", left: `${sideMm}mm`, right: `${sideMm}mm` },
      displayHeaderFooter: true,
      footerTemplate,
    };

    if (traceability) {
      // The matrix has no title page: header on every page, scaled to fit.
      const scale = await fitScale(page, sideMm, inputPath);
      writeFileSync(outputPath, await page.pdf({ ...pdfOptions, scale, headerTemplate }));
      return;
    }

    // Verified live: Chromium fills in .pageNumber during its own internal
    // print pass, not via a visible DOM mutation — neither reading it
    // immediately nor a MutationObserver inside the header template sees it
    // in time, so there is no reliable "hide on page 1" from inside the
    // template itself. Instead, render the document twice (same margins, so
    // page breaks land identically both times) and splice page 1 from the
    // blank-header render into the normal, fully-headed render.
    // Sequential, not Promise.all: both calls render the same `page` object.
    const fullBuffer = await page.pdf({ ...pdfOptions, headerTemplate });
    const blankHeaderBuffer = await page.pdf({ ...pdfOptions, headerTemplate: "<div></div>" });

    const fullDoc = await PDFDocument.load(fullBuffer);
    const blankDoc = await PDFDocument.load(blankHeaderBuffer);
    const finalDoc = await PDFDocument.create();

    const [coverPage] = await finalDoc.copyPages(blankDoc, [0]);
    finalDoc.addPage(coverPage);

    const pageCount = fullDoc.getPageCount();
    if (pageCount > 1) {
      const restIndices = Array.from({ length: pageCount - 1 }, (_, i) => i + 1);
      const restPages = await finalDoc.copyPages(fullDoc, restIndices);
      restPages.forEach((p) => finalDoc.addPage(p));
    }

    writeFileSync(outputPath, await finalDoc.save());
  } finally {
    await page.close();
  }
}

/** The PDFs a Doorstop HTML publish folder turns into. */
function folderJobs(dir, outDir) {
  const docs = join(dir, "documents");
  const jobs = existsSync(docs)
    ? readdirSync(docs)
        .filter((name) => name.endsWith(".html"))
        .map((name) => ({ input: join(docs, name), output: join(outDir, name.replace(/\.html$/, ".pdf")) }))
    : [];
  const trace = join(dir, "traceability.html");
  if (existsSync(trace)) {
    jobs.push({ input: trace, output: join(outDir, "traceability.pdf"), traceability: true });
  }
  return jobs;
}

async function main() {
  const [, , inputArg, outputArg] = process.argv;
  if (!inputArg) {
    console.error("Usage: node export-pdf.mjs <published.html | publish-folder> [output.pdf | output-folder]");
    process.exit(1);
  }

  const inputPath = resolve(inputArg);
  if (!existsSync(inputPath)) {
    console.error(`Failed: ${inputPath} does not exist`);
    process.exit(1);
  }
  const jobs = statSync(inputPath).isDirectory()
    ? folderJobs(inputPath, resolve(outputArg || join(inputPath, "pdf")))
    : [
        {
          input: inputPath,
          output: resolve(outputArg || join(dirname(inputPath), `${basename(inputPath, ".html")}.pdf`)),
        },
      ];
  if (jobs.length === 0) {
    console.error(`Failed: no published HTML found in ${inputPath}`);
    process.exit(1);
  }

  // One browser for every file; a failing file doesn't stop the others.
  let failed = 0;
  const browser = await chromium.launch();
  try {
    for (const job of jobs) {
      console.log(`Exporting ${basename(job.output)}`);
      try {
        mkdirSync(dirname(job.output), { recursive: true });
        await exportFile(browser, job.input, job.output, job);
        console.log(`PDF written to ${job.output}`);
      } catch (err) {
        failed += 1;
        console.error(`Failed: ${job.input} → ${job.output}: ${err?.message ?? err}`);
      }
    }
  } finally {
    await browser.close();
  }
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
