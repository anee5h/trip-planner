#!/usr/bin/env tsx
/**
 * KAI-203: deterministic, read-only destination-detail completeness audit.
 *
 * The canonical index is the only input used for catalogue counts and detail
 * completeness. Generated detail files are compared semantically but never
 * rewritten. Findings are classified observations; only structural invariants
 * are suitable for CI failure.
 */
import fs from "node:fs";
import path from "node:path";
import type { Destination } from "../src/shared/types/destination.js";
import { extractWikipediaMapping } from "../src/shared/services/wikipedia/WikipediaIdentity.js";

const root = process.cwd();
const sourcePath = path.join(root, "src/shared/data/destinations-index.json");
const detailsDir = path.join(root, "public/data/destinations");

type Locale = "en" | "ja";
type Availability = "present" | "absent";
type RelationshipFinding = {
  sourceId: string;
  field: string;
  targetId: string;
  kind: "invalid" | "self";
};

type FieldState = Availability | "not-applicable";

interface StructuredCompleteness {
  name: FieldState;
  description: { en: FieldState; ja: FieldState };
  highlights: { en: FieldState; ja: FieldState };
  coordinates: FieldState;
  recommendedVisitDuration: FieldState;
  transport: FieldState;
  budget: FieldState;
  parking: FieldState;
  reservation: FieldState;
  editorialSourceMetadata: FieldState;
  ratings: FieldState;
  ratingProvenance: FieldState;
  seasonality: FieldState;
  seasonProvenance: FieldState;
  comfort: FieldState;
  comfortProvenance: FieldState;
  relationships: FieldState;
  nearbyPlaces: FieldState;
  mapEligibility: "eligible" | "not-eligible" | "no-relationship-context";
  wikipediaMapping: "verified-mapping" | "unmapped";
}

interface AuditReport {
  schemaVersion: 1;
  ticket: "KAI-203";
  generatedFrom: string;
  catalogue: {
    canonicalCount: number;
    canonicalUniqueCount: number;
    generatedDetailCount: number;
    publishedCount: number;
    statusCounts: Record<string, number>;
    roleCounts: Record<string, number>;
  };
  generatedSynchronization: {
    missingDetailIds: string[];
    orphanDetailIds: string[];
    mismatchedDetailIds: string[];
    synchronized: boolean;
  };
  localization: {
    canonicalHighlightsHiddenByEmptyEn: string[];
    canonicalHighlightsHiddenByEmptyJa: string[];
    canonicalDescriptionHiddenByEmptyEn: string[];
    japaneseHighlightsAvailableElsewhereButEmpty: string[];
    japaneseNotesWithEnglishNameIds: string[];
    emptyStringOverrides: Array<{ id: string; locale: Locale; field: string }>;
    enJaStructureDriftIds: string[];
  };
  hubs: {
    total: number;
    zeroChildrenIds: string[];
    oneChildIds: string[];
    invalidRelationshipIds: RelationshipFinding[];
    invalidRelationshipSourceIds: string[];
    metadataChildCountMismatches: Array<{
      id: string;
      claimed: number;
      actual: number;
      source: string;
    }>;
    featuredIdsEmptyWithExistingChildren: string[];
    classifications: Record<
      string,
      | "healthy"
      | "thin-legitimate"
      | "broken-existing-child-relationships"
      | "unresolved-shell-hub"
      | "metadata-inconsistency"
    >;
    childIdsByHub: Record<string, string[]>;
    featuredIdsByHub: Record<string, string[]>;
    nearbyIdsByHub: Record<string, string[]>;
    relatedIdsByHub: Record<string, string[]>;
  };
  mapEligibility: {
    eligibleHubIds: string[];
    hubsWithCoordinatesButNoUsableChildren: string[];
    childrenWithCoordinatesUnderEligibleHubIds: string[];
    noRelationshipContextIds: string[];
  };
  highlights: {
    legacyVisibleEmptyEnIds: string[];
    legacyVisibleEmptyJaIds: string[];
    sourceBackedEnIds: string[];
    sourceBackedJaIds: string[];
    omittedBecauseNoTrustedSourceEnIds: string[];
    omittedBecauseNoTrustedSourceJaIds: string[];
    placeholderOrGenericIds: string[];
  };
  ratings: {
    numericRatingsWithoutRatingMetadataIds: string[];
    lowOrUnknownConfidenceIds: string[];
    verifiedIds: string[];
    hiddenDespiteNumericRatingsIds: string[];
    modelOrGeneratedUnverifiedIds: string[];
  };
  relationships: {
    brokenRelationshipIds: RelationshipFinding[];
    brokenRelationshipSourceIds: string[];
    nearbyIdsPresent: string[];
    relatedIdsPresent: string[];
    parentIdsPresent: string[];
    relationshipBackedContextIds: string[];
  };
  structuredDetailCompleteness: Record<string, StructuredCompleteness>;
  wikipedia: {
    verifiedMappingIds: string[];
    validAutomaticMatchIds: string[];
    validAutomaticMatchEvaluated: false;
    unresolvedIds: string[];
    noArticleExpectedIds: string[];
    transientFailureIds: string[];
    ambiguousIds: string[];
    note: string;
  };
  structuralErrors: Array<{ code: string; targetId?: string; message: string }>;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function countValues(
  values: Array<string | undefined>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    const key = value ?? "(absent)";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)),
  );
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function nonEmptyArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length > 0;
}

