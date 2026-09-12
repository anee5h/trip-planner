/**
 * KAI-291B1 — provider-agnostic normalized entity ids.
 *
 * One builder for every provider adapter (ODPT and GTFS / GTFS-JP). Plain
 * concatenation with a `:` delimiter is ambiguous when
 * a namespace or provider id itself contains the delimiter
 * (`ns="a", id="b:c"` vs `ns="a:b", id="c"`), so each variable component is
 * `encodeURIComponent`-escaped independently: the escape encodes every
 * literal `:` as `%3A`, which makes the join delimiter unambiguous and the
 * id reversible via `decodeURIComponent`. Provider ids are never hashed
 * away — debugging and provenance stay inspectable.
 *
 * Pure functions only: no I/O, no clock.
 */

import type { TransitProvider } from "./transitGraphTypes";

/** Entity kinds with normalized identities. */
export type TransitEntityKind =
  "operator" | "stop" | "route" | "calendar" | "scheduled_service";

/**
 * Builds one normalized internal id from provider + kind + stable identity
 * namespace + exact provider id. Deterministic; same inputs always yield the
 * same id, and any difference in any component yields a different id.
 */
export function makeTransitEntityId(
  provider: TransitProvider,
  entityKind: TransitEntityKind,
  identityNamespace: string,
  providerId: string,
): string {
  return [provider, entityKind, identityNamespace, providerId]
    .map((component) => encodeURIComponent(component))
    .join(":");
}

/**
 * Parses an id built by `makeTransitEntityId` back into its components.
 * Returns null when the id is not a well-formed four-component identity.
 */
export function parseTransitEntityId(id: string): {
  readonly provider: string;
  readonly entityKind: string;
  readonly identityNamespace: string;
  readonly providerId: string;
} | null {
  const parts = id.split(":");
  if (parts.length !== 4) return null;
  try {
    const [provider, entityKind, identityNamespace, providerId] = parts.map(
      (part) => decodeURIComponent(part),
    );
    if (
      provider === undefined ||
      entityKind === undefined ||
      identityNamespace === undefined ||
      providerId === undefined
    ) {
      return null;
    }
    return { provider, entityKind, identityNamespace, providerId };
  } catch {
    return null;
  }
}
