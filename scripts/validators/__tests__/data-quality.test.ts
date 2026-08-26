import { describe, expect, it } from "vitest";
import { dataQualityValidator } from "../data-quality";
import { firstTimeRange } from "../../audit/data-quality-rules";
import type { ValidationContext } from "../types";
import type { Destination } from "@/shared/types/destination";

const base: Destination = {
  id: "test",
  name: "Test",
  role: "poi",
  prefecture: "Tokyo",
  region: "Kanto",
  categories: [],
  heroImage:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a/a.jpg/1280px-a.jpg",
  description: "desc",
  highlights: [],
  budgetRecommended: 1000,
  budgetMin: 500,
  budgetMax: 2000,
  // KAI-204 phase 3: numeric budgets require explicit provenance — the
  // "clean record" fixture carries trusted manual metadata.
  budgetMetadata: {
    method: "manual",
    confidence: "low",
    basis: "test fixture — trusted provenance",
  },
  transportOptions: { train: 60 },
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
  travelEstimate: { confidence: "high" },
  recommendedVisitHours: { min: 1, max: 2 },
  imageMetadata: {
    source: "Wikimedia Commons",
    license: "CC BY-SA 4.0",
    attribution: "x",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:a.jpg",
  },
} as Destination;

function ctx(
  destinations: Destination[],
  collections: unknown[] = [],
): ValidationContext {
  return {
    catalog: { destinations, collections: collections as never },
    config: {} as never,
  };
}

function run(destinations: Destination[], collections: unknown[] = []) {
  return dataQualityValidator.validate(ctx(destinations, collections));
}

describe("firstTimeRange", () => {
  it("parses HH:MM", () => {
    expect(firstTimeRange("09:00 - 17:00")).toBe(540);
    expect(firstTimeRange("10:30-21:00")).toBe(630);
    expect(firstTimeRange("open access")).toBeNull();
  });
});

