import { describe, expect, it } from "vitest";
import { runAudit } from "../catalog-integrity";
import { buildBaseline, compareToBaseline } from "../catalog-baseline";
import type { Destination } from "@/shared/types/destination";

const base = {
  id: "test-place",
  name: "Test Place",
  prefecture: "Nagasaki",
  region: "Kyushu",
  categories: ["History"],
  heroImage:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a/a.jpg/1280px-a.jpg",
  description: "desc",
  highlights: ["h"],
  budgetRecommended: 1000,
  budgetMin: 500,
  budgetMax: 2000,
  transportOptions: { ferry: 40 },
  walkingMin: 30,
  walkingSunMin: 30,
  walkingShadeMin: 30,
  indoorPercent: 0,
  ratings: {} as Destination["ratings"],
  crowd: { weekday: 1, weekend: 1, holiday: 1 },
  season: { spring: 5, summer: 5, autumn: 5, winter: 5 },
  bestMonths: [4],
  reservation: "",
  parking: "",
  notes: "",
  tags: [],
  collections: [],
  status: "published",
  role: "poi",
  travelEstimate: { confidence: "high" },
  recommendedVisitHours: { min: 1, max: 2 },
  imageMetadata: {
    source: "Wikimedia Commons",
    license: "CC BY-SA 4.0",
    attribution: "x",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:a.jpg",
  },
} as Destination;

describe("KAI-87 data-quality rules in the audit baseline gate", () => {
  it("emits Q-category warnings for preventive violations", () => {
    const violator = {
      ...base,
      id: "island-rail",
      transportZoneId: "gunkanjima",
      transportOptions: { train: 45 },
    };
    const report = runAudit([violator], [], [], []);
    const finding = report.findings.find((f) => f.code === "ISLAND_RAIL_CLAIM");
    expect(finding).toBeTruthy();
    expect(finding!.severity).toBe("warning");
    expect(finding!.category).toBe("Q");
  });

  it("check:catalog-warnings fails on a newly introduced finding (baseline gate)", () => {
    const violator = {
      ...base,
      id: "island-rail",
      transportZoneId: "gunkanjima",
      transportOptions: { train: 45 },
    };
    // Baseline built WITHOUT the violation: the violating fingerprint is not
    // accepted debt, so compareToBaseline must report it as added — which is
    // exactly the condition that makes `npm run check:catalog-warnings` exit
    // non-zero (new warning identities fail the gate).
    const cleanReport = runAudit([{ ...base, id: "clean" }], [], [], []);
    const baseline = buildBaseline(cleanReport);
    const report = runAudit([violator], [], [], []);
    const comparison = compareToBaseline(report, baseline);
    expect(comparison.added.some((f) => f.code === "ISLAND_RAIL_CLAIM")).toBe(
      true,
    );
    expect(comparison.added.length).toBeGreaterThan(0);
  });

  it("accepts an instance that IS baselined (no added finding)", () => {
    const violator = {
      ...base,
      id: "island-rail",
      transportZoneId: "gunkanjima",
      transportOptions: { train: 45 },
    };
    const report = runAudit([violator], [], [], []);
    const baseline = buildBaseline(report);
    const comparison = compareToBaseline(report, baseline);
    expect(comparison.added).toEqual([]);
  });
});
