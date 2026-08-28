/**
 * Shared SEO constants and DOM helpers (KAI-68).
 *
 * This module must stay free of catalogue-data imports so it can be pulled
 * into the client bundle (DestinationDetails) without dragging in
 * destinations-index.json, and into Node/tsx build scripts without touching
 * the DOM. Keep it pure.
 */

export const SITE_NAME = "Meguruto";
export const SITE_URL = "https://meguruto.app";

/** Title suffix used on every destination page. */
export const TITLE_SUFFIX = ` | ${SITE_NAME}`;

export type PageLocale = "en" | "ja";

/** Locale prefix used in crawler-visible share URLs ("" for English — the
 *  canonical locale — "/ja" for Japanese). */
export function localePathPrefix(locale: PageLocale): string {
  return locale === "ja" ? "/ja" : "";
}

/** The app shell defaults (index.html) — restored when leaving a
 *  destination so stale localized metadata never outlives the route. */
export const DEFAULT_PAGE_TITLE = "Meguruto: めぐると、見つかる。";
export const DEFAULT_PAGE_DESCRIPTION =
  "Discover day trips and weekend getaways that fit your time, budget, weather, and travel style.";

/** Home-page <title> per locale (KAI-114: the Japanese home declares the
 *  Katakana brand — メグルト — alongside the Latin brand so users who hear
 *  the product name and search in Katakana can find the site). */
export const HOME_TITLE: Record<PageLocale, string> = {
  en: DEFAULT_PAGE_TITLE,
  ja: "メグルト（Meguruto）｜日帰り・週末旅行をもっと簡単に",
};

/** Share-preview (OG/Twitter) copy per locale. This is what messaging apps
 *  render — it is intentionally broader than the day-trip positioning and
 *  is localized for the Japanese version. The Japanese copy carries the
 *  Katakana brand naturally (KAI-114). */
export const SHARE_COPY: Record<
  PageLocale,
  { title: string; description: string }
> = {
  en: {
    title: "Meguruto — Find Your Next Trip in Japan",
    description:
      "Discover day trips and weekend getaways that fit your time, budget, weather, and travel style.",
  },
  ja: {
    title: "メグルト（Meguruto）— 次の週末、日本のどこへ行く？",
    description:
      "メグルト（Meguruto）は、時間・予算・天気・好みに合わせて、あなたにぴったりの日帰り・週末旅行先を見つける日本旅行プランナー。",
  },
};

/** Social card images. They contain localized tagline text, so each locale
 *  must reference its own image. */
export const OG_IMAGE: Record<PageLocale, string> = {
  en: `${SITE_URL}/og/og-en.png`,
  ja: `${SITE_URL}/og/og-ja.png`,
};

/** og:locale values per locale. */
export const OG_LOCALE: Record<PageLocale, string> = {
  en: "en_US",
  ja: "ja_JP",
};

/** Google truncates meta descriptions around this length. */
export const MAX_META_DESCRIPTION_LENGTH = 155;

/**
 * The canonical site-level WebSite structured-data entity (KAI-114): the
 * Latin brand as `name` with the Japanese Katakana form and the bare
 * domain as `alternateName`, so search engines can associate the product
 * name in both scripts with meguruto.app. Emitted on the home shells only
 * (/ and /ja/) — never duplicated on destination pages, which carry their
 * own TouristDestination entities.
 */
export function websiteJsonLd(): string {
  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    alternateName: ["メグルト", "meguruto.app"],
    url: SITE_URL,
  };
  // Same escaping convention as the prerenderer: `<` can never terminate
  // the enclosing <script> tag.
  return JSON.stringify(ld).replaceAll("<", "\\u003c");
}

/**
 * Truncates canonical destination copy for <meta name="description">.
 * Word-boundary aware; appends an ellipsis when truncated. Never invents
 * content — it only ever shortens the canonical description.
 */
export function truncateDescription(
  description: string,
  maxLength: number = MAX_META_DESCRIPTION_LENGTH,
): string {
  const trimmed = description.trim();
  if (trimmed.length <= maxLength) return trimmed;
  const cut = trimmed.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

/**
 * Security headers mirroring public/_headers. Cloudflare Pages applies
 * _headers to static asset responses but NOT to Pages Function responses,
 * so the function adapter re-applies the same policy itself.
 */
export const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' https://static.cloudflareinsights.com https://www.googletagmanager.com; style-src 'self' 'unsafe-inline' https://fonts.bunny.net; font-src 'self' https://fonts.bunny.net; img-src 'self' data: blob: https:; connect-src 'self' https://nkrfuowqzuvzgqnudchx.supabase.co wss://nkrfuowqzuvzgqnudchx.supabase.co https://api.open-meteo.com https://nominatim.openstreetmap.org https://cloudflareinsights.com https://*.google-analytics.com https://analytics.google.com https://*.analytics.google.com https://www.googletagmanager.com https://en.wikipedia.org https://ja.wikipedia.org; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'; upgrade-insecure-requests",
  "Permissions-Policy":
    "camera=(), microphone=(), payment=(), usb=(), battery=(), magnetometer=(), gyroscope=(), accelerometer=(), ambient-light-sensor=(), autoplay=(), display-capture=(), fullscreen=(), picture-in-picture=(), screen-wake-lock=(), serial=(), sync-xhr=(), xr-spatial-tracking=(), geolocation=(self), clipboard-read=(self), clipboard-write=(self)",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "Cross-Origin-Resource-Policy": "same-site",
  "Cross-Origin-Opener-Policy": "same-origin",
};

/**
 * Client-side page-meta sync used after SPA hydration (KAI-68).
 * The prerendered HTML already carries the canonical EN metadata; this
 * updates title/description to the active locale once React mounts.
 * Guards for non-DOM environments (build scripts import this module).
 */
export function setPageMeta(title: string, description?: string): void {
  if (typeof document === "undefined") return;
  document.title = title;
  if (description === undefined) return;
  let meta = document.querySelector<HTMLMetaElement>(
    'meta[name="description"]',
  );
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "description";
    document.head.appendChild(meta);
  }
  meta.content = truncateDescription(description);
}

/**
 * Restores the shell defaults after the destination route unmounts.
 * DestinationDetails owns document.title/meta while it is mounted and must
 * hand them back when it leaves — navigating Home -> destination -> Home
 * must not leave the destination title/description active.
 */
export function restorePageMeta(): void {
  if (typeof document === "undefined") return;
  document.title = DEFAULT_PAGE_TITLE;
  const meta = document.querySelector<HTMLMetaElement>(
    'meta[name="description"]',
  );
  if (meta) meta.content = DEFAULT_PAGE_DESCRIPTION;
}
