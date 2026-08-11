/**
 * Safe JWT timing diagnostics (KAI-40).
 *
 * Decodes ONLY the timing claims (`iat`, `exp`, `nbf`) from an access token
 * and returns derived metadata. It never returns, persists, or logs the
 * token itself, tolerates malformed tokens, and never throws into
 * application flow — callers degrade gracefully on `null`.
 *
 * This is diagnostic-only. The server (PostgREST) remains authoritative for
 * JWT validity; nothing here overrides or bypasses server-side validation.
 */

export interface JwtTimingMetadata {
  /** Seconds-since-epoch `iat` claim, when present and numeric. */
  iat?: number;
  /** Seconds-since-epoch `exp` claim, when present and numeric. */
  exp?: number;
  /** Seconds-since-epoch `nbf` claim, when present and numeric. */
  nbf?: number;
  /** Client wall-clock seconds at inspection time. */
  now: number;
  /** `iat - now`; positive when the token claims a future issue time. */
  issuedInFutureBySeconds?: number;
  /** `exp - now`; negative when the token is already expired locally. */
  expiresInSeconds?: number;
}

function base64UrlDecode(input: string): string | null {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  try {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

/**
 * Extracts timing metadata from a JWT access token without exposing the
 * token itself. Returns `null` for missing, malformed, or non-JWT input.
 *
 * @param token  The access token to inspect (never returned or persisted).
 * @param nowMs  Injectable wall clock for deterministic tests.
 */
export function getJwtTimingMetadata(
  token: string | null | undefined,
  nowMs: number = Date.now(),
): JwtTimingMetadata | null {
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const payload = base64UrlDecode(parts[1]);
  if (!payload) return null;

  let claims: unknown;
  try {
    claims = JSON.parse(payload);
  } catch {
    return null;
  }

  if (!claims || typeof claims !== "object" || Array.isArray(claims)) {
    return null;
  }

  const record = claims as Record<string, unknown>;
  const iat = asFiniteNumber(record.iat);
  const exp = asFiniteNumber(record.exp);
  const nbf = asFiniteNumber(record.nbf);
  const now = nowMs / 1000;

  const metadata: JwtTimingMetadata = { now };

  if (iat !== undefined) {
    metadata.iat = iat;
    metadata.issuedInFutureBySeconds = iat - now;
  }
  if (exp !== undefined) {
    metadata.exp = exp;
    metadata.expiresInSeconds = exp - now;
  }
  if (nbf !== undefined) {
    metadata.nbf = nbf;
  }

  return metadata;
}
