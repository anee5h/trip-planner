import { describe, expect, it } from "vitest";
import destinationsIndex from "@/shared/data/destinations-index.json";
import type { Destination } from "@/shared/types/destination";

/**
 * KAI-32 Chugoku containment regressions.
 *
 * The repository rule: parentDestinationId is valid only when the child is
 * physically inside the parent's municipality; cross-municipality access
 * must use gatewayHubId, never false containment. Islands must never be
 * reachable by a train-only route and must stay inside their real
 * municipality (Miyajima/Itsukushima is in Hatsukaichi, never Hiroshima
 * City).
 *
 * These tests pin the corrected Chugoku relationships so a future catalogue
 * edit cannot silently reintroduce the old containment errors.
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

describe("KAI-32 Chugoku containment", () => {
  it("keeps Bitchu Matsuyama Castle under Takahashi City, not Okayama City", () => {
    // Regression: the castle is in Takahashi City; the practical gateway is
    // Okayama but parenting must reflect physical containment only.
    expectContained(
      "bitchu-matsuyama-castle",
      "takahashi-city",
      "Okayama:takahashi",
    );
  });

  it("keeps Korakuen Garden in Okayama City and unfeatures it from Kurashiki", () => {
    // Regression: Korakuen is in Okayama City; Kurashiki's featured list
    // must not imply false containment across municipalities.
    expectContained("korakuen-okayama", "okayama-city", "Okayama:okayama");
    const kurashiki = byId.get("kurashiki-city");
    expect(kurashiki?.relationships?.featuredDestinationIds).not.toContain(
      "korakuen-okayama",
    );
  });

  it("keeps Miyajima/Itsukushima under Hatsukaichi City, never Hiroshima City", () => {
    // Regression: Miyajima Island is in Hatsukaichi, not Hiroshima City.
    expectContained(
      "miyajima-itsukushima",
      "hatsukaichi-city",
      "Hiroshima:hatsukaichi",
    );
    const hiroshima = byId.get("hiroshima-city");
    expect(hiroshima?.relationships?.featuredDestinationIds).not.toContain(
      "miyajima-itsukushima",
    );
  });

  it("does not expose a train-only route to the Miyajima island POI", () => {
    // Miyajima is ferry-dependent. The island-marked record must carry no
    // rail/shinkansen/car static option, and without a ferry route in the
    // registry it is declared non-routable (transportZoneId "unknown")
    // rather than inheriting a mainland rail corridor.
    const miyajima = byId.get("miyajima-itsukushima")!;
    expect(miyajima.kind).toBe("island");
    const transportOptions = miyajima.transportOptions ?? {};
    expect(transportOptions.train).toBeUndefined();
    expect(transportOptions.shinkansen).toBeUndefined();
    expect(transportOptions.car).toBeUndefined();
    expect(miyajima.transportZoneId).toBe("unknown");
  });

  it("keeps every Chugoku child inside its parent municipality", () => {
    for (const d of destinationsIndex as Destination[]) {
      if (d.region !== "Chugoku") continue;
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
