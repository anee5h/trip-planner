#!/usr/bin/env node
/**
 * KAI-120: Search Console readiness checker.
 *
 * Verifies the PRODUCTION surfaces that Google Search Console will ingest
 * are internally consistent and indexable, without any Search Console
 * authentication (owner-side property setup stays in docs). This is a
 * deterministic repo-side gate, not a ranking claim.
 *
 * Contract verified (KAI-97 + KAI-108, current main semantics):
 *   1. robots.txt present with the sitemap directive.
 *   2. Sitemap EXACT SET: every canonical destination's EN URL appears
 *      exactly once; public hub URLs appear; no destination missing; no
 *      unexpected destination; no duplicate destination; /ja/... URLs
 *      stay out of the plain sitemap (KAI-108 hreflang is HTML-based).
 *   3. Post-KAI-108 HTML contract per prerendered page:
 *        - EN home: exact EN canonical + complete EN/JA/x-default set
 *        - JA home: exact JA canonical + the same three-link set
 *        - every EN destination: exact EN canonical + full three-link set
 *        - every JA destination: exact JA canonical + same three-link set
 *        - <html lang="en"> / <html lang="ja"> exact per locale
 *        - NO status-based exception (status is quality metadata only;
 *          all 978 canonical destinations are public/indexable)
 *   4. No private/QA/e2e/account surfaces in sitemap or prerender.
 *
 * Determinism: the static mode is BUILD-FREE — it reads the source SPA
 * shell (index.html), generates the SEO output IN MEMORY via the pure
 * prerender functions, and validates that generated output. It never
 * silently skips because dist/ happens not to exist; if the source shell
 * is missing the checker FAILS clearly. Actual disk-output determinism
 * stays with the existing `seo:check` gate.
 *
 * Output discipline: a reported PASS means every enabled check actually
 * executed and passed. No ✓ is printed after a corresponding ✗.
 *
 * Usage:
 *   node scripts/check-search-console-readiness.mjs            # static gate
 *   node scripts/check-search-console-readiness.mjs --live     # + probe meguruto.app
 *
 * Exit 0 = pass, 1 = fail.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const PUBLIC = path.join(ROOT, "public");
const SHELL_PATH = path.join(ROOT, "index.html");
const SITE_URL = "https://meguruto.app";

// Real private SPA route contract (matches src/App.tsx route table +
// the KAI-126 protected Functions). Derived from the route source; a test
// cross-checks this list against the <Route path=...> declarations so the
// checker cannot silently drift.
export const PRIVATE_ROUTES = [
  "/settings",
  "/my-trips",
  "/bucket-list",
  "/passport",
  "/profile",
  "/favorites",
  "/visited-map",
  "/qa",
  "/editorial",
  "/compare",
  "/e2e",
];

// Public hub surfaces in the sitemap that are NOT destinations.
export const SITEMAP_HUB_URLS = [
  `${SITE_URL}/`,
  `${SITE_URL}/destinations`,
  `${SITE_URL}/collections`,
];

// The complete EN/JA/x-default hreflang set (KAI-108) for a URL pair.
export function hreflangSet(enUrl, jaUrl) {
  return [
    `<link rel="alternate" hreflang="en" href="${enUrl}" />`,
    `<link rel="alternate" hreflang="ja" href="${jaUrl}" />`,
    `<link rel="alternate" hreflang="x-default" href="${enUrl}" />`,
  ];
}

import {
  buildPrerenderOutputs,
  buildShellPage,
  destinationUrl,
  loadPrerenderDestinations,
  renderSitemap,
} from "../src/seo/prerender.js";

/**
 * EXACT sitemap-set validation (shared by static + live modes so the two
 * can never drift): all 978 canonical EN destination URLs exactly once,
 * all public hub URLs present, no missing/unexpected/duplicate URL, no
 * /ja/ URLs (KAI-108 hreflang is HTML-based). Returns failure messages
 * (empty = pass).
 */
