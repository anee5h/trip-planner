import { afterEach, describe, expect, it, vi } from "vitest";
import {
  runLiveProbe,
  validateLiveHreflangSet,
  validateSitemapSet,
} from "../check-search-console-readiness.mjs";

/** Minimal-but-valid destination fixture. */
function makeDestination(overrides) {
  return {
    id: "test-destination",
    name: "Test Destination",
    nameJa: "テスト目的地",
    description: "A canonical English description for the test destination.",
    heroImage: "/images/hero.jpg",
    prefecture: "Tokyo",
    region: "Kanto",
    categories: [],
    status: "published",
    collections: [],
    highlights: ["First highlight", "Second highlight"],
    ...overrides,
  };
}

// The live probe hardcodes the kamakura pair — the fixture catalogue
// must include kamakura so the exact-set + hreflang assertions match.
const TWO = [
  makeDestination({ id: "kamakura" }),
  makeDestination({ id: "aaa" }),
];

const SITE = "https://meguruto.app";

function fullSitemap() {
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    `  <url>\n    <loc>${SITE}/</loc>\n  </url>`,
    `  <url>\n    <loc>${SITE}/destinations</loc>\n  </url>`,
    `  <url>\n    <loc>${SITE}/collections</loc>\n  </url>`,
    `  <url>\n    <loc>${SITE}/destinations/kamakura</loc>\n  </url>`,
    `  <url>\n    <loc>${SITE}/destinations/aaa</loc>\n  </url>`,
    `</urlset>`,
    ``,
  ].join("\n");
}

const HREFLANG = (enUrl, jaUrl) =>
  [
    `<link rel="alternate" hreflang="en" href="${enUrl}" />`,
    `<link rel="alternate" hreflang="ja" href="${jaUrl}" />`,
    `<link rel="alternate" hreflang="x-default" href="${enUrl}" />`,
  ].join("");

function homeHtml() {
  return `<html lang="en"><head><link rel="canonical" href="${SITE}/" />${HREFLANG(
    `${SITE}/`,
    `${SITE}/ja/`,
  )}</head><body><div id="root"></div></body></html>`;
}
function jaHomeHtml() {
  return `<html lang="ja"><head><link rel="canonical" href="${SITE}/ja/" />${HREFLANG(
    `${SITE}/`,
    `${SITE}/ja/`,
  )}</head><body><div id="root"></div></body></html>`;
}
function enDestHtml() {
  return `<html lang="en"><head><link rel="canonical" href="${SITE}/destinations/kamakura" />${HREFLANG(
    `${SITE}/destinations/kamakura`,
    `${SITE}/ja/destinations/kamakura`,
  )}</head></html>`;
}
function jaDestHtml() {
  return `<html lang="ja"><head><link rel="canonical" href="${SITE}/ja/destinations/kamakura" />${HREFLANG(
    `${SITE}/destinations/kamakura`,
    `${SITE}/ja/destinations/kamakura`,
  )}</head></html>`;
}

/** Install a mocked fetch: map path → {status, body, headers}. */
function mockFetch(routes) {
  globalThis.fetch = vi.fn(async (url) => {
    const pathname = new URL(String(url)).pathname;
    const resp = routes[pathname] ?? routes[pathname + "/"];
    if (resp) {
      return {
        status: resp.status ?? 200,
        text: async () => resp.body,
        headers: new Map(Object.entries(resp.headers ?? {})),
      };
    }
    return { status: 404, text: async () => "not found", headers: new Map() };
  });
}

