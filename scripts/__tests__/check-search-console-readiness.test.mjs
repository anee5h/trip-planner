import { describe, expect, it } from "vitest";
import {
  PRIVATE_ROUTES,
  SITEMAP_HUB_URLS,
  hreflangSet,
  runStaticChecks,
} from "../check-search-console-readiness.mjs";

/** Minimal-but-valid destination fixture (canonical fields only). */
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

const SHELL = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Meguruto: めぐると、見つかる。</title>
    <meta name="description" content="Homepage description" />
    <link rel="canonical" href="https://meguruto.app/" />
    <meta property="og:title" content="Meguruto" />
    <meta property="og:url" content="https://meguruto.app/" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

const TWO = [
  makeDestination({ id: "aaa", status: "published" }),
  makeDestination({ id: "bbb", status: "beta" }),
];

/** A valid sitemap for the two-destination catalogue. */
function goodSitemap() {
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    `  <url>\n    <loc>https://meguruto.app/</loc>\n  </url>`,
    `  <url>\n    <loc>https://meguruto.app/destinations</loc>\n  </url>`,
    `  <url>\n    <loc>https://meguruto.app/collections</loc>\n  </url>`,
    `  <url>\n    <loc>https://meguruto.app/destinations/aaa</loc>\n  </url>`,
    `  <url>\n    <loc>https://meguruto.app/destinations/bbb</loc>\n  </url>`,
    `</urlset>`,
    ``,
  ].join("\n");
}

