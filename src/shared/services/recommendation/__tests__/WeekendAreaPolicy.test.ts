import { describe, it, expect } from "vitest";
import type { Destination, DestinationKind } from "@/shared/types/destination";
import {
  classifyWeekendResultCandidate,
  consolidateWeekendAreas,
  getContainedPlaces,
  isPublishedDestination,
  computeAreaCapacityMinutes,
  formatWeekendMinutes,
  passesNoOriginWeekendGate,
} from "../WeekendAreaPolicy";

// ── Helpers ──────────────────────────────────────────────────────────────────

type DestOverrides = Omit<Partial<Destination>, "ratings"> & {
  id: string;
  ratings?: Partial<Destination["ratings"]>;
};

function dest(overrides: DestOverrides): Destination {
  return {
    name: overrides.name ?? overrides.id,
    prefecture: "Tokyo",
    region: "Kanto",
    categories: [],
    heroImage: "",
    description: "",
    highlights: [],
    budgetRecommended: 5000,
    budgetMin: 3000,
    budgetMax: 10000,
    transportOptions: {},
    totalTripHours: 1,
    walkingMin: 10,
    walkingSunMin: 5,
    walkingShadeMin: 5,
    indoorPercent: 0,
    ratings: { overall: 5, food: 5, summer: 5, winter: 5 },
    ...overrides,
    id: overrides.id,
  } as unknown as Destination;
}

const hub = dest({
  id: "osaka-city",
  role: "hub",
  municipalityId: "Osaka:osaka",
  recommendedVisitHours: { min: 6, max: 12 },
});

const child = dest({
  id: "osaka-castle",
  role: "poi",
  relationships: { parentDestinationId: "osaka-city" },
  recommendedVisitHours: { min: 1, max: 3 },
});

// ── classifyWeekendResultCandidate ───────────────────────────────────────────

describe("classifyWeekendResultCandidate", () => {
  it("explicit hub → trip_area", () => {
    const cls = classifyWeekendResultCandidate(hub, [hub, child]);
    expect(cls.kind).toBe("trip_area");
    expect(cls.placeCount).toBe(1);
    expect(cls.capacityMinutes).toBe(720); // own 12h > child 3h
  });

  it("child POI → poi with parentHubId", () => {
    const cls = classifyWeekendResultCandidate(child, [hub, child]);
    expect(cls.kind).toBe("poi");
    expect(cls.parentHubId).toBe("osaka-city");
  });

  it("standalone museum is a poi, never a base", () => {
    const museum = dest({
      id: "museum",
      role: "standalone",
      kind: "museum" as DestinationKind,
    });
    expect(classifyWeekendResultCandidate(museum, [museum]).kind).toBe("poi");
  });

  it("standalone tower/park/castle are pois", () => {
    for (const kind of ["tower", "park", "castle", "shrine", "beach"]) {
      const d = dest({
        id: `d-${kind}`,
        role: "standalone",
        kind: kind as DestinationKind,
      });
      expect(classifyWeekendResultCandidate(d, [d]).kind).toBe("poi");
    }
  });

  it("legacy standalone root without area kind → poi (no missing-kind rule)", () => {
    const noKind = dest({
      id: "ghibli-museum",
      role: "standalone",
      recommendedVisitHours: { min: 6, max: 13 },
    });
    expect(classifyWeekendResultCandidate(noKind, [noKind]).kind).toBe("poi");
  });

  it("standalone with explicit area kind → standalone_area", () => {
    const kamikochi = dest({
      id: "nagano-kamikochi",
      role: "standalone",
      kind: "mountain" as DestinationKind,
      recommendedVisitHours: { min: 6, max: 13 },
    });
    const cls = classifyWeekendResultCandidate(kamikochi, [kamikochi]);
    expect(cls.kind).toBe("standalone_area");
    expect(cls.capacityMinutes).toBe(780);
  });

  it("area-like standalone kind (island, nature, lake) → standalone_area", () => {
    for (const kind of ["island", "nature", "lake", "mountain", "district"]) {
      const d = dest({
        id: `d-${kind}`,
        role: "standalone",
        kind: kind as DestinationKind,
      });
      expect(classifyWeekendResultCandidate(d, [d]).kind).toBe(
        "standalone_area",
      );
    }
  });

  it("area-like standalone that is also a child stays standalone_area", () => {
    const kamikochi = dest({
      id: "nagano-kamikochi",
      role: "standalone",
      kind: "mountain" as DestinationKind,
      relationships: { parentDestinationId: "matsumoto-city" },
    });
    const cls = classifyWeekendResultCandidate(kamikochi, [
      dest({ id: "matsumoto-city", role: "hub" }),
      kamikochi,
    ]);
    expect(cls.kind).toBe("standalone_area");
  });

  it("legacy destination without role/kind → poi", () => {
    const legacy = dest({ id: "kegon-falls" });
    expect(classifyWeekendResultCandidate(legacy, [legacy]).kind).toBe("poi");
  });

  it("destination with children → trip_area even without hub role", () => {
    const area = dest({
      id: "area-root",
      role: "standalone",
      relationships: undefined,
    });
    const contained = dest({
      id: "spot",
      role: "poi",
      relationships: { parentDestinationId: "area-root" },
    });
    expect(classifyWeekendResultCandidate(area, [area, contained]).kind).toBe(
      "trip_area",
    );
  });
});

