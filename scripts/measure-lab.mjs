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
    taskDurationMs: 0,
    scriptDurationMs: 0,
    cls: 0,
    lcpMs: 0,
    jsParseMs: 0,
    fcpMs: 0,
  };
  // Real CPU metrics via CDP tracing (ScriptDuration/TaskDuration), not a
  // transferSize approximation.
  const cdp = await page.context().newCDPSession(page);
  const collected = [];
  cdp.on("Tracing.dataCollected", (e) => collected.push(...(e.value ?? [])));
  await cdp.send("Tracing.start", {
    transferMode: "ReportEvents",
    traceConfig: {
      included_categories: [
        "devtools.timeline",
        "disabled-by-default-devtools.timeline",
      ],
      recordScreenshots: false,
      enableSystrace: false,
    },
  });
  page.on("response", (res) => {
    const url = res.url();
    if (url.includes("/assets/") || url.includes("/data/")) {
      const ct = res.headers()["content-type"] || "";
      const bodyLen = res.headers()["content-length"];
      const isJs = ct.includes("javascript");
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
  // Stop the trace.
  await cdp.send("Tracing.end");
  await new Promise((r) => setTimeout(r, 1200)); // let remaining events flush
  // Aggregate main-thread task duration (RunTask family) and script
  // execution (HTMLParserScriptRunner + v8 compile/evaluate).
  for (const ev of collected) {
    if (!ev?.dur) continue;
    if (ev.name === "ThreadControllerImpl::RunTask" || ev.name === "RunTask") {
      metrics.taskDurationMs += ev.dur / 1000;
    }
    if (
      ev.name === "EvaluateScript" ||
      ev.name === "HTMLParserScriptRunner::executeScriptsWaitingForParsing" ||
      ev.name === "v8.evaluateScript" ||
      ev.name === "v8.compile"
    ) {
      metrics.scriptDurationMs += ev.dur / 1000;
    }
  }
  const nav = await page.evaluate(() => {
    const n = performance.getEntriesByType("navigation")[0];
    const w = window.__kai121;
    return {
      fcp: n?.responseEnd || 0,
      longTasks: w.longTasks,
      cls: w.cls,
      lcp: w.lcp,
    };
  });
  metrics.longTasks = nav.longTasks;
  metrics.cls = nav.cls;
  metrics.lcpMs = Math.round(nav.lcp);
  metrics.jsParseMs = Math.round(metrics.scriptDurationMs);
  metrics.fcpMs = Math.round(nav.fcp);
  // largest JS decoded: read from dist
  const largestFile = path.join(DIST, "assets", metrics.largestChunk.url);
  if (existsSync(largestFile)) {
    metrics.largestChunk.decoded = statSync(largestFile).size;
  }
  await cdp.detach().catch(() => {});
  return metrics;
}

async function main() {
  const server = await serve();
  const results = { home: {}, destination: {} };
  // FRESH browser context per route × viewport: a context that already
  // visited Home has the full catalogue cached/warmed, which would
  // contaminate the destination-route measurement. Each measurement gets a
  // brand-new context (cold cache).
  for (const [surface, route] of [
    ["home", "/"],
    ["destination", "/destinations/kyoto-city"],
  ]) {
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
      results[surface][name] = await measure(page, route);
      await browser.close();
    }
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
            `taskDuration=${r.taskDurationMs.toFixed(0)}ms, ` +
            `scriptDuration=${r.scriptDurationMs.toFixed(0)}ms`,
        );
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
