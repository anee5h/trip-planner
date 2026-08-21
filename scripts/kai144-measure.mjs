#!/usr/bin/env node
/** Temporary KAI-144 cold-load evidence harness. */
import { chromium, devices } from "playwright";

const args = new Set(process.argv.slice(2));
const url =
  process.argv.find((arg) => arg.startsWith("http")) ??
  "http://127.0.0.1:4183/";
const runsIndex = process.argv.indexOf("--runs");
const runs = runsIndex >= 0 ? Number(process.argv[runsIndex + 1]) : 3;
const cpuIndex = process.argv.indexOf("--cpu");
const cpuRate = cpuIndex >= 0 ? Number(process.argv[cpuIndex + 1]) : 4;
const desktop = args.has("--desktop");
const labelIndex = process.argv.indexOf("--label");
const label =
  labelIndex >= 0
    ? process.argv[labelIndex + 1]
    : desktop
      ? "desktop"
      : "mobile";

const device = desktop ? devices["Desktop Chrome"] : devices["iPhone 13"];
const allRuns = [];

for (let run = 0; run < runs; run += 1) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ...device,
    viewport: device.viewport,
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpuRate });

  const requests = new Map();
  const navStart = Date.now();
  const relevant = (u) =>
    u.includes("/assets/") ||
    u.includes("destinations-index") ||
    u.includes("stations-by-prefecture") ||
    u.includes("forecast");

  page.on("request", (request) => {
    const u = request.url();
    if (!relevant(u)) return;
    const key = `${request.method()} ${u}`;
    const existing = requests.get(key);
    if (!existing) {
      requests.set(key, {
        url: u,
        start: Date.now() - navStart,
        end: null,
        status: null,
      });
    }
  });
  page.on("response", (response) => {
    const u = response.url();
    if (!relevant(u)) return;
    const key = `${response.request().method()} ${u}`;
    const entry = requests.get(key);
    if (entry) {
      entry.end = Date.now() - navStart;
      entry.status = response.status();
    }
  });

  await page.addInitScript(() => {
    const state = {
      longTasks: [],
      shifts: [],
      cls: 0,
      fcp: 0,
      lcp: 0,
      marks: {},
    };
    const mark = (name, condition) => {
      if (state.marks[name] === undefined && condition) {
        state.marks[name] = Math.round(performance.now());
      }
    };
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          state.longTasks.push({
            start: Math.round(entry.startTime),
            duration: Math.round(entry.duration),
          });
        }
      }).observe({ type: "longtask", buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) {
            state.cls += entry.value;
            state.shifts.push({
              value: Number(entry.value.toFixed(4)),
              sources: (entry.sources ?? []).map((source) => ({
                node: source.node?.outerHTML?.slice(0, 240) ?? null,
                previousRect: source.previousRect,
                currentRect: source.currentRect,
              })),
            });
          }
        }
      }).observe({ type: "layout-shift", buffered: true });
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        if (entries.length) state.lcp = Math.round(entries.at(-1).startTime);
      }).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === "first-contentful-paint")
            state.fcp = Math.round(entry.startTime);
        }
      }).observe({ type: "paint", buffered: true });
    } catch {}
    const timer = setInterval(() => {
      const text = document.body?.textContent ?? "";
      mark(
        "firstOriginDateRender",
        Boolean(
          document.querySelector(
            "[data-home-origin-date-ready], [data-home-weather-shell], button[aria-haspopup=dialog]",
          ),
        ),
      );
      mark(
        "h1Render",
        Boolean(document.querySelector("h1")?.textContent?.trim()),
      );
      mark(
        "plannerReady",
        Boolean(
          document.querySelector(
            "[data-home-planner-ready], [aria-label*=increaseParty], [data-testid=home-planner]",
          ),
        ),
      );
      mark(
        "topMatchesReady",
        Boolean(document.querySelector("[data-top-matches-ready]")) ||
          /Top matches|あなたへのおすすめ|おすすめ/.test(text),
      );
      window.__kai144 = state;
    }, 50);
    window.addEventListener("unload", () => clearInterval(timer), {
      once: true,
    });
    window.__kai144 = state;
  });

  const response = await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  if (!response || response.status() !== 200)
    throw new Error(`navigation status ${response?.status()}`);
  await page.waitForTimeout(12000);
  const state = await page.evaluate(() => window.__kai144);
  const tbt = state.longTasks.reduce(
    (sum, task) => sum + Math.max(0, task.duration - 50),
    0,
  );
  const busy = state.longTasks.reduce((sum, task) => sum + task.duration, 0);
  const requestList = [...requests.values()].map((request) => ({
    kind: request.url.includes("destinations-index.lite")
      ? "initial-index"
      : request.url.includes("TransportResolver")
        ? "transport-chunk"
        : /Home(?:Heavy)?-[^/]+\.js/.test(request.url)
          ? "home-chunk"
          : request.url.includes("destinations-index")
            ? "full-index"
            : request.url.includes("forecast")
              ? "forecast"
              : "other",
    url: request.url.split("/").pop(),
    start: request.start,
    end: request.end,
    status: request.status,
  }));
  const result = {
    run: run + 1,
    fcp: state.fcp,
    lcp: state.lcp,
    tbt: Math.round(tbt),
    busy: Math.round(busy),
    cls: Number(state.cls.toFixed(4)),
    clsSources: state.shifts,
    marks: state.marks,
    requests: requestList.filter((request) =>
      [
        "initial-index",
        "full-index",
        "home-chunk",
        "transport-chunk",
        "forecast",
      ].includes(request.kind),
    ),
    longTasks: state.longTasks,
  };
  allRuns.push(result);
  console.log(JSON.stringify({ label, cpuRate, ...result }));
  await browser.close();
}

const median = (key) => {
  const values = allRuns.map((run) => run[key]).sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)];
};
console.log(
  JSON.stringify(
    {
      label,
      cpuRate,
      median: Object.fromEntries(
        ["fcp", "lcp", "tbt", "busy", "cls"].map((key) => [key, median(key)]),
      ),
      runs: allRuns,
    },
    null,
    2,
  ),
);
