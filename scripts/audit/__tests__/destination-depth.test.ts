import { describe, expect, it } from "vitest";
import type { Destination } from "../../../src/shared/types/destination.js";
import {
  buildDestinationDepthReport,
  PREFECTURE_REGIONS,
  renderDestinationDepthMarkdown,
} from "../destination-depth.js";

function destination(
  id: string,
  overrides: Partial<Destination> = {},
): Destination {
  return {
    id,
    name: id,
    nameJa: id,
    prefecture: "Tokyo",
    region: "Kanto",
    categories: ["Museum"],
    heroImage: "",
    description: "test",
    highlights: [],
    transportOptions: { train: 30 },
    recommendedVisitHours: { min: 2, max: 4 },
    season: { spring: 7, summer: 5, autumn: 7, winter: 5 },
    ratings: {
      overall: 5,
      couple: 5,
      summer: 5,
      winter: 5,
      rain: 5,
      food: 5,
      photography: 5,
      relaxation: 5,
      value: 5,
      uniqueness: 5,
    },
    tags: [],
    reservation: "",
    parking: "",
    notes: "",
    status: "published",
    travelEstimate: { confidence: "high" },
    collections: [],
    ...overrides,
  } as Destination;
}

describe("destination-depth audit", () => {
  it("produces byte-stable structured and markdown output", () => {
    const catalog = [
      destination("b", {
        municipalityId: "Tokyo:bunkyo",
        coordinates: { lat: 35.7, lng: 139.75 },
      }),
      destination("a", {
        municipalityId: "Tokyo:taito",
        coordinates: { lat: 35.71, lng: 139.8 },
      }),
    ];
    const first = buildDestinationDepthReport(catalog);
    const second = buildDestinationDepthReport([...catalog].reverse());
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(renderDestinationDepthMarkdown(first)).toBe(
      renderDestinationDepthMarkdown(second),
    );
  });

  it("keeps unknown metadata out of the score and reports available samples", () => {
    const report = buildDestinationDepthReport([
      destination("known", {
        municipalityId: "Tokyo:taito",
        coordinates: { lat: 35.71, lng: 139.8 },
      }),
      destination("unknown", {
        municipalityId: undefined,
        coordinates: undefined,
        categories: [],
        kind: undefined,
        recommendedVisitHours: undefined,
        totalTripHours: undefined,
        season: undefined,
        transportOptions: {},
      }),
    ]);
    const tokyo = report.prefectures.find((row) => row.prefecture === "Tokyo")!;
    expect(tokyo.sampleCounts.municipality).toBe(1);
    expect(tokyo.sampleCounts.experience).toBe(1);
    expect(tokyo.sampleCounts.duration).toBe(1);
    expect(tokyo.sampleCounts.completeSeason).toBe(1);
    expect(tokyo.sampleCounts.transport).toBe(1);
    expect(tokyo.dimensions.seasonalDiversity.availableSampleCount).toBe(1);
    expect(tokyo.dimensions.seasonalDiversity.score).not.toBeNull();
    expect(tokyo.dimensions.transportDiversity.availableSampleCount).toBe(1);
    const knownOnly = buildDestinationDepthReport([
      destination("known", {
        municipalityId: "Tokyo:taito",
        coordinates: { lat: 35.71, lng: 139.8 },
      }),
    ]);
    expect(tokyo.depthScore).toBe(
      knownOnly.prefectures.find((row) => row.prefecture === "Tokyo")!
        .depthScore,
    );
  });

  it("renormalizes dimension weights when a dimension has no usable sample", () => {
    const report = buildDestinationDepthReport([
      destination("only", {
        municipalityId: "Tokyo:taito",
        coordinates: { lat: 35.71, lng: 139.8 },
        season: undefined,
      }),
    ]);
    const tokyo = report.prefectures.find((row) => row.prefecture === "Tokyo")!;
    expect(tokyo.dimensions.seasonalDiversity.score).toBeNull();
    expect(tokyo.depthScoreCoveragePct).toBe(90);
    expect(tokyo.depthScore).not.toBeNull();
  });

  it("includes every prefecture and preserves the app's Mie-to-Kansai convention", () => {
    const report = buildDestinationDepthReport([
      destination("mie-place", {
        prefecture: "Mie",
        region: "Kansai",
        municipalityId: "Mie:ise",
      }),
    ]);
    expect(report.prefectures).toHaveLength(47);
    expect(report.prefectures.map((row) => row.prefecture)).toContain(
      "Okinawa",
    );
    expect(
      report.prefectures.find((row) => row.prefecture === "Mie")?.region,
    ).toBe("Kansai");
    expect(PREFECTURE_REGIONS.Mie).toBe("Kansai");
  });

  it("reports shell hubs and parent-child concentration without mutating input", () => {
    const hub = destination("hub", {
      role: "hub",
      placeType: "hub",
      kind: "city",
      municipalityId: "Tokyo:taito",
      relationships: { featuredDestinationIds: [] },
    });
    const child = destination("child", {
      role: "poi",
      placeType: "destination",
      municipalityId: "Tokyo:taito",
      relationships: { parentDestinationId: "hub" },
    });
    const shell = destination("shell", {
      role: "hub",
      placeType: "hub",
      kind: "city",
      municipalityId: "Tokyo:bunkyo",
    });
    const input = [hub, child, shell];
    const before = structuredClone(input);
    const report = buildDestinationDepthReport(input);
    expect(report.relationshipSummary.parentCount).toBe(1);
    expect(report.relationshipSummary.childCount).toBe(1);
    expect(
      report.relationshipSummary.shellHubs.map((item) => item.id),
    ).toContain("shell");
    expect(input).toEqual(before);
  });
});
