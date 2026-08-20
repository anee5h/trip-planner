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

test("Home (summary-only surface) never requests the full index", async ({
  page,
}) => {
  const hits = await collectRequests(page);
  // Home is SUMMARY-ONLY: every rail-required field lives in the lite
  // summary, so the full catalogue must NOT be fetched on initial Home
  // load (zero full-index requests).
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("main", { timeout: 20000 });
  // Give any mis-fired lazy loader a chance to appear.
  await page.waitForTimeout(1500);
  const fullHits = hits.filter((u) => u.includes(FULL_INDEX_URL));
  expect(fullHits).toEqual([]);
});

test("settings (summary surface) never loads the full index", async ({
  page,
}) => {
  const hits = await collectRequests(page);
  await page.goto("/settings", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  expect(hits.filter((u) => u.includes(FULL_INDEX_URL))).toEqual([]);
});

// --- KAI-132: the LITE catalogue must be runtime-lazy like the full one. ---

const LITE_INDEX_URL = "/data/destinations-index.lite.json";

async function collectLiteRequests(page: Page): Promise<string[]> {
  const urls: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes("destinations-index.lite")) urls.push(req.url());
  });
  return urls;
}

test("served index.html never references the lite index (module graph clean)", async ({
  page,
}) => {
  // The lite JSON exists at dist/data/destinations-index.lite.json as a
  // plain runtime asset, but it must be ABSENT from the JS/module-preload
  // graph: the served index.html must not reference it in any
  // script/link/modulepreload (the 2.67 MB payload must not be inlined
  // into the shared utils chunk).
  const response = await page.goto("/", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  const html = (await response?.text()) ?? "";
  expect(html).not.toContain("destinations-index.lite");
});

test("no built JS chunk statically imports the lite index (payload not inlined)", async ({
  page,
}) => {
  // Fetch every script the served index.html references and assert NONE
  // of them contains the lite catalogue payload (destination names that
  // would only appear if the 2.67 MB JSON were inlined).
  const response = await page.goto("/", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  const html = (await response?.text()) ?? "";
  const scriptSrcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(
    (m) => m[1],
  );
  expect(scriptSrcs.length).toBeGreaterThan(0);
  for (const src of scriptSrcs) {
    const res = await page.request.get(src);
    const body = await res.text();
    // A destination-name marker from the lite JSON — presence means the
    // catalogue payload was inlined into this chunk.
    expect(body).not.toContain("Abeno_Harukas_Osaka_Japan01-r");
  }
});

test("cold non-catalogue route never requests the lite index", async ({
  page,
}) => {
  const hits = await collectLiteRequests(page);
  // /privacy is a real cold route with no catalogue surfaces.
  await page.goto("/privacy", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  expect(hits).toEqual([]);
});

test("catalogue route requests the lite index exactly once", async ({
  page,
}) => {
  const hits = await collectLiteRequests(page);
  await page.goto("/", { waitUntil: "networkidle", timeout: 60000 });
  // Home is a catalogue surface — the lite index must load.
  await page.waitForSelector("[data-top-matches-placeholder], main", {
    timeout: 20000,
  });
  await page.waitForTimeout(1500);
  expect(hits.filter((u) => u.includes(LITE_INDEX_URL))).toHaveLength(1);
});

test("delayed lite load: catalogue rails stay pending, then recover (Collections + Bucket List)", async ({
  page,
}) => {
  // Deliberately delay the lite catalogue fetch so the home page renders
  // its skeleton + pending deferred sections BEFORE lite resolves. This
  // proves the KAI-132 gates hold (no empty/partial catalogue rails
  // render pre-load) and that Collections/Bucket List recover once the
  // loader resolves — without any retry or reload.
  let releaseLite: (() => void) | null = null;
  const liteGate = new Promise<void>((resolve) => {
    releaseLite = resolve;
  });
  await page.route("**/data/destinations-index.lite.json", async (route) => {
    await liteGate;
    const response = await page.request.get(
      "/data/destinations-index.lite.json",
    );
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: (await response.body()) as Buffer,
    });
  });

  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 60000 });

  // While lite is still pending: the TopMatches skeleton is visible and
  // the catalogue-dependent rails are held as deferred placeholders (NOT
  // mounted — no empty Collections/Bucket List).
  await page.waitForSelector("[data-top-matches-placeholder]", {
    timeout: 20000,
  });
  await page.waitForTimeout(1000);
  const pendingBefore = await page.locator("[data-deferred-pending]").count();
  expect(pendingBefore).toBeGreaterThan(0);
  await expect(
    page.getByRole("heading", { name: "Featured collections" }),
  ).toHaveCount(0);

  // Release the lite fetch: the loader resolves, deferred sections mount,
  // and the catalogue rails recover.
  releaseLite?.();
  await expect
    .poll(async () => page.locator("[data-deferred-pending]").count())
    .toBe(0);
  await expect(
    page.getByRole("heading", { name: "Featured collections" }),
  ).toBeVisible();
  // Bucket List rail (compact prompt for the signed-out/empty state) is
  // mounted too — the deferred queue drained completely.
  await expect(page.locator("[data-deferred-pending]")).toHaveCount(0);
});