// ── isPublishedDestination ───────────────────────────────────────────────────

describe("isPublishedDestination", () => {
  it("published / legacy / missing lifecycle are published", () => {
    expect(isPublishedDestination(dest({ id: "a" }))).toBe(true);
    expect(
      isPublishedDestination(
        dest({ id: "b", editorial: { lifecycle: "published" } as never }),
      ),
    ).toBe(true);
    expect(
      isPublishedDestination(
        dest({ id: "c", editorial: { lifecycle: "legacy" } as never }),
      ),
    ).toBe(true);
  });

  it("in_review and draft are unpublished", () => {
    expect(
      isPublishedDestination(
        dest({ id: "d", editorial: { lifecycle: "in_review" } as never }),
      ),
    ).toBe(false);
    expect(
      isPublishedDestination(
        dest({ id: "e", editorial: { lifecycle: "draft" } as never }),
      ),
    ).toBe(false);
  });
});

// ── getContainedPlaces / capacity ────────────────────────────────────────────

describe("getContainedPlaces + computeAreaCapacityMinutes", () => {
  it("counts only unique published children", () => {
    const unpublished = dest({
      id: "hidden",
      role: "poi",
      relationships: { parentDestinationId: "osaka-city" },
      editorial: { lifecycle: "in_review" } as never,
    });
    const places = getContainedPlaces(hub, [hub, child, unpublished]);
    expect(places.map((p) => p.id)).toEqual(["osaka-castle"]);
  });

  it("capacity is max(own, childrenSum), never the sum", () => {
    const smallHub = dest({
      id: "hub",
      recommendedVisitHours: { min: 1, max: 2 }, // 120 min
    });
    const kids = [
      dest({
        id: "c1",
        relationships: { parentDestinationId: "hub" },
        recommendedVisitHours: { min: 1, max: 6 }, // 360
      }),
      dest({
        id: "c2",
        relationships: { parentDestinationId: "hub" },
        recommendedVisitHours: { min: 1, max: 4 }, // 240
      }),
    ];
    // max(120, 600) = 600
    expect(computeAreaCapacityMinutes(smallHub, kids)).toBe(600);
  });
});

// ── consolidateWeekendAreas ──────────────────────────────────────────────────

describe("consolidateWeekendAreas", () => {
  it("eligible parent suppresses its eligible child card", () => {
    const pool = [hub, child];
    const consolidated = consolidateWeekendAreas([hub, child], pool);
    expect(consolidated.areas.map((a) => a.id)).toEqual(["osaka-city"]);
    expect(consolidated.placeCountById.get("osaka-city")).toBe(1);
    expect(consolidated.totalPlaceCount).toBe(1);
  });

  it("child of an ineligible parent is not promoted", () => {
    const orphan = dest({
      id: "orphan",
      role: "poi",
      relationships: { parentDestinationId: "missing-hub" },
      recommendedVisitHours: { min: 1, max: 10 }, // 600 min — enough on its own
    });
    const consolidated = consolidateWeekendAreas([orphan], [orphan]);
    expect(consolidated.areas).toEqual([]);
    expect(consolidated.totalPlaceCount).toBe(0);
  });

  it("standalone POI is not promoted even with large own capacity", () => {
    const museum = dest({
      id: "big-museum",
      role: "standalone",
      kind: "museum",
      recommendedVisitHours: { min: 1, max: 10 }, // 600 min
    });
    const consolidated = consolidateWeekendAreas([museum], [museum]);
    expect(consolidated.areas).toEqual([]);
  });

  it("coherent standalone area remains eligible", () => {
    const kamikochi = dest({
      id: "nagano-kamikochi",
      role: "standalone",
      kind: "mountain" as DestinationKind,
      recommendedVisitHours: { min: 6, max: 13 },
    });
    const consolidated = consolidateWeekendAreas([kamikochi], [kamikochi]);
    expect(consolidated.areas.map((a) => a.id)).toEqual(["nagano-kamikochi"]);
    expect(consolidated.kindById.get("nagano-kamikochi")).toBe(
      "standalone_area",
    );
  });

  it("separate Tokyo wards stay separate hubs", () => {
    const shinjuku = dest({ id: "shinjuku-city", role: "hub" });
    const shibuya = dest({ id: "shibuya-city", role: "hub" });
    const consolidated = consolidateWeekendAreas(
      [shinjuku, shibuya],
      [shinjuku, shibuya],
    );
    expect(consolidated.areas.map((a) => a.id)).toEqual([
      "shinjuku-city",
      "shibuya-city",
    ]);
  });

  it("separate nearby municipalities stay separate hubs", () => {
    const osaka = dest({ id: "osaka-city", role: "hub" });
    const kyoto = dest({ id: "kyoto-city", role: "hub" });
    const consolidated = consolidateWeekendAreas(
      [osaka, kyoto],
      [osaka, kyoto],
    );
    expect(consolidated.areas.map((a) => a.id)).toEqual([
      "osaka-city",
      "kyoto-city",
    ]);
  });

  it("parent is never counted as its own child place", () => {
    const consolidated = consolidateWeekendAreas([hub], [hub, child]);
    expect(consolidated.totalPlaceCount).toBe(1);
    expect(consolidated.placeCountById.get("osaka-city")).toBe(1);
  });

  it("unpublished children are excluded from counts", () => {
    const hidden = dest({
      id: "hidden",
      role: "poi",
      relationships: { parentDestinationId: "osaka-city" },
      editorial: { lifecycle: "in_review" } as never,
    });
    const consolidated = consolidateWeekendAreas([hub], [hub, child, hidden]);
    expect(consolidated.totalPlaceCount).toBe(1);
  });

  it("same child id is never counted twice across areas", () => {
    // A child with a single parent cannot be double-counted by the data
    // model; a defensive pool with duplicate records still dedupes.
    const dup = dest({
      id: "dup",
      relationships: { parentDestinationId: "osaka-city" },
    });
    const consolidated = consolidateWeekendAreas([hub], [hub, dup, dup]);
    expect(consolidated.totalPlaceCount).toBe(1);
  });
});

