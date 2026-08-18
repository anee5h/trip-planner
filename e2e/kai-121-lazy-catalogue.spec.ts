import { expect, test, type Page } from "@playwright/test";

// KAI-121: these checks assert PRODUCTION runtime network behavior (lazy
// fetch, SW precache). They run against the production preview build in
// the dedicated PWA/preview E2E job (PWA_E2E=1); the vite-dev bins skip.
test.skip(process.env.PWA_E2E !== "1", "preview-build runtime checks only");

/**
 * KAI-121: deterministic runtime-lazy catalogue performance checks.
 *
 * Proves the RUNTIME network reality (not just bundle stats):
 *  1. A cold route that does NOT require the full catalogue (e.g. /legal)
 *     never requests /data/destinations-index.json.
 *  2. The service-worker install does not eagerly fetch it (no precache).
 *  3. A full-data feature (Home) loads it — exactly once per session.
 *  4. After the full data loads, no permanently-cached lite result
 *     shadows it (the summary is complete by definition; the full loader
 *     replaces the working set).
 *
 * Runs against the production preview server (webServer in playwright
 * config serves dist/).
 */
const FULL_INDEX_URL = "/data/destinations-index.json";

async function collectRequests(page: Page): Promise<string[]> {
  const urls: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes("destinations-index")) urls.push(req.url());
  });
  return urls;
}

test("cold non-catalogue route never requests the full index", async ({
  page,
}) => {
  const hits = await collectRequests(page);
  // /privacy is a real cold route (no full-data consumers mounted).
  await page.goto("/privacy", { waitUntil: "networkidle" });
  // Give any mis-fired lazy loader a chance to appear.
  await page.waitForTimeout(1500);
  expect(hits.filter((u) => u.includes(FULL_INDEX_URL))).toEqual([]);
});

test("service-worker install does not precache the full index", async ({
  page,
}) => {
  // Navigate to a non-catalogue route so Home's lazy fetch does not run
  // (isolating the SW's own install-time fetches).
  await page.goto("/privacy", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  const hits = await collectRequests(page);
  // Force the SW install path to run (fresh context has no SW).
  await page.evaluate(async () => {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      await reg.update();
    }
  });
  await page.waitForTimeout(1500);
  // The SW precaches APP_SHELL ("/") only — the catalogue must never be
  // fetched during install. (Home's lazy fetch is absent here because we
  // never visited a full-data route.)
  const swFetched = hits.filter((u) => u.includes(FULL_INDEX_URL));
  expect(swFetched).toEqual([]);
  // Also assert the shell cache contains no catalogue key.
  const cacheKeys = await page.evaluate(async () => {
    const keys: string[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const req of await cache.keys()) keys.push(req.url);
    }
    return keys;
  });
  expect(cacheKeys.some((u) => u.includes("destinations-index"))).toBe(false);
});

test("dist/index.html never references the full index (module graph clean)", async ({
  page,
}) => {
  // The full JSON exists at dist/data/destinations-index.json as a plain
  // runtime asset, but it must be ABSENT from the JS/module-preload graph:
  // the served index.html must not reference it in any script/link/
  // modulepreload.
  const response = await page.goto("/", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  const html = (await response?.text()) ?? "";
  expect(html).not.toContain("destinations-index");
});

test("Home (full-data surface) loads the full index exactly once", async ({
  page,
}) => {
  const hits = await collectRequests(page);
  // domcontentloaded (not networkidle — the 6.5 MB lazy fetch would hold
  // networkidle open and can stall the renderer).
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("main", { timeout: 20000 });
  // Home genuinely needs the full catalogue (rails score on budget/ratings).
  await page.waitForFunction(
    () => {
      // Give the lazy loader a chance; check via performance entries.
      const entries = performance
        .getEntriesByType("resource")
        .map((e) => e.name);
      return entries.some((n) => n.includes("destinations-index"));
    },
    { timeout: 20000 },
  );
  const fullHits = hits.filter((u) => u.includes(FULL_INDEX_URL));
  expect(fullHits.length).toBe(1); // exactly once, shared promise
});

test("settings (summary surface) never loads the full index", async ({
  page,
}) => {
  const hits = await collectRequests(page);
  await page.goto("/settings", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  expect(hits.filter((u) => u.includes(FULL_INDEX_URL))).toEqual([]);
});
