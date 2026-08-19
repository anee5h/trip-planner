/**
 * KAI-68 build-time prerender core.
 *
 * Pure functions (no fs, no network, no timestamps) that turn the built SPA
 * shell plus the destination catalogue into:
 *   - one prerendered HTML page per canonical destination, in BOTH locales
 *     (/destinations/<id> English, /ja/destinations/<id> Japanese). KAI-97:
 *     the full canonical catalogue is public and indexable — `status` is a
 *     content-quality signal, not an indexability gate.
 *   - the localized Japanese home shell (/ja/index.html) whose OG/Twitter
 *     metadata carries Japanese share-preview copy
 *   - sitemap.xml (all canonical destinations + public hub surfaces)
 *   - the public-destination manifest consumed by the Pages Function
 *
 * Determinism contract: same inputs -> byte-identical outputs. The generator
 * CLI (scripts/generate-seo-outputs.ts) and its --check mode enforce this by
 * regenerating in memory and diffing against dist/.
 *
 * Locale contract: share previews are crawler-fetched, so locale cannot live
 * only in client state. English is canonical at /destinations/<id>; Japanese
 * is served at /ja/destinations/<id> with Japanese OG/Twitter metadata and a
 * Japanese prerendered body. Sitemap lists the canonical (English) URLs
 * only; the /ja mirror is not listed there (no hreflang alternates — full
 * SEO metadata redesign is out of scope). All copy comes exclusively
 * from the canonical catalogue fields — nothing is invented for SEO.
 */

import {
  getLocalizedPlace,
  toCanonicalPlace,
} from "../shared/services/place/PlaceCatalog";
import destinationsIndex from "../shared/data/destinations-index.json";
import type { Destination } from "../shared/types/destination";
import {
  HOME_TITLE,
  MAX_META_DESCRIPTION_LENGTH,
  OG_IMAGE,
  OG_LOCALE,
  SITE_NAME,
  SITE_URL,
  SHARE_COPY,
  TITLE_SUFFIX,
  localePathPrefix,
  truncateDescription,
  websiteJsonLd,
  type PageLocale,
} from "./meta";

/** Routes that are always sitemap candidates (public discovery surfaces). */
const SITEMAP_HUB_PATHS = ["/", "/destinations", "/collections"] as const;

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeXml(text: string): string {
  return escapeHtml(text);
}

/** Absolute URL for a destination page in a locale. No trailing slash — the
 *  app links to /destinations/{id} everywhere; the canonical tag pins this
 *  form and both URL variants serve the same prerendered HTML. */
export function destinationUrl(id: string, locale: PageLocale = "en"): string {
  return `${SITE_URL}${localePathPrefix(locale)}/destinations/${id}`;
}

/** Truncated localized description used in meta description / OG
 *  description. Falls back to canonical English when the locale has no
 *  catalogue copy (KAI-93 fallback preserved). */
export function destinationMetaDescription(
  destination: Destination,
  locale: PageLocale = "en",
): string {
  return truncateDescription(
    getLocalizedPlace(destination, locale).description,
    MAX_META_DESCRIPTION_LENGTH,
  );
}

function absoluteImage(image: string): string {
  return /^https?:\/\//i.test(image) ? image : `${SITE_URL}${image}`;
}

/** schema.org TouristDestination JSON-LD. Ratings/reviews/prices are never
 *  emitted: the visible page has no rating UI (KAI-89 hides the overall
 *  score), so no aggregateRating is invented. Canonical English copy is used
 *  even on /ja pages — structured data is out of the share-preview scope. */
function structuredData(destination: Destination): string {
  const canonical = toCanonicalPlace(destination);
  const en = getLocalizedPlace(canonical, "en");
  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "TouristDestination",
    name: en.name,
    description: en.description,
    url: destinationUrl(destination.id),
    image: absoluteImage(canonical.heroImage),
  };
  if (
    canonical.coordinates &&
    Number.isFinite(canonical.coordinates.lat) &&
    Number.isFinite(canonical.coordinates.lng)
  ) {
    ld.geo = {
      "@type": "GeoCoordinates",
      latitude: canonical.coordinates.lat,
      longitude: canonical.coordinates.lng,
    };
  }
  // JSON.stringify output is safe inside <script type="application/ld+json">;
  // escape `<` (e.g. in copy) so it can never terminate the script tag.
  return JSON.stringify(ld).replaceAll("<", "\\u003c");
}

