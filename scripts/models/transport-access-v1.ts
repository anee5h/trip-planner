/**
 * transport-access-v1 — KAI-89 transport provenance model.
 *
 * transportOptions KEYS are access declarations (runtime authorization);
 * VALUES are legacy static minutes with inconsistent semantics — NEVER read
 * by the origin-aware estimator. This model does NOT fabricate times and
 * does NOT remove access keys (that broke runtime authorization). It:
 * 1) derives mode AVAILABILITY from topology (zone localModes +
 *    localAccessModes + flight/ferry registries) as a report, and
 * 2) tags legacy static minutes as low-confidence fallback provenance
 *    (transportMetadata) so template times are never presented as verified
 *    journey facts.
 * The MISSING_TRANSPORT_OPTIONS contract change and origin-aware-only
 * display migration are deferred P2 changes (design report §7).
 */
import type { Destination } from "../../src/shared/types/destination";
import type { TransportMode } from "../../src/shared/services/transport/types";

export interface TransportModelOutput {
  action: "tag" | "keep" | "unknown";
  reason: string;
  metadata?: {
    method: "source-verified" | "calculated" | "legacy-fallback" | "unknown";
    modelVersion: "transport-access-v1";
    confidence: "high" | "medium" | "low" | "unknown";
    basis: string;
  };
}

/**
 * @param eligibleIds manual-review transport records (restored batch times)
 * @param sourceVerifiedIds records with source-verified transport facts
 *   (corrections ledger + Naha Yui Rail)
 * @param zoneLocalModes zoneId -> local modes from transport-topology.json
 */
export function transportModel(
  dest: Destination,
  eligibleIds: Set<string>,
  sourceVerifiedIds: Set<string>,
  zoneLocalModes: Map<string, readonly TransportMode[]>,
): TransportModelOutput {
  if (sourceVerifiedIds.has(dest.id)) {
    return {
      action: "keep",
      reason: "source-verified transport facts (ledger)",
      metadata: {
        method: "source-verified",
        modelVersion: "transport-access-v1",
        confidence: "high",
        basis: "corrections ledger / official sources",
      },
    };
  }
  if (!eligibleIds.has(dest.id)) {
    return {
      action: "keep",
      reason: "outside model scope (override precedence)",
      confidence: undefined,
      metadata: undefined,
    } as TransportModelOutput;
  }
  // Availability derivation (informational): does the zone or localAccessModes
  // declare the record's transportOptions modes?
  const zoneModes = dest.transportZoneId
    ? (zoneLocalModes.get(dest.transportZoneId) ?? [])
    : [];
  const declared = Object.keys(dest.transportOptions ?? {}) as TransportMode[];
  const supportedByZone = declared.filter(
    (m) => zoneModes.includes(m) || dest.localAccessModes?.includes(m),
  );
  return {
    action: "tag",
    reason: `legacy static minutes tagged as fallback; ${supportedByZone.length}/${declared.length} declared modes supported by zone topology`,
    metadata: {
      method: "legacy-fallback",
      modelVersion: "transport-access-v1",
      confidence: "low",
      basis:
        "restored batch times (v1.6.0 default) — not verified journey facts; origin-aware estimator is authoritative",
    },
  };
}
