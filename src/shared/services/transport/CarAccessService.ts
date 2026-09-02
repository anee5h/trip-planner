import type { Destination } from "@/shared/types/destination";
import type {
  CarAccess,
  CarAccessAnchor,
  CarAccessEligibility,
} from "@/shared/types/carAccess";
import carAccessRecords from "@/shared/data/car-access.json";

const canonicalRecords = carAccessRecords as Record<string, CarAccess>;

function legacyCompatibleAccess(destination: Destination): CarAccess {
  const hasLegacyCarOption =
    destination.transportOptions?.car !== undefined ||
    destination.transportOptions?.my_car !== undefined;

  if (hasLegacyCarOption) {
    return {
      state: "unknown",
      eligibility: "eligible",
      anchors: [],
      evidence: "legacy_compatibility",
      sourceUrls: [],
      reason:
        "Existing catalogue car support is retained for compatibility, but no canonical access anchor has been verified yet.",
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

/** Eligibility is not route availability: a legacy-compatible record may be
 * selectable while its route duration remains unknown until KAI-226. */
export function isCarModeEligible(destination: Destination): boolean {
  return getCarAccessEligibility(destination) === "eligible";
}

export function getCarAccessAnchors(
  destination: Destination,
): readonly CarAccessAnchor[] {
  return getCarAccess(destination).anchors;
}

export function getRoutableCarAccessAnchors(
  destination: Destination,
): readonly CarAccessAnchor[] {
  return getCarAccessAnchors(destination).filter(
    (anchor) => anchor.coordinates !== undefined,
  );
}
