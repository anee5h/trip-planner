/**
 * KAI-44: OAuth reauthentication + pending account deletion.
 *
 * OAuth accounts (Google/Twitter/LINE) reauthenticate by completing a
 * FRESH sign-in through their provider — Supabase's reauthentication
 * nonce is only documented for password changes, so the OAuth path is a
 * real provider round-trip.
 *
 * The pending intent is BOUND TO THE ORIGINAL ACCOUNT: { userId,
 * provider, createdAt }. After the redirect, the returned session must
 * belong to the SAME user, or the intent is cleared and an
 * account-mismatch result is stored instead of deleting anyone. The
 * server remains the authority (amr freshness + verified token), but the
 * client binding prevents the wrong freshly-authenticated account from
 * becoming the deletion target.
 *
 * Outcomes are PRESERVED across the redirect in sessionStorage
 * (meguruto_account_deletion_result) so a partial/auth/network failure
 * after the provider round-trip is surfaced with the same localized
 * outcome model as the direct path — never silently discarded.
 */
import { supabase } from "@/lib/supabase";
import {
  requestAccountDeletion,
  type AccountDeletionResult,
} from "@/shared/utils/accountDeletion";

const PENDING_DELETION_KEY = "meguruto_pending_account_deletion";
const RESULT_KEY = "meguruto_account_deletion_result";

/** A pending intent is destructive authorization — it expires like the
 *  server's amr window (15 minutes) so a cancelled OAuth flow can never
 *  execute days later against a fresh, unrelated sign-in. */
const PENDING_DELETION_TTL_MS = 15 * 60 * 1000;

export interface PendingAccountDeletionIntent {
  /** The user who initiated deletion — the ONLY allowed target. */
  userId: string;
  provider: string;
  createdAt: number;
}

export function getPendingAccountDeletionIntent(): PendingAccountDeletionIntent | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    const raw = sessionStorage.getItem(PENDING_DELETION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingAccountDeletionIntent>;
    const createdAt = parsed.createdAt;
    const age = Date.now() - (createdAt as number);
    if (
      typeof parsed.userId !== "string" ||
      !parsed.userId ||
      typeof createdAt !== "number" ||
      !Number.isFinite(createdAt) ||
      age < 0 ||
      age > PENDING_DELETION_TTL_MS
    ) {
      // Invalid or expired intent means invalid destructive authorization.
      // Never substitute Date.now() for a missing timestamp. Clear it and
      // leave a reauth_required result so the user can restart cleanly.
      clearAccountDeletionPending();
      storeAccountDeletionResult({ ok: false, error: "reauth_required" });
      return null;
    }
    return {
      userId: parsed.userId,
      provider: typeof parsed.provider === "string" ? parsed.provider : "",
      createdAt,
    };
  } catch {
    clearAccountDeletionPending();
    return null;
  }
}

/**
 * Persists the deletion intent. Returns false when sessionStorage is
 * unavailable — callers MUST abort the OAuth redirect in that case (an
 * unpersisted intent would otherwise be lost, and the redirect is what
 * carries the destructive continuation).
 */
export function markAccountDeletionPending(
  intent: PendingAccountDeletionIntent,
): boolean {
  try {
    sessionStorage.setItem(PENDING_DELETION_KEY, JSON.stringify(intent));
    return true;
  } catch {
    return false;
  }
}

/** Clears a pending intent (e.g. OAuth initiation failed). */
export function clearAccountDeletionPending(): void {
  try {
    sessionStorage.removeItem(PENDING_DELETION_KEY);
  } catch {
    // ignore
  }
}

/** Preserves a deletion outcome for surfacing after the redirect. */
export function storeAccountDeletionResult(
  result: AccountDeletionResult,
): void {
  try {
    sessionStorage.setItem(RESULT_KEY, JSON.stringify(result));
  } catch {
    // ignore — the user will not see the outcome, but no data is at risk
  }
}

/** Consumes (and clears) a preserved deletion outcome, if any. */
export function takeAccountDeletionResult(): AccountDeletionResult | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    const raw = sessionStorage.getItem(RESULT_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(RESULT_KEY);
    return JSON.parse(raw) as AccountDeletionResult;
  } catch {
    return null;
  }
}

/** Single-flight guard: auth events (initial getSession + onAuthStateChange)
 *  can arrive near-simultaneously; a destructive workflow must never issue
 *  two concurrent delete requests or competing result writes. */
let executionInFlight = false;

/**
 * Completes a pending deletion after an OAuth redirect returns a session.
 * No-op unless an intent is stored. Identity continuity is enforced: a
 * session belonging to a DIFFERENT user clears the intent and stores an
 * account-mismatch result — nothing is deleted.
 *
 * Outcomes are preserved via storeAccountDeletionResult unless the
 * deletion definitively completed. For network ambiguity, the strict
 * reconciliation rule applies: only a definitive getUser() 401 (the Auth
 * user no longer exists) counts as completed; transport/5xx stays an
 * unknown outcome and is stored for surfacing.
 */
export async function executePendingAccountDeletionIfRequested(): Promise<void> {
  if (executionInFlight) return;
  executionInFlight = true;
  try {
    const intent = getPendingAccountDeletionIntent();
    if (!intent || !supabase) return;
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session?.access_token) return; // no session yet — retried on next sign-in

    if (session.user.id !== intent.userId) {
      clearAccountDeletionPending();
      storeAccountDeletionResult({
        ok: false,
        error: "account_mismatch",
      });
      return;
    }

    clearAccountDeletionPending();
    let result: AccountDeletionResult;
    try {
      result = await requestAccountDeletion(session.access_token, {
        reauthMode: "otp",
      });
    } catch {
      result = { ok: false, error: "network_error" };
    }

    if (result.ok) {
      await supabase.auth.signOut().catch(() => {});
      return;
    }

    // Strict reconciliation for the ambiguous network case.
    if (result.error === "network_error") {
      let status: number | undefined;
      try {
        const { error } = await supabase.auth.getUser();
        status = (error as { status?: number } | null)?.status;
      } catch {
        // Reconciliation itself failed (network/service) — unknown.
      }
      if (status === 401) {
        // The session is definitively invalid: the account is gone.
        await supabase.auth.signOut().catch(() => {});
        return;
      }
    }

    // Everything else is preserved for surfacing with the localized
    // outcome model — never silently discarded.
    storeAccountDeletionResult(result);
  } catch {
    // Best-effort after a redirect — never break the app.
  } finally {
    executionInFlight = false;
  }
}
