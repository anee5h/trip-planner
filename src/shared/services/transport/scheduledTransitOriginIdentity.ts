/**
 * Reviewed product identities that may be carried from an explicit station
 * picker selection into scheduled transit. This is intentionally not a label,
 * coordinate, or nearest-station resolver.
 */
export const SCHEDULED_TRANSIT_ORIGIN_PRODUCT_BY_EXACT_STATION = {
  "Tokyo::Shinjukunishiguchi Station (新宿西口駅)":
    "toei-oedo-shinjuku-nishiguchi",
} as const;

export type ScheduledTransitOriginProductId =
  (typeof SCHEDULED_TRANSIT_ORIGIN_PRODUCT_BY_EXACT_STATION)[keyof typeof SCHEDULED_TRANSIT_ORIGIN_PRODUCT_BY_EXACT_STATION];

export function getScheduledTransitOriginProductIdForExactStation(input: {
  readonly prefecture: string;
  readonly stationName: string;
}): ScheduledTransitOriginProductId | undefined {
  return SCHEDULED_TRANSIT_ORIGIN_PRODUCT_BY_EXACT_STATION[
    `${input.prefecture}::${input.stationName}` as keyof typeof SCHEDULED_TRANSIT_ORIGIN_PRODUCT_BY_EXACT_STATION
  ];
}
