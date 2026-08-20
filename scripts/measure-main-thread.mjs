#!/usr/bin/env node
/**
 * KAI-130/132: cold-load main-thread CPU + CLS harness.
 *
 * Uses the Long Tasks API (PerformanceObserver('longtask')) + layout-shift
 * observer (CLS) via addInitScript, 12s settle window, median of N runs.
 * CDP Tracing is NOT used (Tracing.end returns empty keys in the installed
 * Playwright).
 *
 * Usage: node scripts/measure-main-thread.mjs <url> [--runs N] [--label X]
 */
import { chromium } from "playwright";

const url = process.argv[2];
const runsIdx = process.argv.indexOf("--runs");
const labelIdx = process.argv.indexOf("--label");
const runs = runsIdx >= 0 ? Number(process.argv[runsIdx + 1]) : 3;
const label = labelIdx >= 0 ? process.argv[labelIdx + 1] : "measure";

const results = [];
for (let i = 0; i < runs; i++) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
  });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    const out = { longTasks: [], cls: 0, fcp: 0, lcp: 0 };
    if (window.PerformanceObserver) {
      if (window.PerformanceLongTaskTiming) {
        new PerformanceObserver((l) => {
          for (const e of l.getEntries())
            out.longTasks.push({ start: Math.round(e.startTime), dur: Math.round(e.duration) });
        }).observe({ type: "longtask", buffered: true });
      }
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) {
          if (!e.hadRecentInput) out.cls += e.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
      new PerformanceObserver((l) => {
        const es = l.getEntries();
        if (es.length) out.lcp = Math.round(es[es.length - 1].startTime);
      }).observe({ type: "largest-contentful-paint", buffered: true });
    }
    window.__t = out;
  });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(12000); // settle window (late LCP / deferred rails)
  const m = await page.evaluate(() => window.__t);
  const tbt = m.longTasks.reduce((s, t) => s + Math.max(0, t.dur - 50), 0);
  const busy = m.longTasks.reduce((s, t) => s + t.dur, 0);
  results.push({
    tbt: Math.round(tbt),
    busy: Math.round(busy),
    cls: Number(m.cls.toFixed(3)),
    lcp: m.lcp,
    fcp: m.fcp,
    tasks: m.longTasks.length,
    taskList: m.longTasks.map((t) => `${t.start}ms->${t.dur}ms`),
  });
  console.log(
    `run ${i + 1} [${label}]: TBT=${Math.round(tbt)}ms busy=${Math.round(busy)}ms CLS=${Number(m.cls.toFixed(3))} LCP=${m.lcp}ms tasks=${m.longTasks.length}`,
  );
  await browser.close();
}

const sorted = [...results].sort((a, b) => a.tbt - b.tbt);
const med = sorted[Math.floor(sorted.length / 2)];
console.log(`MEDIAN [${label}]: ${JSON.stringify(med)}`);
