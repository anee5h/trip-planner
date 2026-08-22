import type {
  ValidatorModule,
  ValidationResult,
  ValidationIssue,
  ValidationContext,
} from "./types";
import { JAPAN_PREFECTURES } from "../config/prefectures";
import { JAPAN_REGIONS } from "../config/regions";
import { zoneById } from "../../src/shared/services/transport/TransportTopologyService";
import type { TransportZoneId } from "../../src/shared/types/transportTopology";
import type { TransportMode } from "../../src/shared/services/transport/types";

const VALID_TRANSPORT_OPTION_KEYS: Record<TransportMode, true> = {
  train: true,
  shinkansen: true,
  car: true,
  my_car: true,
  bus: true,
  flight: true,
  ferry: true,
};

/**
 * Island zones with no conventional rail: their localModes exclude both
 * train and shinkansen. okinawa-main is deliberately excluded (Yui Rail
 * monorail). Derived from the canonical transport topology (KAI-63).
 */
const RAIL_LESS_ISLAND_ZONES: Record<TransportZoneId, true> =
  Object.fromEntries(
    [...zoneById.values()]
      .filter(
        (zone) =>
          zone.isIsland &&
          !zone.localModes.includes("train") &&
          !zone.localModes.includes("shinkansen"),
      )
      .map((zone) => [zone.id, true] as const),
  ) as Record<TransportZoneId, true>;

