import { describe, expect, it } from "vitest";
import {
  buildPrerenderOutputs,
  renderPublicManifest,
  renderSitemap,
} from "@/seo/prerender";
import { loadPrerenderDestinations } from "@/seo/prerender";
import { SITE_URL, TITLE_SUFFIX } from "@/seo/meta";
import type { Destination } from "@/shared/types/destination";

/**
 * KAI-68 generator integration tests against the REAL catalogue.
 * These pin the actual public URL counts so a change in eligibility
 * (status flips, record removals) is noticed in CI rather than silently
 * shrinking the sitemap.
 */

const SHELL = `<!doctype html>
<html lang="en">
  <head><title>Meguruto</title></head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

describe("KAI-68 generator: real catalogue", () => {
  const destinations = loadPrerenderDestinations();

  it("loads the committed catalogue", () => {
    expect(destinations.length).toBeGreaterThan(500);
  });

  it("prerenders exactly the canonical destination set, nothing else", () => {
    const outputs = buildPrerenderOutputs(SHELL, destinations);
    const prerenderedIds = [...outputs.keys()]
      .filter(
        (p) => p.startsWith("/destinations/") && p.endsWith("/index.html"),
      )
      .map((p) => p.slice("/destinations/".length, -"/index.html".length));
    // KAI-97: every canonical destination is prerendered (both locales).
    expect(prerenderedIds.length).toBe(destinations.length);
    for (const id of prerenderedIds) {
      const dest = destinations.find((d) => d.id === id);
      expect(dest).toBeDefined();
    }
    // No non-destination extras under /destinations/.
    expect(prerenderedIds.length).toBe(new Set(prerenderedIds).size);
  });

  it("every published destination has canonical content for title/meta", () => {
    const outputs = buildPrerenderOutputs(SHELL, destinations);
    for (const dest of destinations.filter((d) => d.status === "published")) {
      const html = outputs.get(`/destinations/${dest.id}/index.html`);
      expect(html, dest.id).toBeDefined();
      expect(html, dest.id).toContain(`<title>`);
      expect(html, dest.id).toContain(`<meta name="description" content="`);
      expect(html, dest.id).toContain(`<link rel="canonical"`);
      expect(html, dest.id).toContain(`<meta property="og:image"`);
      expect(html, dest.id).toContain(`<script type="application/ld+json">`);
      // No internal score/rating fields may leak into prerendered HTML.
      expect(html, dest.id).not.toContain("overallScore");
      expect(html, dest.id).not.toContain("aggregateRating");
    }
  });

  it("sitemap lists every canonical destination with absolute URLs", () => {
    const sitemap = renderSitemap(destinations);
    const urlCount = (sitemap.match(/<loc>/g) ?? []).length;
    // 3 hub paths + one per canonical destination (KAI-97).
    expect(urlCount).toBe(3 + destinations.length);
    for (const dest of destinations) {
      expect(sitemap).toContain(
        `<loc>${SITE_URL}/destinations/${dest.id}</loc>`,
      );
    }
    // Deterministic: destinations sorted by id.
    const ids = [...sitemap.matchAll(/destinations\/([a-z0-9-]+)<\/loc>/g)].map(
      (m) => m[1],
    );
    expect(ids).toEqual([...ids].sort());
  });

  it("manifest covers all public destinations and is sorted", () => {
    const manifest = JSON.parse(renderPublicManifest(destinations)) as {
      id: string;
      status: string;
    }[];
    expect(manifest.length).toBe(destinations.length);
    expect(manifest.map((e) => e.id)).toEqual(
      destinations.map((d) => d.id).sort(),
    );
  });

  it("real generated HTML for a flagship destination contains its content", () => {
    const outputs = buildPrerenderOutputs(SHELL, destinations);
    const tokyo = destinations.find((d) => d.id === "tokyo-station-chiyoda");
    expect(tokyo).toBeDefined();
    const html = outputs.get("/destinations/tokyo-station-chiyoda/index.html")!;
    expect(html).toContain("Tokyo Station");
    expect(html).toContain(tokyo!.description);
    expect(html).toContain(
      `<link rel="canonical" href="${SITE_URL}/destinations/tokyo-station-chiyoda" />`,
    );
  });

  it("generates the localized /ja pages with Japanese share metadata", () => {
    const outputs = buildPrerenderOutputs(SHELL, destinations);
    const tokyo = destinations.find((d) => d.id === "tokyo-station-chiyoda")!;
    const jaHtml = outputs.get(
      "/ja/destinations/tokyo-station-chiyoda/index.html",
    )!;
    expect(jaHtml).toBeDefined();
    expect(jaHtml).toContain('<html lang="ja">');
    expect(jaHtml).toContain(
      `<link rel="canonical" href="${SITE_URL}/ja/destinations/tokyo-station-chiyoda" />`,
    );
    expect(jaHtml).toContain(`<meta property="og:locale" content="ja_JP" />`);
    expect(jaHtml).toContain(
      `<meta name="twitter:title" content="東京駅（丸の内赤れんが駅舎）${TITLE_SUFFIX}" />`,
    );
    // The JA home shell carries the localized social card image.
    const jaHome = outputs.get("/ja/index.html")!;
    expect(jaHome).toContain(
      `<meta property="og:image" content="${SITE_URL}/og/og-ja.png" />`,
    );
    // EN destination page must never carry the JA card.
    const enHtml = outputs.get(
      "/destinations/tokyo-station-chiyoda/index.html",
    )!;
    expect(enHtml).not.toContain("/og/og-ja.png");
    expect(jaHtml).not.toContain("/og/og-en.png");
    expect(tokyo).toBeDefined();
  });
});

describe("KAI-97 generator: eligibility rules", () => {
  it("prerenders every canonical destination regardless of quality status", () => {
    const dest = (id: string, status: string) =>
      ({
        id,
        name: id,
        description: "desc",
        heroImage: "/x.jpg",
        prefecture: "Tokyo",
        region: "Kanto",
        categories: [],
        status,
        collections: [],
      }) as unknown as Destination;
    const outputs = buildPrerenderOutputs(SHELL, [
      dest("beta-x", "beta"),
      dest("verified-y", "verified"),
    ]);
    // KAI-97: status is a quality signal, not an indexability gate — both
    // destinations get EN + JA prerendered pages (2 × 2 + JA home + sitemap
    // + manifest).
    expect(outputs.size).toBe(7);
    expect(outputs.has("/destinations/beta-x/index.html")).toBe(true);
    expect(outputs.has("/ja/destinations/beta-x/index.html")).toBe(true);
    expect(outputs.has("/destinations/verified-y/index.html")).toBe(true);
    expect(outputs.has("/ja/destinations/verified-y/index.html")).toBe(true);
    expect(outputs.has("/sitemap.xml")).toBe(true);
    expect(outputs.has("/data/kai68-public-destinations.json")).toBe(true);
    expect(outputs.has("/ja/index.html")).toBe(true);
  });
});
