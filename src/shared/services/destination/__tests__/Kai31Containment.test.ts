import { describe, expect, it } from "vitest";
import destinationsIndex from "@/shared/data/destinations-index.json";
import type { Destination } from "@/shared/types/destination";

/**
 * KAI-31 containment regressions.
 *
 * The repository rule: parentDestinationId is valid only when the child is
 * physically inside the parent's municipality; cross-municipality access
 * must use gatewayHubId, never false containment.
 *
 * These tests pin the four corrected Shikoku relationships so a future
 * catalogue edit cannot silently reintroduce the old containment errors.
 */
const byId = new Map(
  (destinationsIndex as Destination[]).map((d) => [d.id, d]),
);

function expectContained(
  childId: string,
  hubId: string,
  municipalityId: string,
) {
  const child = byId.get(childId);
  expect(child, `${childId} exists`).toBeTruthy();
  expect(child!.relationships?.parentDestinationId).toBe(hubId);
  expect(child!.municipalityId).toBe(municipalityId);
  expect(child!.relationships?.gatewayHubId).toBeUndefined();
}

function expectGateway(
  childId: string,
  hubId: string,
  municipalityId?: string,
) {
  const child = byId.get(childId);
  expect(child, `${childId} exists`).toBeTruthy();
  expect(child!.relationships?.gatewayHubId).toBe(hubId);
  expect(child!.relationships?.parentDestinationId).toBeUndefined();
  if (municipalityId) {
    expect(child!.municipalityId).toBe(municipalityId);
  }
}

describe("KAI-31 Shikoku containment", () => {
  it("contains Iya Valley under Miyoshi City, not gatewayed via Tokushima City", () => {
    expectContained(
      "iya-valley-tokushima",
      "miyoshi-city",
      "Tokushima:miyoshi",
    );
    const miyoshi = byId.get("miyoshi-city");
    expect(miyoshi?.kind).toBe("city");
    expect(miyoshi?.municipalityId).toBe("Tokushima:miyoshi");
    expect(miyoshi?.relationships?.featuredDestinationIds).toContain(
      "iya-valley-tokushima",
    );
  });

  it("contains Uwajima Castle under Uwajima City and unfeatures it from Matsuyama", () => {
    expectContained("uwajima-castle", "uwajima-city", "Ehime:uwajima");
    const matsuyama = byId.get("matsuyama-city");
    expect(matsuyama?.relationships?.featuredDestinationIds).not.toContain(
      "uwajima-castle",
    );
  });

  it("gateways Teshima via Takamatsu instead of containing it in Takamatsu City", () => {
    // Teshima is in Tonosho Town (Shozu District), not Takamatsu City.
    expectGateway("teshima-island-kagawa", "takamatsu-city", "Kagawa:tonosho");
  });

  it("gateways Ryugado Cave via Kochi instead of containing it in Kochi City", () => {
    // Ryugado Cave is in Kami City, not Kochi City.
    expectGateway("ryugado-cave-kochi", "kochi-city", "Kochi:kami");
  });

  it("keeps every Shikoku child inside its parent municipality", () => {
    for (const d of destinationsIndex as Destination[]) {
      if (d.region !== "Shikoku") continue;
      const parentId = d.relationships?.parentDestinationId;
      if (!parentId) continue;
      const parent = byId.get(parentId);
      expect(parent, `${d.id} parent ${parentId} exists`).toBeTruthy();
      if (parent?.kind === "city") {
        expect(
          d.municipalityId,
          `${d.id} municipality matches ${parentId}`,
        ).toBe(parent.municipalityId);
      }
    }
  });
});
