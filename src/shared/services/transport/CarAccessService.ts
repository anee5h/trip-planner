import type { Destination } from "@/shared/types/destination";
import type {
  CarAccess,
  CarAccessAnchor,
  CarAccessEligibility,
} from "@/shared/types/carAccess";
import carAccessRecords from "@/shared/data/car-access.json";
import { isEligibleForDefaultCandidate } from "./carAccessCandidatePolicy";

const canonicalRecords = carAccessRecords as Record<string, CarAccess>;

function legacyCompatibleAccess(destination: Destination): CarAccess {
  const hasLegacyCarOption =
    destination.transportOptions?.car !== undefined ||
    destination.transportOptions?.my_car !== undefined;

  if (hasLegacyCarOption) {
    return {
      state: "unknown",
      eligibility: "unknown",
      anchors: [],
      evidence: "legacy_compatibility",
      sourceUrls: [],
      reason:
        "Existing catalogue car support is retained for compatibility, but no canonical access anchor has been verified for personalized routing.",
    };
  }

  if (destination.localAccessModes?.includes("car")) {
    return {
      state: "unknown",
      eligibility: "unknown",
      anchors: [],
      evidence: "catalogue_metadata",
      sourceUrls: [],
      reason:
        "Catalogue records car as a local access mode, but no defensible road endpoint is available.",
    };
  }

  return {
    state: "unknown",
    eligibility: "unknown",
    anchors: [],
    evidence: "none",
    sourceUrls: [],
    reason: "No car-access fact or legacy car option is present.",
  };
}

/**
 * Resolve destination access without routing to the catalogue centroid.
 * Explicit destination data wins over the small source-backed registry; the
 * legacy branch is deliberately marked unknown so later route work can replace
 * it without pretending an anchor exists.
 */
export function getCarAccess(destination: Destination): CarAccess {
  return (
    destination.carAccess ??
    canonicalRecords[destination.id] ??
    legacyCompatibleAccess(destination)
  );
}

export function getCarAccessEligibility(
  destination: Destination,
): CarAccessEligibility {
  return getCarAccess(destination).eligibility;
}

/** True when the destination carries legacy car metadata or lists car locally. */
export function hasCarResolutionEvidence(destination: Destination): boolean {
  return (
    destination.transportOptions?.car !== undefined ||
    destination.transportOptions?.my_car !== undefined ||
    destination.localAccessModes?.includes("car") === true
  );
}

/**
 * Resolution model for personalized car access:
 *
 *   legacy car metadata / localAccessModes
 *                     │
 *                     ▼
 *        candidate for car-access resolution      (unknown until routed)
 *                     │
 *                     ▼
 *        canonical access/routing evidence        (explicit anchors)
 *
 * - explicit — a canonical car-access record with coordinate-bearing
 *   anchor(s); the destination may be routed against those anchors.
 * - candidate — legacy metadata marks the destination worth attempting
 *   road routing; the destination coordinates are used only as a routing
 *   candidate, never as proof of parking or direct road access.
 * - restricted / unavailable — a canonical record explicitly forbids car;
 *   candidate derivation NEVER overrides these.
 * - unknown — no evidence worth attempting (no metadata, or no coordinates
 *   to route against, or an explicit record without routable anchors).
 */
export type CarAccessResolutionKind =
  "explicit" | "candidate" | "restricted" | "unavailable" | "unknown";

export interface CarAccessResolution {
  readonly kind: CarAccessResolutionKind;
  readonly access: CarAccess;
  /** Anchors that MAY be routed against (explicit anchors or the derived candidate). */
  readonly anchors: readonly CarAccessAnchor[];
  /** The derived routing candidate, when kind === "candidate". */
  readonly candidateAnchor?: CarAccessAnchor;
  readonly reason: string;
}

function derivedCandidateAnchor(
  destination: Destination,
): CarAccessAnchor | undefined {
  if (!destination.coordinates) return undefined;
  return {
    id: `${destination.id}@candidate`,
    label: `${destination.name ?? destination.id} — destination coordinates (routing candidate, not a verified parking location)`,
    kind: "documented_endpoint",
    coordinates: destination.coordinates,
    sourceUrls: [],
    notes:
      "Derived candidate: legacy car metadata / local access mode marks this destination worth attempting road routing. A successful route establishes routability to the candidate; it is not proof of on-site parking.",
  };
}

export function resolveCarAccess(
  destination: Destination,
): CarAccessResolution {
  const access = getCarAccess(destination);
  const hasExplicitRecord =
    destination.carAccess !== undefined ||
    canonicalRecords[destination.id] !== undefined;

  // Explicit truth wins over any derivation — including explicit refusal.
  if (access.eligibility === "restricted") {
    return {
      kind: "restricted",
      access,
      anchors: [],
      reason:
        access.reason ??
        "Car access is explicitly restricted for this destination.",
    };
  }
  if (access.eligibility === "unavailable") {
    return {
      kind: "unavailable",
      access,
      anchors: [],
      reason:
        access.reason ??
        "Car access is unavailable (for example ferry required or no road access).",
    };
  }

  const explicit = getCarAccessAnchors(destination).filter(
    (anchor) => anchor.coordinates !== undefined,
  );
  if (hasExplicitRecord) {
    return {
      kind: explicit.length > 0 ? "explicit" : "unknown",
      access,
      anchors: explicit,
      reason:
        access.reason ??
        (explicit.length > 0
          ? "Canonical car-access record with coordinate-bearing anchors."
          : "Canonical record exists but has no coordinate-bearing anchor; nothing can be routed."),
    };
  }

  if (!hasCarResolutionEvidence(destination)) {
    // KAI-264 safe first wave: ordinary main-land destinations with valid
    // coordinates and no explicit negative evidence become resolution
    // candidates (authorizes an attempt/estimate; never proof).
    const decision = isEligibleForDefaultCandidate(destination, access);
    if (decision.eligible) {
      const candidate = derivedCandidateAnchor(destination);
      if (candidate) {
        return {
          kind: "candidate",
          access,
          anchors: [candidate],
          candidateAnchor: candidate,
          reason: decision.reason,
        };
      }
    }
    return {
      kind: "unknown",
      access,
      anchors: [],
      reason: decision.reason,
    };
  }

  const candidate = derivedCandidateAnchor(destination);
  if (!candidate) {
    return {
      kind: "unknown",
      access,
      anchors: [],
      reason:
        "Legacy car metadata exists but no destination coordinates are available for a routing candidate.",
    };
  }
  return {
    kind: "candidate",
    access,
    anchors: [candidate],
    candidateAnchor: candidate,
    reason:
      "Legacy car metadata marks this destination as a car-resolution candidate; routing against destination coordinates may establish routability.",
  };
}

/**
 * Personalized car eligibility requires that the destination is resolvable:
 * an explicit coordinate-bearing anchor, or a derived routing candidate.
 * Legacy metadata alone never proves availability — it only authorizes an
 * ATTEMPT. Explicit restrictions always win.
 */
export function isCarModeEligible(destination: Destination): boolean {
  const kind = resolveCarAccess(destination).kind;
  return kind === "explicit" || kind === "candidate";
}

export function getCarAccessAnchors(
  destination: Destination,
): readonly CarAccessAnchor[] {
  return getCarAccess(destination).anchors;
}

/**
 * Anchors that MAY be routed against: explicit canonical anchors first, then
 * the derived candidate. Respects explicit restrictions and unavailable
 * records (they return no routable anchors).
 */
export function getRoutableCarAccessAnchors(
  destination: Destination,
): readonly CarAccessAnchor[] {
  return resolveCarAccess(destination).anchors;
}
