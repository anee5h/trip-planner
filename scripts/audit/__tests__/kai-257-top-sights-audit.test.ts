import { describe, expect, it } from "vitest";
import destinationsIndex from "@/shared/data/destinations-index.json";
import type { Destination } from "@/shared/types/destination";
import { runKai257Audit } from "../../audit-kai-257-top-sights-integrity";

const destinations = destinationsIndex as Destination[];

describe("KAI-257 Top Sights Audit Tooling", () => {
  it("calculates published catalogue size dynamically from canonical data", () => {
    const report = runKai257Audit(destinations);

    expect(report.catalogueSize).toBe(destinations.length);
    expect(report.hubCount).toBe(
      destinations.filter((d) => d.role === "hub").length,
    );
  });

  it("finds zero active defects on current canonical catalogue", () => {
    const report = runKai257Audit(destinations);

    expect(report.summary.totalDefectsFound).toBe(0);
    expect(report.affectedIdLedger).toHaveLength(0);
    expect(report.summary.cleanTopSightsHubCount).toBeGreaterThan(100);
    expect(report.summary.omittedTopSightsHubCount).toBeGreaterThan(0);
  });

  it("populates review ledger for ambiguous standalone candidates in same municipality", () => {
    const report = runKai257Audit(destinations);

    expect(report.reviewLedger.length).toBeGreaterThan(0);
    // Review ledger items are not mutated
    for (const item of report.reviewLedger) {
      expect(item.hubMunicipality).toBeDefined();
      expect(item.candidateMunicipality).toBe(item.hubMunicipality);
    }
  });

  it("detects and categorizes synthetic defect injections accurately", () => {
    const syntheticHub: Destination = {
      id: "synthetic-hub",
      name: "Synthetic Hub",
      role: "hub",
      kind: "city",
      prefecture: "Nagano",
      region: "Chubu",
      municipalityId: "Nagano:karuizawa",
      heroImage: "https://example.com/synth.jpg",
      description: "Synthetic test hub",
      highlights: ["Test"],
      categories: ["City"],
      relationships: {
        featuredDestinationIds: [
          "matsumoto-city", // DESTINATION_LEVEL_AS_SIGHT (peer hub)
          "nagano-bessho-onsen", // PARENT_MUNICIPALITY_MISMATCH (different municipality)
          "kiyomizu-dera", // SAME_PREFECTURE_VIOLATION (Kyoto vs Nagano)
          "non-existent-poi-id", // INVALID_OR_MISSING_ENTITY
          "synthetic-hub", // Self reference
        ],
      },
      transportOptions: {},
    };

    const testCatalogue = [...destinations, syntheticHub];
    const report = runKai257Audit(testCatalogue);

    expect(report.summary.totalDefectsFound).toBeGreaterThanOrEqual(5);

    const syntheticFindings = report.affectedIdLedger.filter(
      (f) => f.hubId === "synthetic-hub",
    );
    expect(syntheticFindings).toHaveLength(5);

    const categories = syntheticFindings.map((f) => f.category);
    expect(categories).toContain("DESTINATION_LEVEL_AS_SIGHT");
    expect(categories).toContain("PARENT_MUNICIPALITY_MISMATCH");
    expect(categories).toContain("SAME_PREFECTURE_VIOLATION");
    expect(categories).toContain("INVALID_OR_MISSING_ENTITY");
  });
});
