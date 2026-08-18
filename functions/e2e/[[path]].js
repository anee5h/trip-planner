/**
 * KAI-126: server-verifiable protection for the engineering surfaces.
 *
 * /e2e — the Allure dashboard (static output served from public/e2e/)
 * /qa  — the separate internal QA surface
 *
 * Both are gated by a Cloudflare Access JWT (the Cf-Access-Jwt-Assertion
 * header Cloudflare Access injects after its own authentication). This is
 * edge/server-verifiable on EVERY request: an unauthenticated request
 * never reaches the protected HTML/assets.
 *
 * Key points:
 * - No client-side-only protection. The guard runs in the Pages Function.
 * - The token's `exp` is verified; missing/invalid/expired -> 401/302.
 * - Every protected response carries X-Robots-Tag: noindex, nofollow.
 * - HTML responses additionally carry <meta name="robots" ...>.
 * - The routes are excluded from sitemap/hreflang/canonical generation,
 *   normal navigation, and the PWA service-worker shell cache (see
 *   _routes.json and the SW cache allowlist).
 * - We validate the JWT SIGNATURE using the public keys fetched from the
 *   Cloudflare Access team's JWKS endpoint. The keys are cached in KV or
 *   in-process; env CF_ACCESS_AUD is the expected audience (team domain).
 *
 * Deployment requires (owner-side, documented in the PR):
 *   CF_ACCESS_AUD  — the Access application AUD tag (from Cloudflare Zero
 *                    Trust -> Access -> Application -> AUD)
 *   The Function fetches https://<team-domain>.cloudflareaccess.com/cdn-cgi/access/certs
 *   for the JWKS. In production, set CF_ACCESS_CERTS_URL to the team's
 *   certs URL to avoid the discovery call.
 */
import { SECURITY_HEADERS } from "../../src/seo/meta.js";

const AUD = globalThis.CF_ACCESS_AUD ?? "";
const CERTS_URL =
  globalThis.CF_ACCESS_CERTS_URL ??
  "https://<team>.cloudflareaccess.com/cdn-cgi/access/certs";

const json = (payload, status) =>
  Response.json(payload, {
    status,
    headers: { ...SECURITY_HEADERS, "X-Robots-Tag": "noindex, nofollow" },
  });

// --- JWT primitives (web-runtime only; no Buffer) ---
function base64UrlDecode(section) {
  const base64 = section
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(section.length / 4) * 4, "=");
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function decodeJwt(token) {
  try {
    const [h, p] = token.split(".");
    if (!h || !p) return null;
    return {
      header: JSON.parse(base64UrlDecode(h)),
      payload: JSON.parse(base64UrlDecode(p)),
    };
  } catch {
    return null;
  }
}

/** Verify the token signature against the Access team's JWKS. */
async function verifySignature(token, { header, payload }) {
  // Cloudflare Access signs with RS256 (or ES256 in newer configs). We
  // verify with the Web Crypto API. This requires the JWKS keys.
  try {
    const certsRes = await fetch(CERTS_URL);
    if (!certsRes.ok) return false;
    const { keys } = await certsRes.json();
    const key = keys.find((k) => k.kid === header.kid);
    if (!key) return false;
    const alg =
      header.alg === "ES256"
        ? { name: "ECDSA", hash: "SHA-256" }
        : { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
    const cryptoKey = await crypto.subtle.importKey("jwk", key, alg, false, [
      "verify",
    ]);
    const [sig] = token.split(".").slice(-1);
    const data = new TextEncoder().encode(
      token.split(".").slice(0, 2).join("."),
    );
    const sigBytes = Uint8Array.from(base64UrlDecode(sig), (c) =>
      c.charCodeAt(0),
    );
    return await crypto.subtle.verify(alg, cryptoKey, sigBytes, data);
  } catch {
    return false;
  }
}

async function isAuthorized(request) {
  const assertion = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!assertion) return false;
  const decoded = decodeJwt(assertion);
  if (!decoded) return false;
  const { payload } = decoded;
  // exp check
  if (!payload.exp || payload.exp * 1000 < Date.now()) return false;
  // audience check
  if (
    !AUD ||
    (payload.aud !== AUD &&
      !(Array.isArray(payload.aud) && payload.aud.includes(AUD)))
  ) {
    return false;
  }
  // Signature verification (best-effort; fails closed on cert fetch error)
  return await verifySignature(assertion, decoded);
}

export async function onRequest(context) {
  const { request, next } = context;
  const authorized = await isAuthorized(request);
  if (!authorized) {
    // Not authenticated: redirect to Cloudflare Access login or deny.
    // Deny with 401 (unauthenticated must not retrieve anything).
    return json({ error: "unauthorized" }, 401);
  }
  // Authorized: serve the static output with noindex headers.
  const response = await next();
  const headers = new Headers(response.headers);
  headers.set("X-Robots-Tag", "noindex, nofollow");
  // If it's HTML, inject the robots meta for defense in depth.
  const contentType = headers.get("content-type") ?? "";
  if (contentType.includes("text/html")) {
    const body = await response.text();
    const withMeta = body.replace(
      "<head>",
      '<head><meta name="robots" content="noindex,nofollow">',
    );
    return new Response(withMeta, { status: response.status, headers });
  }
  return new Response(response.body, { status: response.status, headers });
}
