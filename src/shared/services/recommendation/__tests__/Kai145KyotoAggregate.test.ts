import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import destinationsIndex from "@/shared/data/destinations-index.json";
import type { Destination } from "@/shared/types/destination";
import { DestinationRelationshipService } from "@/shared/services/destination/DestinationRelationshipService";
import { getRecommendations } from "../RecommendationService";
import { searchDocuments } from "@/features/search/services/searchIndex";

const destinations = destinationsIndex as Destination[];
const aggregate = destinations.find((place) => place.id === "kyoto-historic")!;
const kiyomizu = destinations.find((place) => place.id === "kiyomizu-dera")!;

describe("KAI-145 kyoto-historic compatibility surface", () => {
  it("keeps the old canonical ID/detail file while making the group non-recommendable", () => {
    expect(aggregate).toBeDefined();
    expect(aggregate.recommendationEligible).toBe(false);
    expect(aggregate.role).toBe("hub");
    expect(aggregate.placeType).toBe("hub");
    expect(aggregate.relationships?.featuredDestinationIds).toContain(
      "kiyomizu-dera",
    );
    expect(existsSync("public/data/destinations/kyoto-historic.json")).toBe(
      true,
    );
  });

  it("keeps standalone Kiyomizu exactly once and excludes the aggregate from choices", () => {
    expect(
      destinations.filter((place) => place.id === "kiyomizu-dera"),
    ).toHaveLength(1);
    const results = getRecommendations([aggregate, kiyomizu], {
      budget: 100_000,
      carMode: "none",
      publicModes: [],
      partySize: 2,
      visitedIds: [],
    });

    expect(results.map((result) => result.id)).toEqual(["kiyomizu-dera"]);
  });

  it("surfaces curated Kyoto zones from the city hub without the legacy aggregate", () => {
    const kyoto = destinations.find((place) => place.id === "kyoto-city")!;
    const featured =
      DestinationRelationshipService.getFeaturedChildDestinations(kyoto);
    const featuredIds = featured.map((place) => place.id);

    expect(featuredIds).toContain("kiyomizu-dera");
    expect(featuredIds).toContain("arashiyama-bamboo-togetsukyo");
    expect(featuredIds).toContain("kurama-dera-kyoto");
    expect(featuredIds).toContain("sanzen-in-ohara");
    expect(featuredIds).toContain("gekkeikan-okura-sake-museum");
    expect(featuredIds).not.toContain("kyoto-historic");
  });

  it("does not index the compatibility aggregate in typed search", async () => {
    const groups = await searchDocuments("Historic Kyoto", "en");
    const ids = groups
      .filter((group) => group.type === "destination")
      .flatMap((group) =>
        group.items.map((item) => item.metadata?.dest?.id as string),
      );

    expect(ids).not.toContain("kyoto-historic");
  });

  // Keep the fixture's import shape explicit: this test should fail loudly if
  // a future refactor accidentally removes the canonical standalone record.
  it("retains the standalone destination's bilingual identity", () => {
    expect(kiyomizu.name).toBe("Kiyomizu-dera Temple");
    expect(kiyomizu.nameJa).toBe("清水寺");
  });
});