describe("KAI-87 data quality validator", () => {
  it("passes a clean record", async () => {
    const r = await run([{ ...base }]);
    expect(r.passed).toBe(true);
    expect(r.metrics.warningsCount).toBe(0);
  });

  it("flags off-union kind, role, and status", async () => {
    const r = await run([
      {
        ...base,
        kind: "golf_course" as never,
        role: "destination" as never,
        status: "unpublished" as never,
      },
    ]);
    const codes = r.issues.map((i) => i.code);
    expect(codes).toContain("OFF_UNION_KIND");
    expect(codes).toContain("OFF_UNION_ROLE");
    expect(codes).toContain("OFF_UNION_STATUS");
  });

  it("flags version-tag artifacts and QA text leaks", async () => {
    const r = await run([
      {
        ...base,
        tags: ["v1.9.2"],
        notes: "Source-backed v1.9.2 expansion record for Kyoto City.",
      },
    ]);
    const codes = r.issues.map((i) => i.code);
    expect(codes).toContain("VERSION_TAG_ARTIFACT");
    expect(codes).toContain("QA_TEXT_LEAK");
  });

  it("fails deterministic numeric corruption instead of accepting it as data", async () => {
    const r = await run([
      {
        ...base,
        budgetMin: Number.NaN,
        budgetMax: 1000,
        budgetRecommended: 5000,
        transportOptions: { train: Number.POSITIVE_INFINITY },
        recommendedVisitHours: { min: 4, max: 2 },
        ratings: { overall: Number.NaN } as never,
      },
    ]);
    const codes = r.issues.map((i) => i.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        "NONFINITE_USER_NUMBER",
        "NONFINITE_TRANSPORT_VALUE",
        "INVALID_VISIT_HOURS_RANGE",
        "NONFINITE_RATING",
      ]),
    );
    expect(r.passed).toBe(false);
  });

  it("fails unfinished migration text", async () => {
    const r = await run([{ ...base, notes: "Municipal hub created in" }]);
    expect(r.passed).toBe(false);
    expect(r.issues.map((i) => i.code)).toContain("QA_TEXT_LEAK");
  });

  it("checks localized fields for deterministic migration text", async () => {
    const r = await run([
      {
        ...base,
        content: {
          en: {
            name: "Test",
            description: "ok",
            highlights: [],
            notes: "Municipal hub created in",
          },
        },
      },
    ]);
    expect(r.issues.map((i) => i.code)).toContain("QA_TEXT_LEAK");
  });

  it("flags island rail claims on isIsland zones", async () => {
    const r = await run([
      {
        ...base,
        transportZoneId: "sado",
        transportOptions: { train: 180, car: 240 },
      },
    ]);
    expect(r.issues.map((i) => i.code)).toContain("ISLAND_RAIL_CLAIM");
  });

  it("flags localAccessModes/transportOptions contradictions", async () => {
    const r = await run([
      {
        ...base,
        localAccessModes: ["car", "my_car", "bus"] as never,
        transportOptions: { train: 180 },
      },
    ]);
    expect(r.issues.map((i) => i.code)).toContain(
      "LAM_TRANSPORT_CONTRADICTION",
    );
  });

  it("flags open-access hours on paid kinds", async () => {
    const r = await run([
      { ...base, kind: "museum", businessHours: "24 Hours (Open access)" },
    ]);
    expect(r.issues.map((i) => i.code)).toContain("OPEN_ACCESS_ON_PAID_KIND");
  });

  it("flags hours cross-field conflicts", async () => {
    const r = await run([
      {
        ...base,
        businessHours: "09:00 - 17:00",
        openingHours: "10:00 - 18:00",
      },
    ]);
    expect(r.issues.map((i) => i.code)).toContain("HOURS_CROSS_FIELD_CONFLICT");
  });

  it("flags missing season, budget, and image metadata on published non-hubs", async () => {
    const r = await run([
      {
        ...base,
        season: undefined as never,
        bestMonths: [] as never,
        budgetRecommended: undefined as never,
        // A genuinely missing budget: no numbers AND no provenance marker.
        budgetMetadata: undefined as never,
        budgetMin: undefined as never,
        budgetMax: undefined as never,
        budgetBreakdown: undefined as never,
        imageMetadata: undefined as never,
      },
    ]);
    const codes = r.issues.map((i) => i.code);
    expect(codes).toContain("MISSING_SEASON_DATA");
    expect(codes).toContain("MISSING_BUDGET");
    expect(codes).toContain("MISSING_IMAGE_METADATA");
  });

  it("does not flag missing budget/season on hubs", async () => {
    const r = await run([
      {
        ...base,
        role: "hub",
        kind: "city",
        budgetRecommended: undefined as never,
        season: undefined as never,
      },
    ]);
    expect(r.issues.map((i) => i.code)).not.toContain("MISSING_BUDGET");
    expect(r.issues.map((i) => i.code)).not.toContain("MISSING_SEASON_DATA");
  });

  it("flags season/bestMonths contradictions", async () => {
    // winter is top-scored (9) but bestMonths [3,4,5] are spring (score 4 < 9×0.5)
    const r = await run([
      {
        ...base,
        season: { spring: 4, summer: 4, autumn: 4, winter: 9 },
        bestMonths: [3, 4, 5],
      },
    ]);
    expect(r.issues.map((i) => i.code)).toContain(
      "SEASON_BESTMONTHS_CONTRADICTION",
    );
  });

  it("flags walkingMin beyond the visit window", async () => {
    const r = await run([{ ...base, walkingMin: 200 }]);
    expect(r.issues.map((i) => i.code)).toContain("WALKING_MIN_IMPLAUSIBLE");
  });

  it("flags coarse grid coordinates and low-res heroes", async () => {
    const r = await run([
      {
        ...base,
        coordinates: { lat: 36.7, lng: 138.3 },
        heroImage:
          "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a/a.jpg/250px-a.jpg",
      },
    ]);
    const codes = r.issues.map((i) => i.code);
    expect(codes).toContain("COARSE_GRID_COORDS");
    expect(codes).toContain("LOW_RES_HERO");
  });

  it("flags unsplash heroes claiming Wikimedia attribution", async () => {
    const r = await run([
      {
        ...base,
        heroImage: "https://images.unsplash.com/photo-x",
        imageMetadata: {
          source: "Wikimedia Commons",
          license: "CC",
          attribution: "x",
          sourceUrl: "x",
        },
      },
    ]);
    expect(r.issues.map((i) => i.code)).toContain("HERO_LICENSE_HOST_MISMATCH");
  });

  it("flags placeholder sources and off-schema transport keys", async () => {
    const r = await run([
      {
        ...base,
        editorial: {
          lifecycle: "published",
          sources: ["editorial-review-2026"] as never,
        },
        transportOptions: { walk: 15 } as never,
      },
    ]);
    const codes = r.issues.map((i) => i.code);
    expect(codes).toContain("PLACEHOLDER_SOURCE");
    expect(codes).toContain("UNKNOWN_TRANSPORT_KEY");
  });

  it("flags collection sortOrder collisions, count mismatch, and membership shape", async () => {
    const r = await run(
      [
        {
          ...base,
          id: "a",
          collections: [{ collectionId: "c1", sortOrder: 1 }],
        },
        {
          ...base,
          id: "b",
          collections: [
            { collectionId: "c1", sortOrder: 1 },
            { collectionId: "c1", name: "x" as never },
          ],
        },
      ],
      [{ id: "c1", metadata: { expectedMembers: 5 } }],
    );
    const codes = r.issues.map((i) => i.code);
    expect(codes).toContain("COLLECTION_SORTORDER_COLLISION");
    expect(codes).toContain("COLLECTION_COUNT_MISMATCH");
    expect(codes).toContain("COLLECTION_MEMBERSHIP_SHAPE");
  });

  it("fails the gate (error severity) on newly introduced preventive violations", async () => {
    // These classes are zero-debt after KAI-87; a new instance must fail
    // validate:catalog-fast (any validator error fails the gate), not just
    // emit a warning.
    const r = await run([
      { ...base, transportZoneId: "sado", transportOptions: { train: 180 } },
    ]);
    expect(r.passed).toBe(false);
    expect(r.metrics.errorsCount).toBeGreaterThan(0);
    const islandRail = r.issues.find((i) => i.code === "ISLAND_RAIL_CLAIM");
    expect(islandRail?.severity).toBe("error");
  });

  it("keeps accepted-debt classes as warnings (passed stays true)", async () => {
    const r = await run([
      { ...base, season: undefined as never, bestMonths: [] as never },
    ]);
    expect(r.passed).toBe(true);
    expect(r.metrics.errorsCount).toBe(0);
    expect(
      r.issues.some(
        (i) => i.code === "MISSING_SEASON_DATA" && i.severity === "warning",
      ),
    ).toBe(true);
  });

  it("flags imageMetadata with explicitly unverified attribution (warning debt)", async () => {
    const r = await run([
      {
        ...base,
        imageMetadata: {
          source: "Unsplash",
          license: "Unsplash License",
          attribution:
            "Unverified — photographer lookup requires Unsplash API access",
          sourceUrl: "https://unsplash.com",
        },
      },
    ]);
    expect(r.passed).toBe(true);
    expect(r.metrics.errorsCount).toBe(0);
    expect(
      r.issues.some(
        (i) =>
          i.code === "UNRESOLVED_IMAGE_ATTRIBUTION" && i.severity === "warning",
      ),
    ).toBe(true);
  });

  it("flags template transport clusters shared by 3+ records", async () => {
    const r = await run([
      { ...base, id: "a", transportOptions: { train: 200 } },
      { ...base, id: "b", transportOptions: { train: 200 } },
      { ...base, id: "c", transportOptions: { train: 200 } },
    ]);
    expect(r.issues.map((i) => i.code)).toContain("TEMPLATE_TRANSPORT_CLUSTER");
  });

  it("flags repeated destination-template descriptions as warning debt", async () => {
    const r = await run([
      {
        ...base,
        description: "A visitor destination in Kyoto City.",
        content: {
          en: {
            name: "Template",
            description: "A visitor destination in Kyoto City.",
          },
        },
      },
    ]);
    expect(r.passed).toBe(true);
    expect(
      r.issues.some(
        (i) => i.code === "GENERIC_TEMPLATE_COPY" && i.severity === "warning",
      ),
    ).toBe(true);
  });
});

