/**
 * Overnight Explore browse-vs-recommendation audit (Nakayama origin).
 *
 * BEFORE = old Explore funnel: origin-local → valid mode → minutes defined
 *          → evaluateWeekendTravelFit eligible → evaluateWeekendCapacity
 *          eligible → consolidation (areas only).
 * AFTER  = new Explore BROWSE policy: origin-local → valid mode → trip-date
 *          ferry coverage → consolidation. Travel time and capacity are
 *          ranking signals, never browse exclusions.
 *
 * Reports sequential funnel counts for overnight durations and per-city
 * outcome. Day durations (halfDay/fullDay) use the day-trip path and are
 * listed for context only.
 */
import destinationsIndex from "@/shared/data/destinations-index.json";
import type { Destination } from "@/shared/types/destination";
import { getValidModes } from "@/shared/services/recommendation/RecommendationScorer";
import { getBestOneWayTravelMinutes } from "@/shared/services/recommendation/TripDurationService";
import {
  evaluateWeekendTravelFit,
  evaluateWeekendCapacity,
  hasOvernightWorthyWeekendSemantics,
} from "@/shared/services/recommendation/WeekendPolicy";
import {
  classifyWeekendResultCandidate,
  consolidateWeekendAreas,
} from "@/shared/services/recommendation/WeekendAreaPolicy";
import type { TripDuration } from "@/shared/types/tripDuration";

const all = destinationsIndex as unknown as Destination[];
// Nakayama Station, Kanagawa (JR Yokohama Line / subway Green Line).
const ORIGIN = { lat: 35.5192, lng: 139.5393 };
const ZONE = "mainland-honshu";

const CAR_MODES = ["my_car", "car"];
const WATCH = [
  "nagoya-city",
  "osaka-city",
  "kyoto-city",
  "hakone-town",
  "karuizawa-town",
  "sendai-city",
  "niigata-city",
];

function fmt(n: number | undefined): string {
  return n === undefined ? "undefined" : String(Math.round(n));
}

interface Funnel {
  recEligible: number;
  carEligible: number;
  minutesDefined: number;
  oldTravelFit: number;
  oldCapacity: number;
  oldConsolidatedAreas: number;
  newBrowse: number;
  newConsolidatedAreas: number;
}

function evaluate(duration: TripDuration): Funnel {
  const funnel: Funnel = {
    recEligible: 0,
    carEligible: 0,
    minutesDefined: 0,
    oldTravelFit: 0,
    oldCapacity: 0,
    oldConsolidatedAreas: 0,
    newBrowse: 0,
    newConsolidatedAreas: 0,
  };
  const gateReason: Record<string, string> = {};
  let oldPassed: Destination[] = [];
  let newPassed: Destination[] = [];
  for (const dest of all) {
    if (dest.recommendationEligible === false) continue;
    funnel.recEligible += 1;
    const modes = getValidModes(dest, "my_car", [], ORIGIN, undefined, ZONE);
    const carValid = modes.some((m) => CAR_MODES.includes(m));
    if (!carValid) {
      gateReason[dest.id] = "no_car_mode";
      continue;
    }
    funnel.carEligible += 1;
    // AFTER: browse eligibility = valid mode (+ consolidation later).
    newPassed.push(dest);
    // BEFORE: old recommender funnel.
    const minutes = getBestOneWayTravelMinutes(
      dest,
      { homeStationCoords: ORIGIN, originZoneId: ZONE },
      modes,
    );
    if (minutes === undefined) {
      gateReason[dest.id] = "minutes_undefined";
      continue;
    }
    funnel.minutesDefined += 1;
    const fit = evaluateWeekendTravelFit(minutes, {
      overnightWorthy: hasOvernightWorthyWeekendSemantics(dest, all),
    });
    if (!fit.eligible) {
      gateReason[dest.id] = `travel_fit_${fit.band}_${fmt(minutes)}m`;
      continue;
    }
    funnel.oldTravelFit += 1;
    const capacity = evaluateWeekendCapacity(dest, all, duration);
    if (!capacity.eligible) {
      gateReason[dest.id] =
        `capacity_${capacity.reason}_${capacity.activityMinutes}m`;
      continue;
    }
    funnel.oldCapacity += 1;
    oldPassed.push(dest);
  }
  funnel.oldConsolidatedAreas = consolidateWeekendAreas(
    oldPassed,
    all,
  ).areas.length;
  funnel.newConsolidatedAreas = consolidateWeekendAreas(
    newPassed,
    all,
  ).areas.length;
  funnel.newBrowse = newPassed.length;
  (funnel as Funnel & { reasons: Record<string, string> }).reasons = gateReason;
  return funnel;
}

