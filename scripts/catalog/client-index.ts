import type { Destination } from "../../src/shared/types/destination";

/**
 * KAI-82 phase 2: the client-side destination index.
 *
 * The full destinations-index.json (6.5 MB) is the source of truth for
 * scripts, validators and the SEO prerenderer. The app's detail/compare
 * surfaces hydrate from the per-destination JSON files under
 * public/data/destinations/ (fetched on demand), so the index shipped to
 * the client only needs the fields consumed by cards, rails, search,
 * recommendations and planning.
 *
 * Dropping the detail/editorial/audit fields (content, editorial, the
 * *Metadata audit blobs, and other detail-only fields) removes ~2.3 MB
 * from the initial-load bundle while preserving every summary field.
 */
export const CLIENT_INDEX_FIELDS = [
  "id",
  "name",
  "nameJa",
  "kind",
  "role",
  "importance",
  "placeType",
  "recommendationEligible",
  "municipalityId",
  "areaId",
  "aliases",
  "prefecture",
  "region",
  "categories",
  "category",
  "tags",
  "heroImage",
  "image",
  "description",
  "highlights",
  "coordinates",
  "officialWebsite",
  "officialWebsiteRequirement",
  "status",
  "season",
  "bestMonths",
  "bestSeason",
  "weatherDependence",
  "budgetMin",
  "budgetRecommended",
  "budgetMax",
  "budgetMetadata",
  "totalTripHours",
  "walkingMin",
  "indoorPercent",
  "recommendedVisitHours",
  "collections",
  "ratings",
  "ratingMetadata",
  "scoreMetadata",
  "travelEstimate",
  "transportOptions",
  "transportZoneId",
  "localAccessModes",
  "localAccessUnestimated",
  "walkingIntensity",
  "comfort",
  "businessHours",
  "openingHours",
  "relationships",
] as const;

export type ClientIndexField = (typeof CLIENT_INDEX_FIELDS)[number];
export type ClientDestination = Pick<Destination, ClientIndexField>;

/** Fields intentionally NOT shipped to the client: detail surfaces hydrate
 *  from the per-destination JSON files (public/data/destinations/*.json),
 *  editorial/QA dashboards are lazy routes, and the *Metadata/*Ja entries
 *  are audit or legacy artifacts. tsc + the full unit suite guard this
 *  list: any client code accessing a dropped field fails the build. */
const DROPPED_FIELDS: ReadonlySet<string> = new Set([
  "content",
  "editorial",
  "budgetBreakdown",
  // KAI-219B: scoped cost facts are detail/audit fields — the client lite
  // index does NOT need them; detail surfaces hydrate from the per-
  // destination JSON files (which carry the facts), and the engine reads
  // the full index.
  "admission",
  "localTransport",
  "ratingsSchemaVersion",
  "imageMetadata",
  "seasonMetadata",
  "durationMetadata",
  "walkingMetadata",
  "walkingSunMin",
  "walkingShadeMin",
  "comfortMetadata",
  "crowdMetadata",
  "notes",
  "notesJa",
  "schemaVersion",
  "nearHubs",
  "reservation",
  "reservationJa",
  "parking",
  "parkingJa",
  "openingHoursJa",
  "openingHoursMetadata",
  "descriptionJa",
  "highlightsJa",
  "nearestStation",
  "rating",
  "bestSeasons",
  "transportMetadata",
  // Wikipedia identity is consumed by on-demand destination detail records,
  // not the lite index used by list/search surfaces.
  "wikipediaTitle",
  "wikipediaLanguage",
  "wikipediaUrl",
  "wikipediaPageId",
  "wikidataId",
  "crowd",
  "budget",
  "addedAt",
  "imageFromDestinationId",
  "imageNeedsReview",
  "ratingCount",
  "location",
]);

const CLIENT_INDEX_FIELD_SET: ReadonlySet<string> = new Set(
  CLIENT_INDEX_FIELDS,
);

/** The subset of a destination the client bundle needs. */
export function toClientRecord(destination: Destination): ClientDestination {
  const record: Record<string, unknown> = {};
  for (const field of CLIENT_INDEX_FIELDS) {
    const value = (destination as Record<string, unknown>)[field];
    if (value !== undefined) record[field] = value;
  }
  return record as ClientDestination;
}

/**
 * Renders destinations-index.lite.json: same array, one record per
 * canonical destination, only client fields. Deterministic: records keep
 * catalogue order; formatting matches prettier (2-space indent).
 */
export function buildClientIndex(destinations: Destination[]): string {
  const slim = destinations.map((d) => toClientRecord(d));
  return `${JSON.stringify(slim, null, 2)}\n`;
}

/** Fails loudly when a future catalogue field is not classified. */
export function assertClassified(fullIndex: Destination[]): void {
  const seen = new Set<string>();
  for (const d of fullIndex) {
    for (const key of Object.keys(d)) seen.add(key);
  }
  const unclassified = [...seen].filter(
    (k) => !CLIENT_INDEX_FIELD_SET.has(k) && !DROPPED_FIELDS.has(k),
  );
  if (unclassified.length > 0) {
    throw new Error(
      `KAI-82: unclassified index field(s) ${unclassified.join(", ")} — ` +
        `add to CLIENT_INDEX_FIELDS (client needs it) or DROPPED_FIELDS ` +
        `(detail/audit-only).`,
    );
  }
}
