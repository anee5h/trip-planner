#!/usr/bin/env node
/**
 * KAI-121: lab-style performance evidence (deterministic, reproducible).
 *
 * Measures REAL runtime metrics against the built dist/ via a hardened
 * static server (vite-preview semantics):
 *   - total transferred bytes (network, gzip-level)
 *   - largest JS chunk (transferred + decoded)
 *   - main-thread task duration + script duration (CDP Tracing, renderer
 *     main thread only) and long-task count/duration (INP proxy)
 *   - LCP + CLS + FCP via PerformanceObserver (real paint timings)
 *
 * TRUST CHECKS (fail loudly rather than report garbage):
 *   - SPA fallback ONLY for document/navigation requests; missing
 *     JS/CSS/data/image/font assets return 404 (never index.html).
 *   - At least one application JS asset must load with JavaScript MIME.
 *   - pageerror / console error / requestfailed fail the measurement.
 *   - An application DOM marker must exist after navigation (not just
 *     <title>).
 *   - CDP tracing: awaits Tracing.tracingComplete (no fixed sleep),
 *     fails on zero collected events, filters the renderer main thread
 *     by thread metadata (name === "CrRendererMain").
 *
 * Runs Home + a representative destination route, on mobile + desktop
 * viewports. Output is a JSON evidence record for the PR body.
 *
 * Usage: node scripts/measure-lab.mjs [--json]
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
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".ico": "image/x-icon",
};

// SPA fallback ONLY for document/navigation requests (no extension, "/",
// or .html). Missing JS/CSS/data/image/font assets MUST 404.
function isDocumentRequest(urlPath) {
  const ext = path.extname(urlPath).toLowerCase();
  return urlPath === "/" || urlPath.endsWith("/") || !ext || ext === ".html";
}

function serve() {
  const server = createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const isDocument = isDocumentRequest(urlPath);
    let file = path.join(DIST, urlPath === "/" ? "index.html" : urlPath);
    const missing =
      !file.startsWith(DIST) ||
      !existsSync(file) ||
      statSync(file).isDirectory();
    if (missing) {
      if (isDocument) {
        file = path.join(DIST, "index.html");
      } else {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
        return;
      }
    }
    const fileExt = path.extname(file).toLowerCase();
    const mime = MIME[fileExt] || "application/octet-stream";
    const acceptsGzip = (req.headers["accept-encoding"] || "").includes("gzip");
    if (acceptsGzip) {
      const gz = gzipSync(readFileSync(file));
      res.writeHead(200, {
        "Content-Type": mime,
        "Content-Encoding": "gzip",
        "Content-Length": gz.length,
      });
      res.end(gz);
      return;
    }
    res.writeHead(200, { "Content-Type": mime });
    createReadStream(file).pipe(res);
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
    fcpMs: 0,
    failures: [],
  };
  let jsLoaded = false;

  const fail = (msg) => {
    metrics.failures.push(msg);
  };

  page.on("pageerror", (err) =>
    fail(`pageerror: ${String(err).slice(0, 200)}`),
  );
  page.on("requestfailed", (req) => {
    const u = req.url();
    if (u.startsWith(`http://127.0.0.1:${PORT}`)) {
      fail(
        `requestfailed: ${req.method()} ${u.split("/").pop()} (${req.failure()?.errorText})`,
      );
    }
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      fail(`console.error: ${msg.text().slice(0, 200)}`);
    }
  });
  page.on("response", (res) => {
    const url = res.url();
    if (url.includes("/assets/") || url.includes("/data/")) {
      const ct = res.headers()["content-type"] || "";
      const bodyLen = res.headers()["content-length"];
      const isJs = ct.includes("javascript");
      if (isJs && res.status() === 200) {
        jsLoaded = true;
        const decoded = Number(bodyLen) || 0;
        if (decoded > metrics.largestChunk.decoded) {
          metrics.largestChunk = {
            url: url.split("/").pop(),
            bytes: Number(bodyLen) || 0,
            decoded,
          };
        }
      }
      metrics.requests++;
      metrics.transferred += Number(bodyLen) || 0;
    }
  });
  await page.addInitScript(() => {
    window.__kai121 = { longTasks: [], cls: 0, lcp: 0, fcp: 0 };
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
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (e.name === "first-contentful-paint") {
            window.__kai121.fcp = e.startTime;
          }
        }
      }).observe({ type: "paint", buffered: true });
    } catch {}
  });

  // CDP tracing for real renderer-main-thread CPU metrics.
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

  const resp = await page.goto(`http://127.0.0.1:${PORT}${route}`, {
    waitUntil: "load",
    timeout: 60000,
  });
  if (!resp || resp.status() !== 200) {
    fail(`navigation failed: status ${resp?.status()}`);
  }
  await page.waitForTimeout(3000); // let lazy fetch + paint settle

  // App DOM marker (not just <title>): the app mounts into #root with
  // real content.
  try {
    await page.waitForFunction(
      () => {
        const root = document.querySelector("#root");
        return root && root.textContent && root.textContent.trim().length > 50;
      },
      { timeout: 10000 },
    );
  } catch {
    fail("app DOM marker (#root with content) not found after navigation");
  }

  // Stop tracing. The tracingComplete listener is installed BEFORE
  // Tracing.end (no race); the safety timeout REJECTS (fail closed).
  const traceComplete = new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Tracing.tracingComplete timeout")),
      5000,
    );
    cdp.once("Tracing.tracingComplete", () => {
      clearTimeout(timer);
      resolve();
    });
  });
  await cdp.send("Tracing.end");
  await traceComplete;

  if (collected.length === 0) {
    fail("trace collected 0 events");
  } else {
    // Filter the RENDERER MAIN THREAD by thread metadata.
    const threads = new Map();
    for (const ev of collected) {
      if (ev.ph === "M" && ev.name === "thread_name" && ev.args?.name) {
        threads.set(ev.tid, ev.args.name);
      }
    }
    const mainTid = [...threads.entries()].find(
      ([, name]) => name === "CrRendererMain",
    )?.[0];
    if (mainTid === undefined) {
      fail("CrRendererMain thread metadata not found — cannot filter");
    } else {
      let taskEvents = 0;
      let scriptEvents = 0;
      for (const ev of collected) {
        if (!ev?.dur || !ev.tid || ev.tid !== mainTid) continue;
        if (
          ev.name === "ThreadControllerImpl::RunTask" ||
          ev.name === "RunTask"
        ) {
          metrics.taskDurationMs += ev.dur / 1000;
          taskEvents++;
        }
        if (
          ev.name === "EvaluateScript" ||
          ev.name ===
            "HTMLParserScriptRunner::executeScriptsWaitingForParsing" ||
          ev.name === "v8.evaluateScript" ||
          ev.name === "v8.compile"
        ) {
          metrics.scriptDurationMs += ev.dur / 1000;
          scriptEvents++;
        }
      }
      if (taskEvents === 0 && scriptEvents === 0) {
        fail("trace has events but no renderer-main-thread task/script events");
      }
    }
  }

  const nav = await page.evaluate(() => {
    const w = window.__kai121;
    return {
      longTasks: w.longTasks,
      cls: w.cls,
      lcp: w.lcp,
      fcp: w.fcp,
    };
  });
  metrics.longTasks = nav.longTasks;
  metrics.cls = nav.cls;
  metrics.lcpMs = Math.round(nav.lcp);
  metrics.fcpMs = Math.round(nav.fcp);
  if (!(nav.fcp > 0)) fail("no first-contentful-paint observed");

  // Trust gates.
  if (!jsLoaded) fail("no application JS asset loaded with JavaScript MIME");
  if (metrics.failures.length > 0) {
    throw new Error(
      `measurement failed for ${route}: ${metrics.failures.join("; ")}`,
    );
  }

  // Largest JS decoded: read from dist.
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
  // contaminate the destination-route measurement.
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
      try {
        results[surface][name] = await measure(page, route);
      } catch (e) {
        results[surface][name] = { error: String(e.message ?? e) };
        console.error(`FAILED ${surface}/${name}:`, e.message);
      }
      await browser.close();
    }
  }
  server.close();
  // Fail closed: any route/viewport measurement failure must yield a
  // non-zero exit — never a clean exit with ERROR rows printed.
  const hadFailure = Object.values(results).some((m) =>
    Object.values(m).some((r) => r?.error),
  );
  if (hadFailure) {
    throw new Error("one or more KAI-121 measurements failed");
  }
  if (JSON_OUT) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    for (const [surface, m] of Object.entries(results)) {
      console.log(`\n=== ${surface} ===`);
      for (const [viewport, r] of Object.entries(m)) {
        if (r.error) {
          console.log(`  ${viewport}: ERROR ${r.error}`);
          continue;
        }
        console.log(
          `  ${viewport}: transferred=${(r.transferred / 1024).toFixed(0)} KB, ` +
            `largestJS=${(r.largestChunk.decoded / 1024).toFixed(0)} KB decoded, ` +
            `FCP≈${r.fcpMs}ms, LCP≈${r.lcpMs}ms, CLS=${r.cls.toFixed(3)}, ` +
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