export function validateSitemapSet(sitemapUrls, destinations) {
  const failures = [];
  const expectedDestUrls = destinations.map(
    (d) => `${SITE_URL}/destinations/${d.id}`,
  );
  const expectedSet = new Set([...SITEMAP_HUB_URLS, ...expectedDestUrls]);
  const seen = new Map();
  for (const url of sitemapUrls) seen.set(url, (seen.get(url) ?? 0) + 1);

  const missing = expectedDestUrls.filter((u) => !seen.has(u));
  if (missing.length > 0) {
    failures.push(
      `sitemap missing ${missing.length} destination URL(s) (e.g. ${missing[0]})`,
    );
  }
  const unexpected = [...seen.keys()].filter((u) => !expectedSet.has(u));
  if (unexpected.length > 0) {
    failures.push(
      `sitemap has ${unexpected.length} unexpected URL(s): ${unexpected.slice(0, 3).join(", ")}`,
    );
  }
  const dups = [...seen.entries()].filter(([, n]) => n > 1).map(([u]) => u);
  if (dups.length > 0) {
    failures.push(
      `sitemap has duplicate URL(s): ${dups.slice(0, 3).join(", ")}`,
    );
  }
  const missingHubs = SITEMAP_HUB_URLS.filter((u) => !seen.has(u));
  if (missingHubs.length > 0) {
    failures.push(
      `sitemap missing public hub URL(s): ${missingHubs.join(", ")}`,
    );
  }
  const jaInSitemap = sitemapUrls.filter((u) => u.includes("/ja/"));
  if (jaInSitemap.length > 0) {
    failures.push(
      `sitemap contains /ja/ URL(s) (KAI-108 hreflang is HTML-based): ${jaInSitemap.slice(0, 3).join(", ")}`,
    );
  }
  return failures;
}

/**
 * Complete hreflang-set validation for a live HTML page: all three links
 * (en → EN URL, ja → JA URL, x-default → EN URL) present and no MORE than
 * the three (an extra/duplicate bad alternate must not silently pass).
 * Returns failure messages (empty = pass).
 */
export function validateLiveHreflangSet(html, enUrl, jaUrl) {
  const failures = [];
  const expected = hreflangSet(enUrl, jaUrl);
  for (const tag of expected) {
    if (!html.includes(tag)) failures.push(`missing ${tag}`);
  }
  const links = [
    ...html.matchAll(/<link rel="alternate" hreflang="[^"]*"[^>]*>/g),
  ].map((m) => m[0].replace(/\s+/g, " ").trim());
  if (links.length !== expected.length) {
    failures.push(
      `expected exactly ${expected.length} hreflang alternate link(s), found ${links.length}`,
    );
  }
  return failures;
}

/**
 * Run every STATIC check against in-memory prerender output.
 * Returns the array of failure messages (empty = pass).
 * The generator functions are injectable for tests (dependency injection —
 * production callers use the real pure prerender functions).
 */
export function runStaticChecks({
  shell,
  destinations,
  log = () => {},
  renderSitemapFn = renderSitemap,
  buildOutputsFn = buildPrerenderOutputs,
}) {
  const failures = [];
  const ok = (msg) => log(msg);
  const fail = (msg) => failures.push(msg);

  if (!destinations || destinations.length === 0) {
    fail("catalogue loaded empty — cannot validate");
    return failures;
  }
  ok(
    `catalogue: ${destinations.length} canonical destinations (status = quality metadata only)`,
  );

  const outputs = buildOutputsFn(shell, destinations);
  const sitemap = renderSitemapFn(destinations);
  const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    (m) => m[1],
  );

  // --- EXACT sitemap set (shared validator) ---
  for (const f of validateSitemapSet(sitemapUrls, destinations)) fail(f);
  if (failures.filter((f) => f.startsWith("sitemap")).length === 0) {
    ok(
      `sitemap: exact set of ${destinations.length} EN destination URLs + ${SITEMAP_HUB_URLS.length} hubs (no missing/unexpected/duplicate//ja/)`,
    );
  }

  // --- Post-KAI-108 HTML contract ---
  const enHome = buildShellPage(shell, "en");
  const enHomeCanonical = `${SITE_URL}/`;
  for (const tag of hreflangSet(enHomeCanonical, `${SITE_URL}/ja/`)) {
    if (!enHome.includes(tag)) fail(`EN home missing ${tag}`);
  }
  if (!enHome.includes(`<link rel="canonical" href="${enHomeCanonical}" />`)) {
    fail(`EN home canonical mismatch (expected ${enHomeCanonical})`);
  }
  if (!enHome.includes('<html lang="en"')) fail('EN home lacks lang="en"');

  const jaHome = buildShellPage(shell, "ja");
  const jaHomeCanonical = `${SITE_URL}/ja/`;
  for (const tag of hreflangSet(`${SITE_URL}/`, jaHomeCanonical)) {
    if (!jaHome.includes(tag)) fail(`JA home missing ${tag}`);
  }
  if (!jaHome.includes(`<link rel="canonical" href="${jaHomeCanonical}" />`)) {
    fail(`JA home canonical mismatch (expected ${jaHomeCanonical})`);
  }
  if (!jaHome.includes('<html lang="ja"')) fail('JA home lacks lang="ja"');

  let destPairsChecked = 0;
  let destFailures = 0;
  for (const d of destinations) {
    const enUrl = destinationUrl(d.id, "en");
    const jaUrl = destinationUrl(d.id, "ja");
    const enHtml = outputs.get(`/destinations/${d.id}/index.html`) ?? "";
    const jaHtml = outputs.get(`/ja/destinations/${d.id}/index.html`) ?? "";
    const setTags = hreflangSet(enUrl, jaUrl);
    let bad = false;
    if (!enHtml.includes(`<link rel="canonical" href="${enUrl}" />`))
      bad = true;
    if (!jaHtml.includes(`<link rel="canonical" href="${jaUrl}" />`))
      bad = true;
    if (!enHtml.includes('<html lang="en"')) bad = true;
    if (!jaHtml.includes('<html lang="ja"')) bad = true;
    for (const tag of setTags) {
      if (!enHtml.includes(tag)) bad = true;
      if (!jaHtml.includes(tag)) bad = true;
    }
    destPairsChecked += 1;
    if (bad) destFailures += 1;
  }
  if (destFailures > 0) {
    fail(
      `HTML contract failed on ${destFailures}/${destPairsChecked} destination pairs (all statuses checked — no status exception)`,
    );
  } else {
    ok(
      `HTML contract (exact canonical + identical 3-link hreflang + lang) on all ${destPairsChecked} EN+JA destination pairs — no status exception`,
    );
  }

  // --- Private surfaces ---
  const privateInSitemap = PRIVATE_ROUTES.filter((r) => sitemap.includes(r));
  if (privateInSitemap.length > 0) {
    fail(`sitemap contains private surface(s): ${privateInSitemap.join(", ")}`);
  } else {
    ok("sitemap contains no private/QA/e2e/account surfaces");
  }
  const privateInPrerender = [...outputs.keys()].filter((p) =>
    PRIVATE_ROUTES.some((r) => p.includes(r)),
  );
  if (privateInPrerender.length > 0) {
    fail(
      `prerender contains private surface(s): ${privateInPrerender.slice(0, 3).join(", ")}`,
    );
  } else {
    ok("prerender contains no private/QA/e2e/account surfaces");
  }

  return failures;
}