/** Prerendered body content inside #root. Mirrors the DestinationDetails
 *  hero/name/description/highlights block with the app's own classes so the
 *  no-JS page looks like the product. Plain content only — no interactive
 *  controls, no scripts. Localized when the locale has catalogue copy,
 *  otherwise falls back to canonical English. */
function prerenderedBody(destination: Destination, locale: PageLocale): string {
  const canonical = toCanonicalPlace(destination);
  const localized = getLocalizedPlace(canonical, locale);
  const highlights = (localized.highlights ?? []).slice(0, 6);
  return [
    `<div class="bg-slate-50 dark:bg-background min-h-screen pb-20">`,
    `<div class="relative min-h-[380px] sm:min-h-[400px] md:min-h-[440px] w-full overflow-hidden flex flex-col justify-between">`,
    `<img src="${escapeHtml(absoluteImage(canonical.heroImage))}" alt="${escapeHtml(localized.name)}" decoding="async" class="absolute inset-0 w-full h-full object-cover" />`,
    `<div class="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/75 to-transparent/20"></div>`,
    `<div class="relative w-full container mx-auto px-4 pt-16 sm:pt-20 pb-6 md:pb-8 text-white z-10 mt-auto">`,
    `<h1 class="text-2xl sm:text-4xl md:text-6xl font-extrabold tracking-tight mb-2 flex flex-wrap items-baseline gap-2.5 [text-shadow:_0_2px_8px_rgba(0,0,0,0.85)] drop-shadow-md"><span>${escapeHtml(localized.name)}</span></h1>`,
    `<div class="flex flex-wrap items-center gap-3 text-sm text-slate-200/85 mb-3">`,
    `<div class="flex items-center font-medium">${escapeHtml(
      locale === "ja"
        ? destination.prefecture || ""
        : destination.prefecture
          ? `${destination.prefecture}, Japan`
          : "",
    )}</div>`,
    `</div>`,
    `</div>`,
    `</div>`,
    `<main class="container mx-auto px-4 py-6">`,
    `<p class="text-slate-700 dark:text-slate-200 text-base sm:text-lg leading-relaxed mb-8">${escapeHtml(localized.description)}</p>`,
    ...(highlights.length > 0
      ? [
          `<h2 class="text-xl font-bold mb-4">${locale === "ja" ? "見どころ" : "Highlights"}</h2>`,
          `<ul class="space-y-3 mb-8">`,
          ...highlights.map(
            (h) =>
              `<li class="flex items-start gap-2.5"><span class="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-700"></span><span class="text-slate-700 dark:text-slate-200">${escapeHtml(h)}</span></li>`,
          ),
          `</ul>`,
        ]
      : []),
    `</main>`,
    `</div>`,
  ].join("\n");
}

/** The crawler-visible metadata contract for one rendered page. */
export interface PageHead {
  /** document <title> (og:title for destination pages equals the title). */
  title: string;
  metaDescription: string;
  canonical: string;
  ogUrl: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  ogLocale: string;
  jsonLd?: string;
  /** Reciprocal EN/JA alternate-locale link tags (KAI-108). */
  alternates?: string[];
}

/** Alternate-locale link tags for an indexable EN/JA page pair (KAI-108).
 *  Every equivalent EN/JA page emits the SAME complete set — the EN
 *  alternate, the JA alternate, and x-default (the EN root — the canonical
 *  locale; the JA mirror is a localized copy, so the neutral default is
 *  English). The page's own locale is NOT emitted as an alternate — the
 *  canonical tag pins it (self-alternates are redundant with the
 *  canonical and add no crawler signal). The set is identical on both
 *  pages, so the pairing is reciprocal. */
export function hreflangTags(enUrl: string, jaUrl: string): string[] {
  return [
    `<link rel="alternate" hreflang="en" href="${enUrl}" />`,
    `<link rel="alternate" hreflang="ja" href="${jaUrl}" />`,
    `<link rel="alternate" hreflang="x-default" href="${enUrl}" />`,
  ];
}

/** The canonical locale-URL pair for a destination page (EN canonical at
 *  /destinations/<id>, JA mirror at /ja/destinations/<id>). */
export function destinationLocaleUrls(id: string): { en: string; ja: string } {
  return {
    en: destinationUrl(id, "en"),
    ja: destinationUrl(id, "ja"),
  };
}

