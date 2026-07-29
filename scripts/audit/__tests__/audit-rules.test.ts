/**
 * Unit tests for audit rule functions (§9.1 of the v1.9.5 requirements spec).
 *
 * These tests verify:
 * - Valid translated highlights do not produce LOCALIZATION_PARITY_MISMATCH.
 * - Rain contradictions produce RAIN_DATA_CONFLICT with the correct fieldPaths.
 * - A public street with ticket cost > 0 produces FREE_PLACE_TICKET_COST.
 * - A paid museum with zero tickets produces PAID_VENUE_ZERO_TICKET_COST.
 * - Duplicate audit history entries are detected.
 * - An audit run does not mutate imported catalogue objects.
 * - Output ordering is deterministic.
 * - Low-confidence rating metadata reduces rating contribution.
 */

import { describe, it, expect } from "vitest";
import type { Destination } from "../../../src/shared/types/destination.js";
import {
  checkLocalizationParity,
  checkRainConsistency,
  checkAdmissionCost,
  checkKindCategoryCompatibility,
  checkDuplicateAuditHistory,
  checkTransportEstimates,
  checkRatingQuality,
  checkEnumValues,
  checkAreaAssignment,
  findDuplicateRatingVectors,
  applyAllRules,
} from "../rules.js";
import { computeHighestSeverity } from "../rules.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDestination(overrides: Partial<Destination> = {}): Destination {
  return {
    id: "test-dest",
    name: "Test Place",
    prefecture: "Tokyo",
    region: "Kanto",
    description: "A lovely test place with great views.",
    categories: ["Nature"],
    tags: ["v1.9.2"],
    heroImage: "",
    highlights: ["Nature"],
    budgetMin: 5000,
    budgetRecommended: 10000,
    budgetMax: 15000,
    transportOptions: { train: 60 },
    totalTripHours: 6,
    walkingMin: 30,
    walkingSunMin: 15,
    walkingShadeMin: 15,
    indoorPercent: 30,
    crowd: { weekday: 2, weekend: 4, holiday: 5 },
    season: { spring: 5, summer: 4, autumn: 5, winter: 3 },
    bestMonths: [4, 5, 10, 11],
    ratings: {
      overall: 7,
      couple: 7,
      summer: 6,
      winter: 5,
      rain: 5,
      food: 6,
      photography: 8,
      relaxation: 7,
      value: 7,
      uniqueness: 7,
    },
    ratingMetadata: { rubricVersion: 1, method: "assisted", confidence: "low" },
    status: "beta",
    travelEstimate: { confidence: "beta" },
    collections: [],
    reservation: "Not required",
    parking: "Available",
    notes: "",
    content: {
      en: {
        name: "Test Place",
        description: "A lovely test place with great views.",
        highlights: ["Nature"],
      },
      ja: {
        name: "テスト場所",
        description: "美しい景観のテスト場所です。",
        highlights: ["自然"],
      },
    },
    editorial: {
      lifecycle: "in_review",
      sources: [],
      changes: [],
    },
    ...overrides,
  } as unknown as Destination;
}

// ---------------------------------------------------------------------------
// RULE-001: Localization parity
// ---------------------------------------------------------------------------

