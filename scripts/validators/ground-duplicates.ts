/**
 * Contradictory duplicate-corridor detection for the ground registries
 * (KAI-12). Shared by the transport-topology validator and the live-registry
 * invariant test so the two can never drift apart.
 *
 * GroundRouteEstimator supports directional records: a row matches its exact
 * orientation always, and its reverse orientation only when `bidirectional`
 * is true. Duplicate semantics therefore depend on the flag:
 *
 * - the same ordered pair + mode twice -> duplicate (regardless of flags);
 * - `A→B bidirectional:true` plus `B→A` (either flag) -> duplicate — the
 *   bidirectional record already covers both directions, so the second row
 *   is redundant and contradictory;
 * - `A→B` plus `B→A bidirectional:true` -> duplicate (same reason);
 * - `A→B bidirectional:false` plus `B→A bidirectional:false` -> VALID — two
 *   genuinely directional services, exactly what the runtime supports.
 */
export interface GroundCorridorLike {
  from: string;
  to: string;
  bidirectional?: boolean;
  mode?: string;
}

export interface GroundCorridorDuplicate {
  /** the record that collides with an already-seen record */
  route: GroundCorridorLike;
  /** the already-seen record it collides with */
  existing: GroundCorridorLike;
}

export function findContradictoryGroundDuplicates(
  registry: readonly GroundCorridorLike[],
): GroundCorridorDuplicate[] {
  const duplicates: GroundCorridorDuplicate[] = [];
  const seen = new Map<string, GroundCorridorLike>();
  for (const route of registry) {
    const key = `${route.mode}:${route.from}→${route.to}`;
    const reverseKey = `${route.mode}:${route.to}→${route.from}`;
    const existing = seen.get(key);
    if (existing) {
      // Same ordered pair + mode twice — a duplicate even when the second
      // record is directional and the first is bidirectional (or vice
      // versa): one row per ordered pair+mode is the contract.
      duplicates.push({ route, existing });
      seen.set(key, route);
      continue;
    }
    const reverse = seen.get(reverseKey);
    if (reverse && (reverse.bidirectional || route.bidirectional)) {
      // A bidirectional record in either orientation covers both directions,
      // so the opposite-direction record is redundant.
      duplicates.push({ route, existing: reverse });
    }
    seen.set(key, route);
  }
  return duplicates;
}
