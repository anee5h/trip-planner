/**
 * KAI-126: server-verifiable protection for the engineering surfaces.
 *
 * /e2e — the Allure dashboard (served from private R2 storage)
 * /qa  — the separate internal QA surface
 *
 * Both are gated by a Cloudflare Access JWT (the Cf-Access-Jwt-Assertion
 * header Cloudflare Access injects after its own authentication). This is
 * edge/server-verifiable on EVERY request: an unauthenticated request
 * never reaches the protected HTML/assets.
 *
 * Configuration (Cloudflare Pages env vars — read from context.env, the
 * Pages-idiomatic binding; globalThis is NOT populated for Functions):
 *   CF_ACCESS_AUD        — the Access application AUD tag
 *   CF_ACCESS_CERTS_URL  — https://<team>.cloudflareaccess.com/cdn-cgi/access/certs
 *   E2E_REPORT_BUCKET    — R2 bucket binding name (default "E2E_REPORT")
 *     The R2 bucket stores the generated Allure dashboard privately; it is
 *     reachable ONLY through this authenticated Function (never via a
 *     public bucket URL).
 *
 * Security properties:
 * - No client-side-only protection. The guard runs in the Pages Function.
 * - Token verification uses `jose` (the library Cloudflare's own docs use):
 *   signature (RS256/ES256 via the team's JWKS), issuer, audience, expiry.
 * - Every protected response carries X-Robots-Tag: noindex, nofollow.
 * - HTML responses additionally carry <meta name="robots" ...>.
 * - The routes are excluded from sitemap/hreflang/canonical generation,
 *   normal navigation, and the PWA service-worker shell cache.
 */
import { jwtVerify, createRemoteJWKSet } from "jose";
import { SECURITY_HEADERS } from "../../src/seo/meta.js";

const json = (payload, status) =>
  Response.json(payload, {
    status,
    headers: { ...SECURITY_HEADERS, "X-Robots-Tag": "noindex, nofollow" },
  });

// Deliberately scoped CSP for the /e2e dashboard surface ONLY. Allure's
// generated HTML uses an inline bootstrap (self-contained) — this allows
// 'unsafe-inline' for scripts/styles on this private surface while keeping
// the main app's strict CSP intact elsewhere. Google Tag Manager / external
// analytics origins are NOT allowed (ALLURE_NO_ANALYTICS=1 at generation
// removes the GTM snippet entirely; this CSP is defense in depth).
const E2E_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const robotsHtml = (html) =>
  html.replace(
    "<head>",
    '<head><meta name="robots" content="noindex,nofollow">',
  );

const withRobotsHeaders = (headers) => {
  const h = new Headers(headers);
  h.set("X-Robots-Tag", "noindex, nofollow");
  return h;
};

/**
 * Validates the Cloudflare Access JWT. jose handles signature verification
 * (against the team's remote JWKS, cached), algorithm enforcement, exp, and
 * issuer; we additionally pin the application audience.
 */
async function isAuthorized(request, env) {
  const aud = env.CF_ACCESS_AUD;
  const certsUrl = env.CF_ACCESS_CERTS_URL;
  if (!aud || !certsUrl) return false; // fail closed if not configured
  const assertion = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!assertion) return false;
  try {
    const jwks = createRemoteJWKSet(new URL(certsUrl));
    const { payload } = await jwtVerify(assertion, jwks, {
      issuer: certsUrl.replace(/\/cdn-cgi\/access\/certs$/, ""),
      audience: aud,
    });
    // Explicit exp is already enforced by jose; assert it exists.
    if (!payload.exp) return false;
    return true;
  } catch {
    return false;
  }
}

export async function onRequest(context) {
  const { request, next, env } = context;
  const authorized = await isAuthorized(request, env);
  if (!authorized) {
    return json({ error: "unauthorized" }, 401);
  }

  const url = new URL(request.url);

  // /e2e serves the Allure dashboard from PRIVATE R2 storage — never from
  // the public repo. The bucket must have no public access.
  if (url.pathname.startsWith("/e2e")) {
    // Redirect /e2e -> /e2e/ so Allure's relative asset paths (assets/...)
    // resolve under /e2e/ instead of the site root (where /assets/* is a
    // static-family route that would serve the SPA shell as text/html).
    if (url.pathname === "/e2e") {
      return Response.redirect(new URL("/e2e/", url), 308);
    }
    const bucketName = env.E2E_REPORT_BUCKET ?? "E2E_REPORT";
    const bucket = env[bucketName];
    if (!bucket) return json({ error: "report store not configured" }, 503);
    const key = url.pathname.replace(/^\/e2e\/?/, "") || "index.html";
    const obj = await bucket.get(key);
    if (!obj) return json({ error: "not found" }, 404);
    // Successful R2-backed responses carry the SAME security headers as
    // denied responses (X-Robots-Tag + the app's SECURITY_HEADERS set),
    // with the /e2e-scoped CSP (Allure inline bootstrap, no analytics).
    const headers = new Headers(SECURITY_HEADERS);
    headers.set("Content-Security-Policy", E2E_CSP);
    const contentType =
      obj.httpMetadata?.contentType ?? "application/octet-stream";
    headers.set("Content-Type", contentType);
    headers.set("X-Robots-Tag", "noindex, nofollow");
    if (contentType.includes("text/html")) {
      const html = new TextDecoder().decode(await obj.arrayBuffer());
      return new Response(robotsHtml(html), { status: 200, headers });
    }
    return new Response(obj.body, { status: 200, headers });
  }

  // /qa: serve the EXISTING QA SPA shell through ASSETS after auth
  // validation (next() does not fall back to the SPA handler for /qa).
  // The shell is the public app shell — no private data, but it must carry
  // noindex headers + robots meta like every protected surface.
  if (url.pathname.startsWith("/qa")) {
    const shell = await env.ASSETS.fetch(new URL("/index.html", url), {
      headers: {
        "Cf-Access-Jwt-Assertion":
          request.headers.get("Cf-Access-Jwt-Assertion") ?? "",
      },
    });
    const headers = withRobotsHeaders(shell.headers);
    const contentType = shell.headers.get("content-type") ?? "text/html";
    headers.set("Content-Type", contentType);
    if (contentType.includes("text/html")) {
      const body = await shell.text();
      return new Response(robotsHtml(body), { status: shell.status, headers });
    }
    return new Response(shell.body, { status: shell.status, headers });
  }

  // Fallback for any other protected path (should not happen): 404.
  return json({ error: "not found" }, 404);
}