function localizedHighlights(
  destination: Destination,
  locale: Locale,
): string[] {
  const localized = destination.content?.[locale]?.highlights;
  if (locale === "en") {
    // KAI-203 field policy: English may use the canonical highlights when an
    // explicitly empty localized projection would otherwise suppress them.
    return nonEmptyArray(localized)
      ? (localized as string[])
      : Array.isArray(destination.highlights)
        ? destination.highlights
        : [];
  }
  // Japanese editorial prose is intentionally fail-closed; no English fallback.
  return Array.isArray(localized) ? localized : [];
}

function localizedDescription(
  destination: Destination,
  locale: Locale,
): string {
  const localized = destination.content?.[locale]?.description;
  if (locale === "en") {
    return nonEmptyString(localized)
      ? localized
      : nonEmptyString(destination.description)
        ? destination.description
        : "";
  }
  return nonEmptyString(localized) ? localized : "";
}

function hasCoordinates(destination: Destination): boolean {
  const coordinates = destination.coordinates;
  return Boolean(
    coordinates &&
    Number.isFinite(coordinates.lat) &&
    Number.isFinite(coordinates.lng),
  );
}

function hasBudget(destination: Destination): boolean {
  return [
    destination.budgetMin,
    destination.budgetMax,
    destination.budgetRecommended,
  ].some((value) => typeof value === "number" && Number.isFinite(value));
}

function hasTransport(destination: Destination): boolean {
  return Boolean(
    destination.transportOptions &&
    Object.values(destination.transportOptions).some(
      (value) => typeof value === "number" && Number.isFinite(value),
    ),
  );
}

function hasSeasonality(destination: Destination): boolean {
  return Boolean(
    nonEmptyString(destination.bestSeason) ||
    nonEmptyArray(destination.bestMonths) ||
    destination.season,
  );
}

function hasRelationships(destination: Destination): boolean {
  const rels = destination.relationships;
  return Boolean(
    rels &&
    (nonEmptyString(rels.parentDestinationId) ||
      nonEmptyArray(rels.featuredDestinationIds) ||
      nonEmptyArray(rels.nearbyDestinationIds) ||
      nonEmptyArray(rels.relatedDestinationIds)),
  );
}

function isNumericRatingVector(destination: Destination): boolean {
  return Boolean(
    destination.ratings &&
    Object.values(destination.ratings).some(
      (value) => typeof value === "number" && Number.isFinite(value),
    ),
  );
}

function isRatingVerified(destination: Destination): boolean {
  const confidence = destination.ratingMetadata?.confidence;
  return confidence === "high" || confidence === "medium";
}

function relationshipIds(destination: Destination): Array<[string, string]> {
  const rels = destination.relationships;
  if (!rels) return [];
  return [
    ...(rels.parentDestinationId
      ? [
          ["relationships.parentDestinationId", rels.parentDestinationId] as [
            string,
            string,
          ],
        ]
      : []),
    ...(rels.featuredDestinationIds ?? []).map(
      (id) => ["relationships.featuredDestinationIds", id] as [string, string],
    ),
    ...(rels.nearbyDestinationIds ?? []).map(
      (id) => ["relationships.nearbyDestinationIds", id] as [string, string],
    ),
    ...(rels.relatedDestinationIds ?? []).map(
      (id) => ["relationships.relatedDestinationIds", id] as [string, string],
    ),
  ];
}

function claimedChildCount(destination: Destination): number | null {
  const titles =
    destination.editorial?.fieldSources?.recommendedVisitHours ?? [];
  const sourceText = titles.map((source) => source.title ?? "").join(" ");
  const match = sourceText.match(
    /(?:derived|reviewed|from)\s+(\d+)\s+children/i,
  );
  return match ? Number(match[1]) : null;
}

function classifyHub(
  childCount: number,
  hasInvalidRelationship: boolean,
  hasMetadataMismatch: boolean,
): AuditReport["hubs"]["classifications"][string] {
  if (hasInvalidRelationship) return "broken-existing-child-relationships";
  if (hasMetadataMismatch) return "metadata-inconsistency";
  if (childCount === 0) return "unresolved-shell-hub";
  if (childCount === 1) return "thin-legitimate";
  return "healthy";
}

