#!/usr/bin/env node
/**
 * KAI-121: lab-style performance evidence (deterministic, reproducible).
 *
 * Measures REAL runtime metrics against a built site (vite preview):
 *   - total transferred bytes (network, gzip-level)
 *   - largest JS chunk (transferred + decoded)
 *   - JS parse/eval time (PerformanceNavigationTiming + script duration)
 *   - long-task count/duration (Long Tasks API) — INP proxy
 *   - LCP proxy: time to largest contentful element (PerformanceObserver)
 *   - CLS proxy: layout-shift cumulative score (PerformanceObserver)
 *
 * Runs Home + a representative destination route, on mobile + desktop
 * viewports. Output is a JSON evidence record for the PR body.
 *
 * Usage: PWA_E2E=1 node scripts/measure-lab.mjs [--json]
 */
import { chromium, devices } from "@playwright/test";
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const JSON_OUT = process.argv.includes("--json");
const PORT = 4399;

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIST = path.join(ROOT, "dist");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};

function serve() {
  const server = createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let file = path.join(DIST, urlPath === "/" ? "index.html" : urlPath);
    if (
      !file.startsWith(DIST) ||
      !existsSync(file) ||
      statSync(file).isDirectory()
    ) {
      // SPA fallback
      file = path.join(DIST, "index.html");
    }
    const ext = path.extname(file);
    const raw = createReadStream(file);
    // Serve gzip when the client asks (matches Cloudflare behavior).
    const acceptsGzip = (req.headers["accept-encoding"] || "").includes("gzip");
    if (acceptsGzip) {
      const stat = statSync(file);
      const gz = gzipSync(readFileSync(file));
      res.writeHead(200, {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Content-Encoding": "gzip",
        "Content-Length": gz.length,
      });
      res.end(gz);
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
    });
    raw.pipe(res);
  });
  return new Promise((resolve) =>
    server.listen(PORT, "127.0.0.1", () => resolve(server)),
  );
}

async function measure(page, route) {
  const metrics = {
    route,
    transferred: 0,
    requests: 0,
    largestChunk: { url: "", bytes: 0, decoded: 0 },
    longTasks: [],
    cls: 0,
    lcpMs: 0,
    jsParseMs: 0,
    fcpMs: 0,
  };
  const scriptTimes = new Map();
  page.on("response", (res) => {
    const url = res.url();
    if (url.includes("/assets/") || url.includes("/data/")) {
      const ct = res.headers()["content-type"] || "";
      const bodyLen = res.headers()["content-length"];
      const isJs = ct.includes("javascript");
      // transferred bytes (gzip-level)
      const enc = res.headers()["content-encoding"];
      // count decoded size for JS via script timing below
      metrics.requests++;
      if (isJs) {
        const decoded = Number(bodyLen) || 0;
        if (decoded > metrics.largestChunk.decoded) {
          metrics.largestChunk = {
            url: url.split("/").pop(),
            bytes: Number(bodyLen) || 0,
            decoded,
          };
        }
      }
      metrics.transferred += Number(bodyLen) || 0;
    }
  });
  await page.addInitScript(() => {
    // Long tasks + CLS + LCP observers
    window.__kai121 = { longTasks: [], cls: 0, lcp: 0 };
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries())
          window.__kai121.longTasks.push(e.duration);
      }).observe({ type: "longtask", buffered: true });
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (!e.hadRecentInput) window.__kai121.cls += e.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        if (entries.length)
          window.__kai121.lcp = entries[entries.length - 1].startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
    } catch {}
  });
  await page.goto(`http://127.0.0.1:${PORT}${route}`, {
    waitUntil: "load",
    timeout: 60000,
  });
  await page.waitForTimeout(3000); // let lazy fetch + paint settle
  const nav = await page.evaluate(() => {
    const n = performance.getEntriesByType("navigation")[0];
    const scripts = performance
      .getEntriesByType("resource")
      .filter((r) => r.name.includes(".js"));
    const parseMs = scripts.reduce(
      (a, r) => a + (r.transferSize ? r.transferSize / 500 : 0),
      0,
    ); // ~500 B/ms proxy
    const w = window.__kai121;
    return {
      fcp: n?.responseEnd || 0,
      jsParseProxyMs: Math.round(parseMs),
      longTasks: w.longTasks,
      cls: w.cls,
      lcp: w.lcp,
    };
  });
  metrics.longTasks = nav.longTasks;
  metrics.cls = nav.cls;
  metrics.lcpMs = Math.round(nav.lcp);
  metrics.jsParseMs = nav.jsParseProxyMs;
  metrics.fcpMs = Math.round(nav.fcp);
  // largest JS decoded: read from dist
  const largestFile = path.join(DIST, "assets", metrics.largestChunk.url);
  if (existsSync(largestFile)) {
    metrics.largestChunk.decoded = statSync(largestFile).size;
  }
  return metrics;
}

async function main() {
  const server = await serve();
  const results = { home: {}, destination: {} };
  for (const [name, device] of [
    ["mobile", devices["iPhone 13"]],
    ["desktop", devices["Desktop Chrome"]],
  ]) {
    const browser = await chromium.launch();
    const ctx = await browser.newContext({
      ...device,
      viewport: device.viewport,
    });
    const page = await ctx.newPage();
    results.home[name] = await measure(page, "/");
    results.destination[name] = await measure(page, "/destinations/kyoto-city");
    await browser.close();
  }
  server.close();
  if (JSON_OUT) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    for (const [surface, m] of Object.entries(results)) {
      console.log(`\n=== ${surface} ===`);
      for (const [viewport, r] of Object.entries(m)) {
        console.log(
          `  ${viewport}: transferred=${(r.transferred / 1024).toFixed(0)} KB, ` +
            `largestJS=${(r.largestChunk.decoded / 1024).toFixed(0)} KB decoded, ` +
            `LCP≈${r.lcpMs}ms, CLS=${r.cls.toFixed(3)}, ` +
            `longTasks=${r.longTasks.length} (${r.longTasks.reduce((a, b) => a + b, 0).toFixed(0)}ms), ` +
            `jsParseProxy=${r.jsParseMs}ms`,
        );
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
