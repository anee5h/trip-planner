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

  it("keeps japan-top-castles at exactly 100 members with every official position 1-100", async () => {
    const result = await collectionsValidator.validate(
      context(
        destinationsIndex as Destination[],
        collectionsIndex as Collection[],
      ),
    );

    const castleIssueCodes = result.issues
      .filter((issue) => issue.targetId === "japan-top-castles")
      .map((issue) => issue.code);
    const numberingCodes = new Set([
      "CASTLE_MEMBER_COUNT",
      "CASTLE_SORT_ORDER_INVALID",
      "DUPLICATE_CASTLE_SORT_ORDER",
      "MISSING_CASTLE_SORT_ORDER",
    ]);
    expect(
      result.issues.filter((issue) => numberingCodes.has(issue.code)),
    ).toEqual([]);
    expect(castleIssueCodes).not.toContain(
      "EXPECTED_COLLECTION_MEMBER_COUNT_MISMATCH",
    );

    const members = destinationsIndex.filter((destination) =>
      destination.collections?.some(
        (membership) => membership.collectionId === "japan-top-castles",
      ),
    );
    const sortOrders = members
      .map(
        (m) =>
          m.collections?.find((c) => c.collectionId === "japan-top-castles")
            ?.sortOrder,
      )
      .filter((n): n is number => typeof n === "number");
    expect(members).toHaveLength(100);
    expect(new Set(sortOrders).size).toBe(100);
    expect(Math.min(...sortOrders)).toBe(1);
    expect(Math.max(...sortOrders)).toBe(100);
  });

  it("flags a missing and a duplicated official castle position", async () => {
    const members = Array.from({ length: 99 }, (_, i) =>
      destination({
        id: `castle-${i}`,
        collections: [{ collectionId: "japan-top-castles", sortOrder: i + 1 }],
      }),
    );
    members.push(
      destination({
        id: "castle-duplicate",
        collections: [{ collectionId: "japan-top-castles", sortOrder: 1 }],
      }),
    );

    const result = await collectionsValidator.validate(
      context(members, [collection({ id: "japan-top-castles" })]),
    );

    expect(
      result.issues.some((issue) => issue.code === "MISSING_CASTLE_SORT_ORDER"),
    ).toBe(true);
    expect(
      result.issues.some(
        (issue) => issue.code === "DUPLICATE_CASTLE_SORT_ORDER",
      ),
    ).toBe(true);
  });
});

describe("historic-towns-japan — curated semantics and durable product copy", () => {
  const historicTowns = collectionsIndex.find(
    (c) => c.id === "historic-towns-japan",
  )!;

  it("is a Meguruto-curated selection with exact expectedMembers", () => {
    expect(historicTowns.type).toBe("curated");
    expect(historicTowns.metadata.authority).toBe("curated");
    expect(historicTowns.metadata.expectedMembers).toBe(11);
    const members = destinationsIndex.filter((d) =>
      d.collections?.some((ref) => ref.collectionId === "historic-towns-japan"),
    );
    expect(members).toHaveLength(11);
  });

  it("does not embed the mutable national register count in user-facing copy", () => {
    const userFacing = [
      historicTowns.description,
      historicTowns.descriptionJa ?? "",
      historicTowns.content?.en?.description ?? "",
      historicTowns.content?.ja?.description ?? "",
      historicTowns.officialSource ?? "",
    ].join("\n");
    expect(userFacing).not.toContain("129");
    expect(userFacing).not.toMatch(/129地区|129 districts/);
  });
});
