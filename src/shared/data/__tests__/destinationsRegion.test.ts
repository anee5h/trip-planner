import { describe, it, expect } from "vitest";
import destinations from "../destinations-index.json";
import { JAPAN_REGIONS } from "../../../../scripts/config/regions";

describe("Catalog Region Validation Test", () => {
  it("should ensure all destinations have a non-empty, valid canonical region", () => {
    const missingRegion = destinations.filter(
      (d: any) =>
        !d.region || typeof d.region !== "string" || d.region.trim() === "",
    );
    const invalidRegion = destinations.filter(
      (d: any) => d.region && !JAPAN_REGIONS.includes(d.region as any),
    );

    expect(
      missingRegion,
      `Destinations missing region: ${missingRegion.map((d: any) => d.id).join(", ")}`,
    ).toHaveLength(0);
    expect(
      invalidRegion,
      `Destinations with invalid region: ${invalidRegion.map((d: any) => `${d.id} (${d.region})`).join(", ")}`,
    ).toHaveLength(0);
  });

  it("should ensure all hubs (role === 'hub') have a non-empty, valid canonical region", () => {
    const hubs = destinations.filter((d: any) => d.role === "hub");
    const missingRegionHubs = hubs.filter(
      (h: any) =>
        !h.region || typeof h.region !== "string" || h.region.trim() === "",
    );
    const invalidRegionHubs = hubs.filter(
      (h: any) => h.region && !JAPAN_REGIONS.includes(h.region as any),
    );

    expect(hubs.length, "Total hubs count").toBeGreaterThan(0);
    expect(
      missingRegionHubs,
      `Hubs missing region: ${missingRegionHubs.map((h: any) => h.id).join(", ")}`,
    ).toHaveLength(0);
    expect(
      invalidRegionHubs,
      `Hubs with invalid region: ${invalidRegionHubs.map((h: any) => `${h.id} (${h.region})`).join(", ")}`,
    ).toHaveLength(0);
  });

  it("should ensure all parent hub IDs referenced in relationships exist and have valid regions", () => {
    const parentIds = new Set<string>();
    for (const d of destinations as any[]) {
      if (d.relationships?.parentDestinationId) {
        parentIds.add(d.relationships.parentDestinationId);
      }
    }

    const missingParentHubs: string[] = [];
    const parentHubsMissingRegion: string[] = [];

    for (const parentId of parentIds) {
      const parentHub = destinations.find((d: any) => d.id === parentId);
      if (!parentHub) {
        missingParentHubs.push(parentId);
      } else if (
        !parentHub.region ||
        !JAPAN_REGIONS.includes(parentHub.region as any)
      ) {
        parentHubsMissingRegion.push(parentId);
      }
    }

    expect(
      missingParentHubs,
      `Dangling parent hub references: ${missingParentHubs.join(", ")}`,
    ).toHaveLength(0);
    expect(
      parentHubsMissingRegion,
      `Parent hubs missing valid region: ${parentHubsMissingRegion.join(", ")}`,
    ).toHaveLength(0);
  });
});
