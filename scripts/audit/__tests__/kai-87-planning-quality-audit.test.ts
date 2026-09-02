import { describe, expect, it } from "vitest";
import type { Destination } from "@/shared/types/destination";
import {
  buildPlanningAudit,
  calculatePlanningQualityScore,
  classifyAdmission,
  classifySeasonality,
  classifyPriority,
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
  });
});
