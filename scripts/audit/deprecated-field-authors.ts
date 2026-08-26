/**
 * KAI-218A — deprecated generic budget-field authoring ratchet.
 *
 * The KAI-218 retirement contract (DEPRECATION.md): the generic
 * budgetMin/budgetRecommended/budgetMax + budgetBreakdown.{transport,food,
 * cafe} fields must stop being AUTHORED in new/changed production data.
 * New destinations must use the scoped v2 cost facts (admission /
 * localTransport) instead.
 *
 * This module counts how many catalogue records still AUTHOR the deprecated
 * fields. The companion check (check-deprecated-fields.ts) compares the
 * count against a committed baseline (scripts/audit/deprecated-fields-
 * baseline.json) with SHRINK-ONLY semantics — the count can only stay flat
 * or decrease; any growth is a CI failure (new debt).
 *
 * Deliberately counts RECORDS (not field occurrences): a record that
 * authors any deprecated field is one unit of debt. KAI-218's migration
 * drains this to 0 as records convert to scoped facts.
 */

import type { Destination } from "../../src/shared/types/destination";

export interface DeprecatedFieldCounts {
  /** Records authoring any of budgetMin/budgetRecommended/budgetMax. */
  readonly rangeWriters: number;
  /** Records authoring budgetBreakdown.{transport,food,cafe}. */
  readonly breakdownWriters: number;
  /** Records authoring transport or food or cafe (the KAI-218 targets). */
  readonly transportOrFoodOrCafeWriters: number;
  /** Total records in the scanned set. */
  readonly total: number;
}

export function countDeprecatedFieldAuthors(
  destinations: readonly Destination[],
): DeprecatedFieldCounts {
  let rangeWriters = 0;
  let breakdownWriters = 0;
  let transportOrFoodOrCafeWriters = 0;

  for (const dest of destinations) {
    const hasRange =
      dest.budgetMin !== undefined ||
      dest.budgetRecommended !== undefined ||
      dest.budgetMax !== undefined;
    const bd = dest.budgetBreakdown;
    const hasBreakdown =
      bd != null &&
      (bd.transport !== undefined ||
        bd.food !== undefined ||
        bd.cafe !== undefined);
    const hasTransportOrFoodOrCafe =
      bd != null &&
      (bd.transport !== undefined ||
        bd.food !== undefined ||
        bd.cafe !== undefined);

    if (hasRange) rangeWriters += 1;
    if (hasBreakdown) breakdownWriters += 1;
    if (hasTransportOrFoodOrCafe) transportOrFoodOrCafeWriters += 1;
  }

  return {
    rangeWriters,
    breakdownWriters,
    transportOrFoodOrCafeWriters,
    total: destinations.length,
  };
}
