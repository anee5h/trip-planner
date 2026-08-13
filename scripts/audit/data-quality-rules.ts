/**
 * KAI-87 preventive data-quality rules (report §G, PR 6).
 *
 * Pure per-destination/per-collection rule functions shared by BOTH the
 * validator suite (scripts/validators/data-quality.ts — errors for the
 * preventive classes, warnings for accepted-debt classes) and the catalogue
 * audit (scripts/audit/catalog-integrity.ts — all codes as warnings behind
 * the check:catalog-warnings baseline gate). Keeping the logic here means
 * the two gating surfaces can never drift apart.
 *
 * Severity is decided by the caller, not here:
 *  - the validator marks PREVENTIVE_CODES as errors (validate:catalog-fast
 *    fails on any new instance — the classes are zero-debt after KAI-87);
 *  - the audit emits every code as a warning so check:catalog-warnings
 *    baselines existing debt and fails on new fingerprints.
 */

import type { Destination } from "../../src/shared/types/destination";
import type { Collection } from "../../src/shared/types/collection";
import type { TransportMode } from "../../src/shared/services/transport/types";

export interface DataQualityIssue {
  code: string;
  message: string;
}

export interface DestinationRuleContext {
  /** zoneId → local modes (from transport-topology.json). */
  zoneLocalModes: ReadonlyMap<string, readonly TransportMode[]>;
}

export const VALID_KINDS = new Set([
  "city",
  "ward",
  "town",
  "village",
  "district",
  "castle",
  "palace",
  "temple",
  "shrine",
  "museum",
  "park",
  "garden",
  "mountain",
  "lake",
  "waterfall",
  "island",
  "beach",
  "shopping",
  "market",
  "street",
  "viewpoint",
  "tower",
  "bridge",
  "station",
  "onsen",
  "zoo",
  "aquarium",
  // KAI-87: catalogue legacy kinds (schema contract extended, report §A).
  "nature",
  "historic_town",
  "historic",
  "natural",
  "mixed",
  "theme_park",
  "memorial",
  "monument",
  "cruise",
  "cemetery",
  "cliff",
  "rock_formation",
  "amusement_park",
  "cape",
  "observation",
  "event",
  "entertainment",
  "cultural",
]);

export const VALID_ROLES = new Set(["hub", "poi", "standalone"]);
export const VALID_STATUSES = new Set([
  "published",
  "beta",
  "verified",
  "planned",
]);
export const VALID_TRANSPORT_MODES: readonly TransportMode[] = [
  "train",
  "shinkansen",
  "car",
  "my_car",
  "bus",
  "flight",
  "ferry",
];

const PAID_KINDS = new Set([
  "museum",
  "tower",
  "zoo",
  "aquarium",
  "theme_park",
  "amusement_park",
  "castle",
  "garden",
  "onsen",
  "memorial",
  "monument",
]);

export const COLLECTION_MEMBERSHIP_KEYS = new Set([
  "collectionId",
  "sortOrder",
  "confirmed",
  // Provenance for evidence-backed memberships (UNESCO #142).
  "source",
]);

const SEASON_TO_MONTHS: Record<string, number[]> = {
  spring: [3, 4, 5],
  summer: [6, 7, 8],
  autumn: [9, 10, 11],
  winter: [12, 1, 2],
};

/**
 * Error-severity classes in the validator: deterministic violations that are
 * provably wrong whenever they appear. The catalogue is zero-debt on all of
 * them after KAI-87 PR 1-5, so a new instance failing validate:catalog-fast
 * is a real regression, never noise.
 */
