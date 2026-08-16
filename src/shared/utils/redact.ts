/**
 * KAI-46: shared sensitive-value redaction.
 *
 * Imported by BOTH the browser reporter (src/shared/utils/errorReporter.ts)
 * and the server-side ingestion Function (functions/api/errors.js) so the
 * privacy boundary is identical on both ends — anyone can bypass the
 * browser reporter and POST straight to /api/errors, so the server applies
 * the same redaction before anything is stored.
 *
 * Must stay pure (no DOM, no external imports): it runs inside a Pages
 * Function and in the client bundle.
 */

const REDACTED = "[REDACTED]";

/** JWT (e.g. Supabase access tokens): header.payload.signature. The eyJ
 *  header prefix is the strong signal, so payload/signature segments may
 *  be short (truncated or malformed tokens must not slip through). */
const JWT_RE =
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\b/g;

/** Supabase elevated server keys. */
const SB_SECRET_RE = /\bsb_secret_[A-Za-z0-9_-]{8,}\b/g;

/** Resend API keys. */
const RESEND_RE = /\bre_[A-Za-z0-9]{20,}\b/g;

/** Space-separated bearer values: `Bearer <token>` (no = or : separator). */
const BEARER_RE = /\bbearer\s+[A-Za-z0-9._~+/=-]{16,}/gi;

/**
 * Named secret assignments in text: `Bearer xyz`, `access_token=abc`,
 * `Authorization: Bearer xyz`, `password=...`, `apiKey: ...`. Requires a
 * `=`/`:` separator and a value so bare words like "token" stay intact.
 */
const NAMED_SECRET_RE =
  /(?:bearer|authorization|access[_-]?token|refresh[_-]?token|token|api[_-]?key|apikey|password|passwd|secret)\s*[=:]\s*["']?[A-Za-z0-9._~+/=-]{8,}/gi;

/** Sensitive query parameters in URLs: ?token=...&key=... */
const QUERY_SECRET_RE =
  /([?&](?:token|key|api[_-]?key|password|secret)=)[^&\s"']{8,}/gi;

/** Email addresses — stored error text should never contain them. */
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

const PATTERNS: RegExp[] = [
  JWT_RE,
  SB_SECRET_RE,
  RESEND_RE,
  BEARER_RE,
  NAMED_SECRET_RE,
  QUERY_SECRET_RE,
  EMAIL_RE,
];

/**
 * Replaces every sensitive pattern occurrence with [REDACTED]. Order is
 * irrelevant here because replacements never re-match later patterns.
 * Returns the input unchanged when nothing matches.
 */
export function redactSensitiveValues(input: string): string {
  let out = input;
  for (const re of PATTERNS) {
    out = out.replace(re, REDACTED);
  }
  return out;
}

export { REDACTED };
