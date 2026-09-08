import type { PriceRange } from "@/shared/types/planner";
import type { TripEstimateResult } from "./tripEstimateEngine";

export type TransportDisplayUnit =
  "per_person_round_trip" | "per_car_round_trip";

export interface TransportDisplayCost {
  readonly range: PriceRange;
  readonly unit: TransportDisplayUnit;
}

function normalizePartySize(partySize: number): number {
  return Number.isFinite(partySize) && partySize > 0
    ? Math.max(1, Math.floor(partySize))
    : 1;
}

/**
 * Project a canonical trip estimate into the cost shown beside one transport
 * option. TripEstimateResult.total is the whole-trip party total; it must not
 * be rendered as a mode fare. The origin_travel component is the only
 * component whose scope is the transport journey itself.
 */
export function getTransportDisplayCost(
  result: TripEstimateResult | undefined,
  mode: string,
  partySize: number,
): TransportDisplayCost | undefined {
  const originTravel = result?.components.find(
    (component) => component.evidence.scope === "origin_travel",
  );
  if (!originTravel || originTravel.cost.kind !== "bounded") {
    return undefined;
  }

  const isCarMode = mode === "car" || mode === "my_car";
  const divisor = isCarMode ? 1 : normalizePartySize(partySize);
  const range: PriceRange = [
    originTravel.cost.min / divisor,
    originTravel.cost.max / divisor,
  ];
  if (!range.every((value) => Number.isFinite(value) && value >= 0)) {
    return undefined;
  }

  return {
    range,
    unit: isCarMode ? "per_car_round_trip" : "per_person_round_trip",
  };
}
