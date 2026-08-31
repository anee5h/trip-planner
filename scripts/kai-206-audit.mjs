import { mkdir, writeFile } from "node:fs/promises";
import { chromium, devices } from "@playwright/test";

const root = new URL("../", import.meta.url).pathname;
const phase = process.env.KAI206_PHASE || "before";
const baseUrl = process.env.KAI206_BASE_URL || "http://127.0.0.1:4173";
const outputDir =
  process.env.KAI206_OUTPUT_DIR || `${root}docs/KAI-206-screenshots`;
const auditPath =
  process.env.KAI206_AUDIT_PATH || `${root}docs/KAI-206-audit-${phase}.json`;
const cases = [
  {
    id: "destination-mobile",
    path: "/destinations/ueno-park",
    device: devices["iPhone 13"],
  },
  {
    id: "destination-desktop",
    path: "/destinations/ueno-park",
    viewport: { width: 1440, height: 900 },
  },
  {
    id: "hub-mobile",
    path: "/destinations/kyoto-city",
    device: devices["iPhone 13"],
  },
  {
    id: "hub-desktop",
    path: "/destinations/kyoto-city",
    viewport: { width: 1440, height: 900 },
  },
  {
    id: "hub-ja-mobile",
    path: "/ja/destinations/kyoto-city",
    device: devices["iPhone 13"],
  },
  {
    id: "destination-ja-mobile",
    path: "/ja/destinations/ueno-park",
    device: devices["iPhone 13"],
  },
  {
    id: "destination-ja-desktop",
    path: "/ja/destinations/ueno-park",
    viewport: { width: 1440, height: 900 },
  },
  {
    id: "hub-ja-desktop",
    path: "/ja/destinations/kyoto-city",
    viewport: { width: 1440, height: 900 },
  },
];

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const audit = [];

for (const item of cases) {
  const context = await browser.newContext({
    ...(item.device ?? {}),
    ...(item.viewport ? { viewport: item.viewport } : {}),
    locale: item.path.startsWith("/ja/") ? "ja-JP" : "en-US",
    timezoneId: "Asia/Tokyo",
  });
  const page = await context.newPage();
  await page.goto(`${baseUrl}${item.path}`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByRole("heading", { level: 1 }).waitFor({ state: "visible" });
  await page.waitForTimeout(1800);
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += 500) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(400);

  const rendered = await page.evaluate(() => {
    const rect = (element) => {
      const box = element.getBoundingClientRect();
      return {
        top: Math.round(box.top + window.scrollY),
        height: Math.round(box.height),
      };
    };
    const sections = [...document.querySelectorAll("[data-section]")].map(
      (section) => ({
        id: section.getAttribute("data-section"),
        ...rect(section),
        heading: section.querySelector("h2, h3")?.textContent?.trim() ?? "",
      }),
    );
    return {
      url: location.pathname,
      viewport: { width: innerWidth, height: innerHeight },
      document: {
        scrollHeight: document.documentElement.scrollHeight,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      },
      atAGlance: rect(
        document.querySelector(
          '[data-testid="destination-at-a-glance-section"]',
        ),
      ),
      sections,
      rails: [...document.querySelectorAll("[data-rail]")].map((rail) => ({
        label: rail.getAttribute("aria-label"),
        scrollWidth: rail.scrollWidth,
        clientWidth: rail.clientWidth,
        overflowX: getComputedStyle(rail).overflowX,
      })),
      costSurfaces: document.querySelectorAll(
        '[data-testid="trip-cost-breakdown"]',
      ).length,
      costUnavailableSurfaces: document.querySelectorAll(
        '[data-cost-state="unavailable-compact"]',
      ).length,
      text: {
        estimatedVisitCost: [...document.querySelectorAll("body *")].filter(
          (element) =>
            element.children.length === 0 &&
            element.textContent?.trim() === "Estimated visit cost",
        ).length,
        onSiteCostLabels: [...document.querySelectorAll("body *")].filter(
          (element) =>
            element.children.length === 0 &&
            /On-site cost|On-site spend/.test(
              element.textContent?.trim() ?? "",
            ),
        ).length,
      },
    };
  });

  await page.screenshot({
    path: `${outputDir}/kai206-${phase}-${item.id}.png`,
    fullPage: true,
  });
  audit.push({ id: item.id, ...rendered });
  await context.close();
}

await browser.close();
await writeFile(auditPath, `${JSON.stringify(audit, null, 2)}\n`);
console.log(JSON.stringify(audit, null, 2));
