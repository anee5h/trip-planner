import { describe, it, expect } from "vitest";
import type { Destination } from "@/shared/types/destination";
import { runRecommendationPipeline } from "../RecommendationPipeline";
import {
  consolidateTokyoWards,
  buildTokyoWardsLink,
  buildExplorerWardGroup,
  getWardGroup,
  TOKYO_WARDS_GROUP_ID,
  TOKYO_WARDS_DIVERSITY_BONUS_MAX,
  isTokyoWardHub,
} from "../TokyoWardsConsolidation";
import type { PipelineRecommendation } from "../RecommendationTypes";
import destinationsIndex from "@/shared/data/destinations-index.json";

const byId = new Map(
  (destinationsIndex as Destination[]).map((d) => [d.id, d]),
);

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
    transportOptions: { train: 60, shinkansen: 150 },
    totalTripHours: 4,
    walkingMin: 10,
    walkingSunMin: 5,
    walkingShadeMin: 5,
    indoorPercent: 50,
    ratings: { overall: 5, food: 5, summer: 5, winter: 5 },
    ...overrides,
    id: overrides.id,
  } as unknown as Destination;
}

function wardResult(
  id: string,
  score: number,
  placeCount: number,
): PipelineRecommendation {
  return {
    ...dest({
      id,
      role: "hub",
      kind: "ward",
      municipalityId: `Tokyo:${id.replace("-city", "")}`,
      recommendedVisitHours: { min: 1, max: 10 },
    }),
    score,
    match: {
      confidence: 80,
      reasons: [],
      matchedPreferences: [],
      unmatchedPreferences: [],
    },
    transportEstimate: {
      mode: "shinkansen",
      timeRange: [150, 270],
      source: "verified_ground_route",
    },
    weekend: {
      travelFit: { eligible: true, band: "strong", oneWayMinutes: 210 },
      capacity: {
        eligible: true,
        activityMinutes: 600,
        eligiblePlaceCount: 1,
        reason: "sufficient",
      },
      weatherDays: [],
      estimatedCostTransportIncluded: true,
      placeCount,
    },
    pipeline: {
      eligible: true,
      estimatedCost: 10000,
      estimatedCostRange: [8000, 12000],
      estimatedCostTransportIncluded: true,
      bestTransportMode: "shinkansen",
      scoreContributions: { total: score, transport: 0 },
      confidence: 80,
      reasons: [],
    },
  } as unknown as PipelineRecommendation;
}

const WARD_IDS = [
  "shinjuku-city",
  "shibuya-city",
  "taito-city",
  "toshima-city",
  "chiyoda-city",
  "minato-city",
  "chuo-city",
  "bunkyo-city",
  "koto-city",
  "sumida-city",
];

function wardPool(): Destination[] {
  return WARD_IDS.map((id, index) =>
    dest({
      id,
      role: "hub",
      kind: "ward",
      municipalityId: `Tokyo:${id.replace("-city", "")}`,
      coordinates: { lat: 35.68, lng: 139.7 + index * 0.01 },
      recommendedVisitHours: { min: 1, max: 10 },
    }),
  );
}

// ── isTokyoWardHub ───────────────────────────────────────────────────────────

describe("isTokyoWardHub", () => {
  it("covers every hub inside the 23 special-ward municipalities", () => {
    const catalogue = destinationsIndex as Destination[];
    const wardHubs = catalogue.filter(isTokyoWardHub);
    // 23 ward hubs + ward-area hubs (Tokyo Station, Ueno, Odaiba).
    expect(wardHubs.length).toBeGreaterThanOrEqual(23);
    expect(wardHubs.every((d) => d.role === "hub")).toBe(true);
    const wardMunicipalities = new Set(wardHubs.map((d) => d.municipalityId));
    expect(wardMunicipalities.size).toBe(23);
    // Ward-area hubs are members even though their kind is not "ward".
    expect(wardHubs.some((d) => d.id === "tokyo-station-chiyoda")).toBe(true);
    expect(wardHubs.some((d) => d.id === "ueno-taito")).toBe(true);
    expect(wardHubs.some((d) => d.id === "odaiba-minato")).toBe(true);
  });

  it("Machida and other Tokyo cities are not ward hubs", () => {
    const machida = dest({
      id: "machida",
      role: "hub",
      kind: "city",
      municipalityId: "Tokyo:machida",
    });
    expect(isTokyoWardHub(machida)).toBe(false);
  });

  it("POIs inside wards never join the group", () => {
    const poi = dest({
      id: "skytree",
      role: "poi",
      municipalityId: "Tokyo:sumida",
    });
    expect(isTokyoWardHub(poi)).toBe(false);
  });
});

// ── consolidateTokyoWards ────────────────────────────────────────────────────

