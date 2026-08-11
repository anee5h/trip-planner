import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { getJwtTimingMetadata } from "@/lib/jwtTiming";

/**
 * Bounded recovery for transient "JWT issued at future" rejections (KAI-40).
 *
 * PostgREST rejects a request with code PGRST303 / message "JWT issued at
 * future" when the access token's `iat` claim is more than 30s ahead of the
 * server's clock (same class: "JWT not yet valid" for `nbf`). The rejection
 * is correct security behavior; the token was minted by an auth server whose
 * clock was ahead of PostgREST's at mint time (or by another environment).
 *
 * A fresh session refresh exchanges the refresh token for a token minted
 * NOW, which legitimately resolves the stale future-iat token. This module
 * implements that recovery with a very narrow contract:
 *
 *   request → PGRST303 future-iat → refresh exactly once → replay exactly once
 *
 * No looping, no retry chains, no background timers. Any other error, a
 * failed refresh, or an identity change returns the original result so the
 * caller surfaces a real failure state. Nothing here weakens JWT validation,
 * bypasses the server, or logs secret material.
 */

/** PostgREST code for JWT claims-validation failures (time claims, audience,
 * parsing). */
const PGRST_JWT_CLAIMS = "PGRST303";

/**
 * True only for the clock-class PGRST303 rejections a fresh refresh can
 * legitimately recover: `iat`/`nbf` in the future. Deliberately excludes
 * "JWT expired", "JWT not in audience", "Parsing claims failed", and every
 * non-PGRST303 error (network, 500, RLS, schema).
 */
export function isJwtFutureRejection(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  if (candidate.code !== PGRST_JWT_CLAIMS) return false;
  return (
    typeof candidate.message === "string" &&
    /issued at future|not yet valid/i.test(candidate.message)
  );
}

let refreshInFlight: Promise<boolean> | null = null;

/**
 * Refreshes the current session exactly once, sharing a single in-flight
 * promise across concurrent callers so a burst of PGRST303 failures cannot
 * trigger a refresh storm. `@supabase/auth-js` already single-flights its
 * internal refresh; this guards the application boundary as well and gives
 * deterministic semantics for tests. Never caches or returns a token.
 *
 * Resolves `true` when a new session was stored, `false` when the refresh
 * failed or no session existed. Callers must re-verify auth identity before
 * acting on the result.
 */
export function refreshSessionOnce(client: SupabaseClient): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const { data, error } = await client.auth.refreshSession();
    return !error && Boolean(data.session);
  })().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

function redactUserId(userId: string): string {
  if (userId.length <= 8) return `${userId.slice(0, 2)}…`;
  return `${userId.slice(0, 3)}…${userId.slice(-3)}`;
}

export interface JwtRecoveryOptions {
  /** Diagnostics phase label, logged as `sync.<phase>.*` (e.g.
   * "user_data.hydrate"). */
  phase: string;
  /** Identity/liveness guard: must hold before the refresh and before the
   * replay. Callers pass their existing account/hydration-version guard so
   * a sign-out or account switch during recovery aborts the replay. */
  isStillCurrent: () => boolean;
  /** Redacted for logs. */
  userId?: string;
}

/**
 * Runs an authenticated operation once; on a future-iat/nbf PGRST303
 * rejection it refreshes the session exactly once (deduplicated) and replays
 * the operation exactly once. All other outcomes — non-matching errors,
 * failed refresh, identity change — return the last result unchanged.
 *
 * `operation` is `PromiseLike` because supabase-js query builders are
 * thenables, not native `Promise`s.
 */
export async function withJwtFutureRecovery<T>(
  client: SupabaseClient,
  operation: () => PromiseLike<{ data: T; error: PostgrestError | null }>,
  { phase, isStillCurrent, userId }: JwtRecoveryOptions,
): Promise<{ data: T; error: PostgrestError | null }> {
  const first = await operation();

  if (!first.error || !isJwtFutureRejection(first.error) || !isStillCurrent()) {
    return first;
  }

  // Capture timing metadata from the session that was just rejected BEFORE
  // refreshing, so the deltas reflect the token the server saw.
  let timing: ReturnType<typeof getJwtTimingMetadata> = null;
  try {
    const { data } = await client.auth.getSession();
    timing = getJwtTimingMetadata(data.session?.access_token ?? null);
  } catch {
    // Diagnostics are best-effort; never let them break recovery.
  }

  console.error(`[Meguruto Sync] sync.${phase}.jwt_future`, {
    ...(timing ?? {}),
    attempt: 0,
    ...(userId !== undefined ? { user: redactUserId(userId) } : {}),
  });

  const refreshed = await refreshSessionOnce(client);

  if (!isStillCurrent()) return first;

  if (!refreshed) {
    console.error(`[Meguruto Sync] sync.${phase}.recovery_failed`, {
      attempt: 0,
      reason: "refresh_failed",
    });
    return first;
  }

  console.info(`[Meguruto Sync] sync.${phase}.recovery_start`, { attempt: 1 });

  const replay = await operation();

  if (!isStillCurrent()) return replay;

  if (replay.error) {
    console.error(`[Meguruto Sync] sync.${phase}.recovery_failed`, {
      attempt: 1,
      reason: "replay_failed",
      code: replay.error.code,
    });
    return replay;
  }

  console.info(`[Meguruto Sync] sync.${phase}.recovery_success`, {
    attempt: 1,
  });
  return replay;
}
