#!/usr/bin/env node
/**
 * Exports a Doorstop document published with the A4 template to a
 * paginated, A4-sized PDF with a running header/footer.
 *
 * The running header/footer are NOT part of a4.css — mainstream browsers
 * don't support real per-page CSS running headers (the @page margin-box
 * spec), so this script injects them itself via Playwright's native
 * page.pdf({ displayHeaderFooter, headerTemplate, footerTemplate }).
 *
 * Page breaks inside the body (items, tables, headings) are handled by the
 * `break-inside` / `break-after` rules already in a4.css — Chromium's print
 * engine honours those natively, no extra work needed here.
 *
 * Usage:
 *   node export-pdf.mjs <published.html> [output.pdf]
 *
 * Example (after `doorstop publish SYS out --html --template a4`):
 *   node export-pdf.mjs ../../out/documents/SYS.html ../../out/SYS.pdf
 */

import { chromium } from "playwright";
import { PDFDocument } from "pdf-lib";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve, dirname, basename, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_ID = "template-A4";
// "Dezent" accent line: the brand red at low opacity, not full saturation.
const ACCENT_LINE = "rgba(180, 20, 18, 0.35)";

function escapeHtml(str) {
  return String(str).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

/** Inline logo.svg (preferred, crisp at any size) or logo.png (base64) next
 * to this script. Replace either file with your own — nothing else to edit. */
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

async function main() {
  const [, , inputArg, outputArg] = process.argv;
  if (!inputArg) {
    console.error("Usage: node export-pdf.mjs <published.html> [output.pdf]");
    process.exit(1);
  }

  const inputPath = resolve(inputArg);
  const outputPath = resolve(
    outputArg || join(dirname(inputPath), `${basename(inputPath, ".html")}.pdf`),
  );

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(inputPath).href, { waitUntil: "networkidle" });

    // Read the document's own title-block instead of hardcoding it here, so
    // the same script works unmodified for SYS, REQ, or any other document.
    const title = await page
      .locator(".doctitle")
      .first()
      .textContent()
      .then((t) => (t || "").trim())
      .catch(() => "");

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

    const docName = meta["Doc"] || "";
    const issue = meta["Issue"] || "";
    const headerText = [docName, title].filter(Boolean).join(" — ");
    const footerLeft = issue ? `Rev ${issue}` : "";
    const logoHtml = loadLogoHtml();

    await page.emulateMedia({ media: "print" });

    // Header/footer templates run in an isolated context without the page's
    // own stylesheet (no Google Fonts), so use system fonts only.
    const headerTemplate = `
      <div style="width:100%;padding:0 16mm 5px;box-sizing:border-box;border-bottom:1px solid ${ACCENT_LINE};display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:8px;color:#7c8f9c;font-family:Consolas,'SFMono-Regular',monospace;">
        <span>${escapeHtml(headerText)}</span>
        <span style="flex:none;line-height:0;">${logoHtml}</span>
      </div>`;
    // Verified live: Chromium fills in .pageNumber during its own internal
    // print pass, not via a visible DOM mutation — neither reading it
    // immediately nor a MutationObserver inside the header template sees it
    // in time, so there is no reliable "hide on page 1" from inside the
    // template itself. Instead, render the document twice (same margins, so
    // page breaks land identically both times) and splice page 1 from the
    // blank-header render into the normal, fully-headed render.
    const blankHeaderTemplate = `<div></div>`;
    const footerTemplate = `
      <div style="width:100%;padding:5px 16mm 0;box-sizing:border-box;border-top:1px solid ${ACCENT_LINE};display:flex;justify-content:space-between;font-size:8px;color:#7c8f9c;font-family:Consolas,'SFMono-Regular',monospace;">
        <span>${escapeHtml(footerLeft)}</span>
        <span>${escapeHtml(TEMPLATE_ID)}</span>
        <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
      </div>`;

    const pdfOptions = {
      format: "A4",
      printBackground: true,
      // left/right stay 0: a4.css already sizes .native-page to 210mm with
      // its own 16mm inset, so an extra Playwright margin would double it.
      margin: { top: "20mm", bottom: "18mm", left: "0mm", right: "0mm" },
      displayHeaderFooter: true,
      footerTemplate,
    };

    // Sequential, not Promise.all: both calls render the same `page` object,
    // and there's no real need to parallelize two PDF generations here.
    const fullBuffer = await page.pdf({ ...pdfOptions, headerTemplate });
    const blankHeaderBuffer = await page.pdf({ ...pdfOptions, headerTemplate: blankHeaderTemplate });

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

    console.log(`PDF written to ${outputPath}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
