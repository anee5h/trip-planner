/**
 * KAI-275 follow-up audit: Explore restricted-budget filtering for Personal
 * Car discovery (partial estimates).
 *
 * Reproduces the Explore filter decision for the full catalogue:
 *   BEFORE = old rule: keep iff estimate.total?.max <= tier ceiling
 *   AFTER  = new rule: keep iff affordability state is fits OR partial
 *            (exceeds = complete total above ceiling OR known-subtotal
 *            minimum above ceiling; unknown = no meaningful bounded cost)
 *
 * Reports per-duration counts and the affordability-state distribution for
 * Personal Car + Standard, party size 2 (the exact reported regression).
 */
import destinationsIndex from "@/shared/data/destinations-index.json";
import type { Destination } from "@/shared/types/destination";
import {
  calculateTripEstimate,
  evaluateBudgetAffordability,
} from "@/shared/services/budget/tripEstimateEngine";
import { getPlannerBudgetLimit } from "@/features/home/services/PlannerBudgetPolicy";
import { getValidModes } from "@/shared/services/recommendation/RecommendationScorer";
import type { TripDuration } from "@/shared/types/tripDuration";

const all = destinationsIndex as unknown as Destination[];
const ORIGIN = { lat: 35.514745, lng: 139.539692 }; // Yokohama Station area
const PARTY = 2;

const DURATIONS: TripDuration[] = ["halfDay", "fullDay", "2d1n", "3d2n"];

interface Row {
  duration: string;
  before: number;
  after: number;
  fits: number;
  partial: number;
  exceeds: number;
  unknown: number;
}

function estimateFor(dest: Destination, duration: TripDuration) {
  return calculateTripEstimate({
    dest,
    mode: "my_car",
    partySize: PARTY,
    homeCoords: ORIGIN,
    includeOriginTravel: true,
    duration,
  });
}

const rows: Row[] = [];
for (const duration of DURATIONS) {
  const modes = ["my_car", "car"];
  const tierLimit = getPlannerBudgetLimit("standard", PARTY, duration);
  let before = 0;
  let after = 0;
  const states = { fits: 0, partial: 0, exceeds: 0, unknown: 0 };
  for (const dest of all) {
    // Personal-Car-only eligibility (the resolved car universe).
    const valid = getValidModes(
      dest,
      "my_car",
      [],
      ORIGIN,
      undefined,
      "mainland-honshu",
    );
    const carValid = valid.some((m) => modes.includes(m));
    if (!carValid) continue;
    const estimate = estimateFor(dest, duration);
    const oldKeep =
      estimate.total !== undefined && estimate.total.max <= tierLimit;
    if (oldKeep) before += 1;
    const state = evaluateBudgetAffordability(estimate, tierLimit);
    states[state] += 1;
    if (state === "fits" || state === "partial") after += 1;
  }
  rows.push({ duration, before, after, ...states });
}

console.log(
  JSON.stringify(
    {
      origin: "Yokohama Station area",
      tier: "standard",
      partySize: PARTY,
      rows,
    },
    null,
    2,
  ),
);
