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
    // Heritage-group compatibility surface — not an actionable geographic hub.
    expect(aggregate.role).toBe("standalone");
    expect(aggregate.placeType).toBe("destination");
    expect(aggregate.kind).toBe("district");
    expect(aggregate.relationships?.featuredDestinationIds).toContain(
      "kiyomizu-dera",
    );
    expect(existsSync("public/data/destinations/kyoto-historic.json")).toBe(
      true,
    );
  });

  it("is not counted as an actionable shell hub", async () => {
    const { buildDestinationDepthReport } =
      await import("@/../scripts/audit/destination-depth.js");
    const report = buildDestinationDepthReport(destinations);
    const shellIds = report.relationshipSummary.shellHubs.map((hub) => hub.id);
    expect(shellIds).not.toContain("kyoto-historic");
  });

  it("contains exactly one compatibility-conversion editorial event", () => {
    const changes = aggregate.editorial?.changes ?? [];
    const compatEvents = changes.filter(
      (change) =>
        change.summary ===
        "Preserved the old ID as a heritage-group compatibility surface and removed Kiyomizu-oriented aggregate planning metadata.",
    );
    expect(compatEvents).toHaveLength(1);
    expect(compatEvents[0].changedAt).toBe("2026-08-22");
    expect(compatEvents[0].changedBy).toBe("Meguruto editorial");
    expect(compatEvents[0].method).toBe("manual");
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
