/**
 * KAI-111: real 404s for unknown non-destination routes.
 *
 * Destination URLs are handled by the more-specific destination Function.
 * This catch-all owns only the exact client-side route contract. Real
 * static families (assets, data, og, sitemap, robots, favicons, icons) are
 * excluded from Function invocation via _routes.json and are served
 * directly by the static layer, so the catch-all never needs to relay
 * assets and unknown asset-like URLs fall through to a real 404.
 */
import { SECURITY_HEADERS } from "../src/seo/meta.js";

const EXACT_SPA_ROUTES = new Set([
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
]);

const PRIVATE_SPA_ROUTES = new Set([
  "/settings",
  "/my-trips",
  "/bucket-list",
  "/passport",
  "/profile",
  "/favorites",
  "/visited-map",
  "/qa",
  "/editorial",
  "/compare",
]);

function normalizeTrailingSlash(pathname) {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function getLocalePath(pathname) {
  const normalized = normalizeTrailingSlash(pathname);
  if (normalized === "/ja") return { locale: "ja", path: "/" };
  if (normalized.startsWith("/ja/")) {
    return { locale: "ja", path: normalized.slice(3) || "/" };
  }
  return { locale: "en", path: normalized };
}

function isKnownSpaPath(pathname) {
  const { path } = getLocalePath(pathname);
  return EXACT_SPA_ROUTES.has(path) || /^\/collections\/[^/]+$/.test(path);
}

function isPrivateSpaPath(pathname) {
  const { path } = getLocalePath(pathname);
  return PRIVATE_SPA_ROUTES.has(path);
}

function responseHeaders(assetHeaders, robots) {
  const headers = new Headers(assetHeaders);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value);
  }
  headers.set("Content-Type", "text/html; charset=utf-8");
  if (robots) headers.set("X-Robots-Tag", robots);
  return headers;
}

function notFoundBody(locale) {
  const isJa = locale === "ja";
  return `<!doctype html>
<html lang="${isJa ? "ja" : "en"}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, follow" />
    <title>${isJa ? "ページが見つかりません" : "Page not found"} — Meguruto</title>
  </head>
  <body>
    <main>
      <h1>404 — ${isJa ? "ページが見つかりません" : "Page not found"}</h1>
      <p>${isJa ? "お探しのページは見つかりませんでした。" : "The page you are looking for could not be found."}</p>
      <p><a href="${isJa ? "/ja/" : "/"}">${isJa ? "Meguruto ホーム" : "Meguruto home"}</a></p>
    </main>
  </body>
</html>
`;
}

export const onRequest = async (context) => {
  const url = new URL(context.request.url);
  const { pathname } = url;

  // /ja is a canonical directory entry, not an SPA route itself.
  if (pathname === "/ja") {
    return Response.redirect(new URL("/ja/", url), 308);
  }

  const { locale } = getLocalePath(pathname);
  if (isKnownSpaPath(pathname)) {
    const shellPath = locale === "ja" ? "/ja/index.html" : "/index.html";
    const shell = await context.env.ASSETS.fetch(
      new URL(shellPath, url.origin),
    );
    return new Response(shell.body, {
      status: 200,
      headers: responseHeaders(
        shell.headers,
        isPrivateSpaPath(pathname) ? "noindex" : null,
      ),
    });
  }

  return new Response(notFoundBody(locale), {
    status: 404,
    headers: responseHeaders(undefined, "noindex, follow"),
  });
};

export { EXACT_SPA_ROUTES, PRIVATE_SPA_ROUTES, isKnownSpaPath };
