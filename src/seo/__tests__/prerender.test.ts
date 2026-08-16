import { describe, expect, it } from "vitest";
import {
  buildPrerenderOutputs,
  buildShellPage,
  destinationMetaDescription,
  destinationUrl,
  injectHead,
  renderPublicManifest,
  renderSitemap,
} from "@/seo/prerender";
import { SITE_URL, TITLE_SUFFIX } from "@/seo/meta";
import type { Destination } from "@/shared/types/destination";

/** Minimal-but-valid destination fixture (canonical fields only). */
function makeDestination(overrides: Partial<Destination>): Destination {
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
  } as Destination;
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

describe("KAI-68 prerender: destination HTML", () => {
  it("injects destination-specific title, description, canonical, OG and Twitter tags", () => {
    const { html } = injectHead(SHELL, makeDestination({}));
    expect(html).toContain(`<title>Test Destination${TITLE_SUFFIX}</title>`);
    expect(html).toContain(
      `<meta name="description" content="A canonical English description for the test destination." />`,
    );
    expect(html).toContain(
      `<link rel="canonical" href="${SITE_URL}/destinations/test-destination" />`,
    );
    expect(html).toContain(
      `<meta property="og:url" content="${SITE_URL}/destinations/test-destination" />`,
    );
    expect(html).toContain(
      `<meta property="og:title" content="Test Destination${TITLE_SUFFIX}" />`,
    );
    expect(html).toContain(
      `<meta property="og:image" content="${SITE_URL}/images/hero.jpg" />`,
    );
    expect(html).toContain(
      `<meta property="og:image:alt" content="Test Destination${TITLE_SUFFIX}" />`,
    );
    expect(html).toContain(
      `<meta name="twitter:card" content="summary_large_image" />`,
    );
    expect(html).toContain(
      `<meta name="twitter:title" content="Test Destination${TITLE_SUFFIX}" />`,
    );
    expect(html).toContain(
      `<meta name="twitter:image" content="${SITE_URL}/images/hero.jpg" />`,
    );
    expect(html).toContain(
      `<meta property="og:site_name" content="Meguruto" />`,
    );
    // Homepage canonical/OG must not leak into destination pages.
    expect(html).not.toContain(
      `<link rel="canonical" href="https://meguruto.app/" />`,
    );
    expect(html).not.toContain(
      `<meta property="og:url" content="https://meguruto.app/" />`,
    );
    expect(html).not.toContain(
      `<meta name="description" content="Homepage description" />`,
    );
  });

  it("includes destination-specific body content in the prerendered HTML", () => {
    const { html } = injectHead(SHELL, makeDestination({}));
    expect(html).toContain(`<div id="root">`);
    expect(html).toContain(`<span>Test Destination</span></h1>`);
    expect(html).toContain(
      "A canonical English description for the test destination.",
    );
    expect(html).toContain("First highlight");
    expect(html).toContain("Second highlight");
    expect(html).toContain(`alt="Test Destination"`);
    expect(html).toContain(`${SITE_URL}/images/hero.jpg`);
  });

  it("keeps the app mount + module script so SPA hydration still works", () => {
    const { html } = injectHead(SHELL, makeDestination({}));
    expect(html).toContain(`<div id="root">`);
    expect(html).toContain(
      `<script type="module" src="/src/main.tsx"></script>`,
    );
    expect(html).toContain(`<meta charset="UTF-8" />`);
  });

  it("preserves shell head assets (favicon, theme-color, preconnect) while swapping metadata", () => {
    const shellWithHeadAssets = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=2" />
    <meta name="theme-color" content="#243C58" />
    <link rel="preconnect" href="https://fonts.bunny.net" />
    <title>Meguruto: めぐると、見つかる。</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`;
    const { html } = injectHead(shellWithHeadAssets, makeDestination({}));
    // Vite hoists the module script into <head>; it must survive.
    expect(html).toContain(
      `<script type="module" src="/src/main.tsx"></script>`,
    );
    expect(html).toContain(`href="/favicon.svg?v=2"`);
    expect(html).toContain(`name="theme-color" content="#243C58"`);
    expect(html).toContain(`href="https://fonts.bunny.net"`);
    expect(html).not.toContain(`めぐると、見つかる。`);
  });

  it("emits TouristDestination JSON-LD with geo and no invented ratings", () => {
    const { html } = injectHead(
      SHELL,
      makeDestination({ coordinates: { lat: 35.6812, lng: 139.7671 } }),
    );
    const jsonLd = html.match(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
    )?.[1];
    expect(jsonLd).toBeDefined();
    const parsed = JSON.parse(jsonLd!);
    expect(parsed["@type"]).toBe("TouristDestination");
    expect(parsed.name).toBe("Test Destination");
    expect(parsed.description).toContain("canonical English description");
    expect(parsed.url).toBe(`${SITE_URL}/destinations/test-destination`);
    expect(parsed.image).toBe(`${SITE_URL}/images/hero.jpg`);
    expect(parsed.geo).toEqual({
      "@type": "GeoCoordinates",
      latitude: 35.6812,
      longitude: 139.7671,
    });
    // KAI-89: overall score is hidden on all surfaces — never emitted as
    // schema rating data.
    expect(parsed.aggregateRating).toBeUndefined();
    expect(parsed.review).toBeUndefined();
    expect(parsed.rating).toBeUndefined();
    expect(JSON.stringify(html)).not.toContain("aggregateRating");
  });

  it("omits geo when coordinates are absent", () => {
    const { html } = injectHead(SHELL, makeDestination({}));
    const jsonLd = html.match(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
    )?.[1];
    const parsed = JSON.parse(jsonLd!);
    expect(parsed.geo).toBeUndefined();
  });

  it("escapes HTML in name/description/highlights", () => {
    const { html } = injectHead(
      SHELL,
      makeDestination({
        name: 'A&B <Place> "Quoted"',
        description: 'Description with <script>alert(1)</script> & "quotes"',
      }),
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("A&amp;B &lt;Place&gt; &quot;Quoted&quot;");
  });

  it("uses canonical EN copy and never invents SEO copy", () => {
    const { html } = injectHead(SHELL, makeDestination({}));
    // Only known canonical fields appear: no keyword-stuffing, no fake
    // "best day trip" phrasing.
    expect(html).not.toMatch(/best day trip|top 10|must-visit|#1/i);
  });
});

describe("KAI-68 prerender: meta description", () => {
  it("truncates long canonical descriptions at a word boundary with an ellipsis", () => {
    const long = "A very long canonical description. ".repeat(10);
    const meta = destinationMetaDescription(
      makeDestination({ description: long }),
    );
    expect(meta.length).toBeLessThanOrEqual(155 + 1); // +1 for the ellipsis char
    expect(meta.endsWith("…")).toBe(true);
    // Truncation never invents content: the output is always a prefix of the
    // canonical description.
    expect(long.startsWith(meta.slice(0, -1))).toBe(true);
  });

  it("keeps short descriptions intact", () => {
    expect(destinationMetaDescription(makeDestination({}))).toBe(
      "A canonical English description for the test destination.",
    );
  });
});

describe("KAI-68 prerender: sitemap", () => {
  it("lists hub surfaces + published destinations only, sorted and absolute", () => {
    const sitemap = renderSitemap([
      makeDestination({ id: "zzz-destination", status: "published" }),
      makeDestination({ id: "aaa-destination", status: "published" }),
      makeDestination({ id: "beta-destination", status: "beta" }),
      makeDestination({ id: "verified-destination", status: "verified" }),
    ]);
    expect(sitemap).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(sitemap).toContain(`<loc>${SITE_URL}/</loc>`);
    expect(sitemap).toContain(`<loc>${SITE_URL}/destinations</loc>`);
    expect(sitemap).toContain(`<loc>${SITE_URL}/collections</loc>`);
    expect(sitemap).toContain(
      `<loc>${SITE_URL}/destinations/aaa-destination</loc>`,
    );
    expect(sitemap).toContain(
      `<loc>${SITE_URL}/destinations/zzz-destination</loc>`,
    );
    // Non-published and private paths never appear.
    expect(sitemap).not.toContain("beta-destination");
    expect(sitemap).not.toContain("verified-destination");
    expect(sitemap).not.toContain("/settings");
    expect(sitemap).not.toContain("/my-trips");
    expect(sitemap).not.toContain("/bucket-list");
    expect(sitemap).not.toContain("/passport");
    expect(sitemap).not.toContain("/qa");
    expect(sitemap).not.toContain("/editorial");
    expect(sitemap).not.toContain("/compare");
    expect(sitemap).not.toContain("/terms");
    expect(sitemap).not.toContain("/privacy");
    expect(sitemap).not.toContain("/help");
    // Deterministic order: aaa before zzz.
    expect(sitemap.indexOf("aaa-destination")).toBeLessThan(
      sitemap.indexOf("zzz-destination"),
    );
  });

  it("escapes XML special characters in destination ids", () => {
    const sitemap = renderSitemap([
      makeDestination({ id: "weird&<id>", status: "published" }),
    ]);
    expect(sitemap).toContain("weird&amp;&lt;id&gt;");
  });
});

describe("KAI-68 prerender: manifest", () => {
  it("includes every destination id with its status, sorted", () => {
    const manifest = renderPublicManifest([
      makeDestination({ id: "zzz", status: "published" }),
      makeDestination({ id: "aaa", status: "beta" }),
    ]);
    const parsed = JSON.parse(manifest) as { id: string; status: string }[];
    expect(parsed).toEqual([
      { id: "aaa", status: "beta" },
      { id: "zzz", status: "published" },
    ]);
  });
});

describe("KAI-68 prerender: full output set", () => {
  it("is deterministic across generations", () => {
    const destinations = [
      makeDestination({ id: "b-dest", status: "published" }),
      makeDestination({ id: "a-dest", status: "published" }),
      makeDestination({ id: "c-beta", status: "beta" }),
    ];
    const first = buildPrerenderOutputs(SHELL, destinations);
    const second = buildPrerenderOutputs(SHELL, destinations);
    expect(second.size).toBe(first.size);
    for (const [path, content] of first) {
      expect(second.get(path)).toBe(content);
    }
  });

  it("prerenders only published destinations and always emits sitemap, manifest and the JA shell", () => {
    const outputs = buildPrerenderOutputs(SHELL, [
      makeDestination({ id: "pub", status: "published" }),
      makeDestination({ id: "beta", status: "beta" }),
      makeDestination({ id: "verified", status: "verified" }),
    ]);
    expect(outputs.has("/destinations/pub/index.html")).toBe(true);
    expect(outputs.has("/destinations/beta/index.html")).toBe(false);
    expect(outputs.has("/destinations/verified/index.html")).toBe(false);
    expect(outputs.has("/ja/index.html")).toBe(true);
    expect(outputs.has("/ja/destinations/pub/index.html")).toBe(true);
    expect(outputs.has("/ja/destinations/beta/index.html")).toBe(false);
    expect(outputs.has("/sitemap.xml")).toBe(true);
    expect(outputs.has("/data/kai68-public-destinations.json")).toBe(true);
  });
});

describe("KAI-68 prerender: URL strategy", () => {
  it("uses a locale-distinct canonical URL per locale", () => {
    expect(destinationUrl("abashiri-city")).toBe(
      `${SITE_URL}/destinations/abashiri-city`,
    );
    expect(destinationUrl("abashiri-city", "ja")).toBe(
      `${SITE_URL}/ja/destinations/abashiri-city`,
    );
    // No hreflang alternates: full multilingual SEO is out of scope, only
    // the locale-correct share-preview metadata is emitted.
    const { html } = injectHead(SHELL, makeDestination({}));
    expect(html).not.toContain("hreflang");
  });

  it("localizes head, canonical, lang and body for the JA version", () => {
    const { html, head } = injectHead(SHELL, makeDestination({}), "ja");
    expect(html).toContain(`<html lang="ja">`);
    expect(html).toContain(`<title>テスト目的地${TITLE_SUFFIX}</title>`);
    expect(html).toContain(
      `<link rel="canonical" href="${SITE_URL}/ja/destinations/test-destination" />`,
    );
    expect(html).toContain(
      `<meta property="og:title" content="テスト目的地${TITLE_SUFFIX}" />`,
    );
    expect(html).toContain(`<meta property="og:locale" content="ja_JP" />`);
    expect(html).toContain(
      `<meta name="twitter:title" content="テスト目的地${TITLE_SUFFIX}" />`,
    );
    expect(head.canonical).toBe(`${SITE_URL}/ja/destinations/test-destination`);
    // Prerendered body copy is localized too (name/description).
    expect(html).toContain(`<span>テスト目的地</span></h1>`);
  });

  it("keeps the EN head on the canonical URL", () => {
    const { html } = injectHead(SHELL, makeDestination({}));
    expect(html).toContain(`<html lang="en">`);
    expect(html).toContain(`<meta property="og:locale" content="en_US" />`);
    expect(html).not.toContain(`<meta property="og:locale" content="ja_JP" />`);
  });
});

describe("KAI-68 prerender: localized home shell", () => {
  it("builds the JA home page with Japanese share-preview metadata", () => {
    const html = buildShellPage(SHELL, "ja");
    expect(html).toContain('<html lang="ja">');
    expect(html).toContain(
      `<meta property="og:title" content="Meguruto — 次の週末、日本のどこへ行く？" />`,
    );
    expect(html).toContain(
      `<meta property="og:description" content="時間・予算・天気・好みに合わせて、あなたにぴったりの日帰り・週末旅行先を見つけよう。" />`,
    );
    expect(html).toContain(
      `<meta property="og:image" content="${SITE_URL}/og/og-ja.png" />`,
    );
    expect(html).toContain(
      `<meta name="twitter:title" content="Meguruto — 次の週末、日本のどこへ行く？" />`,
    );
    expect(html).toContain(
      `<meta name="twitter:image" content="${SITE_URL}/og/og-ja.png" />`,
    );
    expect(html).toContain(`<link rel="canonical" href="${SITE_URL}/ja/" />`);
    expect(html).toContain(`<meta property="og:locale" content="ja_JP" />`);
    // The empty shell mount survives for SPA hydration.
    expect(html).toContain(`<div id="root"></div>`);
  });

  it("builds the EN home page with English share-preview metadata", () => {
    const html = buildShellPage(SHELL, "en");
    expect(html).toContain('<html lang="en">');
    expect(html).toContain(
      `<meta property="og:title" content="Meguruto — Find Your Next Trip in Japan" />`,
    );
    expect(html).toContain(
      `<meta property="og:image" content="${SITE_URL}/og/og-en.png" />`,
    );
    expect(html).toContain(`<link rel="canonical" href="${SITE_URL}/" />`);
    expect(html).toContain(`<meta property="og:locale" content="en_US" />`);
  });
});
