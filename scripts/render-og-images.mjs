#!/usr/bin/env node
/**
 * Renders the localized OG social cards (public/og/og-{en,ja}.png) from
 * their SVG sources using headless Chromium (via the already-installed
 * Playwright browser). Chromium renders SVG faithfully — gradients,
 * strokes, dashed paths and CJK text shaping — which ImageMagick's internal
 * SVG renderer cannot do.
 *
 * Run: npm run og:render (or directly: node scripts/render-og-images.mjs)
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ogDir = path.join(ROOT, "public", "og");

const browser = await chromium.launch();
try {
  for (const locale of ["en", "ja"]) {
    const svgPath = path.join(ogDir, `og-card-${locale}.svg`);
    const pngPath = path.join(ogDir, `og-${locale}.png`);
    // Wrap the SVG in an HTML page: standalone SVG documents lay out
    // unpredictably in Chromium, an <img> rasterizes faithfully. The
    // wrapper lives in the OS temp dir (never deployed); file:// pages can
    // load the SVG by absolute path.
    const wrapperPath = path.join(
      os.tmpdir(),
      `meguruto-og-render-${locale}.html`,
    );
    fs.writeFileSync(
      wrapperPath,
      `<!doctype html><html><head><meta charset="utf-8"><style>` +
        `html,body{margin:0;padding:0;overflow:hidden}</style></head>` +
        `<body><img src="file://${svgPath}" width="1200" height="630"></body></html>`,
    );
    const page = await browser.newPage({
      viewport: { width: 1200, height: 630 },
      deviceScaleFactor: 1,
    });
    try {
      await page.goto(`file://${wrapperPath}`);
      await page.screenshot({ path: pngPath });
    } finally {
      await page.close();
      fs.unlinkSync(wrapperPath);
    }
    console.log(`rendered ${path.relative(ROOT, pngPath)}`);
  }
} finally {
  await browser.close();
}
