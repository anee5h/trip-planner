import { describe, it, expect } from "vitest";
import { relationshipsValidator } from "../relationships";
import destinationsIndex from "@/shared/data/destinations-index.json";

describe("Geography & Municipality Relationship Integrity", () => {
  it("verifies Ghibli Museum regression fixture is unparented from Chofu hub and correctly assigned to Mitaka municipality with Chofu gateway", () => {
    const ghibli = destinationsIndex.find((d) => d.id === "ghibli-museum");
    expect(ghibli).toBeDefined();
    expect(ghibli?.relationships?.parentDestinationId).toBeUndefined();
    expect(ghibli?.relationships?.gatewayHubId).toBe("chofu-tokyo");
    expect(ghibli?.municipalityId).toBe("Tokyo:mitaka");
  });

  it("triggers PARENT_MUNICIPALITY_NOT_VERIFIED error when a parent hub lacks a verified municipalityId", async () => {
    const mockDestinations = [
      {
        id: "unverified-hub",
        name: "Unverified Hub",
        role: "hub",
        prefecture: "Tokyo",
        // municipalityId is intentionally omitted
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
