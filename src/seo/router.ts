/**
 * KAI-68 request router for public destination URLs.
 *
 * Runs inside the Cloudflare Pages Function at /destinations/:id
 * (functions/destinations/[id].js adapter). Pure logic, unit-tested with an
 * injected fetchAsset so the function behavior is verifiable without
 * deploying.
 *
 * Routing contract:
 *   - id in manifest (ANY quality status) -> prerendered HTML
 *     (dist/destinations/<id>/index.html). KAI-97: `status` is a
 *     content-quality signal, not an indexability gate — every canonical
 *     destination is prerendered, sitemapped and indexable. If the asset
 *     is missing, the function fails closed with a non-indexable 503 rather
 *     than serving a generic shell as an indexable soft-200.
 *   - unknown id -> real 404 with X-Robots-Tag: noindex, so removed or
 *     invalid destination URLs are never indexable soft-200s. Error bodies
 *     use the locale of the request.
 *
 * The manifest is generated at build time from the catalogue
 * (dist/data/kai68-public-destinations.json) — the exact same records the
 * app serves, so the function and the SPA can never disagree about what is
 * public.
 */

import type { Destination } from "../shared/types/destination";
import { localePathPrefix, type PageLocale } from "./meta";

export type DestinationManifestEntry = Pick<Destination, "id" | "status">;

export type AssetFetcher = (path: string) => Promise<Response | null>;

export interface DestinationRequestContext {
  id: string;
  manifest: DestinationManifestEntry[];
  fetchAsset: AssetFetcher;
  /** Locale of the request URL: "en" for /destinations/:id, "ja" for
   *  /ja/destinations/:id. Each locale resolves its own prerendered page
   *  and shell so share-preview crawlers see localized metadata. */
  locale?: PageLocale;
}

const ERROR_COPY = {
  en: {
    notFoundTitle: "Destination Not Found | Meguruto",
    notFoundHeading: "Destination Not Found",
    notFoundMessage:
      "The destination you are looking for does not exist or is no longer available.",
    unavailableTitle: "Destination Temporarily Unavailable | Meguruto",
    unavailableHeading: "Destination Temporarily Unavailable",
    unavailableMessage:
      "This destination is temporarily unavailable. Please try again later.",
  },
  ja: {
    notFoundTitle: "目的地が見つかりません | Meguruto",
    notFoundHeading: "目的地が見つかりません",
    notFoundMessage: "お探しの目的地は存在しないか、公開を終了しています。",
    unavailableTitle: "目的地を一時的に利用できません | Meguruto",
    unavailableHeading: "目的地を一時的に利用できません",
    unavailableMessage:
      "この目的地は一時的に利用できません。しばらくしてからもう一度お試しください。",
  },
} as const;

export function renderDestinationErrorBody(
  locale: PageLocale,
  kind: "notFound" | "unavailable",
): string {
  const copy = ERROR_COPY[locale];
  const title =
    kind === "notFound" ? copy.notFoundTitle : copy.unavailableTitle;
  const heading =
    kind === "notFound" ? copy.notFoundHeading : copy.unavailableHeading;
  const message =
    kind === "notFound" ? copy.notFoundMessage : copy.unavailableMessage;
  const robots = kind === "notFound" ? "noindex" : "noindex, nofollow";
  return `<!doctype html>
<html lang="${locale}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="${robots}" />
    <title>${title}</title>
  </head>
  <body>
    <h1>${heading}</h1>
    <p>${message}</p>
  </body>
</html>
`;
}

export interface DestinationRouteResult {
  status: number;
  body?: string;
  assetPath?: string;
  assetResponse?: Response;
  headers?: Record<string, string>;
}

/**
 * Pure decision core. Returns the response plan; the adapter executes it.
 * Never throws for unknown ids.
 */
export async function routeDestinationRequest(
  ctx: DestinationRequestContext,
): Promise<DestinationRouteResult> {
  const locale = ctx.locale ?? "en";
  const prefix = localePathPrefix(locale);
  const entry = ctx.manifest.find((e) => e.id === ctx.id);
  if (!entry) {
    return {
      status: 404,
      body: renderDestinationErrorBody(locale, "notFound"),
      headers: { "X-Robots-Tag": "noindex, follow" },
    };
  }
  // KAI-97: every canonical destination in the manifest is public,
  // prerendered and indexable. `status` is a content-quality signal, not an
  // indexability gate — the full catalogue converges on the public set.
  const assetPath = `${prefix}/destinations/${ctx.id}/index.html`;
  const asset = await ctx.fetchAsset(assetPath);
  if (asset?.ok) {
    return { status: 200, assetPath, assetResponse: asset, headers: {} };
  }
  // Prerendered page missing (e.g. stale function vs fresh catalogue): fail
  // closed. Serving the locale's generic shell here would create an
  // indexable soft-200 with the wrong destination metadata.
  return {
    status: 503,
    body: renderDestinationErrorBody(locale, "unavailable"),
    headers: {
      "X-Robots-Tag": "noindex, nofollow",
      "Retry-After": "60",
    },
  };
}

/** Validates a destination id path segment (matches the catalogue slug set:
 *  lowercase ascii letters, digits, dashes). */
export function isValidDestinationId(id: string): boolean {
  return /^[a-z0-9-]{1,128}$/.test(id);
}
