/**
 * KAI-68 build-time prerender core.
 *
 * Pure functions (no fs, no network, no timestamps) that turn the built SPA
 * shell plus the destination catalogue into:
 *   - one prerendered HTML page per PUBLISHED destination
 *   - sitemap.xml (published destinations + public hub surfaces only)
 *   - the public-destination manifest consumed by the Pages Function
 *
 * Determinism contract: same inputs -> byte-identical outputs. The generator
 * CLI (scripts/generate-seo-outputs.ts) and its --check mode enforce this by
 * regenerating in memory and diffing against dist/.
 *
 * Locale contract (KAI-68): there is exactly one URL per destination and no
 * URL-based locale strategy, so no hreflang/alternate links are emitted.
 * Prerendered HTML carries canonical English content; the SPA localizes to
 * Japanese after hydration via the existing LocaleContext/i18next path
 * (KAI-93 fallback behavior preserved). All copy comes exclusively from the
 * canonical catalogue fields — nothing is invented for SEO.
 */

import {
  getCanonicalPlaces,
  getLocalizedPlace,
  toCanonicalPlace,
} from "../shared/services/place/PlaceCatalog";
import type { Destination } from "../shared/types/destination";
import {
  MAX_META_DESCRIPTION_LENGTH,
  SITE_NAME,
  SITE_URL,
  TITLE_SUFFIX,
  truncateDescription,
} from "./meta";

/** Destinations eligible for prerendering + sitemap inclusion. */
export const PRERENDER_STATUS = "published" as const;

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

/** Absolute URL for a destination page. No trailing slash — the app links to
 *  `/destinations/{id}` everywhere; the canonical tag pins this form and
 *  both URL variants serve the same prerendered HTML. */
export function destinationUrl(id: string): string {
  return `${SITE_URL}/destinations/${id}`;
}

/** Truncated EN description used in meta description / OG description. */
export function destinationMetaDescription(destination: Destination): string {
  return truncateDescription(
    getLocalizedPlace(destination, "en").description,
    MAX_META_DESCRIPTION_LENGTH,
  );
}

function absoluteImage(image: string): string {
  return /^https?:\/\//i.test(image) ? image : `${SITE_URL}${image}`;
}

/** schema.org TouristDestination JSON-LD. Ratings/reviews/prices are never
 *  emitted: the visible page has no rating UI (KAI-89 hides the overall
 *  score), so no aggregateRating is invented. */
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
 *  controls, no scripts. */
function prerenderedBody(destination: Destination): string {
  const canonical = toCanonicalPlace(destination);
  const en = getLocalizedPlace(canonical, "en");
  const highlights = (en.highlights ?? []).slice(0, 6);
  return [
    `<div class="bg-slate-50 dark:bg-background min-h-screen pb-20">`,
    `<div class="relative min-h-[380px] sm:min-h-[400px] md:min-h-[440px] w-full overflow-hidden flex flex-col justify-between">`,
    `<img src="${escapeHtml(absoluteImage(canonical.heroImage))}" alt="${escapeHtml(en.name)}" decoding="async" class="absolute inset-0 w-full h-full object-cover" />`,
    `<div class="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/75 to-transparent/20"></div>`,
    `<div class="relative w-full container mx-auto px-4 pt-16 sm:pt-20 pb-6 md:pb-8 text-white z-10 mt-auto">`,
    `<h1 class="text-2xl sm:text-4xl md:text-6xl font-extrabold tracking-tight mb-2 flex flex-wrap items-baseline gap-2.5 [text-shadow:_0_2px_8px_rgba(0,0,0,0.85)] drop-shadow-md"><span>${escapeHtml(en.name)}</span></h1>`,
    `<div class="flex flex-wrap items-center gap-3 text-sm text-slate-200/85 mb-3">`,
    `<div class="flex items-center font-medium">${escapeHtml(
      destination.prefecture ? `${destination.prefecture}, Japan` : "",
    )}</div>`,
    `</div>`,
    `</div>`,
    `</div>`,
    `<main class="container mx-auto px-4 py-6">`,
    `<p class="text-slate-700 dark:text-slate-200 text-base sm:text-lg leading-relaxed mb-8">${escapeHtml(en.description)}</p>`,
    ...(highlights.length > 0
      ? [
          `<h2 class="text-xl font-bold mb-4">Highlights</h2>`,
          `<ul class="space-y-3 mb-8">`,
          ...highlights.map(
            (h) =>
              `<li class="flex items-start gap-2.5"><span class="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500"></span><span class="text-slate-700 dark:text-slate-200">${escapeHtml(h)}</span></li>`,
          ),
          `</ul>`,
        ]
      : []),
    `</main>`,
    `</div>`,
  ].join("\n");
}