/** The canonical locale-URL pair for the home page. */
export function homeLocaleUrls(): { en: string; ja: string } {
  return {
    en: `${SITE_URL}/`,
    ja: `${SITE_URL}/ja/`,
  };
}

function renderHeadTags(head: PageHead): string[] {
  return [
    `<title>${escapeHtml(head.title)}</title>`,
    `<meta name="description" content="${escapeHtml(head.metaDescription)}" />`,
    `<link rel="canonical" href="${head.canonical}" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:title" content="${escapeHtml(head.ogTitle)}" />`,
    `<meta property="og:description" content="${escapeHtml(head.ogDescription)}" />`,
    `<meta property="og:url" content="${head.ogUrl}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:locale" content="${head.ogLocale}" />`,
    `<meta property="og:image" content="${head.ogImage}" />`,
    `<meta property="og:image:alt" content="${escapeHtml(head.ogTitle)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(head.ogTitle)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(head.ogDescription)}" />`,
    `<meta name="twitter:image" content="${head.ogImage}" />`,
    ...(head.alternates ?? []),
    ...(head.jsonLd
      ? [`<script type="application/ld+json">${head.jsonLd}</script>`]
      : []),
  ];
}

/** Crawler-visible head for a destination page in the given locale. The
 *  share image is the hero photograph — it carries no localized text, so the
 *  same image serves both locales. Emits reciprocal hreflang alternates
 *  (KAI-108) for the destination's EN/JA pair — every canonical
 *  destination emits the same complete en/ja/x-default set on both
 *  locales (status is a quality signal, not an hreflang gate). */
export function destinationHead(
  destination: Destination,
  locale: PageLocale,
): PageHead {
  const localized = getLocalizedPlace(destination, locale);
  const description = destinationMetaDescription(destination, locale);
  const canonical = destinationUrl(destination.id, locale);
  const title = `${localized.name}${TITLE_SUFFIX}`;
  const pair = destinationLocaleUrls(destination.id);
  const alternates = hreflangTags(pair.en, pair.ja);
  return {
    title,
    metaDescription: description,
    canonical,
    ogUrl: canonical,
    ogTitle: title,
    ogDescription: description,
    ogImage: absoluteImage(toCanonicalPlace(destination).heroImage),
    ogLocale: OG_LOCALE[locale],
    jsonLd: structuredData(destination),
    alternates,
  };
}

/** Crawler-visible head for the home page in the given locale: the
 *  share-preview copy from the ticket, with the localized social card and
 *  the site-level WebSite structured-data entity (KAI-114 — the home
 *  shells carry the canonical site entity; destination pages never
 *  duplicate it). Emits reciprocal hreflang alternates (KAI-108). */
export function homeHead(locale: PageLocale): PageHead {
  const prefix = localePathPrefix(locale);
  const share = SHARE_COPY[locale];
  const canonical = `${SITE_URL}${prefix}/`;
  const pair = homeLocaleUrls();
  return {
    title: HOME_TITLE[locale],
    metaDescription: share.description,
    canonical,
    ogUrl: canonical,
    ogTitle: share.title,
    ogDescription: share.description,
    ogImage: OG_IMAGE[locale],
    ogLocale: OG_LOCALE[locale],
    jsonLd: websiteJsonLd(),
    alternates: hreflangTags(pair.en, pair.ja),
  };
}

/**
 * Replaces the SPA shell's <head> metadata with the given page's tags and
 * fixes <html lang>. Preserves every other shell head element (favicon,
 * theme-color, font links, Vite module scripts) and swaps only title,
 * description, canonical, OG and Twitter tags. Scripts survive so the
 * prerendered page still hydrates into the existing SPA.
 */
