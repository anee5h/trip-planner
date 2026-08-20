/* KAI-132: cold-load CPU trace (after). */
import { chromium } from "playwright";
const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ viewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 } });
const p = await ctx.newPage();
await p.addInitScript(() => {
  const out = { longTasks: [], fcp: 0, lcp: 0 };
  if (window.PerformanceObserver && window.PerformanceLongTaskTiming) {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) out.longTasks.push({ start: Math.round(e.startTime), dur: Math.round(e.duration) });
    }).observe({ type: "longtask", buffered: true });
  }
  new PerformanceObserver((l) => {
    const es = l.getEntries(); if (es.length) out.lcp = Math.round(es[es.length - 1].startTime);
  }).observe({ type: "largest-contentful-paint", buffered: true });
  window.__t = out;
});
await p.goto("http://127.0.0.1:4183/", { waitUntil: "domcontentloaded", timeout: 60000 });
await p.waitForTimeout(9000);
const m = await p.evaluate(() => window.__t);
const tbt = m.longTasks.reduce((s, t) => s + Math.max(0, t.dur - 50), 0);
console.log("TBT:", Math.round(tbt), "ms | LCP:", m.lcp, "ms | long tasks:", m.longTasks.length);
for (const t of m.longTasks) console.log("  +" + t.start + "ms -> " + t.dur + "ms");
await b.close();
