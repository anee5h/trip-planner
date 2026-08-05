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
    coordinates: { lat: 34.46, lng: 133.99 },
    transportOptions: { ferry: 210 },
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
  it("passes a valid ferry-only island", async () => {
    const result = await transportTopologyValidator.validate(
      makeContext([baseDestination({ id: "naoshima-test" })]),
    );
    expect(result.passed).toBe(true);
    expect(errors(result)).toEqual([]);
  });

  it("catches an unresolved island destination zone", async () => {
    const result = await transportTopologyValidator.validate(
      makeContext([
        baseDestination({
          id: "mystery-island",
          name: "Mystery Island",
          tags: ["island", "remote"],
          coordinates: { lat: 28.0, lng: 141.0 },
          prefecture: "Tokyo",
        }),
      ]),
    );
    const unresolved = errors(result).filter(
      (i) => i.code === "unresolved_destination_zone",
    );
    expect(unresolved.length).toBeGreaterThan(0);
    expect(result.passed).toBe(false);
  });

  it("never resolves an island-marked record to the mainland default", async () => {
    const result = await transportTopologyValidator.validate(
      makeContext([
        baseDestination({
          id: "fallthrough-island",
          name: "Fallthrough Island",
          tags: ["island", "remote"],
          coordinates: { lat: 35.4, lng: 137.4 },
          prefecture: "Nagano",
        }),
      ]),
    );
    const unresolved = errors(result).filter(
      (i) => i.code === "unresolved_destination_zone",
    );
    const fallthrough = errors(result).filter(
      (i) => i.code === "island_falls_through_to_mainland",
    );
    expect(unresolved.length + fallthrough.length).toBeGreaterThan(0);
    expect(result.passed).toBe(false);
  });

  it("catches a rail mode without a rail edge", async () => {
    const result = await transportTopologyValidator.validate(
      makeContext([
        baseDestination({
          id: "ferry-rail-island",
          name: "Ferry Rail Island",
          tags: ["island", "remote"],
          coordinates: { lat: 34.46, lng: 133.99 },
          transportOptions: { train: 180, ferry: 210 },
        }),
      ]),
    );
    const rail = errors(result).filter((i) => i.code === "mode_without_edge");
    expect(rail.length).toBeGreaterThan(0);
    expect(result.passed).toBe(false);
  });

  it("catches an invalid local mode in topology", async () => {
    const result = await transportTopologyValidator.validate(
      makeContext([baseDestination({ id: "valid-dest" })]),
    );
    // The production topology must not contain 'walk' as a local mode.
    expect(
      errors(result).filter((i) => i.code === "invalid_local_mode"),
    ).toEqual([]);
  });

  it("catches duplicate edges", async () => {
    const zones = topology.zones;
    const edges = topology.edges;
    const keyed = new Set<string>();
    let duplicates = 0;
    for (const e of edges) {
      const key = [e.from, e.to].sort().join("↔");
      if (keyed.has(key)) duplicates += 1;
      keyed.add(key);
    }
    expect(duplicates).toBe(0);
    expect(zones.length).toBeGreaterThan(10);
  });
});
