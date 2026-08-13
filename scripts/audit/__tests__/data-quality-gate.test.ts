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

  it("flags template rating vectors stamped high/medium confidence (KAI-89)", () => {
    const templateVector = {
      overall: 9.5,
      couple: 9.3,
      summer: 9,
      winter: 9.1,
      rain: 9.2,
      food: 9.6,
      photography: 9.5,
      relaxation: 9.2,
      value: 9.4,
      uniqueness: 9.4,
    };
    const clone = {
      ...base,
      id: "template-clone",
      ratings: templateVector,
      ratingMetadata: {
        rubricVersion: 2,
        method: "manual",
        confidence: "high" as const,
      },
    };
    // Ten identical vectors form a template family; high-confidence metadata
    // on any of them is unsupported (KAI-89 laundering class).
    const clones = Array.from({ length: 10 }, (_, i) => ({
      ...clone,
      id: `template-clone-${i}`,
    }));
    const report = runAudit(clones, [], [], []);
    expect(
      report.findings.some(
        (f) => f.code === "RATING_METADATA_UNSUPPORTED_HIGH",
      ),
    ).toBe(true);
  });

  it("flags impossible rail values in Okinawa (KAI-89)", () => {
    const report = runAudit(
      [
        {
          ...base,
          id: "naha-rail",
          transportZoneId: "okinawa-main",
          transportOptions: { train: 200 },
        },
      ],
      [],
      [],
      [],
    );
    expect(report.findings.some((f) => f.code === "OKINAWA_RAIL_VALUE")).toBe(
      true,
    );
  });

  it("accepts legitimate Yui Rail runtimes above 30 minutes (KAI-89)", () => {
    // Official Yui Rail (yui-rail.co.jp): Naha Airport → Shuri ≈ 27,
    // Kyozuka ≈ 32, Urasoe-Maeda ≈ 34, Tedako-Uranishi (full line) ≈ 37
    // min. None of these are corruption and none may be rejected.
    const report = runAudit(
      [
        {
          ...base,
          id: "yui-shuri",
          transportZoneId: "okinawa-main",
          transportOptions: { train: 27 },
        },
        {
          ...base,
          id: "yui-kyozuka",
          transportZoneId: "okinawa-main",
          transportOptions: { train: 32 },
        },
        {
          ...base,
          id: "yui-urasoemaeda",
          transportZoneId: "okinawa-main",
          transportOptions: { train: 34 },
        },
        {
          ...base,
          id: "yui-tedako",
          transportZoneId: "okinawa-main",
          transportOptions: { train: 37 },
        },
      ],
      [],
      [],
      [],
    );
    expect(report.findings.some((f) => f.code === "OKINAWA_RAIL_VALUE")).toBe(
      false,
    );
  });
});
