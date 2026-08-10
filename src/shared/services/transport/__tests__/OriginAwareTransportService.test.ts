import { describe, it, expect } from "vitest";
import type { Destination } from "@/shared/types/destination";
import { getOriginAwareTransportEstimate } from "../OriginAwareTransportService";

// ── Real catalogue fixtures ───────────────────────────────────────────────────

type DestOverrides = Omit<Partial<Destination>, "ratings"> & {
  id: string;
  ratings?: Partial<Destination["ratings"]>;
};

function dest(overrides: DestOverrides): Destination {
  return {
    name: overrides.name ?? overrides.id,
    prefecture: "Kyoto",
    region: "Kansai",
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

const OSAKA = { lat: 34.7025, lng: 135.4959 };
const TOKYO = { lat: 35.6812, lng: 139.7671 };
const FUKUOKA = { lat: 33.5902, lng: 130.4017 };

function estimateFor(
  destination: Destination,
  home: { lat: number; lng: number },
  modes: string[],
) {
  return getOriginAwareTransportEstimate(
    destination,
    { homeStationCoords: home },
    modes,
  );
}

describe("getOriginAwareTransportEstimate — required real route checks", () => {
  it("Chidoribashi/Osaka → Kyoto: never the legacy 230-minute value", () => {
    const kyoto = dest({ id: "kyoto-city", prefecture: "Kyoto" });
    const estimate = estimateFor(kyoto, OSAKA, ["train", "shinkansen"]);
    // Verified osaka ↔ kyoto shinkansen corridor [15, 35] — NOT transportOptions.train 230.
    expect(estimate).not.toBeNull();
    expect(estimate!.source).toBe("verified_ground_route");
    expect(estimate!.mode).toBe("shinkansen");
    expect(estimate!.timeRange).toEqual([15, 35]);
    expect(estimate!.sourceUrl).toBeTruthy();
    expect(estimate!.checkedAt).toBeTruthy();
  });

  it("Osaka → Abashiri: no train claim at all (flight-only if authorized)", () => {
    const abashiri = dest({ id: "abashiri-city", prefecture: "Hokkaido" });
    // No verified ground corridor exists for osaka → hokkaido: the legacy
    // "train: 200" value must never surface as 3h20 by train.
    const estimate = estimateFor(abashiri, OSAKA, ["train", "shinkansen"]);
    if (estimate) {
      expect(estimate.mode).not.toBe("train");
      expect(estimate.mode).not.toBe("shinkansen");
    }
  });

  it("Osaka → Beppu: verified corridor, never the legacy train value", () => {
    const beppu = dest({ id: "beppu-city", prefecture: "Oita" });
    const estimate = estimateFor(beppu, OSAKA, ["train", "shinkansen"]);
    expect(estimate).not.toBeNull();
    expect(estimate!.source).toBe("verified_ground_route");
    // Verified osaka ↔ oita train [240, 300] — never the legacy 200.
    expect(estimate!.timeRange).toEqual([240, 300]);
  });

  it("Osaka → Nagoya: verified shinkansen corridor", () => {
    const nagoya = dest({ id: "nagoya-city", prefecture: "Aichi" });
    const estimate = estimateFor(nagoya, OSAKA, ["train", "shinkansen"]);
    expect(estimate).not.toBeNull();
    expect(estimate!.mode).toBe("shinkansen");
    expect(estimate!.timeRange).toEqual([50, 75]);
  });

  it("Osaka → Kusatsu: verified train corridor", () => {
    const kusatsu = dest({ id: "gunma-kusatsu-onsen", prefecture: "Gunma" });
    const estimate = estimateFor(kusatsu, OSAKA, ["train", "shinkansen"]);
    expect(estimate).not.toBeNull();
    expect(estimate!.mode).toBe("train");
    expect(estimate!.timeRange).toEqual([240, 300]);
  });

  it("Tokyo → Kyoto: verified shinkansen corridor [135, 220]", () => {
    const kyoto = dest({ id: "kyoto-city", prefecture: "Kyoto" });
    const estimate = estimateFor(kyoto, TOKYO, ["train", "shinkansen"]);
    expect(estimate).not.toBeNull();
    expect(estimate!.mode).toBe("shinkansen");
    expect(estimate!.timeRange).toEqual([135, 220]);
  });

  it("Fukuoka → Kyoto: verified shinkansen corridor [160, 200]", () => {
    const kyoto = dest({ id: "kyoto-city", prefecture: "Kyoto" });
    const estimate = estimateFor(kyoto, FUKUOKA, ["train", "shinkansen"]);
    expect(estimate).not.toBeNull();
    expect(estimate!.mode).toBe("shinkansen");
    expect(estimate!.timeRange).toEqual([160, 200]);
  });
});

describe("getOriginAwareTransportEstimate — policy", () => {
  it("unregistered corridors yield no estimate (no fabrication)", () => {
    const kagawa = dest({ id: "kagawa-dest", prefecture: "Kagawa" });
    expect(
      estimateFor(kagawa, TOKYO, ["train", "shinkansen", "bus"]),
    ).toBeNull();
  });

  it("bus has no verified intercity durations", () => {
    const kyoto = dest({ id: "kyoto-city", prefecture: "Kyoto" });
    expect(estimateFor(kyoto, OSAKA, ["bus"])).toBeNull();
  });

  it("fastest mode wins across authorized modes", () => {
    // tokyo ↔ kyoto: shinkansen [135, 220] beats train [390, 450].
    const kyoto = dest({ id: "kyoto-city", prefecture: "Kyoto" });
    const estimate = estimateFor(kyoto, TOKYO, ["train", "shinkansen"]);
    expect(estimate!.mode).toBe("shinkansen");
  });

  it("same-prefecture trips resolve via municipality corridors", () => {
    const shibuya = dest({
      id: "shibuya-city",
      prefecture: "Tokyo",
      municipalityId: "Tokyo:shibuya",
    });
    const estimate = estimateFor(shibuya, TOKYO, ["train"]);
    expect(estimate).not.toBeNull();
    expect(estimate!.mode).toBe("train");
    // Tokyo Station resolves to Tokyo:chiyoda → Tokyo:chiyoda ↔ Tokyo:shibuya.
    expect(estimate!.timeRange).toEqual([15, 30]);
  });

  it("unresolvable origin municipality → no ground duration (no guessing)", () => {
    const kyoto = dest({ id: "kyoto-city", prefecture: "Kyoto" });
    // Off-station coordinates that trip the confidence guard.
    const estimate = estimateFor(kyoto, { lat: 35.68, lng: 139.76 }, ["train"]);
    expect(estimate).toBeNull();
  });
});