function fieldState(value: boolean): FieldState {
  return value ? "present" : "absent";
}

function buildAudit(destinations: Destination[]): AuditReport {
  const byId = new Map(
    destinations.map((destination) => [destination.id, destination]),
  );
  const childrenByHub = new Map<string, string[]>();
  for (const destination of destinations) {
    const parentId = destination.relationships?.parentDestinationId;
    if (!parentId) continue;
    const current = childrenByHub.get(parentId) ?? [];
    current.push(destination.id);
    childrenByHub.set(parentId, current);
  }
  for (const ids of childrenByHub.values())
    ids.sort((a, b) => a.localeCompare(b));

  const relationships: RelationshipFinding[] = [];
  for (const destination of destinations) {
    for (const [field, targetId] of relationshipIds(destination)) {
      if (targetId === destination.id) {
        relationships.push({
          sourceId: destination.id,
          field,
          targetId,
          kind: "self",
        });
      } else if (!byId.has(targetId)) {
        relationships.push({
          sourceId: destination.id,
          field,
          targetId,
          kind: "invalid",
        });
      }
    }
  }
  relationships.sort((a, b) =>
    `${a.sourceId}:${a.field}:${a.targetId}`.localeCompare(
      `${b.sourceId}:${b.field}:${b.targetId}`,
    ),
  );

  const hubs = destinations.filter((destination) => destination.role === "hub");
  const zeroChildrenIds = hubs
    .filter((hub) => (childrenByHub.get(hub.id)?.length ?? 0) === 0)
    .map((hub) => hub.id)
    .sort((a, b) => a.localeCompare(b));
  const oneChildIds = hubs
    .filter((hub) => (childrenByHub.get(hub.id)?.length ?? 0) === 1)
    .map((hub) => hub.id)
    .sort((a, b) => a.localeCompare(b));

  const metadataChildCountMismatches: AuditReport["hubs"]["metadataChildCountMismatches"] =
    [];
  const featuredIdsEmptyWithExistingChildren: string[] = [];
  const classifications: AuditReport["hubs"]["classifications"] = {};
  const featuredIdsByHub: Record<string, string[]> = {};
  const nearbyIdsByHub: Record<string, string[]> = {};
  const relatedIdsByHub: Record<string, string[]> = {};
  const childIdsByHub: Record<string, string[]> = {};
  for (const hub of hubs) {
    const childIds = childrenByHub.get(hub.id) ?? [];
    childIdsByHub[hub.id] = childIds;
    const featured = hub.relationships?.featuredDestinationIds ?? [];
    const nearby = hub.relationships?.nearbyDestinationIds ?? [];
    const related = hub.relationships?.relatedDestinationIds ?? [];
    featuredIdsByHub[hub.id] = [...featured].sort((a, b) => a.localeCompare(b));
    nearbyIdsByHub[hub.id] = [...nearby].sort((a, b) => a.localeCompare(b));
    relatedIdsByHub[hub.id] = [...related].sort((a, b) => a.localeCompare(b));
    if (childIds.length > 0 && featured.length === 0) {
      featuredIdsEmptyWithExistingChildren.push(hub.id);
    }
    const claimed = claimedChildCount(hub);
    const mismatch = claimed !== null && claimed !== childIds.length;
    if (mismatch) {
      const source = (hub.editorial?.fieldSources?.recommendedVisitHours ?? [])
        .map((entry) => entry.title)
        .filter(nonEmptyString)
        .join(" | ");
      metadataChildCountMismatches.push({
        id: hub.id,
        claimed: claimed!,
        actual: childIds.length,
        source,
      });
    }
    classifications[hub.id] = classifyHub(
      childIds.length,
      relationships.some((finding) => finding.sourceId === hub.id),
      mismatch,
    );
  }
  featuredIdsEmptyWithExistingChildren.sort((a, b) => a.localeCompare(b));
  metadataChildCountMismatches.sort((a, b) => a.id.localeCompare(b.id));

  const canonicalHighlightsHiddenByEmptyEn: string[] = [];
  const canonicalHighlightsHiddenByEmptyJa: string[] = [];
  const canonicalDescriptionHiddenByEmptyEn: string[] = [];
  const japaneseHighlightsAvailableElsewhereButEmpty: string[] = [];
  const japaneseNotesWithEnglishNameIds: string[] = [];
  const emptyStringOverrides: AuditReport["localization"]["emptyStringOverrides"] =
    [];
  const enJaStructureDriftIds: string[] = [];
  const legacyVisibleEmptyEnIds: string[] = [];
  const legacyVisibleEmptyJaIds: string[] = [];
  const sourceBackedEnIds: string[] = [];
  const sourceBackedJaIds: string[] = [];
  const omittedBecauseNoTrustedSourceEnIds: string[] = [];
  const omittedBecauseNoTrustedSourceJaIds: string[] = [];
  const placeholderOrGenericIds: string[] = [];
  const structured: Record<string, StructuredCompleteness> = {};

  for (const destination of destinations) {
    const enHighlights = destination.content?.en?.highlights;
    const jaHighlights = destination.content?.ja?.highlights;
    const canonicalHighlights = destination.highlights ?? [];
    if (
      canonicalHighlights.length > 0 &&
      Array.isArray(enHighlights) &&
      enHighlights.length === 0
    ) {
      canonicalHighlightsHiddenByEmptyEn.push(destination.id);
    }
    if (
      canonicalHighlights.length > 0 &&
      Array.isArray(jaHighlights) &&
      jaHighlights.length === 0
    ) {
      canonicalHighlightsHiddenByEmptyJa.push(destination.id);
    }
    if (
      nonEmptyString(destination.description) &&
      destination.content?.en?.description === ""
    ) {
      canonicalDescriptionHiddenByEmptyEn.push(destination.id);
    }
    if (
      Array.isArray(jaHighlights) &&
      jaHighlights.length === 0 &&
      nonEmptyArray(destination.highlightsJa)
    ) {
      japaneseHighlightsAvailableElsewhereButEmpty.push(destination.id);
    }
    const japaneseNotes = destination.content?.ja?.notes ?? destination.notesJa;
    const japaneseName = destination.content?.ja?.name ?? destination.nameJa;
    if (
      nonEmptyString(japaneseNotes) &&
      nonEmptyString(japaneseName) &&
      nonEmptyString(destination.name) &&
      japaneseName !== destination.name &&
      japaneseNotes.includes(destination.name)
    ) {
      japaneseNotesWithEnglishNameIds.push(destination.id);
    }
    for (const locale of ["en", "ja"] as const) {
      const content = destination.content?.[locale];
      if (content?.description === "")
        emptyStringOverrides.push({
          id: destination.id,
          locale,
          field: "description",
        });
      if (content?.name === "")
        emptyStringOverrides.push({
          id: destination.id,
          locale,
          field: "name",
        });
    }
    const enShape = Object.keys(destination.content?.en ?? {})
      .sort()
      .join(",");
    const jaShape = Object.keys(destination.content?.ja ?? {})
      .sort()
      .join(",");
    if (enShape && jaShape && enShape !== jaShape)
      enJaStructureDriftIds.push(destination.id);

    // Baseline the pre-repair JSX semantics separately: an explicitly present
    // localized [] was truthy and therefore rendered an empty card. The
    // effective policy below is what the repaired UI will use.
    const legacyEnHighlights = Array.isArray(enHighlights)
      ? enHighlights
      : (destination.highlights ?? []);
    const legacyJaHighlights = Array.isArray(jaHighlights) ? jaHighlights : [];
    if (legacyEnHighlights.length === 0)
      legacyVisibleEmptyEnIds.push(destination.id);
    if (legacyJaHighlights.length === 0)
      legacyVisibleEmptyJaIds.push(destination.id);

    const effectiveEnHighlights = localizedHighlights(destination, "en");
    const effectiveJaHighlights = localizedHighlights(destination, "ja");
    if (effectiveEnHighlights.length > 0)
      sourceBackedEnIds.push(destination.id);
    else omittedBecauseNoTrustedSourceEnIds.push(destination.id);
    if (effectiveJaHighlights.length > 0)
      sourceBackedJaIds.push(destination.id);
    else omittedBecauseNoTrustedSourceJaIds.push(destination.id);
    if (
      canonicalHighlights.some((highlight) =>
        /^(explore|discover|local culture|top sights|must-see)/i.test(
          highlight.trim(),
        ),
      )
    ) {
      placeholderOrGenericIds.push(destination.id);
    }

    const childIds = childrenByHub.get(destination.id) ?? [];
    const validChildIds = childIds.filter((id) =>
      hasCoordinates(byId.get(id)!),
    );
    const mapEligibility =
      destination.role !== "hub"
        ? "no-relationship-context"
        : childIds.length > 0 &&
            hasCoordinates(destination) &&
            validChildIds.length > 0
          ? "eligible"
          : "not-eligible";
    structured[destination.id] = {
      name: fieldState(nonEmptyString(destination.name)),
      description: {
        en: fieldState(localizedDescription(destination, "en").length > 0),
        ja: fieldState(localizedDescription(destination, "ja").length > 0),
      },
      highlights: {
        en: fieldState(effectiveEnHighlights.length > 0),
        ja: fieldState(effectiveJaHighlights.length > 0),
      },
      coordinates: fieldState(hasCoordinates(destination)),
      recommendedVisitDuration: fieldState(
        Boolean(
          nonEmptyString(destination.recommendedDuration) ||
          destination.recommendedVisitHours,
        ),
      ),
      transport: fieldState(hasTransport(destination)),
      budget: fieldState(hasBudget(destination)),
      parking: fieldState(
        nonEmptyString(destination.parking) ||
          nonEmptyString(destination.parkingJa),
      ),
      reservation: fieldState(
        nonEmptyString(destination.reservation) ||
          nonEmptyString(destination.reservationJa),
      ),
      editorialSourceMetadata: fieldState(
        Boolean(destination.editorial?.sources?.length),
      ),
      ratings: fieldState(isNumericRatingVector(destination)),
      ratingProvenance: fieldState(Boolean(destination.ratingMetadata)),
      seasonality: fieldState(hasSeasonality(destination)),
      seasonProvenance: fieldState(Boolean(destination.seasonMetadata)),
      comfort: fieldState(Boolean(destination.comfort)),
      comfortProvenance: fieldState(Boolean(destination.comfortMetadata)),
      relationships: fieldState(hasRelationships(destination)),
      nearbyPlaces: fieldState(
        Boolean(
          destination.relationships?.nearbyDestinationIds?.length ||
          destination.relationships?.relatedDestinationIds?.length ||
          destination.relationships?.parentDestinationId,
        ),
      ),
      mapEligibility,
      wikipediaMapping: extractWikipediaMapping(destination)
        ? "verified-mapping"
        : "unmapped",
    };
  }

  const ratingWithoutMetadata = destinations
    .filter(
      (destination) =>
        isNumericRatingVector(destination) && !destination.ratingMetadata,
    )
    .map((destination) => destination.id);
  const lowOrUnknown = destinations
    .filter((destination) => {
      const confidence = destination.ratingMetadata?.confidence;
      return confidence === "low" || confidence === "unknown";
    })
    .map((destination) => destination.id);
  const verifiedIds = destinations
    .filter(isRatingVerified)
    .map((destination) => destination.id);
  const hiddenDespiteNumeric = destinations
    .filter(
      (destination) =>
        isNumericRatingVector(destination) && !isRatingVerified(destination),
    )
    .map((destination) => destination.id);
  const modelOrGeneratedUnverified = destinations
    .filter(
      (destination) =>
        isNumericRatingVector(destination) &&
        !isRatingVerified(destination) &&
        (destination.ratingMetadata?.method === "model" ||
          !destination.ratingMetadata),
    )
    .map((destination) => destination.id);

  const eligibleHubIds = hubs
    .filter((hub) => {
      const children = childrenByHub.get(hub.id) ?? [];
      return (
        hasCoordinates(hub) &&
        children.some((id) => hasCoordinates(byId.get(id)!))
      );
    })
    .map((hub) => hub.id);
  const hubsWithCoordinatesButNoUsableChildren = hubs
    .filter((hub) => {
      const children = childrenByHub.get(hub.id) ?? [];
      return (
        hasCoordinates(hub) &&
        children.length > 0 &&
        !children.some((id) => hasCoordinates(byId.get(id)!))
      );
    })
    .map((hub) => hub.id);
  const childrenWithCoordinatesUnderEligibleHubIds = hubs
    .filter((hub) => {
      const children = childrenByHub.get(hub.id) ?? [];
      return (
        children.length > 0 &&
        children.some((id) => hasCoordinates(byId.get(id)!))
      );
    })
    .flatMap((hub) =>
      (childrenByHub.get(hub.id) ?? []).filter((id) =>
        hasCoordinates(byId.get(id)!),
      ),
    );
  const noRelationshipContextIds = destinations
    .filter(
      (destination) =>
        destination.role === "hub" &&
        (childrenByHub.get(destination.id)?.length ?? 0) === 0,
    )
    .map((destination) => destination.id);

  const mappingIds = destinations
    .filter((destination) => Boolean(extractWikipediaMapping(destination)))
    .map((destination) => destination.id);
  const unresolvedIds = destinations
    .filter((destination) => !extractWikipediaMapping(destination))
    .map((destination) => destination.id);
  const missingDetailIds: string[] = [];
  const mismatchedDetailIds: string[] = [];
  const actualDetailIds = fs.existsSync(detailsDir)
    ? fs
        .readdirSync(detailsDir)
        .filter((file) => file.endsWith(".json"))
        .map((file) => file.slice(0, -5))
    : [];
  for (const destination of destinations) {
    const detailPath = path.join(detailsDir, `${destination.id}.json`);
    if (!fs.existsSync(detailPath)) {
      missingDetailIds.push(destination.id);
      continue;
    }
    try {
      const detail = readJson<Destination>(detailPath);
      if (JSON.stringify(detail) !== JSON.stringify(destination))
        mismatchedDetailIds.push(destination.id);
    } catch {
      mismatchedDetailIds.push(destination.id);
    }
  }
  const canonicalIds = new Set(
    destinations.map((destination) => destination.id),
  );
  const orphanDetailIds = actualDetailIds
    .filter((id) => !canonicalIds.has(id))
    .sort((a, b) => a.localeCompare(b));

  const structuralErrors: AuditReport["structuralErrors"] = [];
  if (
    new Set(destinations.map((destination) => destination.id)).size !==
    destinations.length
  ) {
    structuralErrors.push({
      code: "DUPLICATE_CANONICAL_ID",
      message: "Canonical source contains duplicate destination IDs.",
    });
  }
  for (const finding of relationships) {
    structuralErrors.push({
      code: "INVALID_DESTINATION_RELATIONSHIP",
      targetId: finding.sourceId,
      message: `${finding.field} references ${finding.targetId} (${finding.kind}).`,
    });
  }
  if (
    missingDetailIds.length ||
    orphanDetailIds.length ||
    mismatchedDetailIds.length
  ) {
    structuralErrors.push({
      code: "GENERATED_DETAIL_SYNC_DRIFT",
      message: `Generated detail files differ from canonical source: missing=${missingDetailIds.length}, orphan=${orphanDetailIds.length}, mismatched=${mismatchedDetailIds.length}.`,
    });
  }

  return {
    schemaVersion: 1,
    ticket: "KAI-203",
    generatedFrom: "src/shared/data/destinations-index.json",
    catalogue: {
      canonicalCount: destinations.length,
      canonicalUniqueCount: canonicalIds.size,
      generatedDetailCount: actualDetailIds.length,
      publishedCount: destinations.length,
      statusCounts: countValues(
        destinations.map((destination) => destination.status),
      ),
      roleCounts: countValues(
        destinations.map((destination) => destination.role),
      ),
    },
    generatedSynchronization: {
      missingDetailIds: missingDetailIds.sort((a, b) => a.localeCompare(b)),
      orphanDetailIds,
      mismatchedDetailIds: mismatchedDetailIds.sort((a, b) =>
        a.localeCompare(b),
      ),
      synchronized:
        missingDetailIds.length === 0 &&
        orphanDetailIds.length === 0 &&
        mismatchedDetailIds.length === 0,
    },
    localization: {
      canonicalHighlightsHiddenByEmptyEn: sortedUnique(
        canonicalHighlightsHiddenByEmptyEn,
      ),
      canonicalHighlightsHiddenByEmptyJa: sortedUnique(
        canonicalHighlightsHiddenByEmptyJa,
      ),
      canonicalDescriptionHiddenByEmptyEn: sortedUnique(
        canonicalDescriptionHiddenByEmptyEn,
      ),
      japaneseHighlightsAvailableElsewhereButEmpty: sortedUnique(
        japaneseHighlightsAvailableElsewhereButEmpty,
      ),
      japaneseNotesWithEnglishNameIds: sortedUnique(
        japaneseNotesWithEnglishNameIds,
      ),
      emptyStringOverrides: emptyStringOverrides.sort((a, b) =>
        `${a.id}:${a.locale}:${a.field}`.localeCompare(
          `${b.id}:${b.locale}:${b.field}`,
        ),
      ),
      enJaStructureDriftIds: sortedUnique(enJaStructureDriftIds),
    },
    hubs: {
      total: hubs.length,
      zeroChildrenIds,
      oneChildIds,
      invalidRelationshipIds: relationships.filter(
        (finding) =>
          finding.sourceId && byId.get(finding.sourceId)?.role === "hub",
      ),
      invalidRelationshipSourceIds: sortedUnique(
        relationships.map((finding) => finding.sourceId),
      ),
      metadataChildCountMismatches,
      featuredIdsEmptyWithExistingChildren: sortedUnique(
        featuredIdsEmptyWithExistingChildren,
      ),
      classifications,
      childIdsByHub,
      featuredIdsByHub,
      nearbyIdsByHub,
      relatedIdsByHub,
    },
    mapEligibility: {
      eligibleHubIds: sortedUnique(eligibleHubIds),
      hubsWithCoordinatesButNoUsableChildren: sortedUnique(
        hubsWithCoordinatesButNoUsableChildren,
      ),
      childrenWithCoordinatesUnderEligibleHubIds: sortedUnique(
        childrenWithCoordinatesUnderEligibleHubIds,
      ),
      noRelationshipContextIds: sortedUnique(noRelationshipContextIds),
    },
    highlights: {
      legacyVisibleEmptyEnIds: sortedUnique(legacyVisibleEmptyEnIds),
      legacyVisibleEmptyJaIds: sortedUnique(legacyVisibleEmptyJaIds),
      sourceBackedEnIds: sortedUnique(sourceBackedEnIds),
      sourceBackedJaIds: sortedUnique(sourceBackedJaIds),
      omittedBecauseNoTrustedSourceEnIds: sortedUnique(
        omittedBecauseNoTrustedSourceEnIds,
      ),
      omittedBecauseNoTrustedSourceJaIds: sortedUnique(
        omittedBecauseNoTrustedSourceJaIds,
      ),
      placeholderOrGenericIds: sortedUnique(placeholderOrGenericIds),
    },
    ratings: {
      numericRatingsWithoutRatingMetadataIds: sortedUnique(
        ratingWithoutMetadata,
      ),
      lowOrUnknownConfidenceIds: sortedUnique(lowOrUnknown),
      verifiedIds: sortedUnique(verifiedIds),
      hiddenDespiteNumericRatingsIds: sortedUnique(hiddenDespiteNumeric),
      modelOrGeneratedUnverifiedIds: sortedUnique(modelOrGeneratedUnverified),
    },
    relationships: {
      brokenRelationshipIds: relationships,
      brokenRelationshipSourceIds: sortedUnique(
        relationships.map((finding) => finding.sourceId),
      ),
      nearbyIdsPresent: sortedUnique(
        destinations
          .filter((destination) =>
            nonEmptyArray(destination.relationships?.nearbyDestinationIds),
          )
          .map((destination) => destination.id),
      ),
      relatedIdsPresent: sortedUnique(
        destinations
          .filter((destination) =>
            nonEmptyArray(destination.relationships?.relatedDestinationIds),
          )
          .map((destination) => destination.id),
      ),
      parentIdsPresent: sortedUnique(
        destinations
          .filter((destination) =>
            nonEmptyString(destination.relationships?.parentDestinationId),
          )
          .map((destination) => destination.id),
      ),
      relationshipBackedContextIds: sortedUnique(
        destinations
          .filter((destination) => hasRelationships(destination))
          .map((destination) => destination.id),
      ),
    },
    structuredDetailCompleteness: Object.fromEntries(
      Object.entries(structured).sort(([a], [b]) => a.localeCompare(b)),
    ),
    wikipedia: {
      verifiedMappingIds: sortedUnique(mappingIds),
      validAutomaticMatchIds: [],
      validAutomaticMatchEvaluated: false,
      unresolvedIds: sortedUnique(unresolvedIds),
      noArticleExpectedIds: [],
      transientFailureIds: [],
      ambiguousIds: [],
      note: "Offline committed-data audit: automatic resolver states, ambiguity, no-article, and transient failure require deterministic resolver fixtures or live requests and are not inferred from absence of a mapping.",
    },
    structuralErrors,
  };
}

