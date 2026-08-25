const buckets = new Map();
const MAX_TRACKED_CLIENTS = 2048;

function pruneExpired(now) {
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
  const key = clientKey(request, scope);

  // Reclaim all stale state before deciding whether this client can allocate
  // a bucket. This keeps the map bounded and lets expired buckets be reused.
  pruneExpired(now);

  const bucket = buckets.get(key);
  if (bucket) {
    bucket.count += 1;
    return bucket.count > limit;
  }

  // Fail closed when the map is full: never create an overflow bucket that
  // can be overwritten by each unseen client.
  if (buckets.size >= MAX_TRACKED_CLIENTS) return true;

  buckets.set(key, { count: 1, resetAt: now + windowMs });
  return false;
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