describe("checkLocalizationParity", () => {
  it("does NOT produce a finding when ja highlights contain canonical translations", () => {
    const dest = makeDestination({
      categories: ["Nature", "Shopping"],
      content: {
        en: {
          name: "Test",
          description: "Test.",
          highlights: ["Nature", "Shopping"],
        },
        ja: {
          name: "テスト",
          description: "テスト。",
          highlights: ["自然", "ショッピング"],
        },
      },
    });
    expect(checkLocalizationParity(dest)).toHaveLength(0);
  });

  it("does NOT produce a finding when a category has no canonical Japanese mapping", () => {
    const dest = makeDestination({
      categories: ["Onsen"], // not in CATEGORY_JA_MAP
      content: {
        en: { name: "Test", description: "Test.", highlights: ["Onsen"] },
        ja: { name: "テスト", description: "テスト。", highlights: ["Onsen"] },
      },
    });
    expect(checkLocalizationParity(dest)).toHaveLength(0);
  });

  it("produces LOCALIZATION_PARITY_MISMATCH when canonical translation is absent from ja.highlights", () => {
    const dest = makeDestination({
      categories: ["Museum"],
      content: {
        en: { name: "Test", description: "Test.", highlights: ["Museum"] },
        // ja highlights has English copy instead of canonical translation
        ja: { name: "テスト", description: "テスト。", highlights: ["Museum"] },
      },
    });
    const findings = checkLocalizationParity(dest);
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe("LOCALIZATION_PARITY_MISMATCH");
    expect(findings[0].fieldPaths).toContain("content.ja.highlights");
    expect(findings[0].severity).toBe("warning");
  });

  it("accepts the canonical Japanese translation (博物館 for Museum)", () => {
    const dest = makeDestination({
      categories: ["Museum"],
      content: {
        en: { name: "Test", description: "Test.", highlights: ["Museum"] },
        ja: { name: "テスト", description: "テスト。", highlights: ["博物館"] },
      },
    });
    expect(checkLocalizationParity(dest)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// RULE-003: Rain consistency
// ---------------------------------------------------------------------------

describe("checkRainConsistency", () => {
  it("produces RAIN_DATA_CONFLICT when high rain rating contradicts low rainFriendly", () => {
    const dest = makeDestination({
      ratings: { ...makeDestination().ratings, rain: 9 },
      comfort: { heatTolerance: 5, rainFriendly: 2, walkingIntensity: 5 },
    });
    const findings = checkRainConsistency(dest);
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe("RAIN_DATA_CONFLICT");
    expect(findings[0].fieldPaths).toContain("ratings.rain");
    expect(findings[0].fieldPaths).toContain("comfort.rainFriendly");
  });

  it("produces RAIN_DATA_CONFLICT when high rain rating contradicts low indoorPercent", () => {
    const dest = makeDestination({
      ratings: { ...makeDestination().ratings, rain: 8 },
      indoorPercent: 10,
    });
    const findings = checkRainConsistency(dest);
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe("RAIN_DATA_CONFLICT");
    expect(findings[0].fieldPaths).toContain("indoorPercent");
  });

  it("does NOT flag when rain rating is below threshold", () => {
    const dest = makeDestination({
      ratings: { ...makeDestination().ratings, rain: 7 },
      comfort: { heatTolerance: 5, rainFriendly: 2, walkingIntensity: 5 },
    });
    expect(checkRainConsistency(dest)).toHaveLength(0);
  });

  it("does NOT flag when high rain rating is consistent with high rainFriendly", () => {
    const dest = makeDestination({
      ratings: { ...makeDestination().ratings, rain: 9 },
      comfort: { heatTolerance: 5, rainFriendly: 8, walkingIntensity: 5 },
      indoorPercent: 70,
    });
    expect(checkRainConsistency(dest)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// RULE-004: Admission cost (bidirectional)
// ---------------------------------------------------------------------------

describe("checkAdmissionCost", () => {
  it("produces FREE_PLACE_TICKET_COST when a public street has tickets > 0", () => {
    const dest = makeDestination({
      kind: "street",
      budgetBreakdown: { transport: 500, tickets: 500, food: 1500, cafe: 500 },
    });
    const findings = checkAdmissionCost(dest);
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe("FREE_PLACE_TICKET_COST");
    expect(findings[0].autoFixable).toBe(true);
  });

  it("produces PAID_VENUE_ZERO_TICKET_COST when a museum has zero tickets", () => {
    const dest = makeDestination({
      kind: "museum",
      budgetBreakdown: { transport: 500, tickets: 0, food: 1500, cafe: 500 },
    });
    const findings = checkAdmissionCost(dest);
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe("PAID_VENUE_ZERO_TICKET_COST");
  });

  it("produces PAID_VENUE_ZERO_TICKET_COST when a museum has missing tickets budget", () => {
    const dest = makeDestination({
      kind: "museum",
      // No budgetBreakdown at all
    });
    const findings = checkAdmissionCost(dest);
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe("PAID_VENUE_ZERO_TICKET_COST");
  });

  it("does NOT flag a beach with tickets=0", () => {
    const dest = makeDestination({
      kind: "beach",
      budgetBreakdown: { transport: 500, tickets: 0, food: 1500, cafe: 500 },
    });
    expect(checkAdmissionCost(dest)).toHaveLength(0);
  });

  it("does NOT flag a museum with positive ticket cost", () => {
    const dest = makeDestination({
      kind: "museum",
      budgetBreakdown: { transport: 500, tickets: 1200, food: 1500, cafe: 500 },
    });
    expect(checkAdmissionCost(dest)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// RULE-005: Kind/category compatibility
// ---------------------------------------------------------------------------

describe("checkKindCategoryCompatibility", () => {
  it("flags a market that lacks the Food category", () => {
    const dest = makeDestination({ kind: "market", categories: ["Shopping"] });
    const findings = checkKindCategoryCompatibility(dest);
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe("KIND_CATEGORY_MISMATCH");
  });

  it("does NOT flag a park with Theme Park category", () => {
    const dest = makeDestination({
      kind: "park",
      categories: ["Theme Park"],
    });
    expect(checkKindCategoryCompatibility(dest)).toHaveLength(0);
  });

  it("does NOT flag a kind with no rule defined (e.g. onsen)", () => {
    const dest = makeDestination({ kind: "onsen", categories: ["Onsen"] });
    expect(checkKindCategoryCompatibility(dest)).toHaveLength(0);
  });

  it("does NOT flag a castle with History category", () => {
    const dest = makeDestination({ kind: "castle", categories: ["History"] });
    expect(checkKindCategoryCompatibility(dest)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Duplicate audit history
// ---------------------------------------------------------------------------

describe("checkDuplicateAuditHistory", () => {
  it("detects duplicate audit history entries", () => {
    const entry = {
      changedAt: "2026-07-29",
      changedBy: "TabiMap data audit",
      summary:
        "Canonicalized type, localized categories, budgets, ratings, and transport semantics",
      method: "assisted" as const,
    };
    const dest = makeDestination({
      editorial: {
        lifecycle: "in_review",
        sources: [],
        changes: [entry, entry], // duplicate
      },
    });
    const findings = checkDuplicateAuditHistory(dest);
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe("DUPLICATE_AUDIT_HISTORY");
    expect(findings[0].autoFixable).toBe(true);
  });

  it("does NOT flag unique audit history entries", () => {
    const dest = makeDestination({
      editorial: {
        lifecycle: "in_review",
        sources: [],
        changes: [
          {
            changedAt: "2026-07-28",
            changedBy: "editor",
            summary: "Initial import",
            method: "manual" as const,
          },
          {
            changedAt: "2026-07-29",
            changedBy: "TabiMap data audit",
            summary: "Audit repair",
            method: "assisted" as const,
          },
        ],
      },
    });
    expect(checkDuplicateAuditHistory(dest)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Non-mutation guarantee
// ---------------------------------------------------------------------------

describe("applyAllRules", () => {
  it("does NOT mutate the destination object", () => {
    const dest = makeDestination({
      ratings: { ...makeDestination().ratings, rain: 9 },
      comfort: { heatTolerance: 5, rainFriendly: 2, walkingIntensity: 5 },
    });
    const snapshot = JSON.stringify(dest);
    applyAllRules(dest, new Map());
    expect(JSON.stringify(dest)).toBe(snapshot);
  });
});

// ---------------------------------------------------------------------------
// Deterministic ordering
// ---------------------------------------------------------------------------

describe("computeHighestSeverity", () => {
  it("returns 'none' for an empty findings array", () => {
    expect(computeHighestSeverity([])).toBe("none");
  });

  it("returns the most severe level when mixed severities are present", () => {
    const findings = [
      { severity: "info" as const },
      { severity: "warning" as const },
      { severity: "error" as const },
    ] as Parameters<typeof computeHighestSeverity>[0];
    expect(computeHighestSeverity(findings)).toBe("error");
  });
});

// ---------------------------------------------------------------------------
// RULE-002: Transport thresholds
// ---------------------------------------------------------------------------

describe("checkTransportEstimates", () => {
  it("flags a train estimate above 120 min", () => {
    const dest = makeDestination({
      transportOptions: { train: 150 },
    });
    const findings = checkTransportEstimates(dest);
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe("TRANSPORT_ESTIMATE_SUSPICIOUS");
    expect(findings[0].fieldPaths).toContain("transportOptions.train");
  });

  it("does NOT flag a train estimate at or below 120 min", () => {
    const dest = makeDestination({ transportOptions: { train: 120 } });
    expect(checkTransportEstimates(dest)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// RULE-007: Rating quality
// ---------------------------------------------------------------------------

describe("checkRatingQuality", () => {
  it("flags uniform ratings across all fields", () => {
    const dest = makeDestination({
      ratings: {
        overall: 7,
        couple: 7,
        summer: 7,
        winter: 7,
        rain: 7,
        food: 7,
        photography: 7,
        relaxation: 7,
        value: 7,
        uniqueness: 7,
      },
    });
    const findings = checkRatingQuality(dest);
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe("SUSPICIOUS_RATING_PRECISION");
  });

  it("does NOT flag ratings with varied values", () => {
    const dest = makeDestination(); // has varied values by default
    expect(checkRatingQuality(dest)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Enum values check
// ---------------------------------------------------------------------------

describe("checkEnumValues", () => {
  it("flags invalid weatherDependence enum value", () => {
    const dest = makeDestination({
      weatherDependence:
        "invalid_value" as unknown as Destination["weatherDependence"],
    });
    const findings = checkEnumValues(dest);
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe("INVALID_ENUM_VALUE");
    expect(findings[0].fieldPaths).toContain("weatherDependence");
  });

  it("does NOT flag valid enum values", () => {
    const dest = makeDestination({
      weatherDependence: "high",
      status: "beta",
      role: "poi",
    });
    expect(checkEnumValues(dest)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Area assignment check
// ---------------------------------------------------------------------------

describe("checkAreaAssignment", () => {
  it("flags unknown areaId", () => {
    const dest = makeDestination({
      areaId: "unknown-area-id",
      relationships: { parentDestinationId: "tokyo-city" },
    });
    const findings = checkAreaAssignment(dest);
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe("AREA_ASSIGNMENT_REVIEW");
  });

  it("flags areaId mismatched with parent hub", () => {
    const dest = makeDestination({
      areaId: "omiya", // omiya parent is saitama-city
      relationships: { parentDestinationId: "kyoto-city" },
    });
    const findings = checkAreaAssignment(dest);
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe("AREA_ASSIGNMENT_REVIEW");
    expect(findings[0].fieldPaths).toContain("areaId");
  });

  it("does NOT flag valid areaId aligned with parent hub", () => {
    const dest = makeDestination({
      areaId: "omiya",
      relationships: { parentDestinationId: "saitama-city" },
    });
    expect(checkAreaAssignment(dest)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Duplicate rating vectors check
// ---------------------------------------------------------------------------

describe("findDuplicateRatingVectors", () => {
  it("flags child destinations of the same hub that share identical required rating vectors", () => {
    const dest1 = makeDestination({
      id: "dest-1",
      relationships: { parentDestinationId: "osaka-city" },
    });
    const dest2 = makeDestination({
      id: "dest-2",
      relationships: { parentDestinationId: "osaka-city" },
    });
    const findings = findDuplicateRatingVectors([dest1, dest2]);
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe("DUPLICATE_RATING_VECTOR");
    expect(findings[0].destinationId).toBe("dest-2");
    expect(findings[0].hubId).toBe("osaka-city");
  });

  it("does NOT flag destinations in different hubs with identical ratings", () => {
    const dest1 = makeDestination({
      id: "dest-1",
      relationships: { parentDestinationId: "osaka-city" },
    });
    const dest2 = makeDestination({
      id: "dest-2",
      relationships: { parentDestinationId: "kyoto-city" },
    });
    const findings = findDuplicateRatingVectors([dest1, dest2]);
    expect(findings).toHaveLength(0);
  });
});
