const buckets = new Map();
const MAX_TRACKED_CLIENTS = 2048;

function pruneExpired(now) {
  if (buckets.size < MAX_TRACKED_CLIENTS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

function clientKey(request, scope) {
  const ip = request.headers.get("CF-Connecting-IP")?.trim() || "unknown";
  return `${scope}:${ip}`;
}

/**
 * Best-effort per-isolate guard for expensive write endpoints.
 *
 * Cloudflare's edge rate-limit rule remains the distributed control. This
 * local guard rejects repeated requests before Supabase/Resend work when a
 * request reaches the same isolate. It deliberately uses only the
 * Cloudflare-provided client IP; forwarded headers are not trusted.
 *
 * ponytail: per-isolate map, with the edge rule as the distributed control;
 * move to a durable limiter only if abuse evidence justifies another binding.
 */
export function isRateLimited(request, { scope, limit, windowMs }) {
  const now = Date.now();
  let key = clientKey(request, scope);
  let bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    pruneExpired(now);
    if (!bucket && buckets.size >= MAX_TRACKED_CLIENTS) {
      key = `${scope}:overflow`;
      bucket = buckets.get(key);
    }
    bucket = { count: 1, resetAt: now + windowMs };
    buckets.set(key, bucket);
    return false;
  }

  bucket.count += 1;
  return bucket.count > limit;
}

export function rateLimitResponse(retryAfterSeconds) {
  return Response.json(
    { ok: false, error: "rate_limited" },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSeconds) },
    },
  );
}

/** Test-only reset for isolated endpoint tests. */
export function __resetRequestGuardState() {
  buckets.clear();
}
