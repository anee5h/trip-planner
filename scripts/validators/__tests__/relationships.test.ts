import { describe, it, expect } from "vitest";
import { relationshipsValidator } from "../relationships";
import { DEFAULT_VALIDATION_CONFIG } from "../../config/validation-rules";
import type { Destination } from "../../../src/shared/types/destination";
import destinationsIndex from "@/shared/data/destinations-index.json";

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

describe("relationshipsValidator — focused rule tests", () => {
  it("passes a destination contained within its parent hub", async () => {
    const hub = dest({
      id: "tokyo-city",
      role: "hub",
      prefecture: "Tokyo",
      municipalityId: "Tokyo:tokyo",
      coordinates: { lat: 35.68, lng: 139.76 },
    });
    const poi = dest({
      id: "poi-a",
      role: "standalone",
      prefecture: "Tokyo",
      municipalityId: "Tokyo:tokyo",
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

  it("flags a cross-municipality parent", async () => {
    const hub = dest({
      id: "sakai-city",
      role: "hub",
      prefecture: "Osaka",
      municipalityId: "Osaka:sakai",
    });
    const poi = dest({
      id: "cupnoodles-museum-osaka-ikeda",
      role: "destination",
      prefecture: "Osaka",
      municipalityId: "Osaka:ikeda",
      coordinates: { lat: 34.83, lng: 135.43 },
      relationships: { parentDestinationId: "sakai-city" },
    });
    const res = await relationshipsValidator.validate(context([hub, poi]));
    expect(errorsFor(res.issues)).toContain("CROSS_MUNICIPALITY_PARENT_ID");
  });

  it("accepts a same-municipality parent", async () => {
    const hub = dest({
      id: "asago-city",
      role: "hub",
      prefecture: "Hyogo",
      municipalityId: "Hyogo:asago",
    });
    const poi = dest({
      id: "takeda-castle-ruins-hyogo",
      role: "destination",
      prefecture: "Hyogo",
      municipalityId: "Hyogo:asago",
      coordinates: { lat: 35.32, lng: 134.83 },
      relationships: { parentDestinationId: "asago-city" },
    });
    const res = await relationshipsValidator.validate(context([hub, poi]));
    expect(res.passed).toBe(true);
  });

  it("flags a contained destination without an independently verified municipality", async () => {
    const hub = dest({
      id: "osaka-city",
      role: "hub",
      prefecture: "Osaka",
      municipalityId: "Osaka:osaka",
    });
    const poi = dest({
      id: "unverified-contained",
      role: "destination",
      prefecture: "Osaka",
      coordinates: { lat: 34.7, lng: 135.5 },
      relationships: { parentDestinationId: "osaka-city" },
    });
    const res = await relationshipsValidator.validate(context([hub, poi]));
    expect(errorsFor(res.issues)).toContain("MUNICIPALITY_NOT_VERIFIED");
  });

  it("warns (not errors) on a gateway destination without a verified municipality", async () => {
    const hub = dest({
      id: "sakai-city",
      role: "hub",
      prefecture: "Osaka",
      municipalityId: "Osaka:sakai",
    });
    const poi = dest({
      id: "gateway-unverified",
      role: "standalone",
      prefecture: "Osaka",
      relationships: { gatewayHubId: "sakai-city" },
    });
    const res = await relationshipsValidator.validate(context([hub, poi]));
    expect(errorsFor(res.issues)).not.toContain("MUNICIPALITY_NOT_VERIFIED");
    expect(
      res.issues.some(
        (i) => i.code === "MUNICIPALITY_UNVERIFIED_NON_CONTAINED",
      ),
    ).toBe(true);
    expect(res.passed).toBe(true);
  });

  it("flags a destination with both parent and gateway set", async () => {
    const hub = dest({
      id: "osaka-city",
      role: "hub",
      prefecture: "Osaka",
      municipalityId: "Osaka:osaka",
    });
    const poi = dest({
      id: "both-set",
      role: "standalone",
      prefecture: "Osaka",
      municipalityId: "Osaka:osaka",
      relationships: {
        parentDestinationId: "osaka-city",
        gatewayHubId: "osaka-city",
      },
    });
    const res = await relationshipsValidator.validate(context([hub, poi]));
    expect(errorsFor(res.issues)).toContain("PARENT_AND_GATEWAY_BOTH_SET");
  });

  it("flags a legacy top-level hubId field", async () => {
    const poi = dest({
      id: "legacy-hub",
      role: "standalone",
      prefecture: "Osaka",
      relationships: { parentDestinationId: "osaka-city" },
    }) as unknown as Record<string, unknown>;
    (poi as Record<string, unknown>).hubId = "osaka-city";
    const res = await relationshipsValidator.validate(context([poi as never]));
    expect(errorsFor(res.issues)).toContain("LEGACY_HUB_ID_PRESENT");
  });

  it("does not orphan a gateway destination", async () => {
    const hub = dest({
      id: "sakai-city",
      role: "hub",
      prefecture: "Osaka",
    });
    const poi = dest({
      id: "gateway-poi",
      role: "destination",
      prefecture: "Osaka",
      relationships: { gatewayHubId: "sakai-city" },
    });
    const res = await relationshipsValidator.validate(context([hub, poi]));
    expect(errorsFor(res.issues)).not.toContain("ORPHAN_DESTINATION");
    expect(res.passed).toBe(true);
  });

  it("flags a dangling parent reference", async () => {
    const poi = dest({
      id: "orphan-poi",
      role: "destination",
      prefecture: "Tokyo",
      relationships: { parentDestinationId: "nonexistent-hub" },
    });
    const res = await relationshipsValidator.validate(context([poi]));
    expect(errorsFor(res.issues)).toContain("DANGLING_PARENT_ID");
  });

  it("flags a non-hub parent", async () => {
    const notHub = dest({
      id: "not-a-hub",
      role: "standalone",
      prefecture: "Tokyo",
    });
    const poi = dest({
      id: "child-of-nonhub",
      role: "destination",
      prefecture: "Tokyo",
      relationships: { parentDestinationId: "not-a-hub" },
    });
    const res = await relationshipsValidator.validate(context([notHub, poi]));
    expect(errorsFor(res.issues)).toContain("NON_HUB_PARENT_ID");
  });

  it("flags a circular parent hierarchy", async () => {
    const a = dest({
      id: "hub-a",
      role: "hub",
      prefecture: "Tokyo",
      municipalityId: "Tokyo:tokyo",
      relationships: { parentDestinationId: "hub-b" },
    });
    const b = dest({
      id: "hub-b",
      role: "hub",
      prefecture: "Tokyo",
      municipalityId: "Tokyo:tokyo",
      relationships: { parentDestinationId: "hub-a" },
    });
    const res = await relationshipsValidator.validate(context([a, b]));
    expect(errorsFor(res.issues)).toContain("CIRCULAR_PARENT_HIERARCHY");
  });

  it("flags a cross-prefecture parent", async () => {
    const hub = dest({
      id: "osaka-city",
      role: "hub",
      prefecture: "Osaka",
    });
    const poi = dest({
      id: "kyoto-poi",
      role: "destination",
      prefecture: "Kyoto",
      relationships: { parentDestinationId: "osaka-city" },
    });
    const res = await relationshipsValidator.validate(context([hub, poi]));
    expect(errorsFor(res.issues)).toContain("CROSS_PREFECTURE_PARENT_ID");
  });

  it("flags a self-parent reference", async () => {
    const poi = dest({
      id: "self-parent",
      role: "destination",
      prefecture: "Tokyo",
      relationships: { parentDestinationId: "self-parent" },
    });
    const res = await relationshipsValidator.validate(context([poi]));
    expect(errorsFor(res.issues)).toContain("SELF_PARENT_REFERENCE");
  });
});

describe("Geography & Municipality Relationship Integrity", () => {
  it("verifies Ghibli Museum regression fixture is standalone with correct Mitaka municipality", () => {
    const ghibli = destinationsIndex.find((d) => d.id === "ghibli-museum");
    expect(ghibli).toBeDefined();
    expect(ghibli?.relationships?.parentDestinationId).toBeUndefined();
    expect(ghibli?.relationships?.gatewayHubId).toBeUndefined();
    expect(ghibli?.municipalityId).toBe("Tokyo:mitaka");
  });

  it("triggers PARENT_MUNICIPALITY_NOT_VERIFIED error when a parent hub lacks a verified municipalityId", async () => {
    const mockDestinations = [
      {
        id: "unverified-hub",
        name: "Unverified Hub",
        role: "hub",
        prefecture: "Tokyo",
      },
      {
        id: "child-spot",
        name: "Child Spot",
        role: "spot",
        prefecture: "Tokyo",
        municipalityId: "Tokyo:chuo",
        relationships: {
          parentDestinationId: "unverified-hub",
        },
      },
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await relationshipsValidator.validate({
      catalog: { destinations: mockDestinations },
    } as any);
    const parentMuniIssue = result.issues.find(
      (i) => i.code === "PARENT_MUNICIPALITY_NOT_VERIFIED",
    );
    expect(parentMuniIssue).toBeDefined();
    expect(parentMuniIssue?.targetId).toBe("unverified-hub");
  });

  it("verifies zero relationship validation errors on current catalog dataset", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await relationshipsValidator.validate({
      catalog: { destinations: destinationsIndex },
    } as any);
    const errors = result.issues.filter((i) => i.severity === "error");
    expect(errors).toEqual([]);
  });
});
