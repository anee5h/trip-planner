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
import { getWikimediaResponsiveImage } from "@/shared/utils/wikimediaImages";
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

  it("emits the canonical Wikimedia responsive hero contract in EN and JA HTML", () => {
    const heroImage =
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ae/Kiyomizu-dera%2C_Kyoto.jpg/1280px-Kiyomizu-dera%2C_Kyoto.jpg";
    const attrs = getWikimediaResponsiveImage(heroImage);
    const en = injectHead(SHELL, makeDestination({ heroImage }), "en").html;
    const ja = injectHead(SHELL, makeDestination({ heroImage }), "ja").html;

    expect(attrs.srcSet).toBeDefined();
    expect(attrs.sources).toHaveLength(2);
    for (const source of attrs.sources ?? []) {
      expect(en).toContain(
        `<source media="${source.media}" srcset="${source.srcSet}" sizes="${source.sizes}" />`,
      );
      expect(ja).toContain(
        `<source media="${source.media}" srcset="${source.srcSet}" sizes="${source.sizes}" />`,
      );
    }
    expect(en).toContain(
      `<img src="${attrs.src}" srcset="${attrs.srcSet}" sizes="${attrs.sizes}"`,
    );
    expect(ja).toContain(
      `<img src="${attrs.src}" srcset="${attrs.srcSet}" sizes="${attrs.sizes}"`,
    );

    const picture = (html: string) =>
      html
        .match(/<picture[\s\S]*?<\/picture>/)?.[0]
        .replace(/alt="[^"]*"/, 'alt=""');
    expect(picture(en)).toBe(picture(ja));
  });
  it("keeps the app mount + module script so SPA hydration still works", () => {
    const { html } = injectHead(SHELL, makeDestination({}));
    expect(html).toContain(`<div id="root">`);
    expect(html).toContain(
      `<script type="module" src="/src/main.tsx"></script>`,
    );
    expect(html).toContain(`<meta charset="UTF-8" />`);
  });

  it("preserves shell head assets (favicon, theme-color, preconnect, multi-line Bunny Fonts) while swapping metadata", () => {
    const shellWithHeadAssets = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=2" />
    <meta name="theme-color" content="#243C58" />
    <link rel="preconnect" href="https://fonts.bunny.net" />
    <link
      href="https://fonts.bunny.net/css?family=geist:400,500,600,700,800,900&display=swap"
      rel="stylesheet"
    />
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
    // The multi-line Bunny Fonts stylesheet must survive VERBATIM — the
    // element-aware filter must not destroy legitimate multi-line <link>.
    expect(html).toContain("https://fonts.bunny.net/css?family=");
    expect(html).toContain('rel="stylesheet"');
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

describe("KAI-68/KAI-97 prerender: sitemap", () => {
  it("lists hub surfaces + ALL canonical destinations, sorted and absolute", () => {
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
    // KAI-97: every canonical destination is indexable regardless of quality
    // status; private SPA surfaces never appear.
    expect(sitemap).toContain(
      `<loc>${SITE_URL}/destinations/beta-destination</loc>`,
    );
    expect(sitemap).toContain(
      `<loc>${SITE_URL}/destinations/verified-destination</loc>`,
    );
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

  it("emits the EN home shell (/index.html) with the complete hreflang set, and is idempotent when re-injected", () => {
    const destinations = [makeDestination({ id: "a-dest" })];
    const outputs = buildPrerenderOutputs(SHELL, destinations);
    const enHome = outputs.get("/index.html") ?? "";
    expect(enHome).toContain('<html lang="en"');
    expect(enHome).toContain(
      '<link rel="alternate" hreflang="en" href="https://meguruto.app/" />',
    );
    expect(enHome).toContain(
      '<link rel="alternate" hreflang="ja" href="https://meguruto.app/ja/" />',
    );
    expect(enHome).toContain(
      '<link rel="alternate" hreflang="x-default" href="https://meguruto.app/" />',
    );
    // Re-injecting into the already-generated EN home must not duplicate
    // hreflang/json-ld (swapShellMetadata removes the previous SEO
    // elements before writing the new ones).
    const reInjected = buildShellPage(enHome, "en");
    const count = (reInjected.match(/<link rel="alternate" hreflang=/g) ?? [])
      .length;
    expect(count).toBe(3);
    expect(
      (reInjected.match(/<script type="application\/ld\+json"/g) ?? []).length,
    ).toBe(1);
    // A multi-line <meta name="description"> (as in the real source shell)
    // must not leak into a destination page — exactly one description.
    const multiLineHome = enHome.replace(
      '<meta name="description" content="Homepage description" />',
      '<meta\n    name="description"\n    content="Homepage description"\n    />',
    );
    const destFromMulti = buildShellPage(multiLineHome, "en");
    expect(
      (destFromMulti.match(/name="description"[^>]*>/g) ?? []).length,
    ).toBe(1);
  });

  it("prerenders every canonical destination regardless of quality status, plus sitemap, manifest and the JA shell", () => {
    const outputs = buildPrerenderOutputs(SHELL, [
      makeDestination({ id: "pub", status: "published" }),
      makeDestination({ id: "beta", status: "beta" }),
      makeDestination({ id: "verified", status: "verified" }),
    ]);
    // KAI-97: status is a quality signal, not an indexability gate.
    expect(outputs.has("/destinations/pub/index.html")).toBe(true);
    expect(outputs.has("/destinations/beta/index.html")).toBe(true);
    expect(outputs.has("/destinations/verified/index.html")).toBe(true);
    expect(outputs.has("/ja/index.html")).toBe(true);
    expect(outputs.has("/ja/destinations/pub/index.html")).toBe(true);
    expect(outputs.has("/ja/destinations/beta/index.html")).toBe(true);
    expect(outputs.has("/ja/destinations/verified/index.html")).toBe(true);
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
    // KAI-108: the complete en/ja/x-default set is present; the canonical
    // still pins the page's own locale.
    const { html } = injectHead(SHELL, makeDestination({}));
    expect(html).toContain(
      `<link rel="canonical" href="${SITE_URL}/destinations/test-destination" />`,
    );
    expect(html).toContain(
      `<link rel="alternate" hreflang="ja" href="${SITE_URL}/ja/destinations/test-destination" />`,
    );
    expect(html).toContain(
      `<link rel="alternate" hreflang="en" href="${SITE_URL}/destinations/test-destination" />`,
    );
    expect(html).toContain(
      `<link rel="alternate" hreflang="x-default" href="${SITE_URL}/destinations/test-destination" />`,
    );
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
      `<title>メグルト（Meguruto）｜日帰り・週末旅行をもっと簡単に</title>`,
    );
    expect(html).toContain(
      `<meta property="og:title" content="メグルト（Meguruto）— 次の週末、日本のどこへ行く？" />`,
    );
    expect(html).toContain(
      `<meta property="og:description" content="メグルト（Meguruto）は、時間・予算・天気・好みに合わせて、あなたにぴったりの日帰り・週末旅行先を見つける日本旅行プランナー。" />`,
    );
    expect(html).toContain(
      `<meta property="og:image" content="${SITE_URL}/og/og-ja.png" />`,
    );
    expect(html).toContain(
      `<meta name="twitter:title" content="メグルト（Meguruto）— 次の週末、日本のどこへ行く？" />`,
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

  it("renders the site-level WebSite entity on the JA home shell (KAI-114)", () => {
    const html = buildShellPage(SHELL, "ja");
    expect(html).toContain(`<script type="application/ld+json">`);
    expect(html).toContain(`"@type":"WebSite"`);
    expect(html).toContain(`"name":"Meguruto"`);
    expect(html).toContain(`"alternateName":["メグルト","meguruto.app"]`);
  });

  it("renders the site-level WebSite entity on the EN home shell (KAI-114)", () => {
    const html = buildShellPage(SHELL, "en");
    expect(html).toContain(`"@type":"WebSite"`);
    expect(html).toContain(`"alternateName":["メグルト","meguruto.app"]`);
  });

  it("never duplicates the WebSite entity on destination pages (KAI-114)", () => {
    const { html } = injectHead(SHELL, makeDestination({}));
    expect(html).not.toContain(`"@type":"WebSite"`);
    expect(html).toContain(`"@type":"TouristDestination"`);
  });
});

describe("KAI-108 hreflang alternates", () => {
  it("homepage pair: both EN and JA emit the IDENTICAL complete set (en/ja/x-default)", () => {
    const en = buildShellPage(SHELL, "en");
    const ja = buildShellPage(SHELL, "ja");
    const expectedSet = [
      `<link rel="alternate" hreflang="en" href="${SITE_URL}/" />`,
      `<link rel="alternate" hreflang="ja" href="${SITE_URL}/ja/" />`,
      `<link rel="alternate" hreflang="x-default" href="${SITE_URL}/" />`,
    ];
    for (const tag of expectedSet) {
      expect(en).toContain(tag);
      expect(ja).toContain(tag);
    }
    // Identical three-link set on both pages (same count, same tags).
    const countTags = (html: string) =>
      (html.match(/rel="alternate" hreflang=/g) ?? []).length;
    expect(countTags(en)).toBe(3);
    expect(countTags(ja)).toBe(3);
  });

  it("destination pair: identical complete set in raw prerendered HTML, canonical stays locale-specific", () => {
    const en = injectHead(
      SHELL,
      makeDestination({ id: "kamakura" }),
      "en",
    ).html;
    const ja = injectHead(
      SHELL,
      makeDestination({ id: "kamakura" }),
      "ja",
    ).html;
    const enUrl = `${SITE_URL}/destinations/kamakura`;
    const jaUrl = `${SITE_URL}/ja/destinations/kamakura`;
    const expectedSet = [
      `<link rel="alternate" hreflang="en" href="${enUrl}" />`,
      `<link rel="alternate" hreflang="ja" href="${jaUrl}" />`,
      `<link rel="alternate" hreflang="x-default" href="${enUrl}" />`,
    ];
    for (const tag of expectedSet) {
      expect(en).toContain(tag);
      expect(ja).toContain(tag);
    }
    const countTags = (html: string) =>
      (html.match(/rel="alternate" hreflang=/g) ?? []).length;
    expect(countTags(en)).toBe(3);
    expect(countTags(ja)).toBe(3);
    // alternates are present BEFORE hydration (raw HTML, not JS)
    expect(en.indexOf("hreflang")).toBeLessThan(
      en.indexOf('<script type="module"'),
    );
    expect(ja.indexOf("hreflang")).toBeLessThan(
      ja.indexOf('<script type="module"'),
    );
    // canonical stays self-locale (unchanged by KAI-108)
    expect(en).toContain(`<link rel="canonical" href="${enUrl}" />`);
    expect(ja).toContain(`<link rel="canonical" href="${jaUrl}" />`);
  });

  it("non-published canonical status still emits the same valid pair (status is not an hreflang gate)", () => {
    // KAI-97: status is a quality signal, not an indexability/hreflang gate.
    for (const status of ["beta", "verified", "planned"] as const) {
      const en = injectHead(
        SHELL,
        makeDestination({ id: "kamakura", status }),
        "en",
      ).html;
      const ja = injectHead(
        SHELL,
        makeDestination({ id: "kamakura", status }),
        "ja",
      ).html;
      const enUrl = `${SITE_URL}/destinations/kamakura`;
      const jaUrl = `${SITE_URL}/ja/destinations/kamakura`;
      expect(en).toContain(`hreflang="en" href="${enUrl}"`);
      expect(en).toContain(`hreflang="ja" href="${jaUrl}"`);
      expect(en).toContain(`hreflang="x-default" href="${enUrl}"`);
      expect(ja).toContain(`hreflang="en" href="${enUrl}"`);
      expect(ja).toContain(`hreflang="ja" href="${jaUrl}"`);
      expect(ja).toContain(`hreflang="x-default" href="${enUrl}"`);
    }
  });

  it("unknown/non-canonical destinations create no prerender output", () => {
    // The generator only prerenders catalogue destinations; an id outside
    // the catalogue produces no HTML output and therefore no hreflang.
    const outputs = buildPrerenderOutputs(SHELL, [
      makeDestination({ id: "real", status: "published" }),
    ]);
    for (const [path, html] of outputs) {
      expect(html).not.toContain("/destinations/ghost");
      if (path.includes("ghost")) {
        throw new Error("unknown destination must not be prerendered");
      }
    }
    expect([...outputs.keys()]).not.toContain("/destinations/ghost/index.html");
    expect([...outputs.keys()]).not.toContain(
      "/ja/destinations/ghost/index.html",
    );
  });

  it("private/noindex surfaces never receive destination hreflang", () => {
    // Private SPA surfaces (account/settings/bucket-list) are not
    // prerendered at all; the public prerender output never references
    // them. Verify the full output set stays confined to the canonical
    // catalogue + public hubs.
    const outputs = buildPrerenderOutputs(SHELL, [
      makeDestination({ id: "aaa", status: "published" }),
      makeDestination({ id: "bbb", status: "beta" }),
    ]);
    const paths = [...outputs.keys()];
    for (const p of paths) {
      expect(p).not.toMatch(
        /^\/(account|settings|bucket-list|my-trips|passport|collections\/[^/]+)/,
      );
    }
    // KAI-97 cardinality: every canonical destination (published or not)
    // gets an EN + JA prerender.
    for (const id of ["aaa", "bbb"]) {
      expect(paths).toContain(`/destinations/${id}/index.html`);
      expect(paths).toContain(`/ja/destinations/${id}/index.html`);
    }
  });

  it("sitemap stays KAI-97 (no hreflang extension, no xhtml namespace)", () => {
    const sitemap = renderSitemap([
      makeDestination({ id: "aaa", status: "published" }),
    ]);
    expect(sitemap).not.toContain("xhtml");
    expect(sitemap).not.toContain("hreflang");
    expect(sitemap).toContain(
      `<url>\n    <loc>${SITE_URL}/destinations/aaa</loc>\n  </url>`,
    );
  });
});