function validRoutes() {
  return {
    "/robots.txt": {
      body: "User-agent: *\nAllow: /\nSitemap: https://meguruto.app/sitemap.xml",
    },
    "/sitemap.xml": { body: fullSitemap() },
    "/": { body: homeHtml() },
    "/ja/": { body: jaHomeHtml() },
    "/destinations/kamakura": { body: enDestHtml() },
    "/ja/destinations/kamakura": { body: jaDestHtml() },
    "/settings": {
      body: "<html></html>",
      headers: { "x-robots-tag": "noindex, nofollow" },
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("KAI-120 live probe: runLiveProbe (mocked fetch, no network)", () => {
  it("passes on a valid production fixture", async () => {
    mockFetch(validRoutes());
    const failures = await runLiveProbe({ destinations: TWO });
    expect(failures).toEqual([]);
  });

  it("fails when a canonical destination is MISSING from the live sitemap", async () => {
    const routes = validRoutes();
    routes["/sitemap.xml"] = {
      body: fullSitemap().replace(`<loc>${SITE}/destinations/aaa</loc>`, ""),
    };
    mockFetch(routes);
    const failures = await runLiveProbe({ destinations: TWO });
    expect(failures.some((f) => f.includes("missing 1 destination URL"))).toBe(
      true,
    );
  });

  it("fails on an INCOMPLETE hreflang set (EN home missing its self alternate)", async () => {
    const routes = validRoutes();
    routes["/"] = {
      body: `<html lang="en"><head><link rel="canonical" href="${SITE}/" /><link rel="alternate" hreflang="ja" href="${SITE}/ja/" /><link rel="alternate" hreflang="x-default" href="${SITE}/" /></head></html>`,
    };
    mockFetch(routes);
    const failures = await runLiveProbe({ destinations: TWO });
    expect(failures.some((f) => f.startsWith("/ missing"))).toBe(true);
  });

  it("fails on an EXTRA/duplicate hreflang alternate (count mismatch)", async () => {
    const routes = validRoutes();
    routes["/"] = {
      body: `<html lang="en"><head><link rel="canonical" href="${SITE}/" />${HREFLANG(
        `${SITE}/`,
        `${SITE}/ja/`,
      )}<link rel="alternate" hreflang="ja" href="${SITE}/ja/" /></head></html>`,
    };
    mockFetch(routes);
    const failures = await runLiveProbe({ destinations: TWO });
    expect(failures.some((f) => f.startsWith("/ expected exactly"))).toBe(true);
  });

  it("fails when a private route does NOT expose noindex", async () => {
    const routes = validRoutes();
    routes["/settings"] = { body: "<html></html>", headers: {} };
    mockFetch(routes);
    const failures = await runLiveProbe({ destinations: TWO });
    expect(
      failures.some((f) =>
        f.includes("/settings does not expose x-robots-tag"),
      ),
    ).toBe(true);
  });

  it("fails clearly when the catalogue is missing (prerequisite)", async () => {
    mockFetch(validRoutes());
    const failures = await runLiveProbe({});
    expect(
      failures.some((f) => f.includes("requires the canonical catalogue")),
    ).toBe(true);
  });
});

describe("KAI-120 live probe: pure validators", () => {
  it("validateSitemapSet flags a /ja/ URL and duplicates", () => {
    const urls = [
      `${SITE}/`,
      `${SITE}/destinations`,
      `${SITE}/collections`,
      `${SITE}/destinations/aaa`,
      `${SITE}/destinations/aaa`,
      `${SITE}/ja/destinations/aaa`,
    ];
    const failures = validateSitemapSet(urls, TWO);
    expect(failures.some((f) => f.includes("duplicate"))).toBe(true);
    expect(failures.some((f) => f.includes("/ja/ URL"))).toBe(true);
  });

  it("validateLiveHreflangSet rejects a page missing x-default", () => {
    const html = `<link rel="alternate" hreflang="en" href="${SITE}/destinations/aaa" /><link rel="alternate" hreflang="ja" href="${SITE}/ja/destinations/aaa" />`;
    const failures = validateLiveHreflangSet(
      html,
      `${SITE}/destinations/aaa`,
      `${SITE}/ja/destinations/aaa`,
    );
    expect(failures.some((f) => f.includes("x-default"))).toBe(true);
    expect(failures.some((f) => f.includes("expected exactly 3"))).toBe(true);
  });
});
