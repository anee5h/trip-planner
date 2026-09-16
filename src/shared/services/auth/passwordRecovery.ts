export interface PasswordRecoveryCallback {
  isRecovery: boolean;
  hasCredentials: boolean;
  errorCode: string | null;
}

export type PasswordRecoveryUpdateError =
  | "invalid_session"
  | "weak_password"
  | "weak_password_pwned"
  | "same_password"
  | "network"
  | "generic";

type LocationLike = Pick<Location, "origin" | "pathname" | "search" | "hash">;

export function isPasswordRecoveryEvent(event: string): boolean {
  return event === "PASSWORD_RECOVERY";
}

const INVALID_SESSION_CODES = new Set([
  "bad_code_verifier",
  "flow_state_expired",
  "flow_state_not_found",
  "otp_expired",
  "reauthentication_needed",
  "reauthentication_not_valid",
  "refresh_token_already_used",
  "refresh_token_not_found",
  "session_expired",
  "session_not_found",
]);

function safeAuthErrorField(
  error: unknown,
  field: "code" | "message" | "name",
) {
  if (!error || typeof error !== "object") return "";
  const value = (error as Record<string, unknown>)[field];
  return typeof value === "string"
    ? value
        .replace(/[\r\n\t]+/g, " ")
        .trim()
        .slice(0, 240)
        .toLowerCase()
    : "";
}

/**
 * Maps Supabase AuthError fields to product states without exposing the raw
 * provider message. The server remains authoritative for password policy.
 */
export function classifyPasswordRecoveryError(
  error: unknown,
): PasswordRecoveryUpdateError {
  const code = safeAuthErrorField(error, "code");
  const message = safeAuthErrorField(error, "message");
  const name = safeAuthErrorField(error, "name");
  const authError =
    error && typeof error === "object"
      ? (error as { reasons?: unknown; status?: unknown })
      : undefined;
  const status =
    typeof authError?.status === "number" ? authError.status : undefined;

  if (code === "weak_password") {
    const reasons = Array.isArray(authError?.reasons)
      ? authError.reasons.filter(
          (reason): reason is string => typeof reason === "string",
        )
      : [];
    if (
      reasons.includes("pwned") ||
      message.includes("pwned") ||
      message.includes("leaked")
    ) {
      return "weak_password_pwned";
    }
    return "weak_password";
  }
  if (code === "same_password") return "same_password";
  if (
    name === "authsessionmissingerror" ||
    INVALID_SESSION_CODES.has(code) ||
    status === 401 ||
    status === 403 ||
    message.includes("auth session missing") ||
    message.includes("requires reauthentication")
  ) {
    return "invalid_session";
  }
  if (
    error instanceof TypeError ||
    message.includes("network") ||
    message.includes("failed to fetch") ||
    message.includes("fetch failed") ||
    message.includes("timeout")
  ) {
    return "network";
  }
  return "generic";
}

export function inspectRecoveryCallback(
  location: LocationLike | URL,
): PasswordRecoveryCallback {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
  const search = new URLSearchParams(location.search);
  const isRecovery =
    hash.get("type") === "recovery" || search.get("type") === "recovery";
  return {
    isRecovery,
    hasCredentials: Boolean(
      hash.get("access_token") && hash.get("refresh_token"),
    ),
    errorCode: isRecovery ? search.get("error_code") : null,
  };
}

export function isPasswordRecoveryRoute(pathname: string): boolean {
  return pathname === "/reset-password" || pathname === "/ja/reset-password";
}

export function getPasswordRecoveryRedirectUrl(
  location: LocationLike | URL,
): string {
  const localePrefix =
    location.pathname === "/ja" || location.pathname.startsWith("/ja/")
      ? "/ja"
      : "";
  return `${location.origin}${localePrefix}/reset-password`;
}
