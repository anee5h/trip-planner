/**
 * KAI-111: real 404s for unknown public routes.
 *
 * Replaces the `/* /index.html 200` catch-all in public/_redirects. Cloudflare
 * Pages serves static assets first and resolves more-specific file-based
 * functions (destinations/[id].js, the /ja mirror) before this catch-all, so
 * by the time this runs the path is NOT a static asset and NOT a canonical
 * destination. Known SPA route prefixes (EN + /ja) still get the app shell so
 * deep links, refreshes and client routing keep working; genuinely unknown
 * paths return a real HTTP 404 that is non-indexable and carries the security
 * headers (from public/_headers).
 */
const EN_SPA_PREFIXES = [
  "/",
  "/destinations",
  "/collections",
  "/compare",
  "/favorites",
  "/bucket-list",
  "/my-trips",
  "/passport",
  "/visited-map",
  "/profile",
  "/settings",
  "/help",
  "/qa",
  "/editorial",
  "/terms",
  "/privacy",
  "/cookies",
];

const JA_SPA_PREFIXES = EN_SPA_PREFIXES.filter((p) => p !== "/").map(
  (p) => `/ja${p}`,
);

function isKnownSpaPath(pathname) {
  const prefixes =
    pathname === "/ja" || pathname.startsWith("/ja/")
      ? JA_SPA_PREFIXES
      : EN_SPA_PREFIXES;
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

const NOT_FOUND_BODY = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, follow" />
    <title>Page not found — Meguruto</title>
    <style>
      body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; display: grid; place-items: center; min-height: 100vh; margin: 0; }
      main { text-align: center; padding: 2rem; }
      h1 { font-size: 2rem; margin-bottom: 0.5rem; }
      a { color: #38bdf8; }
    </style>
  </head>
  <body>
    <main>
      <h1>404 — Page not found</h1>
      <p>このページは見つかりませんでした。</p>
      <p><a href="/">Meguruto home</a></p>
    </main>
  </body>
</html>
`;

export const onRequest = async (context) => {
  const url = new URL(context.request.url);
  const { pathname } = url;

  // Serve static assets first (with _routes.json include ["/*"] every path
  // reaches the function layer; assets must be relayed from ASSETS). Asset
  // paths have a file extension — SPA routes never do. (Note: wrangler pages
  // dev's ASSETS serves the shell for any miss, so the extension gate keeps
  // unknown no-extension routes out of the asset path locally AND in prod.)
  if (/\.(?:[a-z0-9]+)$/i.test(pathname)) {
    const asset = await context.env.ASSETS.fetch(url);
    return new Response(asset.body, {
      status: asset.status,
      headers: asset.headers,
    });
  }

  if (isKnownSpaPath(pathname)) {
    const shellPath =
      pathname === "/ja" || pathname.startsWith("/ja/")
        ? "/ja/index.html"
        : "/index.html";
    const shell = await context.env.ASSETS.fetch(
      new URL(shellPath, url.origin),
    );
    // Mirror public/_headers noindex for private SPA surfaces (Pages applies
    // _headers to function responses in production; mirroring here also
    // keeps the local dev contract identical).
    const PRIVATE_PREFIXES = [
      "/settings",
      "/my-trips",
      "/bucket-list",
      "/passport",
      "/visited-map",
      "/profile",
    ];
    const isPrivate = PRIVATE_PREFIXES.some(
      (p) =>
        pathname === p ||
        pathname.startsWith(`${p}/`) ||
        pathname.startsWith(`/ja${p}`),
    );
    return new Response(shell.body, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        ...(isPrivate ? { "X-Robots-Tag": "noindex" } : {}),
      },
    });
  }

  return new Response(NOT_FOUND_BODY, {
    status: 404,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex, follow",
    },
  });
};