interface PrerenderHead {
  title: string;
  description: string;
  canonical: string;
  ogUrl: string;
  ogImage: string;
  jsonLd: string;
}

function buildHead(destination: Destination): PrerenderHead {
  const en = getLocalizedPlace(destination, "en");
  const description = destinationMetaDescription(destination);
  const canonical = destinationUrl(destination.id);
  return {
    title: `${en.name}${TITLE_SUFFIX}`,
    description,
    canonical,
    ogUrl: canonical,
    ogImage: absoluteImage(toCanonicalPlace(destination).heroImage),
    jsonLd: structuredData(destination),
  };
}

/**
 * Replaces the SPA shell's <head> metadata with destination-specific tags.
 * Preserves every other shell head element (favicon, theme-color, font
 * links, Vite module scripts) and swaps only title, description, canonical,
 * OG and Twitter tags. Scripts survive so the prerendered page still
 * hydrates into the existing SPA.
 */
export function injectHead(
  shell: string,
  destination: Destination,
): { html: string; head: PrerenderHead } {
  const head = buildHead(destination);
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
  const headTags = [
    `<title>${escapeHtml(head.title)}</title>`,
    `<meta name="description" content="${escapeHtml(head.description)}" />`,
    `<link rel="canonical" href="${head.canonical}" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:title" content="${escapeHtml(head.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(head.description)}" />`,
    `<meta property="og:url" content="${head.ogUrl}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:image" content="${head.ogImage}" />`,
    `<meta property="og:image:alt" content="${escapeHtml(head.title)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(head.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(head.description)}" />`,
    `<meta name="twitter:image" content="${head.ogImage}" />`,
    `<script type="application/ld+json">${head.jsonLd}</script>`,
  ];
  const html = shell
    .replace(
      /<head>[\s\S]*?<\/head>/,
      `<head>\n    ${[...headTags, preserved].join("\n    ")}\n  </head>`,
    )
    .replace(
      /<div id="root"><\/div>/,
      `<div id="root">\n${prerenderedBody(destination)}\n</div>`,
    );
  return { html, head };
}

/** Renders sitemap.xml for the public/indexable URL set. Deterministic:
 *  fixed order (hub paths, then destinations sorted by id), no lastmod. */
export function renderSitemap(destinations: Destination[]): string {
  const published = destinations
    .filter((d) => d.status === PRERENDER_STATUS)
    .map((d) => d.id)
    .sort();
  const urls = [
    ...SITEMAP_HUB_PATHS,
    ...published.map((id) => `/destinations/${id}`),
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
 *  prerendered (published), shell-served (beta/verified) and unknown. */
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
  const published = destinations
    .filter((d) => d.status === PRERENDER_STATUS)
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const destination of published) {
    const { html } = injectHead(shell, destination);
    outputs.set(`/destinations/${destination.id}/index.html`, html);
  }
  outputs.set("/sitemap.xml", renderSitemap(destinations));
  outputs.set(
    "/data/kai68-public-destinations.json",
    renderPublicManifest(destinations),
  );
  return outputs;
}

/** Canonical catalogue records — the single source for prerender. */
export function loadPrerenderDestinations(): Destination[] {
  return getCanonicalPlaces() as Destination[];
}