describe("consolidateTokyoWards", () => {
  it("Kanto origins keep every ward independent", () => {
    const results = WARD_IDS.map((id, i) => wardResult(id, 50 + i, 2));
    const out = consolidateTokyoWards({
      results,
      originPrefecture: "kanagawa",
      pool: [],
    });
    expect(out).toHaveLength(WARD_IDS.length);
    expect(out.some((r) => r.id === TOKYO_WARDS_GROUP_ID)).toBe(false);
  });

  it("neutral browsing (no origin) keeps every ward independent", () => {
    const results = WARD_IDS.map((id, i) => wardResult(id, 50 + i, 2));
    const out = consolidateTokyoWards({
      results,
      originPrefecture: undefined,
      pool: [],
    });
    expect(out).toHaveLength(WARD_IDS.length);
    expect(out.some((r) => r.id === TOKYO_WARDS_GROUP_ID)).toBe(false);
  });

  it("a single matching ward is shown directly", () => {
    const results = [wardResult("shinjuku-city", 70, 2)];
    const out = consolidateTokyoWards({
      results,
      originPrefecture: "osaka",
      pool: [],
    });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("shinjuku-city");
  });

  it("outside Kanto, eligible wards collapse into one group result", () => {
    const results = WARD_IDS.map((id, i) => wardResult(id, 50 + i, 2));
    const out = consolidateTokyoWards({
      results,
      originPrefecture: "osaka",
      pool: [],
    });
    expect(out.filter((r) => r.id === TOKYO_WARDS_GROUP_ID)).toHaveLength(1);
    expect(out.some((r) => WARD_IDS.includes(r.id))).toBe(false);
    const group = out.find((r) => r.id === TOKYO_WARDS_GROUP_ID)!;
    expect(group.wardGroup?.memberCount).toBe(WARD_IDS.length);
    expect(group.wardGroup?.memberIds).toEqual(WARD_IDS);
  });

  it("Machida (Tokyo city) is never merged into the group", () => {
    const machida = wardResult("machida-city", 90, 3);
    machida.kind = "city";
    machida.municipalityId = "Tokyo:machida";
    const results = [
      ...WARD_IDS.map((id, i) => wardResult(id, 50 + i, 2)),
      machida,
    ];
    const out = consolidateTokyoWards({
      results,
      originPrefecture: "osaka",
      pool: [],
    });
    expect(out.some((r) => r.id === "machida-city")).toBe(true);
    const group = out.find((r) => r.id === TOKYO_WARDS_GROUP_ID)!;
    expect(group.wardGroup?.memberCount).toBe(WARD_IDS.length);
  });

  it("group score is highest member plus a small bounded bonus, never the sum", () => {
    const two = consolidateTokyoWards({
      results: [
        wardResult("shinjuku-city", 100, 1),
        wardResult("shibuya-city", 90, 1),
      ],
      originPrefecture: "osaka",
      pool: [],
    }).find((r) => r.id === TOKYO_WARDS_GROUP_ID)!;
    const ten = consolidateTokyoWards({
      results: WARD_IDS.map((id, i) => wardResult(id, 100 - i * 2, 1)),
      originPrefecture: "osaka",
      pool: [],
    }).find((r) => r.id === TOKYO_WARDS_GROUP_ID)!;

    expect(two.score).toBe(100 + 1); // highest + min(6, 1)
    expect(ten.score).toBe(100 + TOKYO_WARDS_DIVERSITY_BONUS_MAX);
    // Bounded: 10 wards add at most +6, never 9 × member scores.
    expect(ten.score).toBeLessThan(100 + 100);
    expect(ten.score - two.score).toBeLessThanOrEqual(
      TOKYO_WARDS_DIVERSITY_BONUS_MAX - 1,
    );
  });

  it("place counts are unique and published-only", () => {
    const hub = dest({
      id: "shinjuku-city",
      role: "hub",
      kind: "ward",
      municipalityId: "Tokyo:shinjuku",
    });
    const pub1 = dest({
      id: "place-1",
      relationships: { parentDestinationId: "shinjuku-city" },
    });
    const pub2 = dest({
      id: "place-2",
      relationships: { parentDestinationId: "shinjuku-city" },
    });
    const unpublished = dest({
      id: "place-3",
      relationships: { parentDestinationId: "shinjuku-city" },
      editorial: { lifecycle: "in_review" } as never,
    });
    const dup = dest({
      id: "place-2",
      relationships: { parentDestinationId: "shinjuku-city" },
    });
    const results = [
      wardResult("shinjuku-city", 80, 0),
      wardResult("shibuya-city", 70, 0),
    ];
    const out = consolidateTokyoWards({
      results,
      originPrefecture: "osaka",
      pool: [hub, pub1, pub2, unpublished, dup],
    });
    const group = out.find((r) => r.id === TOKYO_WARDS_GROUP_ID)!;
    expect(group.wardGroup?.placeCount).toBe(2); // published, deduped
    expect(group.weekend?.placeCount).toBe(2);
  });

  it("gateway time is the verified estimate of the best-served member", () => {
    const slow = wardResult("shinjuku-city", 60, 1);
    slow.transportEstimate = {
      mode: "shinkansen",
      timeRange: [150, 270],
      source: "verified_ground_route",
    };
    const fast = wardResult("shibuya-city", 80, 1);
    fast.transportEstimate = {
      mode: "flight",
      timeRange: [90, 130],
      source: "verified_flight",
    };
    const out = consolidateTokyoWards({
      results: [slow, fast],
      originPrefecture: "osaka",
      pool: [],
    });
    const group = out.find((r) => r.id === TOKYO_WARDS_GROUP_ID)!;
    expect(group.wardGroup?.gatewayEstimate?.mode).toBe("flight");
    expect(group.wardGroup?.gatewayEstimate?.timeRange).toEqual([90, 130]);
    expect(group.transportEstimate?.timeRange).toEqual([90, 130]);
  });
});