function listSection(title: string, ids: string[]): string {
  if (ids.length === 0) return `### ${title}\n\n- None\n`;
  return `### ${title} (${ids.length})\n\n${ids.map((id) => `- ${id}`).join("\n")}\n`;
}

function renderMarkdown(report: AuditReport): string {
  const c = report.catalogue;
  const h = report.hubs;
  const l = report.localization;
  const r = report.ratings;
  const w = report.wikipedia;
  const lines = [
    "# KAI-203 Destination-detail completeness audit",
    "",
    `Source: \`${report.generatedFrom}\``,
    "",
    "## Summary",
    "",
    `- Canonical catalogue records: **${c.canonicalCount}** (unique: ${c.canonicalUniqueCount})`,
    `- Generated detail files: **${c.generatedDetailCount}**`,
    `- Status counts: ${Object.entries(c.statusCounts)
      .map(([key, value]) => `${key}=${value}`)
      .join(", ")}`,
    `- Hubs: **${h.total}**; zero children: **${h.zeroChildrenIds.length}**; one child: **${h.oneChildIds.length}**`,
    `- Legacy visible-empty Highlights risk: EN **${report.highlights.legacyVisibleEmptyEnIds.length}**, JA **${report.highlights.legacyVisibleEmptyJaIds.length}**`,
    `- Canonical highlights hidden by empty localized override: EN **${l.canonicalHighlightsHiddenByEmptyEn.length}**, JA **${l.canonicalHighlightsHiddenByEmptyJa.length}**`,
    `- Japanese notes containing an English canonical destination name: **${l.japaneseNotesWithEnglishNameIds.length}**`,
    `- Numeric ratings without ratingMetadata: **${r.numericRatingsWithoutRatingMetadataIds.length}**`,
    `- Broken relationship IDs: **${report.relationships.brokenRelationshipIds.length}**`,
    `- Generated synchronization: **${report.generatedSynchronization.synchronized ? "current" : "drift"}**`,
    "",
    "## Baseline counts",
    "",
    "| Class | Count |",
    "| --- | ---: |",
    `| Hubs | ${h.total} |`,
    `| Hubs with zero children | ${h.zeroChildrenIds.length} |`,
    `| Hubs with one child | ${h.oneChildIds.length} |`,
    `| Hubs with metadata child-count mismatch | ${h.metadataChildCountMismatches.length} |`,
    `| Hubs with existing children but empty featuredDestinationIds (fallback-eligible) | ${h.featuredIdsEmptyWithExistingChildren.length} |`,
    `| Legacy visible-empty Highlights EN | ${report.highlights.legacyVisibleEmptyEnIds.length} |`,
    `| Legacy visible-empty Highlights JA | ${report.highlights.legacyVisibleEmptyJaIds.length} |`,
    `| Canonical highlights hidden by empty EN override | ${l.canonicalHighlightsHiddenByEmptyEn.length} |`,
    `| Canonical highlights hidden by empty JA override | ${l.canonicalHighlightsHiddenByEmptyJa.length} |`,
    `| Japanese notes containing an English canonical destination name | ${l.japaneseNotesWithEnglishNameIds.length} |`,
    `| Numeric ratings without ratingMetadata | ${r.numericRatingsWithoutRatingMetadataIds.length} |`,
    `| Low/unknown rating confidence | ${r.lowOrUnknownConfidenceIds.length} |`,
    `| Broken relationship IDs | ${report.relationships.brokenRelationshipIds.length} |`,
    `| Map-eligible hubs | ${report.mapEligibility.eligibleHubIds.length} |`,
    `| Wikipedia verified mappings | ${w.verifiedMappingIds.length} |`,
    `| Wikipedia valid automatic matches | not evaluated offline |`,
    `| Wikipedia unresolved committed mappings | ${w.unresolvedIds.length} |`,
    "",
    "## Root-cause cohorts",
    "",
    "The report is read-only. Empty localized Japanese prose is not treated as an English fallback defect; unsupported language content remains omitted.",
    "",
    listSection(
      "Canonical English highlights suppressed by explicit empty content.en.highlights",
      l.canonicalHighlightsHiddenByEmptyEn,
    ),
    listSection(
      "Canonical Japanese highlights suppressed by explicit empty content.ja.highlights",
      l.canonicalHighlightsHiddenByEmptyJa,
    ),
    listSection(
      "Hubs with existing children but empty featuredDestinationIds",
      h.featuredIdsEmptyWithExistingChildren,
    ),
    listSection(
      "Unresolved shell hubs (no existing parent-linked children)",
      h.zeroChildrenIds,
    ),
    listSection("Hubs with one existing child", h.oneChildIds),
    listSection(
      "Numeric ratings without ratingMetadata (correctly remain gated)",
      r.numericRatingsWithoutRatingMetadataIds,
    ),
    listSection(
      "Broken relationship source IDs",
      report.relationships.brokenRelationshipSourceIds,
    ),
    listSection(
      "Legacy EN pages whose old unconditional card would be empty",
      report.highlights.legacyVisibleEmptyEnIds,
    ),
    listSection(
      "Legacy JA pages whose old unconditional card would be empty",
      report.highlights.legacyVisibleEmptyJaIds,
    ),
    listSection(
      "Japanese notes with English canonical destination names",
      l.japaneseNotesWithEnglishNameIds,
    ),
    listSection(
      "Map-eligible hubs with existing coordinate-backed children",
      report.mapEligibility.eligibleHubIds,
    ),
    "## Structural errors",
    "",
    report.structuralErrors.length === 0
      ? "- None"
      : report.structuralErrors
          .map(
            (finding) =>
              `- **${finding.code}**${finding.targetId ? ` (${finding.targetId})` : ""}: ${finding.message}`,
          )
          .join("\n"),
    "",
    "## Wikipedia audit boundary",
    "",
    `- Verified deterministic mappings in committed data: **${w.verifiedMappingIds.length}**`,
    "- Automatic valid matches, ambiguous matches, no-article expectations, and transient failures are not inferred from missing mappings. Deterministic resolver tests cover those states; the offline catalogue audit records them as not evaluated.",
    "",
  ];
  return lines.join("\n");
}

function parseArgs(args: string[]): {
  json?: string;
  markdown?: string;
  strict: boolean;
} {
  const result: { json?: string; markdown?: string; strict: boolean } = {
    strict: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") result.json = args[++index];
    else if (arg === "--markdown") result.markdown = args[++index];
    else if (arg === "--strict") result.strict = true;
  }
  return result;
}

const options = parseArgs(process.argv.slice(2));
const destinations = readJson<Destination[]>(sourcePath);
const report = buildAudit(destinations);
const markdown = renderMarkdown(report);
if (options.json) {
  fs.mkdirSync(path.dirname(path.resolve(options.json)), { recursive: true });
  fs.writeFileSync(options.json, `${JSON.stringify(report, null, 2)}\n`);
}
if (options.markdown) {
  fs.mkdirSync(path.dirname(path.resolve(options.markdown)), {
    recursive: true,
  });
  fs.writeFileSync(options.markdown, markdown);
}
if (!options.json && !options.markdown) {
  process.stdout.write(`${markdown}\n`);
}
if (options.strict && report.structuralErrors.length > 0) process.exitCode = 1;
