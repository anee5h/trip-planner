export interface TripPartyComposition {
  partySize: number;
  childCount?: number;
}

/** Return the child count only when it is a valid split of the live party. */
export function resolveChildCount({
  partySize,
  childCount,
}: TripPartyComposition): number | undefined {
  if (
    !Number.isSafeInteger(partySize) ||
    partySize < 1 ||
    !Number.isSafeInteger(childCount) ||
    childCount! < 0 ||
    childCount! > partySize
  ) {
    return undefined;
  }
  return childCount;
}
