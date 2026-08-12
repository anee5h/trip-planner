import { describe, expect, it } from "vitest";
import collectionsIndex from "../../../src/shared/data/collections-index.json";
import destinationsIndex from "../../../src/shared/data/destinations-index.json";
import { DEFAULT_VALIDATION_CONFIG } from "../../config/validation-rules";
import { collectionsValidator } from "../collections";
import type { Collection } from "../../../src/shared/types/collection";
import type { Destination } from "../../../src/shared/types/destination";
import type { ValidationResult } from "../types";

function destination(overrides: Partial<Destination>): Destination {
  return {
    id: "destination-a",
    name: "Destination A",
    prefecture: "Tokyo",
    region: "Kanto",
    categories: [],
    heroImage: "https://example.com/destination-a.jpg",
    description: "Destination A",
    highlights: [],
    budgetRecommended: 0,
    budgetMin: 0,
    budgetMax: 0,
    transportOptions: {},
    walkingMin: 0,
    walkingSunMin: 0,
    walkingShadeMin: 0,
    indoorPercent: 0,
    ratings: {
      overall: 0,
      couple: 0,
      summer: 0,
      winter: 0,
      rain: 0,
      food: 0,
      photography: 0,
      relaxation: 0,
      value: 0,
      uniqueness: 0,
    },
    crowd: { weekday: 0, weekend: 0, holiday: 0 },
    season: { spring: 0, summer: 0, autumn: 0, winter: 0 },
    bestMonths: [],
    tags: [],
    reservation: "None",
    parking: "None",
    notes: "None",
    status: "beta",
    travelEstimate: { confidence: "beta" },
    collections: [],
    ...overrides,
  } as Destination;
}

function collection(overrides: Partial<Collection> = {}): Collection {
  return {
    id: "collection-a",
    slug: "collection-a",
    name: "Collection A",
    description: "Collection A",
    category: "Curated",
    type: "curated",
    icon: "Landmark",
    badgeColor: "sky",
    sortOrder: 1,
    metadata: {
      authority: "historical_consensus",
      status: "active",
      lastVerified: "2026-08-11",
    },
    ...overrides,
  };
}

function context(destinations: Destination[], collections: Collection[]) {
  return {
    catalog: { destinations, collections },
    config: DEFAULT_VALIDATION_CONFIG,
  };
}
function issueCodes(result: ValidationResult) {
  return result.issues.map((issue) => issue.code);
}

describe("collectionsValidator — collection integrity rules", () => {
  it("keeps the UNESCO target synchronized with curated catalog membership", async () => {
    const result = await collectionsValidator.validate(
      context(
        destinationsIndex as Destination[],
        collectionsIndex as Collection[],
      ),
    );
    const unesco = collectionsIndex.find(
      (collection) => collection.id === "unesco-japan",
    );
    const unescoMembers = destinationsIndex.filter((destination) =>
      destination.collections?.some(
        (membership) => membership.collectionId === "unesco-japan",
      ),
    );

    expect(unesco?.metadata.expectedMembers).toBe(44);
    expect(unescoMembers).toHaveLength(44);
    expect(
      result.issues.filter((issue) => issue.targetId === "unesco-japan"),
    ).toEqual([]);
  });

  it("flags a destination that repeats the same collection membership", async () => {
    const result = await collectionsValidator.validate(
      context(
        [
          destination({
            collections: [
              { collectionId: "collection-a", confirmed: true },
              { collectionId: "collection-a", confirmed: true },
            ],
          }),
        ],
        [collection()],
      ),
    );

    expect(result.passed).toBe(false);
    expect(issueCodes(result)).toContain("DUPLICATE_DESTINATION_COLLECTION");
  });

  it("flags destination references to unknown collections", async () => {
    const result = await collectionsValidator.validate(
      context(
        [
          destination({
            collections: [
              { collectionId: "missing-collection", confirmed: true },
            ],
          }),
        ],
        [collection()],
      ),
    );

    expect(result.passed).toBe(false);
    expect(issueCodes(result)).toContain("DANGLING_DESTINATION_COLLECTION");
  });

  it("rejects city hubs from the UNESCO collection", async () => {
    const result = await collectionsValidator.validate(
      context(
        [
          destination({
            id: "kyoto-city",
            name: "Kyoto City",
            kind: "city",
            role: "hub",
            collections: [{ collectionId: "unesco-japan", confirmed: true }],
          }),
        ],
        [collection({ id: "unesco-japan", slug: "unesco-japan" })],
      ),
    );

    expect(result.passed).toBe(false);
    expect(issueCodes(result)).toContain("HUB_IN_BLACKLISTED_COLLECTION");
  });

  it("flags duplicate collection IDs in the collection index", async () => {
    const result = await collectionsValidator.validate(
      context([], [collection(), collection({ slug: "collection-a-copy" })]),
    );

    expect(result.passed).toBe(false);
    expect(issueCodes(result)).toContain("DUPLICATE_COLLECTION_ID");
  });

  it("warns when expected member metadata drifts from catalog membership", async () => {
    const result = await collectionsValidator.validate(
      context(
        [
          destination({
            collections: [{ collectionId: "collection-a", confirmed: true }],
          }),
        ],
        [
          collection({
            metadata: { ...collection().metadata, expectedMembers: 2 },
          }),
        ],
      ),
    );

    expect(result.passed).toBe(true);
    expect(issueCodes(result)).toContain(
      "EXPECTED_COLLECTION_MEMBER_COUNT_MISMATCH",
    );
  });
});