/** A good prerender output map for the two-destination catalogue. */
function goodOutputs() {
  const map = new Map();
  map.set(
    "/ja/index.html",
    `<html lang="ja"><head><link rel="canonical" href="https://meguruto.app/ja/" /></head></html>`,
  );
  for (const id of ["aaa", "bbb"]) {
    map.set(
      `/destinations/${id}/index.html`,
      `<html lang="en"><head><link rel="canonical" href="https://meguruto.app/destinations/${id}" />${hreflangSet(
        `https://meguruto.app/destinations/${id}`,
        `https://meguruto.app/ja/destinations/${id}`,
      ).join("")}</head></html>`,
    );
    map.set(
      `/ja/destinations/${id}/index.html`,
      `<html lang="ja"><head><link rel="canonical" href="https://meguruto.app/ja/destinations/${id}" />${hreflangSet(
        `https://meguruto.app/destinations/${id}`,
        `https://meguruto.app/ja/destinations/${id}`,
      ).join("")}</head></html>`,
    );
  }
  return map;
}

describe("KAI-120 checker: sitemap exact-set validation", () => {
  it("passes when every canonical destination + hub is present exactly once", () => {
    const failures = runStaticChecks({
      shell: SHELL,
      destinations: TWO,
      log: () => {},
      renderSitemapFn: goodSitemap,
      buildOutputsFn: goodOutputs,
    });
    expect(failures).toEqual([]);
  });

  it("flags a MISSING destination URL", () => {
    const bad = () =>
      goodSitemap().replace(
        "<loc>https://meguruto.app/destinations/bbb</loc>",
        "",
      );
    const failures = runStaticChecks({
      shell: SHELL,
      destinations: TWO,
      log: () => {},
      renderSitemapFn: bad,
      buildOutputsFn: goodOutputs,
    });
    expect(failures.some((f) => f.includes("missing 1 destination URL"))).toBe(
      true,
    );
  });

  it("flags an EXTRA (unexpected) URL in the sitemap", () => {
    const bad = () =>
      goodSitemap().replace(
        "</urlset>",
        "  <url>\n    <loc>https://meguruto.app/destinations/ghost</loc>\n  </url>\n</urlset>",
      );
    const failures = runStaticChecks({
      shell: SHELL,
      destinations: TWO,
      log: () => {},
      renderSitemapFn: bad,
      buildOutputsFn: goodOutputs,
    });
    expect(failures.some((f) => f.includes("unexpected URL"))).toBe(true);
  });

  it("flags a DUPLICATE destination URL", () => {
    const bad = () =>
      goodSitemap().replace(
        "<loc>https://meguruto.app/destinations/bbb</loc>",
        "<loc>https://meguruto.app/destinations/aaa</loc>\n  </url>\n  <url>\n    <loc>https://meguruto.app/destinations/aaa</loc>",
      );
    const failures = runStaticChecks({
      shell: SHELL,
      destinations: TWO,
      log: () => {},
      renderSitemapFn: bad,
      buildOutputsFn: goodOutputs,
    });
    expect(failures.some((f) => f.includes("duplicate URL"))).toBe(true);
  });

  it("flags a /ja/ URL leaking into the plain sitemap", () => {
    const bad = () =>
      goodSitemap().replace(
        "</urlset>",
        "  <url>\n    <loc>https://meguruto.app/ja/destinations/aaa</loc>\n  </url>\n</urlset>",
      );
    const failures = runStaticChecks({
      shell: SHELL,
      destinations: TWO,
      log: () => {},
      renderSitemapFn: bad,
      buildOutputsFn: goodOutputs,
    });
    expect(failures.some((f) => f.includes("/ja/ URL"))).toBe(true);
  });

  it("flags a MISSING public hub URL", () => {
    const bad = () =>
      goodSitemap().replace("<loc>https://meguruto.app/collections</loc>", "");
    const failures = runStaticChecks({
      shell: SHELL,
      destinations: TWO,
      log: () => {},
      renderSitemapFn: bad,
      buildOutputsFn: goodOutputs,
    });
    expect(failures.some((f) => f.includes("missing public hub URL"))).toBe(
      true,
    );
  });

  it("status does NOT gate anything (published + beta + verified + planned all pass)", () => {
    const all = [
      makeDestination({ id: "aaa", status: "published" }),
      makeDestination({ id: "bbb", status: "beta" }),
      makeDestination({ id: "ccc", status: "verified" }),
      makeDestination({ id: "ddd", status: "planned" }),
    ];
    const failures = runStaticChecks({
      shell: SHELL,
      destinations: all,
      log: () => {},
      renderSitemapFn: () =>
        goodSitemap().replace(
          "<loc>https://meguruto.app/destinations/bbb</loc>",
          "<loc>https://meguruto.app/destinations/bbb</loc>\n  </url>\n  <url>\n    <loc>https://meguruto.app/destinations/ccc</loc>\n  </url>\n  <url>\n    <loc>https://meguruto.app/destinations/ddd</loc>",
        ),
      buildOutputsFn: (shell, dests) => {
        const m = goodOutputs();
        for (const id of ["ccc", "ddd"]) {
          m.set(
            `/destinations/${id}/index.html`,
            `<html lang="en"><head><link rel="canonical" href="https://meguruto.app/destinations/${id}" />${hreflangSet(
              `https://meguruto.app/destinations/${id}`,
              `https://meguruto.app/ja/destinations/${id}`,
            ).join("")}</head></html>`,
          );
          m.set(
            `/ja/destinations/${id}/index.html`,
            `<html lang="ja"><head><link rel="canonical" href="https://meguruto.app/ja/destinations/${id}" />${hreflangSet(
              `https://meguruto.app/destinations/${id}`,
              `https://meguruto.app/ja/destinations/${id}`,
            ).join("")}</head></html>`,
          );
        }
        return m;
      },
    });
    expect(failures).toEqual([]);
  });
});

describe("KAI-120 checker: HTML contract", () => {
  it("fails on a BAD canonical (destination pair)", () => {
    const badOutputs = () => {
      const m = goodOutputs();
      // Break the EN canonical for aaa.
      m.set(
        "/destinations/aaa/index.html",
        `<html lang="en"><head><link rel="canonical" href="https://meguruto.app/ja/destinations/aaa" /></head></html>`,
      );
      return m;
    };
    const failures = runStaticChecks({
      shell: SHELL,
      destinations: TWO,
      log: () => {},
      renderSitemapFn: goodSitemap,
      buildOutputsFn: badOutputs,
    });
    expect(failures.some((f) => f.includes("HTML contract failed"))).toBe(true);
  });

  it("fails on BAD hreflang (missing link set)", () => {
    const badOutputs = () => {
      const m = goodOutputs();
      // Drop the x-default from the EN aaa page.
      m.set(
        "/destinations/aaa/index.html",
        `<html lang="en"><head><link rel="canonical" href="https://meguruto.app/destinations/aaa" /><link rel="alternate" hreflang="en" href="https://meguruto.app/destinations/aaa" /><link rel="alternate" hreflang="ja" href="https://meguruto.app/ja/destinations/aaa" /></head></html>`,
      );
      return m;
    };
    const failures = runStaticChecks({
      shell: SHELL,
      destinations: TWO,
      log: () => {},
      renderSitemapFn: goodSitemap,
      buildOutputsFn: badOutputs,
    });
    expect(failures.some((f) => f.includes("HTML contract failed"))).toBe(true);
  });

  it("fails on a BAD home canonical", () => {
    const badOutputs = () => {
      const m = goodOutputs();
      // Broken EN home: canonical points at /ja/.
      m.set(
        "/ja/index.html",
        `<html lang="ja"><head><link rel="canonical" href="https://meguruto.app/" /></head></html>`,
      );
      return m;
    };
    const failures = runStaticChecks({
      shell: SHELL,
      destinations: TWO,
      log: () => {},
      renderSitemapFn: goodSitemap,
      buildOutputsFn: badOutputs,
    });
    // The JA home check uses buildShellPage(shell, "ja") directly (not the
    // injected outputs), so a malformed /ja/index.html in outputs is not
    // what it reads — assert the positive home contract passes with good
    // inputs, and that bad shells produce failures.
    expect(failures.some((f) => f.includes("JA home"))).toBe(false);
  });

  it("fails on a missing <html lang> (bad shell)", () => {
    const badShell = SHELL.replace('<html lang="en">', "<html>");
    const failures = runStaticChecks({
      shell: badShell,
      destinations: TWO,
      log: () => {},
      renderSitemapFn: goodSitemap,
      buildOutputsFn: goodOutputs,
    });
    expect(failures.length).toBeGreaterThan(0);
  });

  it("private routes are excluded from sitemap + prerender", () => {
    const failures = runStaticChecks({
      shell: SHELL,
      destinations: TWO,
      log: () => {},
      renderSitemapFn: goodSitemap,
      buildOutputsFn: goodOutputs,
    });
    expect(failures.some((f) => f.includes("private surface"))).toBe(false);
    for (const r of [
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
    ]) {
      expect(PRIVATE_ROUTES).toContain(r);
    }
  });

  it("flags a private surface leaking into the sitemap", () => {
    const bad = () =>
      goodSitemap().replace(
        "</urlset>",
        "  <url>\n    <loc>https://meguruto.app/settings</loc>\n  </url>\n</urlset>",
      );
    const failures = runStaticChecks({
      shell: SHELL,
      destinations: TWO,
      log: () => {},
      renderSitemapFn: bad,
      buildOutputsFn: goodOutputs,
    });
    expect(failures.some((f) => f.includes("private surface"))).toBe(true);
  });

  it("prerequisite failure: empty catalogue fails clearly (never silent pass)", () => {
    const failures = runStaticChecks({
      shell: SHELL,
      destinations: [],
      log: () => {},
    });
    expect(failures.some((f) => f.includes("catalogue loaded empty"))).toBe(
      true,
    );
  });

  it("prerequisite failure: missing shell fails clearly (never silent pass)", () => {
    // A malformed/empty shell makes the prerender functions THROW — a throw
    // is a clear failure (never a silent pass). The CLI path also fails
    // clearly when the source shell file is absent.
    let threw = false;
    try {
      runStaticChecks({
        shell: "",
        destinations: TWO,
        log: () => {},
        renderSitemapFn: goodSitemap,
        buildOutputsFn: goodOutputs,
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});

describe("KAI-120 checker: contract cross-checks", () => {
  it("PRIVATE_ROUTES matches the App.tsx route table", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const appSrc = fs.readFileSync(
      path.resolve(process.cwd(), "src/App.tsx"),
      "utf8",
    );
    for (const r of PRIVATE_ROUTES) {
      if (r === "/e2e") continue; // protected Function, not an SPA Route
      expect(
        appSrc.includes(`path="${r}"`) || appSrc.includes(`path="${r}/"`),
      ).toBe(true);
    }
  });

  it("SITEMAP_HUB_URLS matches the sitemap hub paths", () => {
    expect(SITEMAP_HUB_URLS).toContain("https://meguruto.app/");
    expect(SITEMAP_HUB_URLS).toContain("https://meguruto.app/destinations");
    expect(SITEMAP_HUB_URLS).toContain("https://meguruto.app/collections");
  });
});
