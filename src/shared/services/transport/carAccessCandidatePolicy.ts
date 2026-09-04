import type { Destination } from "@/shared/types/destination";
import type { CarAccess } from "@/shared/types/carAccess";
import type { TransportZoneId } from "@/shared/types/transportTopology";
import { resolveDestinationTransportZone } from "./TransportTopologyService";

/**
 * KAI-264 safe first-wave candidate policy.
 *
 * Long-term semantic rule (candidate authorization only, never proof):
 * valid coordinates + ordinary road-network geography + no explicit
 * negative evidence -> candidate_resolvable.
 *
 * This state lets Meguruto ATTEMPT/ESTIMATE car access. It NEVER means:
 * verified routable, parking verified, exact road endpoint verified,
 * canonical route/toll/fuel known, or unrestricted access proven.
 */

/** Main continuous road-network land masses (bridge-connected groups). */
export const MAJOR_LAND_TRANSPORT_ZONE_IDS = new Set<TransportZoneId>([
  "mainland-honshu",
  "hokkaido",
  "mainland-kyushu",
  "mainland-shikoku",
]);

/** Structured access states that always override candidate derivation. */
const NEGATIVE_ACCESS_STATES = new Set([
  "restricted",
  "unavailable",
  "ferry_required",
  "seasonal",
]);

/**
 * Endpoint-sensitive records (mountain/trail/waterfall/shrine/ropeway/
 * viewpoint classification and similar): their catalogue coordinate is
 * often NOT the correct car endpoint. They are preserved as unknown until
 * an explicit road-access endpoint exists; never bulk-promoted. The same
 * deterministic pattern drives the audit cohort E.
 */
const ENDPOINT_SENSITIVE_PATTERN =
  /mountain|summit|peak|trail|trek|hike|ropeway|cable.?car|waterfall|falls?|shrine|temple|jinja|taisha|onse|onsen|hot.?spring|garden|observatory|viewpoint|lighthouse|beach|coast|point|port|harbou?r|dam|gorge|valley|canyon|cave|ruins|castle.?ruins|kofun|mound|museum|zoo|aquarium|stadium|theme.?park|amusement|marina|pier|jetty|trailhead/i;

export function isEndpointSensitive(destination: Destination): boolean {
  return ENDPOINT_SENSITIVE_PATTERN.test(
    `${destination.id} ${destination.name ?? ""}`.toLowerCase(),
  );
}

export interface DefaultCandidateDecision {
  readonly eligible: boolean;
  readonly reason: string;
}

/**
 * Deterministic promotion predicate (analysis + runtime share this).
 * Blocks: non-main-land zones (remote islands / ferry-only), explicit
 * structured negative states (restricted/unavailable/ferry_required/
 * seasonal), boat-only local access, invalid/missing coordinates, and
 * endpoint-sensitive records. `access` is the resolved CarAccess; the
 * caller has already handled `eligibility` restricted/unavailable.
 */
export function isEligibleForDefaultCandidate(
  destination: Destination,
  access: CarAccess,
): DefaultCandidateDecision {
  if (access.eligibility === "restricted") {
    return {
      eligible: false,
      reason: "Explicit car access restriction overrides candidate derivation.",
    };
  }
  if (access.eligibility === "unavailable") {
    return {
      eligible: false,
      reason:
        "Explicit car unavailability (e.g. ferry required, no road access) overrides candidate derivation.",
    };
  }
  if (NEGATIVE_ACCESS_STATES.has(access.state)) {
    return {
      eligible: false,
      reason: `Structured access state "${access.state}" overrides candidate derivation.`,
    };
  }
  const localModes = destination.localAccessModes;
  if (
    Array.isArray(localModes) &&
    localModes.length > 0 &&
    !localModes.includes("car") &&
    (localModes as readonly string[]).some(
      (mode) => mode === "ferry" || mode === "boat",
    )
  ) {
    return {
      eligible: false,
      reason: "Boat/ferry-only local access; no continuous-road candidate.",
    };
  }
  if (!destination.coordinates) {
    return {
      eligible: false,
      reason: "No destination coordinates; nothing can be routed or estimated.",
    };
  }
  const { lat, lng } = destination.coordinates;
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return {
      eligible: false,
      reason:
        "Invalid destination coordinates; nothing can be routed or estimated.",
    };
  }
  const zone = resolveDestinationTransportZone(destination);
  if (!zone || !MAJOR_LAND_TRANSPORT_ZONE_IDS.has(zone)) {
    return {
      eligible: false,
      reason: `Not on a continuous-road major land mass (zone ${zone ?? "unknown"}); no direct-driving candidate.`,
    };
  }
  if (isEndpointSensitive(destination)) {
    return {
      eligible: false,
      reason:
        "Endpoint-sensitive record; preserved as unknown until an explicit road endpoint exists.",
    };
  }
  return {
    eligible: true,
    reason:
      "Ordinary main-land destination with valid coordinates and no explicit negative evidence; authorized as a car-access candidate (attempt/estimate only, never proof).",
  };
}
