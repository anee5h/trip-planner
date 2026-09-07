import type {
  Journey,
  JourneyExternalMode,
  JourneyHandoffCapability,
} from "@/shared/types/journey";
import type { TransportMode } from "./types";

export interface JourneyHandoff {
  readonly href: string;
  readonly externalMode: JourneyExternalMode;
  readonly internalMode: TransportMode;
  readonly origin: { readonly lat: number; readonly lng: number };
  readonly destination: { readonly lat: number; readonly lng: number };
}

export function journeyHandoffCapabilityForMode(
  mode: TransportMode,
  completeness: Journey["completeness"],
  availability: Journey["availability"],
): JourneyHandoffCapability {
  if (completeness !== "complete") {
    return {
      supported: false,
      reason:
        completeness === "partial" ? "partial_journey" : "unavailable_journey",
    };
  }
  if (availability !== "available") {
    return { supported: false, reason: "unavailable_journey" };
  }
  if (mode === "car" || mode === "my_car") {
    return { supported: true, mode: "driving" };
  }
  if (mode === "train" || mode === "shinkansen" || mode === "bus") {
    return { supported: true, mode: "transit" };
  }
  return { supported: false, reason: "unsupported_mode" };
}

/** Build the only external directions URL from the canonical Journey. */
export function buildJourneyHandoff(journey: Journey): JourneyHandoff | null {
  const firstLeg = journey.legs[0];
  if (!firstLeg) return null;
  const capability = journeyHandoffCapabilityForMode(
    firstLeg.mode,
    journey.completeness,
    journey.availability,
  );
  if (!capability.supported || !capability.mode) return null;
  const origin = journey.origin.coordinates;
  const destination = journey.destination.coordinates;
  if (!origin || !destination) return null;

  const originValue = `${origin.lat},${origin.lng}`;
  const destinationValue = `${destination.lat},${destination.lng}`;
  return {
    href:
      `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(originValue)}` +
      `&destination=${encodeURIComponent(destinationValue)}&travelmode=${capability.mode}`,
    externalMode: capability.mode,
    internalMode: firstLeg.mode,
    origin,
    destination,
  };
}