export const PREVENTIVE_CODES = new Set([
  "ISLAND_RAIL_CLAIM",
  "LAM_TRANSPORT_CONTRADICTION",
  "QA_TEXT_LEAK",
  "UNKNOWN_TRANSPORT_KEY",
  "HERO_LICENSE_HOST_MISMATCH",
  "MISSING_TRAVEL_ESTIMATE",
  "VERSION_TAG_ARTIFACT",
  "PLACEHOLDER_SOURCE",
  "OFF_UNION_KIND",
  "OFF_UNION_STATUS",
  "COLLECTION_SORTORDER_COLLISION",
  "COLLECTION_MEMBERSHIP_SHAPE",
]);

export function firstTimeRange(text: string | undefined): number | null {
  if (!text) return null;
  const m = text.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function isCoarseGrid(v: number): boolean {
  return Math.abs(v * 10 - Math.round(v * 10)) < 1e-6;
}

export function collectDestinationIssues(
  dest: Destination,
  ctx: DestinationRuleContext,
): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  const push = (code: string, message: string) =>
    issues.push({ code, message });

  // ---- G4: schema unions ----
  if (dest.kind && !VALID_KINDS.has(dest.kind)) {
    push(
      "OFF_UNION_KIND",
      `kind '${dest.kind}' is outside the DestinationKind union`,
    );
  }
  if (dest.role && !VALID_ROLES.has(dest.role)) {
    push(
      "OFF_UNION_ROLE",
      `role '${dest.role}' is outside the hub|poi|standalone union`,
    );
  }
  if (dest.role === undefined && dest.status === "published") {
    push("MISSING_ROLE", "published record has no role");
  }
  if (dest.status && !VALID_STATUSES.has(dest.status)) {
    push(
      "OFF_UNION_STATUS",
      `status '${dest.status}' is outside the published|beta|verified union`,
    );
  }
  if ((dest.tags ?? []).some((t) => /\bv\d+\.\d+\.\d+\b/.test(t))) {
    push(
      "VERSION_TAG_ARTIFACT",
      "tags contain a version artifact like 'v1.9.2'",
    );
  }

  // ---- G3: placeholder sources + QA text ----
  const sources = dest.editorial?.sources ?? [];
  if (
    sources.some(
      (s) =>
        typeof s === "string" || (s && typeof s === "object" && !("url" in s)),
    )
  ) {
    push(
      "PLACEHOLDER_SOURCE",
      "editorial.sources contains a dangling placeholder (string or url-less entry)",
    );
  }
  if (
    /Source-backed|v1\.9\.2|KAI-31/.test(
      `${dest.notes ?? ""} ${dest.description ?? ""}`,
    )
  ) {
    push(
      "QA_TEXT_LEAK",
      "notes/description contain QA/provenance template text",
    );
  }

  // ---- transport keys (H-67) ----
  for (const key of Object.keys(dest.transportOptions ?? {})) {
    if (!VALID_TRANSPORT_MODES.includes(key as TransportMode)) {
      push(
        "UNKNOWN_TRANSPORT_KEY",
        `transportOptions has off-schema key '${key}'`,
      );
    }
  }

  // ---- G5: island rail (precise: zone without rail local modes) ----
  const lam = dest.localAccessModes ?? [];
  const to = dest.transportOptions ?? {};
  const zoneModes = dest.transportZoneId
    ? ctx.zoneLocalModes.get(dest.transportZoneId)
    : undefined;
  if (
    zoneModes &&
    !zoneModes.includes("train") &&
    !zoneModes.includes("shinkansen")
  ) {
    if (to.train !== undefined || to.shinkansen !== undefined) {
      push(
        "ISLAND_RAIL_CLAIM",
        `zone '${dest.transportZoneId}' has no rail local mode but transportOptions lists train/shinkansen`,
      );
    }
  }
  // LAM comparison covers only local (land) modes: ferry/flight are access
  // modes that localAccessModes cannot express by schema design.
  if (
    lam.length &&
    Object.keys(to).some(
      (m) =>
        m !== "ferry" && m !== "flight" && !lam.includes(m as TransportMode),
    )
  ) {
    push(
      "LAM_TRANSPORT_CONTRADICTION",
      "transportOptions contains a mode excluded by localAccessModes",
    );
  }

  // ---- G2: hours ----
  const bhStart = firstTimeRange(dest.businessHours);
  const ohStart = firstTimeRange(dest.openingHours);
  if (
    bhStart !== null &&
    ohStart !== null &&
    Math.abs(bhStart - ohStart) > 30
  ) {
    push(
      "HOURS_CROSS_FIELD_CONFLICT",
      `businessHours (${dest.businessHours}) vs openingHours (${dest.openingHours}) disagree on opening time`,
    );
  }
  const openText =
    `${dest.businessHours ?? ""} ${dest.openingHours ?? ""}`.toLowerCase();
  if (
    PAID_KINDS.has(dest.kind ?? "") &&
    /open access|24 hours/.test(openText)
  ) {
    push(
      "OPEN_ACCESS_ON_PAID_KIND",
      `paid kind '${dest.kind}' claims 'open access'/'24 hours'`,
    );
  }

  // ---- G9: seasonality ----
  if (
    dest.status === "published" &&
    dest.role !== "hub" &&
    (!dest.season || !dest.bestMonths?.length)
  ) {
    push(
      "MISSING_SEASON_DATA",
      "published non-hub record lacks season/bestMonths",
    );
  }
  if (dest.season && dest.bestMonths?.length) {
    const seasonScores = Object.fromEntries(
      Object.entries(dest.season).map(([k, v]) => [k, Number(v)]),
    );
    for (const month of dest.bestMonths) {
      const season = (
        Object.entries(SEASON_TO_MONTHS) as Array<[string, number[]]>
      ).find(([, ms]) => ms.includes(month))?.[0];
      if (!season) continue;
      const score = seasonScores[season] ?? 0;
      const max = Math.max(...Object.values(seasonScores));
      if (max > 0 && score < max * 0.5) {
        push(
          "SEASON_BESTMONTHS_CONTRADICTION",
          `bestMonths includes ${month} (${season} score ${score}) while top season is ${max}`,
        );
        break;
      }
    }
  }

  // ---- G4/G7/A: completeness ----
  if (dest.status === "published" && !dest.travelEstimate) {
    push(
      "MISSING_TRAVEL_ESTIMATE",
      "published record lacks travelEstimate.confidence",
    );
  }
  if (
    dest.status === "published" &&
    dest.role !== "hub" &&
    dest.budgetRecommended === undefined
  ) {
    push("MISSING_BUDGET", "published non-hub record lacks budgetRecommended");
  }
  if (dest.status === "published" && !dest.imageMetadata) {
    push("MISSING_IMAGE_METADATA", "published record lacks imageMetadata");
  }

  // ---- G11: walkingMin sanity ----
  const visitMaxMin = dest.recommendedVisitHours
    ? dest.recommendedVisitHours.max * 60
    : null;
  if (visitMaxMin !== null && dest.walkingMin > visitMaxMin) {
    push(
      "WALKING_MIN_IMPLAUSIBLE",
      `walkingMin (${dest.walkingMin}) exceeds recommendedVisitHours.max×60 (${visitMaxMin})`,
    );
  }

  // ---- G6: coarse grid + low-res hero + license host ----
  if (
    dest.coordinates &&
    isCoarseGrid(dest.coordinates.lat) &&
    isCoarseGrid(dest.coordinates.lng)
  ) {
    push(
      "COARSE_GRID_COORDS",
      "coordinates sit on a 0.1° grid (generator-rounded)",
    );
  }
  const heroPx = dest.heroImage?.match(/(\d+)px-/);
  if (heroPx && Number(heroPx[1]) < 500) {
    push("LOW_RES_HERO", `hero resolution ${heroPx[1]}px is below 500px`);
  }
  const heroHost = dest.heroImage?.includes("unsplash")
    ? "unsplash"
    : dest.heroImage?.includes("istock")
      ? "istock"
      : null;
  if (heroHost && /wikimedia/i.test(dest.imageMetadata?.source ?? "")) {
    push(
      "HERO_LICENSE_HOST_MISMATCH",
      `${heroHost} hero claims Wikimedia attribution`,
    );
  }

  return issues;
}

