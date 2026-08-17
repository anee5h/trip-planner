/**
 * KAI-44: server-authorized account deletion request.
 *
 * Pure client-side request logic, separated from the UI so it is unit
 * testable: POSTs the caller's Supabase access token plus a server-verified
 * reauthentication payload to the Pages Function
 * (functions/api/account/delete.js). The server enforces recent
 * authentication itself — the UI never is the security boundary.
 *
 * The server's partial-failure JSON is preserved, not collapsed to a bare
 * boolean: { error, step, deleted, retrySafe } lets the UI tell the user
 * exactly what happened (nothing deleted / some data deleted / Auth
 * deletion failed / session expired / unknown network outcome).
 */

export type ReauthPayload =
  | { reauthMode: "password"; email: string; password: string }
  | { reauthMode: "otp" };

export type AccountDeletionResult =
  | { ok: true; deleted: Record<string, boolean> }
  | {
      ok: false;
      error: string;
      step?: string;
      deleted?: Record<string, boolean>;
      retrySafe?: boolean;
    };

export async function requestAccountDeletion(
  accessToken: string,
  reauth: ReauthPayload,
  fetchImpl: typeof fetch = fetch,
): Promise<AccountDeletionResult> {
  try {
    const res = await fetchImpl("/api/account/delete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(reauth),
    });
    let body: Record<string, unknown> = {};
    try {
      body = await res.json();
    } catch {
      // Non-JSON body: fall back to status-only.
    }
    if (res.ok) {
      return {
        ok: true,
        deleted: (body.deleted as Record<string, boolean>) ?? {},
      };
    }
    return {
      ok: false,
      error: typeof body.error === "string" ? body.error : "request_failed",
      step: typeof body.step === "string" ? body.step : undefined,
      deleted:
        body.deleted && typeof body.deleted === "object"
          ? (body.deleted as Record<string, boolean>)
          : undefined,
      retrySafe:
        typeof body.retrySafe === "boolean" ? body.retrySafe : undefined,
    };
  } catch {
    // Network failure — the outcome is unknown: the server may or may not
    // have processed the request. Callers should reconcile with the
    // session state (see ProfileModal) instead of assuming nothing
    // happened.
    return { ok: false, error: "network_error" };
  }
}
