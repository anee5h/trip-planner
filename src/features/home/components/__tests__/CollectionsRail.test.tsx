import { describe, expect, it } from "vitest";
import type { Destination } from "@/shared/types/destination";
import type { Collection } from "@/shared/types/collection";
import {
  getFeaturedCollectionCards,
  MAX_FEATURED_COLLECTIONS,
  type FeaturedCollectionCandidate,
} from "../CollectionsRail";

function collection(id: string, sortOrder: number): Collection {
  return {
    id,
    slug: id,
    name: id,
    description: "",
    nameJa: `${id} 日本語`,
    descriptionJa: "",
    category: "curated",
    type: "curated",
    icon: "",
    badgeColor: "",
    sortOrder,
    sourceUrl: `https://example.com/${id}`,
    metadata: {
      authority: "curated",
      status: "active",
      lastVerified: "2026-08-01",
    },
  };
}

function candidate(id: string, sortOrder: number): FeaturedCollectionCandidate {
  return {
    collection: collection(id, sortOrder),
    members: [
      {
        id: `${id}-cover`,
        heroImage: `https://example.com/${id}.jpg`,
      } as unknown as Destination,
    ],
  };
}

describe("Featured Collections", () => {
  it("exposes more than the legacy six without exceeding ten", () => {
    const cards = getFeaturedCollectionCards(
      Array.from({ length: 12 }, (_, index) =>
        candidate(`collection-${index}`, index),
      ),
    );

    expect(cards.length).toBeGreaterThan(6);
    expect(cards.length).toBeLessThanOrEqual(MAX_FEATURED_COLLECTIONS);
  });

  it("does not pad with inactive, unsourced, or unusable collections", () => {
    const invalid = candidate("invalid", 0);
    invalid.collection.metadata.status = "deprecated";
    const noCover = candidate("no-cover", 1);
    noCover.members = [{ id: "no-cover" } as unknown as Destination];

    expect(getFeaturedCollectionCards([invalid, noCover])).toEqual([]);
  });
});
