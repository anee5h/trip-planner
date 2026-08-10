/**
 * Catalogue integrity audit — pure, read-only rule functions.
 *
 * AUD-001: The audit never mutates catalogue data; every function returns
 *          findings only.
 * AUD-002: Findings are structured objects with stable codes (documented
 *          below), so machine consumers can rely on them across runs.
 *          Rules that can fire several times for one record (relationship
 *          lists, duplicate coordinates, ...) carry identity fields in
 *          `details` (referenced id, relationship key, sorted id set) so
 *          the warning baseline can fingerprint each violation; see
 *          warningIdentity() in scripts/audit/catalog-baseline.ts.
 * AUD-003: Distance/duplicate-coordinate checks are suspicion signals only;
 *          they never justify an automatic reassignment.
 * AUD-004: Municipality-mismatch rules apply only when the parent is an
 *          explicit municipality-scale hub (city/ward/town/village).
 * AUD-005: Output is deterministic — all finding lists are sorted.
 *
 * Categories:
 *   A  Relationship integrity            (REL_*)
 *   B  Geographic suspicion              (GEO_*)
 *   C  Duration and timing completeness  (TIME_*)
 *   D  Municipality and naming           (MUNI_*)
 *   E  Source/generated consistency      (SYNC_*)
 *   F  Recommendation-impact summary     (IMPACT_*)
 */

import type { Destination } from "../../src/shared/types/destination.js";

export type AuditSeverity = "error" | "warning" | "info";

export interface AuditFinding {
  code: string;
  severity: AuditSeverity;
  category: "A" | "B" | "C" | "D" | "E";
  targetId: string;
  message: string;
  /** Structured payload for machine consumers (never free-form prose only). */
  details?: Record<string, unknown>;
}

export interface AuditOptions {
  prefecture?: string;
  destinationId?: string;
  /** Fixed timestamp for deterministic output; the CLI passes the real time. */
  generatedAt?: string;
}

export interface AuditImpact {
  /** Published children of the hub (parentDestinationId === hub id). */
  parentPlaceCount: number;
  /** Hub weekend capacity minutes per WeekendCapacityPolicy semantics. */
  parentWeekendCapacityMinutes: number;
  /** Whether the hub passes the 480-minute weekend capacity gate. */
  parentWeekendEligible: boolean;
  /** Which municipality-based city filter would include the child. */
  childCityFilterMunicipalityId?: string;
  /** Structural child of its parent (parentDestinationId set and resolvable). */
  childContainedByParent: boolean;
  /** Listed in the parent hub's featuredDestinationIds. */
  childFeaturedByParent: boolean;
  /** Contained or featured by its parent: appears in the parent's itinerary candidate set. */
  childItineraryCandidate: boolean;
  /** Featured refs of this hub that are NOT its structural children (featured-only links). */
  featuredOnlyRefs: string[];
  /** Whether the child appears in any nearby/related grouping list. */
  childInNearbyGrouping: boolean;
}

