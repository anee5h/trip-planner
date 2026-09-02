import { describe, expect, it } from "vitest";
import destinationsData from "@/shared/data/destinations-index.json";
import { getValidModes } from "@/shared/services/recommendation/RecommendationScorer";
import { resolveOriginTransportZone } from "@/shared/services/transport/TransportTopologyService";
import type { Destination } from "@/shared/types/destination";
import {
  buildPlanningAudit,
  calculatePlanningQualityScore,
  calculateNormalizedPlanningQualityScore,
  classifyAdmission,
  classifySeasonality,
  classifyPriority,
  classifyPlanningPriority,
} from "../kai-87-planning-quality-audit";

const base = {
  id: "fixture-place",
  name: "Fixture Place",
  prefecture: "Tokyo",
  region: "Kanto",
  categories: ["Nature"],
  heroImage: "https://upload.wikimedia.org/wikipedia/commons/a/a/a.jpg",
  description: "A real description.",
  highlights: ["A real highlight"],
  transportOptions: { car: 80 },
  transportMetadata: { method: "source-verified" as const },
  admission: {
    state: "verified_free" as const,
    provenance: "verified_source" as const,
    cost: { kind: "bounded" as const, min: 0, max: 0 },
    scope: "open_area" as const,
    basis: "FREE_ENTRY official visitor guidance",
    sourceUrls: ["https://example.test/entry"],
    checkedAt: "2026-01-01",
  },
  localTransport: {
    kind: "not_applicable" as const,
    reason: "on-site plan",
  },
  recommendedVisitHours: { min: 1, max: 3 },
  coordinates: { lat: 35.68, lng: 139.76 },
  ratings: {},
  season: { spring: 5, summer: 5, autumn: 5, winter: 5 },
  bestMonths: [4],
  bestSeason: "Spring",
  seasonMetadata: { method: "model" as const, confidence: "medium" as const },
  durationMetadata: { method: "manual" as const, confidence: "high" as const },
  weatherDependence: "low" as const,
  reservation: "Usually not required.",
  parking: "Check official guidance.",
  notes: "No special notes.",
  tags: [],
  collections: [],
  status: "published" as const,
  travelEstimate: { confidence: "high" as const },
} as unknown as Destination;

