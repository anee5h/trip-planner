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
    const bucketName = env.E2E_REPORT_BUCKET ?? "E2E_REPORT";
    const bucket = env[bucketName];
    if (!bucket) return json({ error: "report store not configured" }, 503);
    const key = url.pathname.replace(/^\/e2e\/?/, "") || "index.html";
    const obj = await bucket.get(key);
    if (!obj) return json({ error: "not found" }, 404);
    const headers = new Headers();
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

  // /qa: pass through with noindex headers (reserved internal surface).
  const response = await next();
  const headers = withRobotsHeaders(response.headers);
  const contentType = headers.get("content-type") ?? "";
  if (contentType.includes("text/html")) {
    const body = await response.text();
    return new Response(robotsHtml(body), { status: response.status, headers });
  }
  return new Response(response.body, { status: response.status, headers });
}
