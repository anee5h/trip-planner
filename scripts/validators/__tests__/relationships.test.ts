import { describe, it, expect } from "vitest";
import { relationshipsValidator } from "../relationships";
import { DEFAULT_VALIDATION_CONFIG } from "../../config/validation-rules";
import type { Destination } from "../../../src/shared/types/destination";

function dest(overrides: Partial<Destination>): Destination {
  return {
    id: "x",
    name: "X",
    prefecture: "Tokyo",
    region: "Kanto",
    categories: [],
    heroImage: "https://example.com/x.jpg",
    description: "X",
    highlights: [],
    budgetRecommended: 0,
    budgetMin: 0,
    budgetMax: 0,
    role: "standalone",
    ...overrides,
  } as Destination;
}

function context(destinations: Destination[]) {
  return {
    catalog: { destinations, collections: [] },
    config: DEFAULT_VALIDATION_CONFIG,
  };
}

function errorsFor(issues: { severity: string; code: string }[]) {
  return issues.filter((i) => i.severity === "error").map((i) => i.code);
}

describe("relationshipsValidator distance + gateway checks", () => {
  it("passes a destination contained within its parent hub", async () => {
    const hub = dest({
      id: "tokyo-city",
      role: "hub",
      coordinates: { lat: 35.68, lng: 139.76 },
    });
    const poi = dest({
      id: "poi-a",
      role: "standalone",
      coordinates: { lat: 35.7, lng: 139.76 },
      relationships: { parentDestinationId: "tokyo-city" },
    });
    const res = await relationshipsValidator.validate(context([hub, poi]));
    expect(res.passed).toBe(true);
  });

  it("flags a parent beyond the containment distance", async () => {
    const hub = dest({
      id: "morioka-city",
      role: "hub",
      prefecture: "Iwate",
      coordinates: { lat: 39.7, lng: 141.15 },
    });
    const poi = dest({
      id: "geibikei-gorge-iwate",
      role: "standalone",
      prefecture: "Iwate",
      coordinates: { lat: 39.02, lng: 141.58 },
      relationships: { parentDestinationId: "morioka-city" },
    });
    const res = await relationshipsValidator.validate(context([hub, poi]));
    expect(errorsFor(res.issues)).toContain(
      "PARENT_BEYOND_CONTAINMENT_DISTANCE",
    );
  });

  it("accepts a gatewayHubId in place of a far parent", async () => {
    const hub = dest({
      id: "morioka-city",
      role: "hub",
      prefecture: "Iwate",
      coordinates: { lat: 39.7, lng: 141.15 },
    });
    const poi = dest({
      id: "geibikei-gorge-iwate",
      role: "standalone",
      prefecture: "Iwate",
      coordinates: { lat: 39.02, lng: 141.58 },
      relationships: { gatewayHubId: "morioka-city" },
    });
    const res = await relationshipsValidator.validate(context([hub, poi]));
    expect(res.passed).toBe(true);
  });

  it("flags a dangling gateway hub id", async () => {
    const poi = dest({
      id: "naoshima",
      role: "standalone",
      prefecture: "Kagawa",
      relationships: { gatewayHubId: "takamatsu-city" },
    });
    const res = await relationshipsValidator.validate(context([poi]));
    expect(errorsFor(res.issues)).toContain("DANGLING_GATEWAY_HUB_ID");
  });

  it("flags a cross-prefecture gateway hub", async () => {
    const hub = dest({
      id: "osaka-city",
      role: "hub",
      prefecture: "Osaka",
    });
    const poi = dest({
      id: "naoshima",
      role: "standalone",
      prefecture: "Kagawa",
      relationships: { gatewayHubId: "osaka-city" },
    });
    const res = await relationshipsValidator.validate(context([hub, poi]));
    expect(errorsFor(res.issues)).toContain("CROSS_PREFECTURE_GATEWAY_ID");
  });
});