export interface CollectionMembershipInfo {
  destinationId: string;
  sortOrder?: number;
  keys: string[];
  isString: boolean;
}

export function collectCollectionIssues(
  collections: Collection[],
  memberships: Map<string, CollectionMembershipInfo[]>,
): Array<DataQualityIssue & { targetId: string }> {
  const issues: Array<DataQualityIssue & { targetId: string }> = [];
  for (const [cid, list] of memberships) {
    const seen = new Map<number, string>();
    for (const m of list) {
      if (m.isString) {
        issues.push({
          code: "COLLECTION_MEMBERSHIP_SHAPE",
          message: `collection ${cid}: membership is a bare string`,
          targetId: m.destinationId,
        });
        continue;
      }
      const unknown = m.keys.filter((k) => !COLLECTION_MEMBERSHIP_KEYS.has(k));
      if (unknown.length) {
        issues.push({
          code: "COLLECTION_MEMBERSHIP_SHAPE",
          message: `collection ${cid}: membership has unknown keys: ${unknown.join(",")}`,
          targetId: m.destinationId,
        });
      }
      if (m.sortOrder === undefined) continue;
      if (seen.has(m.sortOrder)) {
        issues.push({
          code: "COLLECTION_SORTORDER_COLLISION",
          message: `collection ${cid}: sortOrder ${m.sortOrder} used by ${seen.get(m.sortOrder)} and ${m.destinationId}`,
          targetId: m.destinationId,
        });
      } else {
        seen.set(m.sortOrder, m.destinationId);
      }
    }
  }
  for (const collection of collections) {
    const expected = collection.metadata?.expectedMembers;
    const actual = memberships.get(collection.id)?.length ?? 0;
    if (expected !== undefined && expected !== actual) {
      issues.push({
        code: "COLLECTION_COUNT_MISMATCH",
        message: `collection ${collection.id} has ${actual} members, expectedMembers ${expected}`,
        targetId: collection.id,
      });
    }
  }
  return issues;
}

