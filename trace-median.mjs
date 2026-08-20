/* KAI-132: 3-run median mobile trace (after) + lite fetch timing. */
import { chromium } from "playwright";
const b = await chromium.launch({ headless: true });
const results = [];
for (let i = 0; i < 3; i++) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 } });
  const p = await ctx.newPage();
  await p.addInitScript(() => {
    const out = { longTasks: [], lcp: 0, liteFetch: -1 };
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
  const liteHits = [];
  p.on("request", (req) => {
    if (req.url().includes("destinations-index.lite")) liteHits.push(req.url());
  });
  await p.goto("http://127.0.0.1:4183/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.waitForTimeout(9000);
  const m = await p.evaluate(() => window.__t);
  const tbt = m.longTasks.reduce((s, t) => s + Math.max(0, t.dur - 50), 0);
  results.push({ tbt: Math.round(tbt), lcp: m.lcp, tasks: m.longTasks.length, liteHits: liteHits.length });
  console.log(`run ${i + 1}: TBT=${Math.round(tbt)}ms LCP=${m.lcp}ms tasks=${m.longTasks.length} liteFetch=${liteHits.length}`);
  await ctx.close();
}
const sorted = [...results].sort((a, b) => a.tbt - b.tbt);
console.log("MEDIAN:", JSON.stringify(sorted[1]));
await b.close();
