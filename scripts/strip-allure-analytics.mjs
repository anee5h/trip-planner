#!/usr/bin/env node
/**
 * KAI-126: strip analytics from a generated Allure report.
 *
 * Allure 2.43's index.html still embeds a Google Tag Manager snippet even
 * with ALLURE_NO_ANALYTICS=1 (the opt-out fix landed in later versions).
 * This deterministically removes the GTM block from the generated HTML so
 * the private dashboard never phones home. Run AFTER `allure generate`,
 * BEFORE upload.
 *
 * Usage: node scripts/strip-allure-analytics.mjs <report-dir>
 */
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2];
if (!dir || !fs.existsSync(dir)) {
  console.error("usage: node scripts/strip-allure-analytics.mjs <report-dir>");
  process.exit(2);
}

const indexHtml = path.join(dir, "index.html");
if (!fs.existsSync(indexHtml)) {
  console.error(`no index.html in ${dir}`);
  process.exit(2);
}

let html = fs.readFileSync(indexHtml, "utf8");
const original = html;

// 1. Remove the GTM <script> loader + inline gtag() block.
html = html.replace(
  /<script[^>]*googletagmanager\.com\/gtag\/js[^>]*><\/script>/gi,
  "",
);
html = html.replace(
  /<script[^>]*>\s*window\.dataLayer\s*=\s*window\.dataLayer\s*\|\|\s*\[\];[\s\S]*?function gtag\(\)\{dataLayer\.push\(arguments\);[\s\S]*?gtag\([^)]*\);[^<]*<\/script>/gi,
  "",
);
// Fallback: strip any remaining dataLayer/gtag inline script.
html = html.replace(
  /<script[^>]*>[\s\S]*?dataLayer[\s\S]*?<\/script>/gi,
  (m) => (m.includes("dataLayer") ? "" : m),
);

// 2. Verify the result is clean.
if (/googletagmanager|dataLayer|gtag\(/.test(html)) {
  console.error(
    "❌ strip-allure-analytics FAILED: GTM remnants remain in index.html",
  );
  process.exit(1);
}

if (html !== original) {
  fs.writeFileSync(indexHtml, html);
  console.log("✅ Stripped GTM analytics from Allure index.html");
} else {
  console.log("✅ No analytics snippet found (already clean)");
}