export interface AuditReport {
  /** Attached by the caller (CLI); the pure audit itself never timestamps. */
  generatedAt?: string;
  scanned: {
    destinations: number;
    detailFiles: number;
  };
  summary: {
    errors: number;
    warnings: number;
    info: number;
  };
  findings: AuditFinding[];
  /** Recommendation-impact summary for records with relationship findings. */
  impact: Record<string, AuditImpact>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Municipality-scale hub kinds that make municipality equality enforceable. */
const MUNICIPALITY_HUB_KINDS = new Set(["city", "ward", "town", "village"]);

/** Japan bounding box (lat/lng). */
const JAPAN_LAT = [24, 46] as const;
const JAPAN_LNG = [122, 146] as const;

/** Child-to-parent containment suspicion distance (km). */
const SUSPICIOUS_CHILD_DISTANCE_KM = 60;

/**
 * Non-overlapping island bounding boxes (mirror of the transport-topology
 * service). A destination whose coordinates fall inside an island box is
 * not contained in any mainland municipality, so a mainland parent hub is
 * a containment error unless the island is bridge-connected. KAI-31: this
 * deterministically catches the Teshima class (island child falsely
 * contained in Takamatsu City instead of gateway-accessed).
 */
const ISLAND_BOUNDS: Record<string, [number, number, number, number]> = {
  "okinawa-main": [26.0, 127.5, 27.0, 128.5],
  ogasawara: [26.5, 142.0, 27.8, 142.5],
  sado: [37.8, 138.1, 38.4, 138.6],
  ishigaki: [24.2, 124.0, 24.6, 124.4],
  miyako: [24.6, 125.1, 25.0, 125.5],
  amami: [27.5, 128.5, 29.0, 130.5],
  yakushima: [30.1, 130.3, 30.5, 130.8],
  tsushima: [34.0, 129.1, 34.7, 129.5],
  naoshima: [34.42, 133.93, 34.49, 134.02],
  teshima: [34.45, 134.05, 34.51, 134.12],
  tomogashima: [34.2, 134.9, 34.4, 135.1],
};

/** Islands connected by a bridge or causeway to a mainland hub. */
const BRIDGE_CONNECTED_ISLANDS = new Set([
  "enoshima-island",
  "tsunoshima-bridge-yamaguchi",
  "aoshima-island-miyazaki",
  "chiringashima-island",
  "kouri-island-okinawa",
]);

/** Coordinate equality rounding for duplicate detection. */
const COORD_ROUND = 3;

const MUNICIPALITY_ID_PATTERN = /^[A-Za-z]+:[a-z0-9_-]+$/;

const VALID_STATUSES = new Set(["verified", "planned", "beta", "published"]);
const VALID_LIFECYCLES = new Set([
  "legacy",
  "draft",
  "in_review",
  "approved",
  "published",
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function distanceKm(
  a: Destination | undefined,
  b: Destination | undefined,
): number | null {
  const ac = a?.coordinates;
  const bc = b?.coordinates;
  if (!ac || !bc || typeof ac.lat !== "number" || typeof bc.lat !== "number") {
    return null;
  }
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(bc.lat - ac.lat);
  const dLng = toRad(bc.lng - ac.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(ac.lat)) * Math.cos(toRad(bc.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Mirrors WeekendCapacityPolicy: max(hub own max, sum of child max) × 60. */
function weekendCapacityMinutes(
  hub: Destination,
  publishedChildren: Destination[],
): number {
  const ownMinutes = (hub.recommendedVisitHours?.max ?? 0) * 60;
  const childrenSum = publishedChildren.reduce(
    (sum, c) => sum + (c.recommendedVisitHours?.max ?? 0) * 60,
    0,
  );
  return Math.max(ownMinutes, childrenSum);
}

function isPublished(dest: Destination): boolean {
  const lifecycle = dest.editorial?.lifecycle;
  return (
    lifecycle === undefined ||
    lifecycle === "published" ||
    lifecycle === "legacy"
  );
}

function sortFindings(findings: AuditFinding[]): AuditFinding[] {
  const rank = { error: 0, warning: 1, info: 2 } as const;
  return [...findings].sort(
    (a, b) =>
      rank[a.severity] - rank[b.severity] ||
      a.code.localeCompare(b.code) ||
      a.targetId.localeCompare(b.targetId) ||
      a.message.localeCompare(b.message),
  );
}

// ---------------------------------------------------------------------------
// Category A — relationship integrity
// ---------------------------------------------------------------------------

function checkRelationships(
  destinations: Destination[],
  byId: Map<string, Destination>,
  findings: AuditFinding[],
): void {
  const validIds = new Set(byId.keys());

  // Parent cycles (DFS along parentDestinationId).
  for (const dest of destinations) {
    const seen = new Set<string>();
    let cursor: Destination | undefined = dest;
    while (cursor?.relationships?.parentDestinationId) {
      const nextId = cursor.relationships.parentDestinationId;
      if (nextId === cursor.id) break; // self-parent reported below
      if (seen.has(nextId)) {
        findings.push({
          code: "REL_CYCLE",
          severity: "error",
          category: "A",
          targetId: dest.id,
          message: `Relationship cycle detected: '${dest.id}' reaches '${nextId}' again through parent links.`,
          details: { cycle: [...seen, nextId] },
        });
        break;
      }
      seen.add(nextId);
      const next = byId.get(nextId);
      if (!next) break;
      cursor = next;
    }
  }

  for (const dest of destinations) {
    const rels = dest.relationships;
    if (!rels) continue;

    // REL_DANGLING_PARENT / REL_SELF_PARENT / REL_NON_HUB_PARENT / REL_CROSS_PREFECTURE_PARENT / REL_CROSS_MUNICIPALITY_PARENT
    const parentId = rels.parentDestinationId;
    if (parentId) {
      if (parentId === dest.id) {
        findings.push({
          code: "REL_SELF_PARENT",
          severity: "error",
          category: "A",
          targetId: dest.id,
          message: `Destination '${dest.id}' cannot have itself as parent.`,
        });
      } else {
        const parent = byId.get(parentId);
        if (!parent) {
          findings.push({
            code: "REL_DANGLING_PARENT",
            severity: "error",
            category: "A",
            targetId: dest.id,
            message: `Destination '${dest.id}' references non-existent parent '${parentId}'.`,
            details: { parentDestinationId: parentId },
          });
        } else {
          if (parent.role !== "hub") {
            findings.push({
              code: "REL_NON_HUB_PARENT",
              severity: "error",
              category: "A",
              targetId: dest.id,
              message: `Destination '${dest.id}' has non-hub parent '${parentId}'.`,
              details: { parentDestinationId: parentId },
            });
          }
          if (
            parent.prefecture &&
            dest.prefecture &&
            parent.prefecture !== dest.prefecture
          ) {
            findings.push({
              code: "REL_CROSS_PREFECTURE_PARENT",
              severity: "error",
              category: "A",
              targetId: dest.id,
              message: `Destination '${dest.id}' (${dest.prefecture}) cannot have parent '${parentId}' (${parent.prefecture}).`,
              details: { parentDestinationId: parentId },
            });
          }
          // AUD-004: municipality equality only for municipality-scale hubs.
          if (
            MUNICIPALITY_HUB_KINDS.has(parent.kind ?? "") &&
            parent.municipalityId &&
            dest.municipalityId &&
            parent.municipalityId !== dest.municipalityId
          ) {
            findings.push({
              code: "REL_CROSS_MUNICIPALITY_PARENT",
              severity: "error",
              category: "A",
              targetId: dest.id,
              message: `Destination '${dest.id}' is in '${dest.municipalityId}' but parent '${parentId}' is in '${parent.municipalityId}'.`,
              details: {
                childMunicipalityId: dest.municipalityId,
                parentMunicipalityId: parent.municipalityId,
              },
            });
          }
          // Unpublished/invalid parent (editorial lifecycle gate).
          const lifecycle = parent.editorial?.lifecycle;
          if (
            lifecycle === "draft" ||
            lifecycle === "in_review" ||
            lifecycle === "approved"
          ) {
            findings.push({
              code: "REL_UNPUBLISHED_PARENT",
              severity: "warning",
              category: "A",
              targetId: dest.id,
              message: `Child '${dest.id}' is assigned to parent '${parentId}' whose editorial lifecycle is '${lifecycle}' (not published).`,
              details: { parentDestinationId: parentId },
            });
          }
        }
      }
    }

    // REL_DANGLING_REF / REL_DUPLICATE_REF for list relationships.
    for (const key of [
      "gatewayHubId",
      "featuredDestinationIds",
      "nearbyDestinationIds",
      "relatedDestinationIds",
    ] as const) {
      const value = rels[key];
      if (!value) continue;
      const list = Array.isArray(value) ? value : [value];
      const seen = new Set<string>();
      for (const refId of list) {
        if (typeof refId !== "string") continue;
        if (refId === dest.id) {
          findings.push({
            code: "REL_SELF_REF",
            severity: "error",
            category: "A",
            targetId: dest.id,
            message: `Destination '${dest.id}' cannot reference itself in '${key}'.`,
            details: { key },
          });
        }
        if (seen.has(refId)) {
          findings.push({
            code: "REL_DUPLICATE_REF",
            severity: "warning",
            category: "A",
            targetId: dest.id,
            message: `Duplicate entry '${refId}' in '${key}' of '${dest.id}'.`,
            details: { key, refId },
          });
        }
        seen.add(refId);
        if (!validIds.has(refId)) {
          findings.push({
            code: "REL_DANGLING_REF",
            severity: "error",
            category: "A",
            targetId: dest.id,
            message: `Destination '${dest.id}' references non-existent '${refId}' in '${key}'.`,
            details: { key, refId },
          });
        } else {
          const ref = byId.get(refId)!;
          // Cross-prefecture featured/nearby refs are high-confidence
          // relationship errors (batch-import signature); same-prefecture
          // cross-municipality featured refs are suspicious but can be
          // legitimate regional editorial picks.
          if (
            key !== "gatewayHubId" &&
            ref.prefecture &&
            dest.prefecture &&
            ref.prefecture !== dest.prefecture
          ) {
            findings.push({
              code: "REL_CROSS_PREFECTURE_REF",
              severity: "warning",
              category: "A",
              targetId: dest.id,
              message: `'${dest.id}' lists '${refId}' (${ref.prefecture}) in '${key}' but is in ${dest.prefecture}.`,
              details: { key, refId, refPrefecture: ref.prefecture },
            });
          } else if (
            key === "featuredDestinationIds" &&
            dest.municipalityId &&
            ref.municipalityId &&
            dest.municipalityId !== ref.municipalityId
          ) {
            findings.push({
              code: "REL_CROSS_MUNICIPALITY_FEATURED",
              severity: "warning",
              category: "A",
              targetId: dest.id,
              message: `Hub '${dest.id}' features '${refId}' which is in a different municipality (${ref.municipalityId}).`,
              details: {
                refId,
                hubMunicipalityId: dest.municipalityId,
                refMunicipalityId: ref.municipalityId,
              },
            });
          }
        }
      }
    }

    // Gateway hub must be a hub.
    if (rels.gatewayHubId) {
      const gateway = byId.get(rels.gatewayHubId);
      if (gateway && gateway.role !== "hub") {
        findings.push({
          code: "REL_NON_HUB_GATEWAY",
          severity: "error",
          category: "A",
          targetId: dest.id,
          message: `Destination '${dest.id}' has non-hub gateway '${rels.gatewayHubId}'.`,
          details: { gatewayHubId: rels.gatewayHubId },
        });
      }
    }
  }

  // Parent place-count consistency: featured lists that reference no child
  // of the hub while the hub has published children are stale editorial
  // claims; featured lists referencing only out-of-hub places are flagged.
  for (const dest of destinations) {
    const featured = dest.relationships?.featuredDestinationIds ?? [];
    if (featured.length === 0 || dest.role !== "hub") continue;
    const children = destinations.filter(
      (c) => c.relationships?.parentDestinationId === dest.id,
    );
    const featuredChildren = featured.filter((id) =>
      children.some((c) => c.id === id),
    );
    const publishedChildren = children.filter(isPublished);
    if (publishedChildren.length > 0 && featuredChildren.length === 0) {
      findings.push({
        code: "REL_FEATURED_NOT_CHILDREN",
        severity: "warning",
        category: "A",
        targetId: dest.id,
        message: `Hub '${dest.id}' has ${publishedChildren.length} published child(ren) but features none of them (${featured.length} featured refs); featured place count disagrees with published children.`,
        details: {
          publishedChildCount: publishedChildren.length,
          featuredCount: featured.length,
        },
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Category B — geographic suspicion
// ---------------------------------------------------------------------------

function checkGeography(
  destinations: Destination[],
  byId: Map<string, Destination>,
  findings: AuditFinding[],
): void {
  for (const dest of destinations) {
    const c = dest.coordinates;
    if (!c) continue;
    const { lat, lng } = c;
    if (
      typeof lat !== "number" ||
      typeof lng !== "number" ||
      Number.isNaN(lat) ||
      Number.isNaN(lng)
    ) {
      findings.push({
        code: "GEO_INVALID_COORDINATES",
        severity: "warning",
        category: "B",
        targetId: dest.id,
        message: `Destination '${dest.id}' has non-numeric coordinates ${JSON.stringify(c)}.`,
      });
      continue;
    }
    if (
      lat < JAPAN_LAT[0] ||
      lat > JAPAN_LAT[1] ||
      lng < JAPAN_LNG[0] ||
      lng > JAPAN_LNG[1]
    ) {
      findings.push({
        code: "GEO_OUTSIDE_JAPAN",
        severity: "warning",
        category: "B",
        targetId: dest.id,
        message: `Coordinates ${lat},${lng} for '${dest.id}' fall outside Japan's bounding box.`,
      });
    }
  }

  // Duplicate coordinates across destinations. Direct parent/child pairs and
  // same-site hub/POI anchors (a hub and a POI standing on the same spot) are
  // expected and downgraded to info; unrelated duplicates stay warnings.
  const byCoord = new Map<string, string[]>();
  for (const dest of destinations) {
    const c = dest.coordinates;
    if (!c || typeof c.lat !== "number" || typeof c.lng !== "number") continue;
    const key = `${c.lat.toFixed(COORD_ROUND)},${c.lng.toFixed(COORD_ROUND)}`;
    byCoord.set(key, [...(byCoord.get(key) ?? []), dest.id]);
  }
  for (const [key, ids] of byCoord) {
    if (ids.length <= 1) continue;
    const records = ids
      .map((id) => byId.get(id))
      .filter(Boolean) as Destination[];
    const parentChildPair = records.some((a) =>
      records.some(
        (b) =>
          a.id !== b.id &&
          (a.relationships?.parentDestinationId === b.id ||
            b.relationships?.parentDestinationId === a.id),
      ),
    );
    const hubPoiAnchor =
      records.some((r) => r.role === "hub") &&
      records.some((r) => r.role !== "hub");
    const severity = parentChildPair || hubPoiAnchor ? "info" : "warning";
    const reason = parentChildPair
      ? "direct parent/child pair sharing the site"
      : hubPoiAnchor
        ? "same-site hub/POI anchor"
        : "unrelated destinations";
    findings.push({
      code: "GEO_DUPLICATE_COORDINATES",
      severity,
      category: "B",
      targetId: ids[0],
      message: `Destinations [${ids.join(", ")}] share coordinates ${key}; ${reason} — verify they are not copies.`,
      details: { coordinates: key, destinationIds: ids, reason },
    });
  }

  // Child implausibly far from municipality-specific parent.
  for (const dest of destinations) {
    const parentId = dest.relationships?.parentDestinationId;
    if (!parentId) continue;
    const parent = byId.get(parentId);
    if (!parent || !MUNICIPALITY_HUB_KINDS.has(parent.kind ?? "")) continue;
    const d = distanceKm(dest, parent);
    if (d !== null && d > SUSPICIOUS_CHILD_DISTANCE_KM) {
      findings.push({
        code: "GEO_CHILD_FAR_FROM_MUNI_PARENT",
        severity: "warning",
        category: "B",
        targetId: dest.id,
        message: `Child '${dest.id}' is ${Math.round(d)} km from municipality parent '${parentId}'; distance is a suspicion signal only, never an automatic reassignment.`,
        details: { distanceKm: Math.round(d), parentId },
      });
    }

    // Island containment: a child on island X can only be contained in a
    // hub that is on the same island (e.g. Naha City on Okinawa main
    // island) or bridge-connected. A child on an island parented to a hub
    // on another island or on the mainland is a hard geography error, not
    // a suspicion signal. KAI-31: this deterministically catches the
    // Teshima class (island child falsely contained in Takamatsu City
    // instead of gateway-accessed).
    if (BRIDGE_CONNECTED_ISLANDS.has(dest.id)) continue;
    // Records with an explicit island transport zone (e.g. tomogashima)
    // carry editorial zone authority: the islands may be administered by
    // the parent city even though they are offshore.
    if (dest.transportZoneId) continue;
    const c = dest.coordinates;
    const pc = parent.coordinates;
    if (!c || !pc) continue;
    const islandOf = (lat: number, lng: number) =>
      Object.entries(ISLAND_BOUNDS).find(
        ([, [latMin, lngMin, latMax, lngMax]]) =>
          lat >= latMin && lat <= latMax && lng >= lngMin && lng <= lngMax,
      )?.[0];
    const childIsland = islandOf(c.lat, c.lng);
    const parentIsland = islandOf(pc.lat, pc.lng);
    if (!childIsland || childIsland === parentIsland) continue;
    findings.push({
      code: "GEO_ISLAND_FALSE_CONTAINMENT",
      severity: "error",
      category: "B",
      targetId: dest.id,
      message: `Child '${dest.id}' is on island '${childIsland}' but is parented to hub '${parentId}' on island/mainland '${parentIsland ?? "mainland"}'; use gatewayHubId instead of parentDestinationId.`,
      details: { island: childIsland, parentId },
    });
  }
}

// ---------------------------------------------------------------------------
// Category C — duration and timing completeness
// ---------------------------------------------------------------------------

function checkTiming(
  destinations: Destination[],
  byId: Map<string, Destination>,
  findings: AuditFinding[],
): void {
  const publishedPois: Destination[] = [];
  for (const dest of destinations) {
    const isPoi =
      dest.placeType === "destination" ||
      dest.role === "poi" ||
      dest.role === "standalone";
    if (isPoi && isPublished(dest)) publishedPois.push(dest);

    const h = dest.recommendedVisitHours;
    if (h) {
      const bad =
        typeof h.min !== "number" ||
        typeof h.max !== "number" ||
        Number.isNaN(h.min) ||
        Number.isNaN(h.max) ||
        h.min <= 0 ||
        h.max <= 0 ||
        h.min > h.max;
      if (bad) {
        findings.push({
          code: "TIME_INVALID_VISIT_HOURS",
          severity: "error",
          category: "C",
          targetId: dest.id,
          message: `Destination '${dest.id}' has invalid recommendedVisitHours ${JSON.stringify(h)} (min must be > 0 and <= max).`,
          details: { recommendedVisitHours: h },
        });
      }
    }

    if (typeof dest.totalTripHours === "number" && dest.totalTripHours <= 0) {
      findings.push({
        code: "TIME_INVALID_TOTAL_TRIP_HOURS",
        severity: "error",
        category: "C",
        targetId: dest.id,
        message: `Destination '${dest.id}' has non-positive totalTripHours ${dest.totalTripHours}.`,
      });
    }

    // Opening-hours object present but unusable.
    const rawHours = dest.businessHours ?? dest.openingHours;
    if (
      rawHours !== undefined &&
      rawHours !== null &&
      (typeof rawHours !== "string" || rawHours.trim() === "")
    ) {
      findings.push({
        code: "TIME_UNUSABLE_OPENING_HOURS",
        severity: "warning",
        category: "C",
        targetId: dest.id,
        message: `Destination '${dest.id}' has a non-string or empty opening-hours value.`,
      });
    }
    const meta = dest.openingHoursMetadata;
    if (meta?.verifiedAt) {
      const t = new Date(meta.verifiedAt).getTime();
      if (Number.isNaN(t)) {
        findings.push({
          code: "TIME_INVALID_VERIFIED_AT",
          severity: "warning",
          category: "C",
          targetId: dest.id,
          message: `Destination '${dest.id}' has unparseable openingHoursMetadata.verifiedAt '${meta.verifiedAt}'.`,
        });
      } else if (t > Date.now()) {
        findings.push({
          code: "TIME_FUTURE_VERIFIED_AT",
          severity: "warning",
          category: "C",
          targetId: dest.id,
          message: `Destination '${dest.id}' has a future openingHoursMetadata.verifiedAt '${meta.verifiedAt}'.`,
        });
      }
    }

    // Contradictory open/closed claims in one string.
    const lower = (rawHours ?? "").toLowerCase();
    if (
      (lower.includes("24 hours") || lower.includes("open access")) &&
      (lower.includes("closed") || lower.includes("休"))
    ) {
      findings.push({
        code: "TIME_CONTRADICTORY_OPEN_CLOSED",
        severity: "warning",
        category: "C",
        targetId: dest.id,
        message: `Destination '${dest.id}' opening-hours string mixes always-open and closed claims: "${rawHours}".`,
      });
    }

    // UI-required timing field absent (hub/POI level).
    const isHubOrCity = dest.role === "hub" || dest.kind === "city";
    if (isHubOrCity && !h) {
      findings.push({
        code: "TIME_HUB_MISSING_VISIT_HOURS",
        severity: "warning",
        category: "C",
        targetId: dest.id,
        message: `Hub '${dest.id}' is missing recommendedVisitHours; weekend capacity falls back to 0 minutes.`,
      });
    }
    // KAI-50: `recommendedVisitHours` is the canonical planning duration.
    // The deprecated `totalTripHours` field cannot substitute because its
    // legacy semantics may include transport from a fixed origin. Records
    // without canonical visit data are flagged; hubs and published POIs
    // keep their role-specific warnings below.
    if (!h && !isHubOrCity && !(isPoi && isPublished(dest))) {
      findings.push({
        code: "TIME_MISSING_CANONICAL_DURATION",
        severity: "warning",
        category: "C",
        targetId: dest.id,
        message: `Destination '${dest.id}' is missing recommendedVisitHours and cannot be duration-planned; legacy totalTripHours is not a substitute.`,
      });
    }
  }

  // Published POI missing visit duration (kept separate from opening hours).
  for (const poi of publishedPois) {
    if (!poi.recommendedVisitHours) {
      findings.push({
        code: "TIME_POI_MISSING_VISIT_HOURS",
        severity: "warning",
        category: "C",
        targetId: poi.id,
        message: `Published POI '${poi.id}' is missing recommendedVisitHours.`,
      });
    }
  }

  // Hub capacity relying on invalid child durations.
  for (const dest of destinations) {
    if (dest.role !== "hub") continue;
    const children = destinations.filter(
      (c) => c.relationships?.parentDestinationId === dest.id,
    );
    const invalidChildren = children.filter(
      (c) =>
        !c.recommendedVisitHours ||
        c.recommendedVisitHours.min <= 0 ||
        c.recommendedVisitHours.max <= 0 ||
        c.recommendedVisitHours.min > c.recommendedVisitHours.max,
    );
    if (invalidChildren.length > 0) {
      findings.push({
        code: "TIME_HUB_CAPACITY_INVALID_CHILD",
        severity: "warning",
        category: "C",
        targetId: dest.id,
        message: `Hub '${dest.id}' weekend capacity relies on ${invalidChildren.length} child(ren) with missing/invalid visit hours: [${invalidChildren.map((c) => c.id).join(", ")}].`,
        details: { childIds: invalidChildren.map((c) => c.id) },
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Category D — municipality and naming consistency
// ---------------------------------------------------------------------------

function checkMunicipality(
  destinations: Destination[],
  byId: Map<string, Destination>,
  findings: AuditFinding[],
): void {
  for (const dest of destinations) {
    const muni = dest.municipalityId;
    if (muni !== undefined && !MUNICIPALITY_ID_PATTERN.test(muni)) {
      findings.push({
        code: "MUNI_INVALID_FORMAT",
        severity: "warning",
        category: "D",
        targetId: dest.id,
        message: `Destination '${dest.id}' has malformed municipalityId '${muni}' (expected '<Prefecture>:<slug>').`,
      });
    }
    if (muni && dest.prefecture) {
      const prefix = muni.split(":")[0];
      if (prefix.toLowerCase() !== dest.prefecture.toLowerCase()) {
        findings.push({
          code: "MUNI_PREFECTURE_MISMATCH",
          severity: "warning",
          category: "D",
          targetId: dest.id,
          message: `Destination '${dest.id}' municipalityId '${muni}' disagrees with prefecture '${dest.prefecture}'.`,
          details: { municipalityId: muni, prefecture: dest.prefecture },
        });
      }
    }

    // Municipality-scale hubs should carry a Japanese name for bilingual
    // consistency (English/Japanese disagreement check).
    if (
      MUNICIPALITY_HUB_KINDS.has(dest.kind ?? "") &&
      dest.role === "hub" &&
      !dest.nameJa
    ) {
      findings.push({
        code: "MUNI_HUB_MISSING_NAME_JA",
        severity: "warning",
        category: "D",
        targetId: dest.id,
        message: `Municipality hub '${dest.id}' has no nameJa; Japanese views fall back to the English name.`,
      });
    }

    // Canonical naming variants: city hubs must end with " City" etc.
    if (dest.kind === "city" && !dest.name.endsWith(" City")) {
      findings.push({
        code: "MUNI_CITY_NAME_VARIANT",
        severity: "warning",
        category: "D",
        targetId: dest.id,
        message: `City hub '${dest.id}' name '${dest.name}' does not use the canonical ' City' suffix.`,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Category E — source/generated consistency
// ---------------------------------------------------------------------------

export interface DetailFileEntry {
  id: string;
  record: Destination;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a as Record<string, unknown>);
    const kb = Object.keys(b as Record<string, unknown>);
    return (
      ka.length === kb.length &&
      ka.every((k) =>
        deepEqual(
          (a as Record<string, unknown>)[k],
          (b as Record<string, unknown>)[k],
        ),
      )
    );
  }
  return false;
}

function checkSync(
  destinations: Destination[],
  details: DetailFileEntry[],
  metaEntries: { id: string; [k: string]: unknown }[],
  findings: AuditFinding[],
): void {
  const byId = new Map(destinations.map((d) => [d.id, d]));
  const detailById = new Map(details.map((d) => [d.id, d.record]));

  // E1/E3: index record missing detail, or index/detail field mismatch.
  for (const dest of destinations) {
    const detail = detailById.get(dest.id);
    if (!detail) {
      findings.push({
        code: "SYNC_MISSING_DETAIL",
        severity: "error",
        category: "E",
        targetId: dest.id,
        message: `Index record '${dest.id}' has no generated detail file (public/data/destinations/${dest.id}.json).`,
      });
      continue;
    }
    if (!deepEqual(dest, detail)) {
      // Report the specific differing fields for actionable output.
      const diffFields: string[] = [];
      for (const key of new Set([
        ...Object.keys(dest),
        ...Object.keys(detail),
      ])) {
        if (
          !deepEqual(
            (dest as Record<string, unknown>)[key],
            (detail as Record<string, unknown>)[key],
          )
        ) {
          diffFields.push(key);
        }
      }
      findings.push({
        code: "SYNC_DETAIL_MISMATCH",
        severity: "error",
        category: "E",
        targetId: dest.id,
        message: `Generated detail for '${dest.id}' disagrees with the index on fields: ${diffFields.join(", ")}. Run sync-destination-details.`,
        details: { diffFields },
      });
    }
  }

  // E2: orphan detail file.
  for (const entry of details) {
    if (!byId.has(entry.id)) {
      findings.push({
        code: "SYNC_ORPHAN_DETAIL",
        severity: "error",
        category: "E",
        targetId: entry.id,
        message: `Detail file public/data/destinations/${entry.id}.json has no index record.`,
      });
    }
  }

  // E4: stale destinations-meta.json (store state).
  const metaById = new Map(metaEntries.map((m) => [m.id, m]));
  const metaIds = new Set(metaById.keys());
  for (const dest of destinations) {
    const meta = metaById.get(dest.id);
    const expectedRole = dest.role ?? "poi";
    const expectedKind = dest.kind ?? "attraction";
    const expectedStatus = dest.status ?? "verified";
    if (!meta) {
      findings.push({
        code: "SYNC_META_MISSING",
        severity: "warning",
        category: "E",
        targetId: dest.id,
        message: `destinations-meta.json is missing '${dest.id}' (store state is stale; regenerate meta).`,
      });
      continue;
    }
    if (
      (meta.role ?? "poi") !== expectedRole ||
      (meta.kind ?? "attraction") !== expectedKind ||
      (meta.status ?? "verified") !== expectedStatus ||
      !deepEqual(meta.relationships ?? {}, dest.relationships ?? {})
    ) {
      findings.push({
        code: "SYNC_META_STALE",
        severity: "warning",
        category: "E",
        targetId: dest.id,
        message: `destinations-meta.json entry for '${dest.id}' disagrees with the index (role/kind/status/relationships).`,
      });
    }
  }
  for (const id of metaIds) {
    if (!byId.has(id)) {
      findings.push({
        code: "SYNC_META_ORPHAN",
        severity: "warning",
        category: "E",
        targetId: id,
        message: `destinations-meta.json contains '${id}' with no index record.`,
      });
    }
  }

  // E5: duplicate ids / duplicate slugs.
  const seenIds = new Set<string>();
  for (const dest of destinations) {
    if (seenIds.has(dest.id)) {
      findings.push({
        code: "SYNC_DUPLICATE_ID",
        severity: "error",
        category: "E",
        targetId: dest.id,
        message: `Duplicate destination id '${dest.id}' in the index.`,
      });
    }
    seenIds.add(dest.id);
  }
  const slugCounts = new Map<string, number>();
  for (const dest of destinations) {
    const slug = dest.id.toLowerCase();
    slugCounts.set(slug, (slugCounts.get(slug) ?? 0) + 1);
  }
  for (const [slug, count] of slugCounts) {
    if (count > 1) {
      findings.push({
        code: "SYNC_DUPLICATE_SLUG",
        severity: "error",
        category: "E",
        targetId: slug,
        message: `Duplicate slug '${slug}' appears ${count} times.`,
      });
    }
  }

  // E6: lifecycle/status synchronization.
  for (const dest of destinations) {
    const lifecycle = dest.editorial?.lifecycle;
    if (lifecycle && !VALID_LIFECYCLES.has(lifecycle)) {
      findings.push({
        code: "SYNC_INVALID_LIFECYCLE",
        severity: "error",
        category: "E",
        targetId: dest.id,
        message: `Destination '${dest.id}' has invalid editorial lifecycle '${lifecycle}'.`,
      });
    }
    if (dest.status && !VALID_STATUSES.has(dest.status)) {
      findings.push({
        code: "SYNC_INVALID_STATUS",
        severity: "error",
        category: "E",
        targetId: dest.id,
        message: `Destination '${dest.id}' has invalid status '${dest.status}'.`,
      });
    }
    if (lifecycle === "published" && dest.status !== "published") {
      findings.push({
        code: "SYNC_LIFECYCLE_STATUS_MISMATCH",
        severity: "warning",
        category: "E",
        targetId: dest.id,
        message: `Destination '${dest.id}' has editorial lifecycle 'published' but status '${dest.status}'.`,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Category F — recommendation-impact summary
// ---------------------------------------------------------------------------

function computeImpact(
  destinations: Destination[],
  byId: Map<string, Destination>,
  findings: AuditFinding[],
): Record<string, AuditImpact> {
  const impact: Record<string, AuditImpact> = {};
  const byParent = new Map<string, Destination[]>();
  for (const dest of destinations) {
    const parentId = dest.relationships?.parentDestinationId;
    if (!parentId) continue;
    byParent.set(parentId, [...(byParent.get(parentId) ?? []), dest]);
  }
  const childrenOf = (hubId: string) => byParent.get(hubId) ?? [];
  const publishedOf = (hubId: string) => childrenOf(hubId).filter(isPublished);

  // Impact is reported for relationship correction candidates: records that
  // carry at least one category-A finding, plus their parent hubs (whose
  // place counts and capacity change when a child relationship is corrected).
  const candidateIds = new Set<string>();
  for (const f of findings) {
    if (f.category !== "A") continue;
    candidateIds.add(f.targetId);
    const parentId = byId.get(f.targetId)?.relationships?.parentDestinationId;
    if (parentId) candidateIds.add(parentId);
  }

  for (const dest of destinations) {
    if (!candidateIds.has(dest.id)) continue;
    const rels = dest.relationships ?? {};
    const parentId = rels.parentDestinationId;
    const parent = parentId ? byId.get(parentId) : undefined;

    const children = parentId ? childrenOf(parentId) : [];
    const publishedChildren = parentId ? publishedOf(parentId) : [];
    const parentFeatured = parent?.relationships?.featuredDestinationIds ?? [];

    const childContainedByParent = Boolean(parentId && parent);
    const childFeaturedByParent = parent
      ? parentFeatured.includes(dest.id)
      : false;

    impact[dest.id] = {
      parentPlaceCount: parentId ? publishedChildren.length : 0,
      parentWeekendCapacityMinutes: parent
        ? weekendCapacityMinutes(parent, publishedChildren)
        : 0,
      parentWeekendEligible: parent
        ? weekendCapacityMinutes(parent, publishedChildren) >= 480
        : false,
      childCityFilterMunicipalityId: dest.municipalityId,
      childContainedByParent,
      childFeaturedByParent,
      childItineraryCandidate: childContainedByParent || childFeaturedByParent,
      // For hub candidates, list featured refs that are NOT structural
      // children: those are featured-only links (e.g. a cross-municipality
      // featured pick) whose correction changes the hub's featured section.
      featuredOnlyRefs: rels.featuredDestinationIds
        ? rels.featuredDestinationIds.filter(
            (id) => !children.some((c) => c.id === id),
          )
        : [],
      childInNearbyGrouping: Boolean(
        (rels.nearbyDestinationIds?.length ?? 0) > 0 ||
        (rels.relatedDestinationIds?.length ?? 0) > 0,
      ),
    };
  }
  return impact;
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

export function runAudit(
  destinations: Destination[],
  details: DetailFileEntry[],
  metaEntries: { id: string; [k: string]: unknown }[],
  options: AuditOptions = {},
): AuditReport {
  const findings: AuditFinding[] = [];
  const byId = new Map(destinations.map((d) => [d.id, d]));

  checkRelationships(destinations, byId, findings);
  checkGeography(destinations, byId, findings);
  checkTiming(destinations, byId, findings);
  checkMunicipality(destinations, byId, findings);
  checkSync(destinations, details, metaEntries, findings);

  let filtered = findings;
  if (options.prefecture) {
    const pref = options.prefecture.trim().toLowerCase();
    const inPref = (id: string) =>
      byId.get(id)?.prefecture?.toLowerCase() === pref;
    filtered = findings.filter(
      (f) =>
        inPref(f.targetId) ||
        (f.details?.refPrefecture as string | undefined)?.toLowerCase() ===
          pref,
    );
  }
  if (options.destinationId) {
    filtered = filtered.filter(
      (f) =>
        f.targetId === options.destinationId ||
        (f.details &&
          typeof f.details === "object" &&
          JSON.stringify(f.details).includes(options.destinationId as string)),
    );
  }

  const sorted = sortFindings(filtered);
  const summary = {
    errors: sorted.filter((f) => f.severity === "error").length,
    warnings: sorted.filter((f) => f.severity === "warning").length,
    info: sorted.filter((f) => f.severity === "info").length,
  };

  const impact = computeImpact(destinations, byId, findings);

  return {
    generatedAt: options.generatedAt,
    scanned: {
      destinations: destinations.length,
      detailFiles: details.length,
    },
    summary,
    findings: sorted,
    impact,
  };
}