export function swapShellMetadata(
  shell: string,
  head: PageHead,
  lang: string,
  body?: string,
): string {
  const headMatch = shell.match(/<head>([\s\S]*?)<\/head>/);
  if (!headMatch) {
    throw new Error(`SPA shell has no <head>: ${shell.slice(0, 120)}`);
  }
  const preserved = headMatch[1]
    .split(/\n\s*/)
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      if (/<title>/i.test(trimmed)) return false;
      if (/<meta name="description"/i.test(trimmed)) return false;
      if (/<link rel="canonical"/i.test(trimmed)) return false;
      if (/<meta property="og:/i.test(trimmed)) return false;
      if (/<meta name="twitter:/i.test(trimmed)) return false;
      return true;
    })
    .join("\n    ");
  const headTags = [...renderHeadTags(head), preserved];
  const rootReplacement =
    body === undefined
      ? `<div id="root"></div>`
      : `<div id="root">\n${body}\n</div>`;
  return shell
    .replace(/<html lang="[^"]*"/, `<html lang="${lang}"`)
    .replace(
      /<head>[\s\S]*?<\/head>/,
      `<head>\n    ${headTags.join("\n    ")}\n  </head>`,
    )
    .replace(/<div id="root"><\/div>/, rootReplacement);
}

/**
 * Destination page from the SPA shell (KAI-68 entry point, kept for
 * compatibility with the generator and tests).
 */
export function injectHead(
  shell: string,
  destination: Destination,
  locale: PageLocale = "en",
): { html: string; head: PageHead } {
  const head = destinationHead(destination, locale);
  const html = swapShellMetadata(
    shell,
    head,
    locale,
    prerenderedBody(destination, locale),
  );
  return { html, head };
}

/**
 * Home page for a locale from the SPA shell. For English this is the built
 * shell itself (dist/index.html, already carries the EN metadata); for
 * Japanese it produces /ja/index.html with Japanese share-preview metadata
 * and a Japanese <html lang>.
 */
export function buildShellPage(shell: string, locale: PageLocale): string {
  return swapShellMetadata(shell, homeHead(locale), locale);
}

/** Renders sitemap.xml for the public/indexable URL set. Deterministic:
 *  fixed order (hub paths, then destinations sorted by id), no lastmod.
 *  KAI-97: the ENTIRE canonical catalogue is indexable (status is a quality
 *  signal, not an indexability gate). Canonical English URLs only — the
 *  /ja mirror is not separately indexed. Hreflang lives in the prerendered
 *  HTML heads (KAI-108), not in the sitemap. */
export function renderSitemap(destinations: Destination[]): string {
  const ids = destinations.map((d) => d.id).sort();
  const urls = [
    ...SITEMAP_HUB_PATHS,
    ...ids.map((id) => `/destinations/${id}`),
  ];
  const body = urls
    .map(
      (path) =>
        `  <url>\n    <loc>${escapeXml(SITE_URL + path)}</loc>\n  </url>`,
    )
    .join("\n");
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    body,
    `</urlset>`,
    ``,
  ].join("\n");
}

/** Public-destination manifest for the Pages Function: every destination that
 *  is served publicly (all catalogue records — the app has no private
 *  destinations), with its status so the function can distinguish
 *  prerendered (all canonical destinations — status is a quality signal,
 *  not an indexability gate) and unknown. */
export function renderPublicManifest(destinations: Destination[]): string {
  const entries = destinations
    .map((d) => ({ id: d.id, status: d.status }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return `${JSON.stringify(entries)}\n`;
}

/** The full prerendered set, keyed by output path (as written under dist/). */
export function buildPrerenderOutputs(
  shell: string,
  destinations: Destination[],
): Map<string, string> {
  const outputs = new Map<string, string>();
  const sorted = destinations.sort((a, b) => a.id.localeCompare(b.id));
  outputs.set("/ja/index.html", buildShellPage(shell, "ja"));
  for (const destination of sorted) {
    const { html } = injectHead(shell, destination, "en");
    outputs.set(`/destinations/${destination.id}/index.html`, html);
    const jaHtml = injectHead(shell, destination, "ja").html;
    outputs.set(`/ja/destinations/${destination.id}/index.html`, jaHtml);
  }
  outputs.set("/sitemap.xml", renderSitemap(destinations));
  outputs.set(
    "/data/kai68-public-destinations.json",
    renderPublicManifest(destinations),
  );
  return outputs;
}

/** Canonical catalogue records — the single source for prerender.
 *  Build-time only: the prerender generator runs in Node (tsx), where the
 *  full index must be synchronously available. KAI-121 keeps the lazy
 *  browser path via loadDestinationsIndex(); this build path imports the
 *  full index directly so SEO generation stays deterministic (prerender.ts
 *  is never bundled into the browser — it is build-script only). */
export function loadPrerenderDestinations(): Destination[] {
  return destinationsIndex as Destination[];
}
