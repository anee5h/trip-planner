import type { PriceRange } from "@/shared/types/planner";
import type { BudgetReasonCode } from "@/shared/types/destination";
import type { TripEstimateResult } from "./tripEstimateEngine";

export type TransportDisplayUnit =
  "per_person_round_trip" | "per_car_round_trip";

export interface CompleteTransportDisplayCost {
  readonly range: PriceRange;
  readonly unit: TransportDisplayUnit;
  readonly completeness: "complete";
}

export interface PartialTransportDisplayCost {
  readonly range: PriceRange;
  readonly unit: TransportDisplayUnit;
  readonly completeness: "partial";
  readonly reason?: BudgetReasonCode;
}

export interface UnavailableTransportDisplayCost {
  readonly unit: TransportDisplayUnit;
  readonly completeness: "unavailable";
  readonly reason?: BudgetReasonCode;
}

export type TransportDisplayCost =
  | CompleteTransportDisplayCost
  | PartialTransportDisplayCost
  | UnavailableTransportDisplayCost;

function normalizePartySize(partySize: number): number {
  return Number.isFinite(partySize) && partySize > 0
    ? Math.max(1, Math.floor(partySize))
    : 1;
}

function validRange(range: readonly [number, number]): boolean {
  return (
    range.length === 2 &&
    Number.isFinite(range[0]) &&
    Number.isFinite(range[1]) &&
    range[0] >= 0 &&
    range[1] >= range[0]
  );
}

/**
 * Project a canonical trip estimate into the cost shown beside one transport
 * option. TripEstimateResult.total is the whole-trip party total; it must not
 * be rendered as a mode fare. The origin_travel component is the only
 * component whose scope is the transport journey itself.
 *
 * A component with an unavailable primary cost may still carry a bounded
 * `knownCost` (currently the car subtotal when toll is unknown). That subtotal
 * is explicitly partial and never presented as a complete trip price.
 */
export function getTransportDisplayCost(
  result: TripEstimateResult | undefined,
  mode: string,
  partySize: number,
): TransportDisplayCost | undefined {
  const originTravel = result?.components.find(
    (component) => component.evidence.scope === "origin_travel",
  );
  if (!originTravel) return undefined;

  const isCarMode = mode === "car" || mode === "my_car";
  const unit: TransportDisplayUnit = isCarMode
    ? "per_car_round_trip"
    : "per_person_round_trip";
  const divisor = isCarMode ? 1 : normalizePartySize(partySize);
  const asDisplayRange = (
    range: readonly [number, number] | undefined,
  ): PriceRange | undefined => {
    if (!range || !validRange(range)) return undefined;
    const displayRange: PriceRange = [range[0] / divisor, range[1] / divisor];
    return displayRange.every((value) => Number.isFinite(value) && value >= 0)
      ? displayRange
      : undefined;
  };

  if (originTravel.cost.kind === "bounded") {
    const range = asDisplayRange([
      originTravel.cost.min,
      originTravel.cost.max,
    ]);
    return range
      ? { range, unit, completeness: "complete" }
      : { unit, completeness: "unavailable", reason: "source_missing" };
  }

  const knownRange =
    originTravel.knownCost?.kind === "bounded"
      ? asDisplayRange([originTravel.knownCost.min, originTravel.knownCost.max])
      : undefined;
  if (knownRange) {
    return {
      range: knownRange,
      unit,
      completeness: "partial",
      ...(originTravel.evidence.reason
        ? { reason: originTravel.evidence.reason }
        : {}),
    };
  }

  return {
    unit,
    completeness: "unavailable",
    ...(originTravel.evidence.reason
      ? { reason: originTravel.evidence.reason }
      : {}),
  };
}