// ── No-origin weekend gate ───────────────────────────────────────────────────

describe("passesNoOriginWeekendGate", () => {
  it("no-origin 2D1N still enforces 480 published minutes", () => {
    const thinHub = dest({
      id: "thin-hub",
      role: "hub",
      recommendedVisitHours: { min: 1, max: 6 }, // 360 min
    });
    expect(passesNoOriginWeekendGate(thinHub, [thinHub])).toBe(false);
  });

  it("thin hub fails even without an origin", () => {
    const thinArea = dest({
      id: "thin-area",
      role: "standalone",
      kind: "nature" as DestinationKind,
      recommendedVisitHours: { min: 1, max: 7 }, // 420 min
    });
    expect(passesNoOriginWeekendGate(thinArea, [thinArea])).toBe(false);
  });

  it("coherent 480+ minute area passes without an origin", () => {
    const kamikochi = dest({
      id: "nagano-kamikochi",
      role: "standalone",
      kind: "mountain" as DestinationKind,
      recommendedVisitHours: { min: 6, max: 13 }, // 780 min
    });
    expect(passesNoOriginWeekendGate(kamikochi, [kamikochi])).toBe(true);
  });

  it("hub with children summing to 480+ passes", () => {
    const hub = dest({
      id: "hub",
      role: "hub",
      recommendedVisitHours: { min: 1, max: 2 }, // 120 own
    });
    const kids = [
      dest({
        id: "c1",
        relationships: { parentDestinationId: "hub" },
        recommendedVisitHours: { min: 1, max: 4 },
      }),
      dest({
        id: "c2",
        relationships: { parentDestinationId: "hub" },
        recommendedVisitHours: { min: 1, max: 4 },
      }),
    ];
    // childrenSum 480 >= own 120 → 480 minutes → passes.
    expect(passesNoOriginWeekendGate(hub, [hub, ...kids])).toBe(true);
  });

  it("POI never passes the no-origin gate", () => {
    const museum = dest({
      id: "museum",
      role: "standalone",
      kind: "museum" as DestinationKind,
      recommendedVisitHours: { min: 1, max: 10 },
    });
    expect(passesNoOriginWeekendGate(museum, [museum])).toBe(false);
  });
});

// ── formatWeekendMinutes ─────────────────────────────────────────────────────

describe("formatWeekendMinutes", () => {
  it("formats minutes as compact durations", () => {
    expect(formatWeekendMinutes(45)).toBe("45m");
    expect(formatWeekendMinutes(60)).toBe("1h");
    expect(formatWeekendMinutes(130)).toBe("2h 10m");
    expect(formatWeekendMinutes(undefined)).toBe("");
  });

  it("localizes to Japanese duration units", () => {
    expect(formatWeekendMinutes(45, "ja")).toBe("45分");
    expect(formatWeekendMinutes(60, "ja")).toBe("1時間");
    expect(formatWeekendMinutes(130, "ja")).toBe("2時間10分");
  });
});
