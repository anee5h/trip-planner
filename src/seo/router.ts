/**
 * KAI-68 request router for public destination URLs.
 *
 * Runs inside the Cloudflare Pages Function at /destinations/:id
 * (functions/destinations/[id].js adapter). Pure logic, unit-tested with an
 * injected fetchAsset so the function behavior is verifiable without
 * deploying.
 *
 * Routing contract:
 *   - id in manifest with status "published" -> prerendered HTML
 *     (dist/destinations/<id>/index.html). If the asset is missing the
 *     function falls back to the SPA shell rather than 404ing a valid
 *     destination.
 *   - id in manifest with any other status (beta/verified) -> SPA shell 200.
 *     These are public destinations, just not prerendered/sitemapped yet.
 *   - unknown id -> real 404 with X-Robots-Tag: noindex, so removed or
 *     invalid destination URLs are never indexable soft-200s.
 *
 * The manifest is generated at build time from the catalogue
 * (dist/data/kai68-public-destinations.json) — the exact same records the
 * app serves, so the function and the SPA can never disagree about what is
 * public.
 */

import type { Destination } from "../shared/types/destination";

export type DestinationManifestEntry = Pick<Destination, "id" | "status">;

export type AssetFetcher = (path: string) => Promise<Response | null>;

export interface DestinationRequestContext {
  id: string;
  manifest: DestinationManifestEntry[];
  fetchAsset: AssetFetcher;
}

const PRERENDERED_STATUS = "published" as const;

const NOT_FOUND_BODY = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex" />
    <title>Destination Not Found | Meguruto</title>
  </head>
  <body>
    <h1>Destination Not Found</h1>
    <p>The destination you are looking for does not exist or is no longer available.</p>
  </body>
</html>
`;

/** noindex directive for non-published destinations and unknown ids.
 *  `follow` keeps links crawlable — these are valid public app pages, just
 *  not part of the indexable/prerendered SEO set. */
const NOINDEX_FOLLOW = "noindex, follow";

export interface DestinationRouteResult {
  status: number;
  body?: string;
  assetPath?: string;
  headers?: Record<string, string>;
}

/**
 * Pure decision core. Returns the response plan; the adapter executes it.
 * Never throws for unknown ids.
 */
export async function routeDestinationRequest(
  ctx: DestinationRequestContext,
): Promise<DestinationRouteResult> {
  const entry = ctx.manifest.find((e) => e.id === ctx.id);
  if (!entry) {
    return {
      status: 404,
      body: NOT_FOUND_BODY,
      headers: { "X-Robots-Tag": "noindex, follow" },
    };
  }
  if (entry.status === PRERENDERED_STATUS) {
    const assetPath = `/destinations/${ctx.id}/index.html`;
    const asset = await ctx.fetchAsset(assetPath);
    if (asset?.ok) {
      return { status: 200, assetPath, headers: {} };
    }
    // Prerendered page missing (e.g. stale function vs fresh catalogue):
    // fall back to the SPA shell so valid destinations never 404.
    return { status: 200, assetPath: "/index.html", headers: {} };
  }
  // beta/verified: valid public app destinations that are not part of the
  // published/prerendered SEO set. User-accessible (SPA hydrates normally)
  // but explicitly excluded from search indexes.
  return {
    status: 200,
    assetPath: "/index.html",
    headers: { "X-Robots-Tag": NOINDEX_FOLLOW },
  };
}

/** Validates a destination id path segment (matches the catalogue slug set:
 *  lowercase ascii letters, digits, dashes). */
export function isValidDestinationId(id: string): boolean {
  return /^[a-z0-9-]{1,128}$/.test(id);
}