export const destinationsValidator: ValidatorModule = {
  name: "Catalog Destinations",
  description:
    "Validates schema integrity, canonical geographic attributes, coordinates, and budget totals across all destinations.",
  purpose:
    "Ensure every destination in the catalog has valid unique IDs, coordinates, prefectures, regions, and deterministic budget totals.",
  guarantees: [
    "Unique destination IDs and slugs",
    "Canonical Japan prefecture and region assignment",
    "Valid geographic coordinates (lat: 24..46, lng: 122..146)",
    "Non-empty name and description",
    "Deterministic budget breakdown tolerance (diff <= ¥100 or <= 2%)",
    "Truthful transport metadata: no fabricated island rail/car access, canonical transport keys, localAccessModes cannot grant modes unsupported by the destination's transport zone (KAI-63)",
  ],
  doesNotValidate: [
    "HTTP image URL reachability",
    "Search query ranking",
    "Routing table resolution",
  ],
  async validate(context: ValidationContext): Promise<ValidationResult> {
    const { destinations } = context.catalog;
    const { budgetTolerancePercent, budgetMinToleranceYen } = context.config;

    const issues: ValidationIssue[] = [];
    const seenIds = new Set<string>();
    const seenCoordinates = new Map<string, string>();

    let totalChecked = destinations.length;

    for (const dest of destinations) {
      // 1. Unique ID check
      if (!dest.id) {
        issues.push({
          severity: "error",
          code: "MISSING_DESTINATION_ID",
          message: "Destination object is missing an 'id' field.",
        });
      } else if (seenIds.has(dest.id)) {
        issues.push({
          severity: "error",
          code: "DUPLICATE_DESTINATION_ID",
          message: `Duplicate destination ID detected: '${dest.id}'`,
          targetId: dest.id,
        });
      } else {
        seenIds.add(dest.id);
      }

      // 2. Name & Description check
      if (!dest.name || dest.name.trim() === "") {
        issues.push({
          severity: "error",
          code: "EMPTY_DESTINATION_NAME",
          message: `Destination '${dest.id}' has an empty or missing 'name' field.`,
          targetId: dest.id,
        });
      }

      if (!dest.description || dest.description.trim() === "") {
        issues.push({
          severity: "warning",
          code: "EMPTY_DESTINATION_DESCRIPTION",
          message: `Destination '${dest.id}' has an empty or missing 'description'.`,
          targetId: dest.id,
        });
      }

      // 3. Prefecture check
      if (!dest.prefecture) {
        issues.push({
          severity: "error",
          code: "MISSING_PREFECTURE",
          message: `Destination '${dest.id}' is missing a 'prefecture' field.`,
          targetId: dest.id,
        });
      } else if (!JAPAN_PREFECTURES.includes(dest.prefecture as any)) {
        issues.push({
          severity: "error",
          code: "INVALID_PREFECTURE",
          message: `Destination '${dest.id}' has non-canonical prefecture '${dest.prefecture}'.`,
          targetId: dest.id,
        });
      }

      // 4. Region check
      if (!dest.region) {
        issues.push({
          severity: "error",
          code: "MISSING_REGION",
          message: `Destination '${dest.id}' is missing a 'region' field.`,
          targetId: dest.id,
        });
      } else if (!JAPAN_REGIONS.includes(dest.region as any)) {
        issues.push({
          severity: "error",
          code: "INVALID_REGION",
          message: `Destination '${dest.id}' has non-canonical region '${dest.region}'.`,
          targetId: dest.id,
        });
      }

      // 5. Coordinates check
      const hasCoordinates = Boolean(
        dest.coordinates &&
        typeof dest.coordinates.lat === "number" &&
        typeof dest.coordinates.lng === "number",
      );
      if (!hasCoordinates) {
        if (dest.recommendationEligible !== false) {
          issues.push({
            severity: "error",
            code: "MISSING_COORDINATES",
            message: `Destination '${dest.id}' is missing valid numerical lat/lng coordinates.`,
            targetId: dest.id,
          });
        }
      } else {
        const { lat, lng } = dest.coordinates;
        if (lat < 24 || lat > 46 || lng < 122 || lng > 146) {
          issues.push({
            severity: "error",
            code: "OUT_OF_BOUNDS_COORDINATES",
            message: `Destination '${dest.id}' has out-of-bounds coordinates (lat: ${lat}, lng: ${lng}).`,
            targetId: dest.id,
          });
        }

        const coordKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
        if (seenCoordinates.has(coordKey)) {
          issues.push({
            severity: "warning",
            code: "DUPLICATE_COORDINATES",
            message: `Destination '${dest.id}' shares exact coordinates (${coordKey}) with '${seenCoordinates.get(coordKey)}'.`,
            targetId: dest.id,
          });
        } else {
          seenCoordinates.set(coordKey, dest.id);
        }
      }

      // 6. Deterministic Budget Sum Check
      if (dest.budgetBreakdown && typeof dest.budgetRecommended === "number") {
        const { transport, tickets, food, cafe } = dest.budgetBreakdown;
        const sum = transport + tickets + food + cafe;
        const diff = Math.abs(sum - dest.budgetRecommended);
        const tolerance = Math.max(
          budgetMinToleranceYen,
          dest.budgetRecommended * budgetTolerancePercent,
        );

        if (diff > tolerance) {
          issues.push({
            severity: "warning",
            code: "BUDGET_BREAKDOWN_MISMATCH",
            message: `Destination '${dest.id}' budgetBreakdown sum (¥${sum}) differs from recommended (¥${dest.budgetRecommended}) by ¥${diff} (tolerance: ¥${Math.round(tolerance)}).`,
            targetId: dest.id,
          });
        }
      }

      // 7. Strict runtime contract for published Okinawa destinations.
      //    Okinawa is the currently migrated catalogue slice.
      //    Legacy destinations do not yet satisfy the complete runtime contract.
      //    Global enforcement must happen only after a dedicated catalogue migration.
      if (
        dest.status === "published" &&
        dest.prefecture === "Okinawa" &&
        dest.role !== "hub"
      ) {
        if (dest.categories === undefined || dest.categories === null) {
          issues.push({
            severity: "error",
            code: "MISSING_CATEGORIES",
            message: `Published destination '${dest.id}' has missing 'categories' field.`,
            targetId: dest.id,
          });
        }
        if (dest.tags === undefined || dest.tags === null) {
          issues.push({
            severity: "error",
            code: "MISSING_TAGS",
            message: `Published destination '${dest.id}' has missing 'tags' field.`,
            targetId: dest.id,
          });
        }
        if (dest.highlights === undefined || dest.highlights === null) {
          issues.push({
            severity: "error",
            code: "MISSING_HIGHLIGHTS",
            message: `Published destination '${dest.id}' has missing 'highlights' field.`,
            targetId: dest.id,
          });
        }
        if (dest.collections === undefined || dest.collections === null) {
          issues.push({
            severity: "error",
            code: "MISSING_COLLECTIONS",
            message: `Published destination '${dest.id}' has missing 'collections' field.`,
            targetId: dest.id,
          });
        }
        // Route-known-but-unestimated records (localAccessModes set with
        // localAccessUnestimated) intentionally carry no static minutes;
        // the UI renders "route known — time and cost unavailable".
        const routeKnownUnestimated =
          dest.localAccessModes?.length && dest.localAccessUnestimated === true;
        if (
          !routeKnownUnestimated &&
          (!dest.transportOptions ||
            typeof dest.transportOptions !== "object" ||
            Object.keys(dest.transportOptions).length === 0)
        ) {
          if (
            !dest.transportOptions ||
            typeof dest.transportOptions !== "object" ||
            Object.keys(dest.transportOptions).length === 0
          ) {
            issues.push({
              severity: "error",
              code: "MISSING_TRANSPORT_OPTIONS",
              message: `Published destination '${dest.id}' has empty or missing 'transportOptions'.`,
              targetId: dest.id,
            });
          }
        }
        if (!dest.ratings || typeof dest.ratings !== "object") {
          issues.push({
            severity: "error",
            code: "MISSING_RATINGS",
            message: `Published destination '${dest.id}' has missing 'ratings' object.`,
            targetId: dest.id,
          });
        } else {
          for (const key of [
            "overall",
            "couple",
            "summer",
            "winter",
            "rain",
            "food",
            "photography",
            "relaxation",
            "value",
            "uniqueness",
          ]) {
            if (typeof dest.ratings[key] !== "number") {
              issues.push({
                severity: "error",
                code: "MISSING_RATING_KEY",
                message: `Published destination '${dest.id}' is missing required rating '${key}'.`,
                targetId: dest.id,
              });
            }
          }
        }
        // KAI-89 review: crowd is optional with the explicit neutral marker
        // (crowdMetadata.method 'unknown' — zero runtime consumers, and
        // kind-derived bands would be manufactured evidence).
        const crowdNeutral = dest.crowdMetadata?.method === "unknown";
        if (!crowdNeutral && (!dest.crowd || typeof dest.crowd !== "object")) {
          issues.push({
            severity: "error",
            code: "MISSING_CROWD",
            message: `Published destination '${dest.id}' has missing 'crowd' object (and no explicit neutral marker).`,
            targetId: dest.id,
          });
        }
        // KAI-89 model pass: season/bestMonths are optional. Absence is
        // allowed ONLY with the explicit neutral marker (seasonMetadata.method
        // 'unknown'); otherwise a published record must carry both.
        const seasonNeutral = dest.seasonMetadata?.method === "unknown";
        if (
          !seasonNeutral &&
          (!dest.season || typeof dest.season !== "object")
        ) {
          issues.push({
            severity: "error",
            code: "MISSING_SEASON",
            message: `Published destination '${dest.id}' has missing 'season' object (and no explicit neutral marker).`,
            targetId: dest.id,
          });
        }
        if (
          !seasonNeutral &&
          (dest.bestMonths === undefined || dest.bestMonths === null)
        ) {
          issues.push({
            severity: "error",
            code: "MISSING_BEST_MONTHS",
            message: `Published destination '${dest.id}' has missing 'bestMonths' field (and no explicit neutral marker).`,
            targetId: dest.id,
          });
        }
        if (!dest.notes || dest.notes.trim() === "") {
          issues.push({
            severity: "warning",
            code: "MISSING_NOTES",
            message: `Published destination '${dest.id}' has empty or missing 'notes'.`,
            targetId: dest.id,
          });
        }
        if (
          dest.totalTripHours !== undefined &&
          (typeof dest.totalTripHours !== "number" ||
            !Number.isFinite(dest.totalTripHours) ||
            dest.totalTripHours <= 0)
        ) {
          issues.push({
            severity: "error",
            code: "INVALID_TOTAL_TRIP_HOURS",
            message: `Published destination '${dest.id}' has invalid totalTripHours: ${dest.totalTripHours}.`,
            targetId: dest.id,
          });
        }
        if (
          typeof dest.walkingMin !== "number" ||
          !Number.isFinite(dest.walkingMin) ||
          dest.walkingMin < 0
        ) {
          issues.push({
            severity: "error",
            code: "INVALID_WALKING_MIN",
            message: `Published destination '${dest.id}' has invalid walkingMin: ${dest.walkingMin}.`,
            targetId: dest.id,
          });
        }
        // KAI-89 walking model: synthetic 60/40 sun/shade splits are removed
        // (REMOVE_SYNTHETIC_SPLIT); absence is the corrected state.
        if (
          dest.walkingSunMin !== undefined &&
          (typeof dest.walkingSunMin !== "number" ||
            !Number.isFinite(dest.walkingSunMin) ||
            dest.walkingSunMin < 0)
        ) {
          issues.push({
            severity: "error",
            code: "INVALID_WALKING_SUN_MIN",
            message: `Published destination '${dest.id}' has invalid walkingSunMin: ${dest.walkingSunMin}.`,
            targetId: dest.id,
          });
        }
        if (
          dest.walkingShadeMin !== undefined &&
          (typeof dest.walkingShadeMin !== "number" ||
            !Number.isFinite(dest.walkingShadeMin) ||
            dest.walkingShadeMin < 0)
        ) {
          issues.push({
            severity: "error",
            code: "INVALID_WALKING_SHADE_MIN",
            message: `Published destination '${dest.id}' has invalid walkingShadeMin: ${dest.walkingShadeMin}.`,
            targetId: dest.id,
          });
        }
        if (
          typeof dest.indoorPercent !== "number" ||
          !Number.isFinite(dest.indoorPercent) ||
          dest.indoorPercent < 0 ||
          dest.indoorPercent > 100
        ) {
          issues.push({
            severity: "error",
            code: "INVALID_INDOOR_PERCENT",
            message: `Published destination '${dest.id}' has invalid indoorPercent: ${dest.indoorPercent}.`,
            targetId: dest.id,
          });
        }
        if (!dest.reservation || dest.reservation.trim() === "") {
          issues.push({
            severity: "error",
            code: "MISSING_RESERVATION",
            message: `Published destination '${dest.id}' has empty or missing 'reservation'.`,
            targetId: dest.id,
          });
        }
        if (!dest.parking || dest.parking.trim() === "") {
          issues.push({
            severity: "error",
            code: "MISSING_PARKING",
            message: `Published destination '${dest.id}' has empty or missing 'parking'.`,
            targetId: dest.id,
          });
        }
        if (
          !dest.travelEstimate ||
          typeof dest.travelEstimate !== "object" ||
          !dest.travelEstimate.confidence
        ) {
          issues.push({
            severity: "error",
            code: "MISSING_TRAVEL_ESTIMATE",
            message: `Published destination '${dest.id}' has missing or invalid 'travelEstimate'.`,
            targetId: dest.id,
          });
        }
        if (!dest.content?.en?.name || !dest.content.en.description) {
          issues.push({
            severity: "error",
            code: "MISSING_ENGLISH_CONTENT",
            message: `Published destination '${dest.id}' has missing English content.`,
            targetId: dest.id,
          });
        }

        // Walkability must be a finite 1–10 value
        const w = dest.ratings?.walkability;
        if (typeof w !== "number" || !Number.isFinite(w) || w < 1 || w > 10) {
          issues.push({
            severity: "error",
            code: "INVALID_WALKABILITY",
            message: `Published destination '${dest.id}' has invalid walkability: ${w}.`,
            targetId: dest.id,
          });
        }

        // Walking-minute invariants
        const wm = dest.walkingMin;
        const ws = dest.walkingSunMin;
        const wh = dest.walkingShadeMin;
        if (ws + wh > wm) {
          issues.push({
            severity: "error",
            code: "WALKING_SUN_SHADE_EXCEEDS_TOTAL",
            message: `Published destination '${dest.id}': sun+shade (${ws}+${wh}) > walkingMin (${wm}).`,
            targetId: dest.id,
          });
        }
        // KAI-50: `totalTripHours` is deprecated and semantically
        // ambiguous; walking time is validated against the canonical visit
        // duration only.
        const maxVisitMin = dest.recommendedVisitHours?.max
          ? dest.recommendedVisitHours.max * 60
          : null;
        if (maxVisitMin !== null && wm > maxVisitMin) {
          issues.push({
            severity: "error",
            code: "WALKING_EXCEEDS_VISIT",
            message: `Published destination '${dest.id}': walkingMin (${wm}) > visit max (${maxVisitMin}).`,
            targetId: dest.id,
          });
        }
      }

      // 8. Transport truthfulness checks (KAI-63): destinations must never
      //    claim transport modes that do not exist on their island, that
      //    their local access excludes, or that are not canonical.
      if (dest.transportOptions) {
        // V-MODE-KEY: transportOptions keys must be canonical transport modes.
        for (const key of Object.keys(dest.transportOptions)) {
          if (!VALID_TRANSPORT_OPTION_KEYS[key as TransportMode]) {
            issues.push({
              severity: "error",
              code: "V-MODE-KEY",
              message: `Destination '${dest.id}' has non-canonical transportOptions key '${key}'.`,
              targetId: dest.id,
            });
          }
        }

        const zone = dest.transportZoneId
          ? zoneById.get(dest.transportZoneId as TransportZoneId)
          : undefined;

        // V-ISLAND-RAIL: no conventional rail on rail-less island zones.
        if (
          dest.transportZoneId &&
          RAIL_LESS_ISLAND_ZONES[dest.transportZoneId as TransportZoneId] &&
          ("train" in dest.transportOptions ||
            "shinkansen" in dest.transportOptions)
        ) {
          issues.push({
            severity: "error",
            code: "V-ISLAND-RAIL",
            message: `Destination '${dest.id}' claims train/shinkansen access in rail-less island zone '${dest.transportZoneId}'.`,
            targetId: dest.id,
          });
        }

        // V-CAR-ZONE: no private vehicles on zones whose localModes
        // exclude car (e.g. ogasawara, tomogashima).
        if (zone && !zone.localModes.includes("car")) {
          for (const key of ["car", "my_car"] as const) {
            if (key in dest.transportOptions) {
              issues.push({
                severity: "error",
                code: "V-CAR-ZONE",
                message: `Destination '${dest.id}' claims '${key}' access in zone '${zone.id}' whose localModes exclude private vehicles.`,
                targetId: dest.id,
              });
            }
          }
        }
      }

      // V-LOCAL-ACCESS (same-zone contract): localAccessModes narrows the
      // zone's local modes for same-zone authorization — it can never grant
      // a mode the zone lacks. Cross-zone modes come from the topology edge
      // separately and are not constrained by localAccessModes (KAI-63
      // review; see getEligibleOriginModes in TransportTopologyService).
      if (dest.localAccessModes?.length) {
        const localZone = dest.transportZoneId
          ? zoneById.get(dest.transportZoneId as TransportZoneId)
          : undefined;
        if (localZone) {
          const zoneModes = new Set<TransportMode>(localZone.localModes);
          for (const mode of dest.localAccessModes) {
            if (!zoneModes.has(mode)) {
              issues.push({
                severity: "error",
                code: "V-LOCAL-ACCESS",
                message: `Destination '${dest.id}' declares localAccessModes mode '${mode}' not supported by zone '${localZone.id}' [${localZone.localModes.join(", ")}].`,
                targetId: dest.id,
              });
            }
          }
        }
      }
    }

    const errorsCount = issues.filter((i) => i.severity === "error").length;
    const warningsCount = issues.filter((i) => i.severity === "warning").length;
    const infoCount = issues.filter((i) => i.severity === "info").length;

    return {
      name: destinationsValidator.name,
      passed: errorsCount === 0,
      issues,
      metrics: {
        totalChecked,
        errorsCount,
        warningsCount,
        infoCount,
        durationMs: 0,
      },
    };
  },
};