describe("KAI-87 planning-quality audit contract", () => {
  it("keeps verified free, unknown, and unavailable admission distinct", () => {
    expect(classifyAdmission(base)).toBe("explicit_free");
    expect(
      classifyAdmission({
        ...base,
        id: "unknown",
        admission: undefined,
        budgetMetadata: { method: "unknown" },
      }),
    ).toBe("unknown");
    expect(
      classifyAdmission({
        ...base,
        id: "unavailable",
        admission: { state: "unavailable", cost: { kind: "unavailable" } },
      }),
    ).toBe("unavailable");
  });

  it("flags a placeholder all-year value without treating it as verified", () => {
    expect(
      classifySeasonality({
        ...base,
        bestSeason: "All year",
        bestMonths: [],
        season: undefined,
        seasonMetadata: undefined,
      }),
    ).toBe("suspicious");
    expect(
      classifySeasonality({
        ...base,
        bestSeason: "All year",
        bestMonths: [],
        seasonMetadata: { method: "model" },
      }),
    ).toBe("suspicious");
  });

  it("assigns P0 to recommendation-visible critical transport gaps", () => {
    expect(
      classifyPriority({
        recommendationVisible: true,
        criticalTransportOrBudget: true,
        importantPlanningGap: false,
        lowerImpact: false,
      }),
    ).toBe("P0");
  });

  it("keeps truthful evidence debt and schema gaps out of P0", () => {
    const emptyClassification = {
      destinationDataDefects: [],
      evidenceDebt: ["transport:local_transport_evidence"],
      schemaCapabilityGaps: ["parking_cost_unsupported_by_schema"],
      truthfulUnavailable: ["transport:local_transport_unavailable"],
      intentionalNotApplicable: [],
    };
    expect(
      classifyPlanningPriority({
        recommendationVisible: true,
        classification: emptyClassification,
      }),
    ).toBe("P2");
    expect(
      classifyPlanningPriority({
        recommendationVisible: true,
        classification: {
          ...emptyClassification,
          destinationDataDefects: ["budget:invalid_budget_range"],
        },
      }),
    ).toBe("P0");
    expect(
      classifyPlanningPriority({
        recommendationVisible: true,
        classification: {
          ...emptyClassification,
          destinationDataDefects: ["logistics:recommended_visit_duration"],
        },
      }),
    ).toBe("P1");
    expect(
      classifyPlanningPriority({
        recommendationVisible: false,
        classification: emptyClassification,
      }),
    ).toBe("P3");
  });

  it("normalizes weights when a quality dimension is not applicable", () => {
    const normalized = calculateNormalizedPlanningQualityScore({
      transport: "verified",
      budget: "not_applicable",
      seasonality: "verified",
      logistics: "complete",
      contentIntegrity: "complete",
      provenance: "verified",
    });
    expect(normalized.score).toBe(100);
    expect(normalized.appliedWeight).toBe(75);
    expect(normalized.excludedDimensions).toEqual(["budget"]);
  });

  it("keeps the KAI-87 P0 cohort clear of normalized critical defects", () => {
    const report = buildPlanningAudit(destinationsData as Destination[]);
    const previousP0 = [
      "inujima",
      "ogijima",
      "shodoshima",
      "ne-castle-hachinohe",
      "nemuro-peninsula-chashi-sites",
      "shimokita-hanto",
      "towada-hachimantai",
      "tsugaru",
      "tsuyama-castle",
      "noto",
      "awaji-farm-park-england-hill",
      "iki-tsushima",
      "izanagi-jingu-awaji",
      "kerama-shoto",
      "koshikijima",
      "nijigen-no-mori-awaji",
      "noto-hanto",
      "rishiri-rebun-sarobetsu",
      "sumoto-castle-awaji",
      "towada-art-center",
      "hirosaki-castle",
      "kabushima-shrine",
      "lake-towada-aomori",
      "tomogashima-islands",
      "amami-iriomote-natural-site",
    ];

    expect(report.priority.P0).toEqual([]);
    expect(
      previousP0.filter((id) => report.destinations[id].priority === "P0"),
    ).toEqual([]);
  });

  it("keeps each repaired P0 destination recommendation-reachable", () => {
    const previousP0 = [
      "inujima",
      "ogijima",
      "shodoshima",
      "ne-castle-hachinohe",
      "nemuro-peninsula-chashi-sites",
      "shimokita-hanto",
      "towada-hachimantai",
      "tsugaru",
      "tsuyama-castle",
      "noto",
      "awaji-farm-park-england-hill",
      "iki-tsushima",
      "izanagi-jingu-awaji",
      "kerama-shoto",
      "koshikijima",
      "nijigen-no-mori-awaji",
      "noto-hanto",
      "rishiri-rebun-sarobetsu",
      "sumoto-castle-awaji",
      "towada-art-center",
      "hirosaki-castle",
      "kabushima-shrine",
      "lake-towada-aomori",
      "tomogashima-islands",
      "amami-iriomote-natural-site",
    ];
    const origins = [
      { lat: 35.5147, lng: 139.5393 },
      { lat: 35.6812, lng: 139.7671 },
      { lat: 34.7025, lng: 135.4959 },
      { lat: 33.5902, lng: 130.4017 },
      { lat: 26.2124, lng: 127.6809 },
      { lat: 34.35, lng: 134.046 },
      { lat: 45.415, lng: 141.673 },
    ];
    const destinations = new Map(
      (destinationsData as Destination[]).map((destination) => [
        destination.id,
        destination,
      ]),
    );
    const travelDate = new Date("2026-08-15T12:00:00Z");
    const missing = previousP0.filter((id) => {
      const destination = destinations.get(id)!;
      return !origins.some((coordinates) => {
        const originZoneId = resolveOriginTransportZone({ coordinates });
        return (
          getValidModes(
            destination,
            "rental",
            ["train", "shinkansen", "bus", "flight", "ferry"],
            coordinates,
            undefined,
            originZoneId,
            { travelDate },
          ).length > 0
        );
      });
    });

    expect(missing).toEqual([]);
  });

  it("produces deterministic scores and reports", () => {
    const score = calculatePlanningQualityScore({
      transport: "verified",
      budget: "complete",
      seasonality: "verified",
      logistics: "complete",
      contentIntegrity: "complete",
      provenance: "verified",
    });
    expect(score).toBe(100);

    const first = buildPlanningAudit([base]);
    const second = buildPlanningAudit([base]);
    expect(first).toEqual(second);
    expect(first.catalogue.canonicalCount).toBe(1);
    expect(
      first.qualityScore.scoresByDestination["fixture-place"],
    ).toBeGreaterThan(0);
    expect(
      first.qualityScore.scoresByDestination["fixture-place"],
    ).toBeLessThanOrEqual(100);
    expect(first.schemaVersion).toBe(2);
    expect(
      first.findingDimensions.schemaCapabilityGaps.any.count,
    ).toBeGreaterThan(0);
    expect(
      first.findingDimensions.intentionalNotApplicable.count,
    ).toBeGreaterThan(0);
    expect(first.rawFindings.model).toBe("pre-normalization-v1");
    expect(Object.values(first.rawFindings.priority).flat()).toContain(
      "fixture-place",
    );
    expect(first.destinations["fixture-place"].priority).toBe("P2");
    expect(
      first.destinations["fixture-place"].normalizedQuality.appliedWeight,
    ).toBeGreaterThan(0);
  });
});