/**
 * Run the optional LIVE probe against meguruto.app (unauthenticated,
 * read-only). Returns failure messages (empty = pass).
 * `destinations` is the canonical catalogue (required for exact-set
 * sitemap validation) — injectable for tests.
 */
export async function runLiveProbe({
  siteUrl = SITE_URL,
  destinations,
  log = () => {},
} = {}) {
  const failures = [];
  const ok = (msg) => log(msg);
  const fail = (msg) => failures.push(msg);

  async function getText(p) {
    const res = await fetch(`${siteUrl}${p}`, { redirect: "follow" });
    return { status: res.status, text: await res.text() };
  }

  if (!destinations || destinations.length === 0) {
    fail("live probe requires the canonical catalogue (destinations)");
    return failures;
  }

  try {
    const robots = await getText("/robots.txt");
    if (robots.status !== 200) fail(`/robots.txt -> ${robots.status}`);
    else if (!robots.text.includes("Sitemap: https://meguruto.app/sitemap.xml"))
      fail("/robots.txt lacks the sitemap directive");
    else ok("/robots.txt -> 200 + sitemap directive");

    // EXACT sitemap-set validation (shared with static mode).
    const sitemap = await getText("/sitemap.xml");
    if (sitemap.status !== 200) fail(`/sitemap.xml -> ${sitemap.status}`);
    else {
      const urls = [...sitemap.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
        (m) => m[1],
      );
      const sitemapFailures = validateSitemapSet(urls, destinations);
      for (const f of sitemapFailures) fail(`/sitemap.xml ${f}`);
      if (sitemapFailures.length === 0)
        ok(
          `/sitemap.xml -> 200 with exact set (${destinations.length} EN destinations + ${SITEMAP_HUB_URLS.length} hubs)`,
        );
    }

    // Complete hreflang set on every representative page (all three
    // links: en → EN URL, ja → JA URL, x-default → EN URL).
    const home = await getText("/");
    if (home.status !== 200) fail(`/ -> ${home.status}`);
    else {
      if (
        !home.text.includes(
          '<link rel="canonical" href="https://meguruto.app/" />',
        )
      )
        fail("/ lacks the EN home canonical");
      const hf = validateLiveHreflangSet(
        home.text,
        "https://meguruto.app/",
        "https://meguruto.app/ja/",
      );
      for (const f of hf) fail(`/ ${f}`);
      if (
        failures.filter((f) => f.startsWith("/ ")).length === 0 &&
        hf.length === 0
      )
        ok("/ -> 200 + EN canonical + complete 3-link hreflang set");
    }

    const jaHome = await getText("/ja/");
    if (jaHome.status !== 200) fail(`/ja/ -> ${jaHome.status}`);
    else {
      if (
        !jaHome.text.includes(
          '<link rel="canonical" href="https://meguruto.app/ja/" />',
        )
      )
        fail("/ja/ lacks the JA home canonical");
      const hf = validateLiveHreflangSet(
        jaHome.text,
        "https://meguruto.app/",
        "https://meguruto.app/ja/",
      );
      for (const f of hf) fail(`/ja/ ${f}`);
      if (
        failures.filter((f) => f.startsWith("/ja/ ")).length === 0 &&
        hf.length === 0
      )
        ok("/ja/ -> 200 + JA canonical + complete 3-link hreflang set");
    }

    const enDest = await getText("/destinations/kamakura");
    const jaDest = await getText("/ja/destinations/kamakura");
    const enUrl = "https://meguruto.app/destinations/kamakura";
    const jaUrl = "https://meguruto.app/ja/destinations/kamakura";
    if (enDest.status !== 200)
      fail(`/destinations/kamakura -> ${enDest.status}`);
    else {
      if (!enDest.text.includes(`<link rel="canonical" href="${enUrl}" />`))
        fail("EN destination lacks exact canonical");
      const hf = validateLiveHreflangSet(enDest.text, enUrl, jaUrl);
      for (const f of hf) fail(`EN destination ${f}`);
      if (failures.filter((f) => f.includes("EN destination")).length === 0)
        ok(
          "EN destination /destinations/kamakura -> 200 + canonical + complete 3-link hreflang set",
        );
    }
    if (jaDest.status !== 200)
      fail(`/ja/destinations/kamakura -> ${jaDest.status}`);
    else {
      if (!jaDest.text.includes(`<link rel="canonical" href="${jaUrl}" />`))
        fail("JA destination lacks exact canonical");
      const hf = validateLiveHreflangSet(jaDest.text, enUrl, jaUrl);
      for (const f of hf) fail(`JA destination ${f}`);
      if (failures.filter((f) => f.includes("JA destination")).length === 0)
        ok(
          "JA destination /ja/destinations/kamakura -> 200 + JA canonical + complete 3-link hreflang set",
        );
    }

    const privateRes = await fetch(`${siteUrl}/settings`, {
      redirect: "follow",
    });
    const noindex = (
      privateRes.headers.get("x-robots-tag") ?? ""
    ).toLowerCase();
    if (!noindex.includes("noindex")) {
      fail("/settings does not expose x-robots-tag: noindex");
    } else {
      ok("/settings -> x-robots-tag: noindex");
    }
  } catch (e) {
    fail(`live probe error: ${e.message}`);
  }

  return failures;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = [];
  let okCount = 0;
  let ranCount = 0;
  const recordOk = (msg) => {
    ranCount += 1;
    okCount += 1;
    console.log(`  ✓ ${msg}`);
  };
  const recordFail = (msg) => {
    ranCount += 1;
    failures.push(msg);
    console.error(`  ✗ ${msg}`);
  };

  // 1. robots.txt
  const robotsPath = path.join(PUBLIC, "robots.txt");
  if (!fs.existsSync(robotsPath)) {
    recordFail("public/robots.txt missing");
  } else {
    const robots = fs.readFileSync(robotsPath, "utf8");
    if (!robots.includes("Sitemap: https://meguruto.app/sitemap.xml")) {
      recordFail("robots.txt lacks the sitemap directive");
    } else {
      recordOk("robots.txt present with sitemap directive");
    }
  }

  // 2. Source SPA shell REQUIRED (deterministic, never silently skipped)
  if (!fs.existsSync(SHELL_PATH)) {
    recordFail(
      `source SPA shell missing (${SHELL_PATH}) — cannot run static checks`,
    );
  } else {
    const shell = fs.readFileSync(SHELL_PATH, "utf8");
    const staticFailures = runStaticChecks({
      shell,
      destinations: loadPrerenderDestinations(),
      log: (msg) => {
        ranCount += 1;
        okCount += 1;
        console.log(`  ✓ ${msg}`);
      },
    });
    for (const f of staticFailures) {
      ranCount += 1;
      failures.push(f);
      console.error(`  ✗ ${f}`);
    }
  }

  // 3. Optional live probe
  if (process.argv.includes("--live")) {
    console.log("  [live probe]");
    const liveFailures = await runLiveProbe({
      destinations: loadPrerenderDestinations(),
      log: (msg) => console.log(`  ✓ ${msg}`),
    });
    for (const f of liveFailures) {
      ranCount += 1;
      failures.push(f);
      console.error(`  ✗ ${f}`);
    }
  }

  if (failures.length > 0) {
    console.error(
      `\nSearch Console readiness: ${failures.length} FAILURE(S) (${ranCount} checks ran, ${okCount} passed)`,
    );
    process.exit(1);
  }
  console.log(
    `\nSearch Console readiness: PASS (${ranCount} checks executed and passed)`,
  );
}
