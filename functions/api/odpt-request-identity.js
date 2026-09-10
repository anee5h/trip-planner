/**
 * KAI-290 PR 2B — canonical ODPT request identity.
 *
 * ONE identity generator shared by result caching, in-flight deduplication and
 * provider-budget accounting, so all three agree on what "the same request"
 * means. If they disagreed, a cache hit and a budget token could be issued for
 * requests that are not actually equivalent.
 *
 * Generated ONLY from an already-validated request: the operation plus the
 * validated semantic filters declared by that operation's schema. Fields that
 * validation rejected never reach this module, so an unvalidated caller
 * parameter cannot influence the key.
 *
 * The identity never contains, and is never derived from:
 *   - `ODPT_API_KEY` or the `acl:consumerKey` parameter name
 *   - the caller's IP address or any other caller-specific value
 *   - the credential-bearing provider URL
 *   - arbitrary unvalidated caller input
 *
 * Representation: a versioned prefix plus a JSON array of `[name, value]` pairs
 * sorted by name. An array of pairs is used instead of a flat
 * `name=value|name=value` string on purpose — a naive join collides for text
 * filters that legitimately contain the separator (`title: "A|operator=B"`
 * would produce the same string as two separate filters). JSON escaping makes
 * that impossible, and sorting by name makes the result independent of the
 * caller's JSON property order.
 */
import { OPERATION_SCHEMAS } from "./odpt-core.js";

/** Bumped only when the identity representation changes (invalidates caches). */
export const ODPT_REQUEST_IDENTITY_VERSION = "odpt-canonical-v1";

/**
 * Reduces a validated filter value to its identity-bearing form.
 *
 * ODPT filter values are validated to primitives (strings and finite numbers),
 * so anything else is not identity-bearing and is skipped rather than
 * stringified — a `toString()`-ed object could collide with a real value.
 */
function canonicalFilterValue(value) {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return undefined;
}

/**
 * Builds the canonical identity for a validated request.
 *
 * @param {{ok: true, operation: string, body: Record<string, unknown>}} validated
 *   The success object returned by `validateOdptRequest`. Passing anything else
 *   is a programming error (identity must be generated AFTER validation), so it
 *   throws rather than silently producing a weaker key.
 * @returns {string} credential-free canonical identity
 */
export function canonicalOdptRequestIdentity(validated) {
  if (
    !validated ||
    validated.ok !== true ||
    typeof validated.operation !== "string"
  ) {
    throw new TypeError(
      "canonicalOdptRequestIdentity requires a validated ODPT request",
    );
  }
  const { operation, body } = validated;
  const schema = OPERATION_SCHEMAS[operation];
  if (!schema) {
    throw new TypeError(`cannot canonicalize unknown operation: ${operation}`);
  }

  const pairs = [["operation", operation]];
  const declared = [...schema.pathParams, ...schema.queryParams].sort();
  for (const name of declared) {
    const value = canonicalFilterValue(body?.[name]);
    if (value === undefined) continue;
    pairs.push([name, value]);
  }
  // Sort so the result depends only on the semantic content, never on the
  // order the caller happened to write JSON properties in.
  pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  return `${ODPT_REQUEST_IDENTITY_VERSION}:${JSON.stringify(pairs)}`;
}

/**
 * Deterministic 64-bit FNV-1a digest as hex, used to bound cache-key length.
 *
 * Deterministic and dependency-free so cache keys are reproducible across
 * isolates and testable without Web Crypto. Two independent offsets are
 * combined into 64 bits to keep accidental collision probability negligible;
 * collisions are additionally *detected*, not merely assumed away — cache
 * entries store their full canonical identity and a mismatch is treated as a
 * miss (see `odpt-runtime-protection.js`).
 */
export function hashOdptRequestIdentity(identity) {
  const text = String(identity);
  const seeds = [0x811c9dc5, 0x01000193];
  const parts = [];
  for (const seed of seeds) {
    let hash = seed >>> 0;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      // FNV prime multiply, kept in 32-bit range.
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    parts.push(hash.toString(16).padStart(8, "0"));
  }
  return parts.join("");
}

/**
 * Bounded, credential-free cache key derived from a canonical identity.
 *
 * The provider URL (`https://api.odpt.org/...?acl:consumerKey=...`) is NEVER
 * used as a cache key; this synthetic key is built from the canonical identity
 * alone. The scheme/host is an internal placeholder that must never be fetched.
 */
export const ODPT_CACHE_KEY_NAMESPACE =
  "https://odpt-cache.meguruto.internal/v1";

export function odptCacheKey(identity) {
  return `${ODPT_CACHE_KEY_NAMESPACE}/${hashOdptRequestIdentity(identity)}`;
}
