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

/** The app shell defaults (index.html) — restored when leaving a
 *  destination so stale localized metadata never outlives the route. */
export const DEFAULT_PAGE_TITLE = "Meguruto: めぐると、見つかる。";
export const DEFAULT_PAGE_DESCRIPTION =
  "Find Japan day trips and weekend getaways that fit your time, budget, weather, and travel preferences.";

/** Google truncates meta descriptions around this length. */
export const MAX_META_DESCRIPTION_LENGTH = 155;

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
    "default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.bunny.net; font-src 'self' https://fonts.bunny.net; img-src 'self' data: blob: https:; connect-src 'self' https://nkrfuowqzuvzgqnudchx.supabase.co wss://nkrfuowqzuvzgqnudchx.supabase.co https://api.open-meteo.com https://nominatim.openstreetmap.org https://cloudflareinsights.com https://en.wikipedia.org https://ja.wikipedia.org; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'; upgrade-insecure-requests",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
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