describe("KAI-214 budget-state taxonomy hard contract", () => {
  const trustedBase = {
    ...base,
    budgetMetadata: {
      method: "manual",
      confidence: "low",
      basis: "verified ticket ¥1500 (ledger LEDGER_VERIFIED)",
    },
  };

  async function codes(overrides: Partial<Destination>) {
    const r = await run([{ ...trustedBase, ...overrides }]);
    return r.issues.map((i) => i.code);
  }

  it("verified_paid without verified_source provenance → hard error", async () => {
    const c = await codes({
      budgetMetadata: {
        method: "manual",
        state: "verified_paid",
        // no provenance
        basis: "verified",
      },
    });
    expect(c).toContain("KAI214_TRUSTED_STATE_REQUIRES_VERIFIED_PROVENANCE");
  });

  it("verified_free without evidence → hard error", async () => {
    const c = await codes({
      budgetMetadata: {
        method: "manual",
        state: "verified_free",
        provenance: "verified_source",
        basis: "admission costs apply (no gratuity evidence)",
      },
    });
    expect(c).toContain("KAI214_VERIFIED_FREE_REQUIRES_EVIDENCE");
  });

  it("unavailable without reasonCode → hard error", async () => {
    const c = await codes({
      budgetMetadata: {
        method: "unknown",
        state: "unavailable",
        // no reasonCode
      },
    });
    expect(c).toContain("KAI214_NON_NUMERIC_STATE_REQUIRES_REASON");
  });

  it("not_applicable carrying tickets>0 → hard error", async () => {
    const c = await codes({
      budgetBreakdown: { transport: 500, tickets: 1500, food: 300, cafe: 200 },
      budgetMetadata: {
        method: "manual",
        state: "not_applicable",
        provenance: "verified_source",
        reasonCode: "hub_budget_not_applicable",
        basis: "hub",
      },
    });
    expect(c).toContain("KAI214_NOT_APPLICABLE_WITH_TICKETS");
  });

  it("verified_paid + provenance model → contradictory hard error", async () => {
    const c = await codes({
      budgetMetadata: {
        method: "model",
        state: "verified_paid",
        provenance: "model",
        modelVersion: "budget-model-v1",
      },
    });
    expect(c).toContain("KAI214_CONTRADICTORY_STATE_PROVENANCE");
  });

  it("valid explicit state passes cleanly", async () => {
    const c = await codes({
      budgetMetadata: {
        method: "manual",
        state: "verified_paid",
        provenance: "verified_source",
        confidence: "low",
        basis: "verified ticket ¥1500 (ledger LEDGER_VERIFIED)",
      },
    });
    expect(c).not.toContain(
      "KAI214_TRUSTED_STATE_REQUIRES_VERIFIED_PROVENANCE",
    );
    expect(c).not.toContain("KAI214_CONTRADICTORY_STATE_PROVENANCE");
  });

  it("existing records without explicit state are untouched (ratchet)", async () => {
    // The current catalogue uses method-only metadata; none of the new
    // KAI-214 guards may fire on it.
    const c = await codes({
      budgetMetadata: {
        method: "manual",
        confidence: "low",
        basis: "verified ticket ¥1500 (ledger LEDGER_VERIFIED)",
      },
    });
    expect(c.some((code) => code.startsWith("KAI214_"))).toBe(false);
  });
});
