import { describe, expect, it } from "vitest";
import { transportTopologyValidator } from "@/../scripts/validators/transport-topology";
import type {
  ValidationContext,
  ValidationIssue,
} from "@/../scripts/validators/types";
import type { Destination } from "@/shared/types/destination";
import { topology } from "@/shared/services/transport/TransportTopologyService";

function makeContext(destinations: Destination[]): ValidationContext {
  return {
    catalog: { destinations, collections: [] },
    config: {
      hubCollectionBlacklist: [],
      budgetTolerancePercent: 0,
      budgetMinToleranceYen: 0,
      httpTimeoutMs: 1000,
      maxWarningThreshold: 0,
      allowedImageMimeTypes: [],
    },
  };
}

function baseDestination(overrides: Partial<Destination> = {}): Destination {
  return {
    id: "test-island",
    name: "Test Island",
    nameJa: "テスト島",
    prefecture: "Kagawa",
    region: "Shikoku",
    categories: ["Art & Culture"],
    tags: ["island"],
    coordinates: { lat: 34.46, lng: 133.996 },
    transportOptions: { train: 180 },
    role: "standalone",
    status: "published",
    totalTripHours: 8,
    budgetMin: 1000,
    budgetMax: 4000,
    budgetRecommended: 2500,
    ratingCount: 1,
    ...overrides,
  } as Destination;
}

function errors(result: { issues: ValidationIssue[] }): ValidationIssue[] {
  return result.issues.filter((i) => i.severity === "error");
}

describe("transportTopologyValidator", () => {
  it("passes a valid explicitly assigned island", async () => {
    const result = await transportTopologyValidator.validate(
      makeContext([
        baseDestination({
          id: "naoshima-test",
          transportZoneId: "naoshima",
        }),
      ]),
    );
    expect(result.passed).toBe(true);
    expect(errors(result)).toEqual([]);
  });

  it("catches an explicit zone referencing an unknown zone", async () => {
    const result = await transportTopologyValidator.validate(
      makeContext([
        baseDestination({
          id: "bad-zone-island",
          transportZoneId: "atlantis",
        }),
      ]),
    );
    const bad = errors(result).filter(
      (i) => i.code === "unknown_explicit_zone",
    );
    expect(bad.length).toBeGreaterThan(0);
    expect(result.passed).toBe(false);
  });

  it("catches an explicit zone mismatching runtime resolution", async () => {
    const result = await transportTopologyValidator.validate(
      makeContext([
        baseDestination({
          id: "mismatch-island",
          transportZoneId: "sado",
          coordinates: { lat: 34.46, lng: 133.996 },
        }),
      ]),
    );
    const mismatch = errors(result).filter(
      (i) => i.code === "explicit_zone_mismatch",
    );
    expect(mismatch.length).toBeGreaterThan(0);
    expect(result.passed).toBe(false);
  });

  it("catches an island-marked record with no assignment", async () => {
    const result = await transportTopologyValidator.validate(
      makeContext([
        baseDestination({
          id: "unassigned-island",
          kind: "island",
          tags: ["island", "remote"],
          prefecture: "Nagano",
          coordinates: { lat: 35.4, lng: 137.4 },
        }),
      ]),
    );
    const unassigned = errors(result).filter(
      (i) => i.code === "unassigned_island",
    );
    expect(unassigned.length).toBeGreaterThan(0);
    expect(result.passed).toBe(false);
  });

  it("catches an explicit-only zone resolved without assignment", async () => {
    const result = await transportTopologyValidator.validate(
      makeContext([
        baseDestination({
          id: "missing-explicit-ishigaki",
          tags: [],
          prefecture: "Okinawa",
          coordinates: { lat: 24.45, lng: 124.2 },
          transportZoneId: undefined,
        }),
      ]),
    );
    const missing = errors(result).filter(
      (i) => i.code === "missing_explicit_zone",
    );
    expect(missing.length).toBeGreaterThan(0);
    expect(result.passed).toBe(false);
  });

  it("accepts an intentional declaration that naturally resolves unknown", async () => {
    const result = await transportTopologyValidator.validate(
      makeContext([
        baseDestination({
          id: "bridge-island",
          transportZoneId: "mainland-honshu",
          tags: ["island", "bridge"],
          coordinates: { lat: 35.3, lng: 139.48 },
        }),
      ]),
    );
    const mismatch = errors(result).filter(
      (i) => i.code === "explicit_zone_mismatch",
    );
    expect(mismatch).toEqual([]);
    expect(result.passed).toBe(true);
  });

  it("passes with no destination records (structural checks only)", async () => {
    const result = await transportTopologyValidator.validate(makeContext([]));
    expect(errors(result)).toEqual([]);
  });

  it("topology edges only carry rail/road/bus modes", () => {
    const RAIL_ROAD_BUS = new Set([
      "train",
      "shinkansen",
      "car",
      "my_car",
      "bus",
    ]);
    for (const edge of topology.edges) {
      for (const mode of edge.modes) {
        expect(RAIL_ROAD_BUS.has(mode)).toBe(true);
      }
    }
  });
});