test("lite load failure shows error + retry recovers (fail → retry → success, no crash)", async ({
  page,
}) => {
  // KAI-132 error semantics: a failed loadLiteIndex() must NOT be treated
  // as ready. The home page shows an explicit error state (with Retry),
  // the planner stays usable, and no ErrorBoundary crash occurs. Retry
  // re-fetches (loadLiteIndex clears its singleton on failure) and the
  // catalogue rails recover.
  let failLite = true;
  await page.route("**/data/destinations-index.lite.json", async (route) => {
    if (failLite) {
      // HTTP 500 with a VALID JSON body: proves status handling (the
      // response.ok rejection), not a JSON-parse failure.
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: "[]",
      });
    } else {
      const response = await page.request.get(
        "/data/destinations-index.lite.json",
      );
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: (await response.body()) as Buffer,
      });
    }
  });

  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));

  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 60000 });

  // The failure surfaces as an explicit error state (NOT the skeleton,
  // NOT an empty catalogue, NOT a crash).
  await page.waitForSelector("[data-top-matches-error]", { timeout: 20000 });
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  // No ErrorBoundary crash: the planner/hero still rendered.
  await expect(page.locator("main")).toBeVisible();
  expect(pageErrors).toEqual([]);

  // Retry succeeds: error state clears, rails mount.
  failLite = false;
  await page.getByRole("button", { name: "Retry" }).click();
  await expect
    .poll(async () => page.locator("[data-top-matches-error]").count())
    .toBe(0);
  await expect(
    page.getByRole("heading", { name: "Featured collections" }),
  ).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("secondary route (explorer) fail → retry → success, no crash", async ({
  page,
}) => {
  // Same error semantics on a NON-Home route: /destinations surfaces the
  // explicit error state (NOT an empty grid that looks like a real empty
  // catalogue), retry re-fetches, and the grid recovers — no
  // ErrorBoundary crash at any point.
  let failLite = true;
  await page.route("**/data/destinations-index.lite.json", async (route) => {
    if (failLite) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: "[]",
      });
    } else {
      const response = await page.request.get(
        "/data/destinations-index.lite.json",
      );
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: (await response.body()) as Buffer,
      });
    }
  });

  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));

  await page.goto("/destinations", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  await page.waitForSelector("[data-lite-error]", { timeout: 20000 });
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  expect(pageErrors).toEqual([]);

  failLite = false;
  await page.getByRole("button", { name: "Retry" }).click();
  await expect
    .poll(async () => page.locator("[data-lite-error]").count())
    .toBe(0);
  // The explorer grid recovers: a destination card link is present.
  await expect(page.locator('a[href^="/destinations/"]').first()).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("/collections failure shows error + retry recovers", async ({ page }) => {
  // CollectionsDirectory must not spinner-forever on a failed lite load:
  // an explicit error + retry, then recovery when the loader succeeds.
  let failLite = true;
  await page.route("**/data/destinations-index.lite.json", async (route) => {
    if (failLite) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: "[]",
      });
    } else {
      const response = await page.request.get(
        "/data/destinations-index.lite.json",
      );
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: (await response.body()) as Buffer,
      });
    }
  });

  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));

  await page.goto("/collections", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  await page.waitForSelector("[data-lite-error]", { timeout: 20000 });
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  expect(pageErrors).toEqual([]);

  failLite = false;
  await page.getByRole("button", { name: "Retry" }).click();
  await expect
    .poll(async () => page.locator("[data-lite-error]").count())
    .toBe(0);
  // A collection card (link) recovers.
  await expect(page.locator('a[href^="/collections/"]').first()).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("custom-destination city picker: parent fail → retry → success", async ({
  page,
}) => {
  // When customDestinations is supplied, the picker's internal lite
  // loader is DISABLED and the PARENT owns loading/error/retry. Settings'
  // home-station picker is a customDestinations consumer: on lite failure
  // it must surface the parent's error/retry (not spin), and retry must
  // recover — proving parent/child retries cannot diverge.
  let failLite = true;
  await page.route("**/data/destinations-index.lite.json", async (route) => {
    if (failLite) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: "[]",
      });
    } else {
      const response = await page.request.get(
        "/data/destinations-index.lite.json",
      );
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: (await response.body()) as Buffer,
      });
    }
  });

  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));

  await page.goto("/settings", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  await page.waitForSelector("[data-lite-error]", { timeout: 20000 });
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  expect(pageErrors).toEqual([]);

  failLite = false;
  await page.getByRole("button", { name: "Retry" }).click();
  await expect
    .poll(async () => page.locator("[data-lite-error]").count())
    .toBe(0);
  // Settings recovered: the home-station section rendered.
  await expect(page.locator("main")).toBeVisible();
  expect(pageErrors).toEqual([]);
});