/** Full-browse surface: children and standalone POIs are now directly
 *  accessible in the overnight grid (not only via hub drill-in). */
function browseStats() {
  const carValid = all.filter(
    (d) =>
      d.recommendationEligible !== false &&
      getValidModes(d, "my_car", [], ORIGIN, undefined, ZONE).some((m) =>
        CAR_MODES.includes(m),
      ),
  );
  const cons = consolidateWeekendAreas(carValid, all);
  return {
    fullBrowseRecords: carValid.length,
    areaCards: cons.areas.length,
    childPoisInBrowse: carValid.filter(
      (d) => d.relationships?.parentDestinationId !== undefined,
    ).length,
    standalonePoisInBrowse: carValid.filter(
      (d) =>
        d.relationships?.parentDestinationId === undefined &&
        classifyWeekendResultCandidate(d, all).kind === "poi",
    ).length,
    publishedPlacesAcrossAreas: cons.totalPlaceCount,
  };
}

async function main() {
  const durations: TripDuration[] = ["2d1n", "3d2n"];
  for (const duration of durations) {
    const funnel = evaluate(duration);
    const reasons = (funnel as Funnel & { reasons: Record<string, string> })
      .reasons;
    const areas = consolidateWeekendAreas(
      all.filter((d) => {
        if (d.recommendationEligible === false) return false;
        return getValidModes(d, "my_car", [], ORIGIN, undefined, ZONE).some(
          (m) => CAR_MODES.includes(m),
        );
      }),
      all,
    ).areas;
    console.log(`\n=== duration=${duration} ===`);
    console.log(
      JSON.stringify({
        ...browseStats(),
        recEligible: funnel.recEligible,
        carEligible: funnel.carEligible,
        minutesDefined: funnel.minutesDefined,
        old_travelFit: funnel.oldTravelFit,
        old_capacity: funnel.oldCapacity,
        old_consolidatedAreas: funnel.oldConsolidatedAreas,
        new_browseEligible: funnel.newBrowse,
        new_consolidatedAreas: funnel.newConsolidatedAreas,
      }),
    );
    for (const id of WATCH) {
      const dest = all.find((d) => d.id === id);
      if (!dest) {
        console.log(`${id}: NOT IN CATALOGUE`);
        continue;
      }
      const minutes = getBestOneWayTravelMinutes(
        dest,
        { homeStationCoords: ORIGIN, originZoneId: ZONE },
        ["my_car"],
      );
      const capacity = evaluateWeekendCapacity(dest, all, duration);
      const kind = classifyWeekendResultCandidate(dest, all).kind;
      const oldReason = reasons[id] ?? "passed_all_old_gates";
      const browse = areas.some((a) => a.id === id);
      console.log(
        `${id}: oldReason=${oldReason} | newBrowse=${browse ? "YES" : "no"} | minutes=${fmt(minutes)} | capacity=${capacity.activityMinutes}m(${capacity.reason}) | kind=${kind}`,
      );
    }
  }
}

main().catch((e) => {
  console.error("AUDIT_ERROR:", e);
  process.exit(1);
});