export function buildMembershipMap(
  destinations: Destination[],
): Map<string, CollectionMembershipInfo[]> {
  const map = new Map<string, CollectionMembershipInfo[]>();
  for (const d of destinations) {
    for (const m of d.collections ?? []) {
      if (typeof m === "string") {
        const list = map.get(m) ?? [];
        list.push({ destinationId: d.id, keys: ["string"], isString: true });
        map.set(m, list);
      } else {
        const list = map.get(m.collectionId) ?? [];
        list.push({
          destinationId: d.id,
          sortOrder: m.sortOrder,
          keys: Object.keys(m),
          isString: false,
        });
        map.set(m.collectionId, list);
      }
    }
  }
  return map;
}

export function collectTransportClusters(
  destinations: Destination[],
  minCluster = 3,
): Array<DataQualityIssue & { targetId: string }> {
  const cluster = new Map<string, string[]>();
  for (const d of destinations) {
    const key = JSON.stringify(d.transportOptions ?? {});
    if (key === "{}") continue;
    const list = cluster.get(key) ?? [];
    list.push(d.id);
    cluster.set(key, list);
  }
  const issues: Array<DataQualityIssue & { targetId: string }> = [];
  const reported = new Set<string>();
  for (const [key, ids] of cluster) {
    if (ids.length >= minCluster && !reported.has(key)) {
      reported.add(key);
      issues.push({
        code: "TEMPLATE_TRANSPORT_CLUSTER",
        message: `Identical transportOptions shared by ${ids.length} records (${ids.slice(0, 5).join(", ")}…) — templated batch value`,
        targetId: ids[0],
      });
    }
  }
  return issues;
}