// ── buildExplorerWardGroup ───────────────────────────────────────────────────

describe("buildExplorerWardGroup", () => {
  it("builds a single virtual card carrying member ids and counts", () => {
    const members = WARD_IDS.slice(0, 3).map((id, i) =>
      dest({
        id,
        role: "hub",
        kind: "ward",
        municipalityId: `Tokyo:${id.replace("-city", "")}`,
        ratings: { overall: 5 + i } as never,
      }),
    );
    const group = buildExplorerWardGroup({
      members,
      placeCount: 9,
      tripMode: "weekend_2d1n",
    });
    expect(group.id).toBe(TOKYO_WARDS_GROUP_ID);
    expect(group.name).toBe("Tokyo 23 Wards");
    const meta = getWardGroup(group);
    expect(meta?.memberCount).toBe(3);
    expect(meta?.placeCount).toBe(9);
    expect(meta?.memberIds).toEqual(WARD_IDS.slice(0, 3));
    expect(meta?.tripMode).toBe("weekend_2d1n");
  });

  it("returns undefined metadata for ordinary destinations", () => {
    const plain = dest({ id: "edogawa-city", role: "hub", kind: "ward" });
    expect(getWardGroup(plain)).toBeUndefined();
  });
});

// ── buildTokyoWardsLink ──────────────────────────────────────────────────────

describe("buildTokyoWardsLink", () => {
  it("preserves the matching ward filter and trip mode", () => {
    const url = buildTokyoWardsLink(
      ["shinjuku-city", "shibuya-city"],
      "weekend_2d1n",
    );
    expect(url).toBe(
      "/destinations?city=shinjuku-city&city=shibuya-city&tripMode=weekend_2d1n",
    );
  });

  it("omits tripMode for neutral browsing", () => {
    expect(buildTokyoWardsLink(["taito-city"])).toBe(
      "/destinations?city=taito-city",
    );
  });
});

// ── Pipeline integration ─────────────────────────────────────────────────────

describe("runRecommendationPipeline — Tokyo wards consolidation", () => {
  const OSAKA = { lat: 34.7025, lng: 135.4959 };
  const YOKOHAMA = { lat: 35.4437, lng: 139.638 };

  it("Osaka origin + 10 eligible Tokyo wards → one Tokyo 23 Wards result", () => {
    const pool = [byId.get("osaka-city")!, ...wardPool()];
    const results = runRecommendationPipeline(pool, {
      vibe: "any",
      budget: 300000,
      carMode: "none",
      publicModes: ["shinkansen"],
      partySize: 2,
      visitedIds: [],
      homeStationCoords: OSAKA,
      tripMode: "weekend_2d1n",
    });
    const ids = results.map((r) => r.id);
    expect(ids).toContain(TOKYO_WARDS_GROUP_ID);
    expect(ids.filter((id) => WARD_IDS.includes(id))).toHaveLength(0);
    const group = results.find((r) => r.id === TOKYO_WARDS_GROUP_ID)!;
    expect(group.wardGroup?.memberCount).toBe(WARD_IDS.length);
    expect(group.wardGroup?.gatewayEstimate?.source).toBe(
      "verified_ground_route",
    );
    expect(group.wardGroup?.placeCount).toBe(0);
  });

  it("Kanto origin keeps ten independent ward results", () => {
    const pool = [byId.get("yokohama-city")!, ...wardPool()];
    const results = runRecommendationPipeline(pool, {
      vibe: "any",
      budget: 300000,
      carMode: "none",
      publicModes: ["train"],
      partySize: 2,
      visitedIds: [],
      homeStationCoords: YOKOHAMA,
      tripMode: "weekend_2d1n",
    });
    const ids = results.map((r) => r.id);
    expect(ids).not.toContain(TOKYO_WARDS_GROUP_ID);
    expect(ids.filter((id) => WARD_IDS.includes(id))).toHaveLength(
      WARD_IDS.length,
    );
  });

  it("neutral browsing (no origin) keeps the 23 wards separate", () => {
    const pool = [...wardPool(), byId.get("osaka-city")!];
    const results = runRecommendationPipeline(pool, {
      vibe: "any",
      budget: 300000,
      carMode: "none",
      publicModes: ["train"],
      partySize: 2,
      visitedIds: [],
      tripMode: "day_trip",
    });
    expect(results.map((r) => r.id)).not.toContain(TOKYO_WARDS_GROUP_ID);
  });
});
