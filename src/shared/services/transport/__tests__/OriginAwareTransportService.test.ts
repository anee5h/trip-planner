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
    const kyoto = dest({
      id: "kyoto-city",
      prefecture: "Kyoto",
      municipalityId: "Kyoto:kyoto",
      coordinates: { lat: 35.0116, lng: 135.7681 },
    });
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
    const abashiri = dest({
      id: "abashiri-city",
      prefecture: "Hokkaido",
      coordinates: { lat: 43.9978, lng: 144.2735 },
    });
    // No verified ground corridor exists for osaka → hokkaido: the legacy
    // "train: 200" value must never surface as 3h20 by train.
    const estimate = estimateFor(abashiri, OSAKA, ["train", "shinkansen"]);
    if (estimate) {
      expect(estimate.mode).not.toBe("train");
      expect(estimate.mode).not.toBe("shinkansen");
    }
  });

  it("Osaka → Beppu: verified corridor, never the legacy train value", () => {
    const beppu = dest({
      id: "beppu-city",
      prefecture: "Oita",
      coordinates: { lat: 33.2846, lng: 131.4913 },
    });
    const estimate = estimateFor(beppu, OSAKA, ["train", "shinkansen"]);
    expect(estimate).not.toBeNull();
    expect(estimate!.source).toBe("verified_ground_route");
    // Verified osaka ↔ oita train [240, 300] — never the legacy 200.
    expect(estimate!.timeRange).toEqual([240, 300]);
  });

  it("Osaka → Nagoya: verified shinkansen corridor", () => {
    const nagoya = dest({
      id: "nagoya-city",
      prefecture: "Aichi",
      municipalityId: "Aichi:nagoya",
      coordinates: { lat: 35.1815, lng: 136.9066 },
    });
    const estimate = estimateFor(nagoya, OSAKA, ["train", "shinkansen"]);
    expect(estimate).not.toBeNull();
    expect(estimate!.mode).toBe("shinkansen");
    expect(estimate!.timeRange).toEqual([50, 75]);
  });

  it("Osaka → Kusatsu: verified train corridor", () => {
    const kusatsu = dest({
      id: "gunma-kusatsu-onsen",
      prefecture: "Gunma",
      coordinates: { lat: 36.6225, lng: 138.596 },
    });
    const estimate = estimateFor(kusatsu, OSAKA, ["train", "shinkansen"]);
    expect(estimate).not.toBeNull();
    expect(estimate!.mode).toBe("train");
    expect(estimate!.timeRange).toEqual([240, 300]);
  });

  it("Tokyo → Kyoto: verified shinkansen corridor [135, 220]", () => {
    const kyoto = dest({
      id: "kyoto-city",
      prefecture: "Kyoto",
      municipalityId: "Kyoto:kyoto",
      coordinates: { lat: 35.0116, lng: 135.7681 },
    });
    const estimate = estimateFor(kyoto, TOKYO, ["train", "shinkansen"]);
    expect(estimate).not.toBeNull();
    expect(estimate!.mode).toBe("shinkansen");
    expect(estimate!.timeRange).toEqual([135, 220]);
  });

  it("Fukuoka → Kyoto: verified shinkansen corridor [160, 200]", () => {
    const kyoto = dest({
      id: "kyoto-city",
      prefecture: "Kyoto",
      municipalityId: "Kyoto:kyoto",
      coordinates: { lat: 35.0116, lng: 135.7681 },
    });
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
    const kyoto = dest({
      id: "kyoto-city",
      prefecture: "Kyoto",
      municipalityId: "Kyoto:kyoto",
      coordinates: { lat: 35.0116, lng: 135.7681 },
    });
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

describe("getOriginAwareTransportEstimate — verified bus corridors (KAI-12)", () => {
  const busContext = (originMunicipalityId: string) => ({
    homeStationCoords: { lat: 35.6812, lng: 139.7671 },
    originMunicipalityId,
  });

  it("Sendai → Yamagata: verified fixed bus fare propagates", () => {
    const yamagata = dest({
      id: "yamagata-city",
      prefecture: "Yamagata",
      municipalityId: "Yamagata:yamagata",
    });
    const estimate = getOriginAwareTransportEstimate(
      yamagata,
      busContext("Miyagi:sendai"),
      ["bus"],
    );
    expect(estimate).not.toBeNull();
    expect(estimate!.mode).toBe("bus");
    expect(estimate!.source).toBe("verified_ground_route");
    expect(estimate!.timeRange).toEqual([66, 66]);
    expect(estimate!.fare).toEqual([1100, 1100]);
    expect(estimate!.fareVariability).toBe("fixed");
    expect(estimate!.sourceUrl).toMatch(/^https?:\/\//);
    expect(estimate!.checkedAt).toBeTruthy();
  });

  it("Tokyo → Nagano: dynamic bus fare stays a range, never fixed truth", () => {
    const nagano = dest({
      id: "nagano-city",
      prefecture: "Nagano",
      municipalityId: "Nagano:nagano",
    });
    const estimate = getOriginAwareTransportEstimate(
      nagano,
      busContext("Tokyo:chiyoda"),
      ["bus"],
    );
    expect(estimate).not.toBeNull();
    // Dynamic "from ¥X" fare: lower bound set, upper bound null, marked
    // dynamic — a range/dynamic fare must never be presented as fixed.
    expect(estimate!.fare![0]).toBeGreaterThan(0);
    expect(estimate!.fareVariability).toBe("dynamic");
  });

  it("pair without a verified corridor stays unknown", () => {
    const sapporo = dest({
      id: "sapporo-city",
      prefecture: "Hokkaido",
      municipalityId: "Hokkaido:sapporo",
    });
    const estimate = getOriginAwareTransportEstimate(
      sapporo,
      busContext("Aichi:nagoya"),
      ["bus"],
    );
    expect(estimate).toBeNull();
  });

  it("Tokyo → Matsuyama: specific-dates-only corridor stays unknown (no bus date gating)", () => {
    // Regression (KAI-12): オレンジライナーえひめ night (Tokyo↔Matsuyama) is
    // audited specific-dates-only; with no bus operatingPeriods/date gating
    // the corridor is removed from the registry and must not surface as
    // verified availability for any date.
    const matsuyama = dest({
      id: "matsuyama-city",
      prefecture: "Ehime",
      municipalityId: "Ehime:matsuyama",
    });
    expect(
      getOriginAwareTransportEstimate(matsuyama, busContext("Tokyo:chiyoda"), [
        "bus",
      ]),
    ).toBeNull();
  });

  it("ferry/flight-dependent islands never inherit mainland ground corridors", () => {
    // Regression (KAI-12): a prefecture-pair corridor (tokyo→niigata,
    // fukuoka→kagoshima, osaka→wakayama) must never apply to an island in
    // that prefecture — Sado, Yakushima, Amami, Tomogashima and Miyajima
    // have no rail (MODE_SEMANTICS §1; KAI-32). The destination transport
    // zone gates ground corridors (localModes ∪ edge modes); a
    // non-routable "unknown" zone (Miyajima's unmodeled ferry last leg)
    // yields no ground corridor either.
    const sado = dest({
      id: "sado-island",
      prefecture: "Niigata",
      municipalityId: "Niigata:sado",
      transportZoneId: "sado",
    });
    const yakushima = dest({
      id: "yakushima-town",
      prefecture: "Kagoshima",
      municipalityId: "Kagoshima:yakushima",
      transportZoneId: "yakushima",
    });
    const amami = dest({
      id: "amami-iriomote-natural-site",
      prefecture: "Kagoshima",
      transportZoneId: "amami",
    });
    const tomogashima = dest({
      id: "tomogashima-islands",
      prefecture: "Wakayama",
      transportZoneId: "tomogashima",
    });
    const miyajima = dest({
      id: "miyajima-itsukushima",
      prefecture: "Hiroshima",
      kind: "island",
    });
    // tokyo→niigata, fukuoka→kagoshima and osaka→wakayama corridors all
    // exist — none may surface for these islands.
    expect(
      getOriginAwareTransportEstimate(sado, busContext("Tokyo:chiyoda"), [
        "shinkansen",
        "train",
      ]),
    ).toBeNull();
    expect(
      getOriginAwareTransportEstimate(sado, busContext("Tokyo:chiyoda"), [
        "bus",
      ]),
    ).toBeNull();
    expect(
      getOriginAwareTransportEstimate(
        yakushima,
        busContext("Fukuoka:fukuoka"),
        ["shinkansen", "train"],
      ),
    ).toBeNull();
    expect(
      getOriginAwareTransportEstimate(amami, busContext("Fukuoka:fukuoka"), [
        "shinkansen",
        "train",
      ]),
    ).toBeNull();
    expect(
      getOriginAwareTransportEstimate(tomogashima, busContext("Osaka:osaka"), [
        "shinkansen",
        "train",
      ]),
    ).toBeNull();
    // Miyajima (ferry last leg unmodeled, non-routable zone) must not
    // inherit the tokyo/osaka→hiroshima corridor.
    expect(
      getOriginAwareTransportEstimate(miyajima, busContext("Osaka:osaka"), [
        "shinkansen",
        "train",
      ]),
    ).toBeNull();
  });

  it("Hokkaido keeps its legitimate shinkansen corridor", () => {
    // Hakodate is the Hokkaido shinkansen terminus — the honshu↔hokkaido
    // edge carries shinkansen, so the prefecture-pair corridor stands.
    const hakodate = dest({
      id: "hakodate-city",
      prefecture: "Hokkaido",
      municipalityId: "Hokkaido:hakodate",
      coordinates: { lat: 41.774, lng: 140.728 },
      transportZoneId: "hokkaido",
    });
    expect(
      getOriginAwareTransportEstimate(hakodate, busContext("Tokyo:chiyoda"), [
        "shinkansen",
      ]),
    ).not.toBeNull();
  });
});

describe("getOriginAwareTransportEstimate — 50 km bus catchment (KAI-12)", () => {
  const SHINAGAWA = { lat: 35.6285, lng: 139.7387 }; // unwired municipality
  const OMIYA = { lat: 35.9063, lng: 139.6236 }; // unwired (Saitama)
  const TOKYO = { lat: 35.6812, lng: 139.7671 };

  it("origin within 50 km of a terminal uses its corridors (Shinagawa → Osaka bus)", () => {
    const osaka = dest({
      id: "osaka-city",
      prefecture: "Osaka",
      municipalityId: "Osaka:osaka",
      coordinates: { lat: 34.7025, lng: 135.4959 },
    });
    const estimate = getOriginAwareTransportEstimate(
      osaka,
      { homeStationCoords: SHINAGAWA },
      ["bus"],
    );
    expect(estimate).not.toBeNull();
    expect(estimate!.mode).toBe("bus");
    expect(estimate!.evidence).toBe("estimated");
    expect(estimate!.corridorEvidence).toBe("verified");
    expect(estimate!.timeRange[0]).toBeGreaterThan(438);
    expect(estimate!.timeRange[1]).toBeGreaterThan(498);
    expect(estimate!.accessDistanceKm?.origin).toBeGreaterThan(0);
    expect(estimate!.fare).toEqual([3300, 19000]);
  });

  it("origin within 50 km of a terminal uses its corridors (Omiya → Sendai bus)", () => {
    const sendai = dest({
      id: "sendai-city",
      prefecture: "Miyagi",
      municipalityId: "Miyagi:sendai",
      coordinates: { lat: 38.268, lng: 140.87 },
    });
    const estimate = getOriginAwareTransportEstimate(
      sendai,
      { homeStationCoords: OMIYA },
      ["bus"],
    );
    expect(estimate).not.toBeNull();
    expect(estimate!.mode).toBe("bus");
    expect(estimate!.evidence).toBe("estimated");
    expect(estimate!.corridorEvidence).toBe("verified");
    expect(estimate!.timeRange[0]).toBeGreaterThan(66);
  });

  it("destination within 50 km of the arrival terminal is reachable (Nara via Osaka)", () => {
    const nara = dest({
      id: "nara-city",
      prefecture: "Nara",
      municipalityId: "Nara:nara",
      coordinates: { lat: 34.6851, lng: 135.8048 },
    });
    const estimate = getOriginAwareTransportEstimate(
      nara,
      { homeStationCoords: TOKYO },
      ["bus"],
    );
    expect(estimate).not.toBeNull();
    // Nara is ~27 km from the Osaka terminal → tokyo→osaka corridor applies.
    expect(estimate!.evidence).toBe("estimated");
    expect(estimate!.corridorEvidence).toBe("verified");
    expect(estimate!.timeRange[0]).toBeGreaterThan(438);
    expect(estimate!.timeRange[1]).toBeGreaterThan(498);
    expect(estimate!.accessDistanceKm?.destination).toBeGreaterThan(0);
  });

  it("locations beyond 50 km of every terminal stay unknown", () => {
    const abashiri = dest({
      id: "abashiri-city",
      prefecture: "Hokkaido",
      coordinates: { lat: 43.99, lng: 144.26 },
    });
    expect(
      getOriginAwareTransportEstimate(abashiri, { homeStationCoords: TOKYO }, [
        "bus",
      ]),
    ).toBeNull();
    expect(
      getOriginAwareTransportEstimate(
        abashiri,
        { homeStationCoords: { lat: 43.99, lng: 144.26 } },
        ["bus"],
      ),
    ).toBeNull();
    const osaka = dest({
      id: "osaka-city",
      prefecture: "Osaka",
      municipalityId: "Osaka:osaka",
      coordinates: { lat: 34.7025, lng: 135.4959 },
    });
    expect(
      getOriginAwareTransportEstimate(
        osaka,
        { homeStationCoords: { lat: 43.99, lng: 144.26 } },
        ["bus"],
      ),
    ).toBeNull();
  });

  it("exact municipality wiring still wins over the radius", () => {
    const osaka = dest({
      id: "osaka-city",
      prefecture: "Osaka",
      municipalityId: "Osaka:osaka",
      coordinates: { lat: 34.7025, lng: 135.4959 },
    });
    const estimate = getOriginAwareTransportEstimate(
      osaka,
      { homeStationCoords: TOKYO },
      ["bus"],
    );
    expect(estimate).not.toBeNull();
    expect(estimate!.evidence).toBe("verified");
    expect(estimate!.timeRange).toEqual([438, 498]);
    expect(estimate!.accessDistanceKm).toBeUndefined();
  });

  it("destination catchment must not bridge natural barriers (Hakone ≠ Kawaguchiko)", () => {
    // Hakone is ~42 km from the Kawaguchiko terminal — beyond the 30 km
    // arrival catchment — so the tokyo→kawaguchiko coach must not be
    // claimed for Hakone (cross-mountain pairing, no real connection).
    const hakone = dest({
      id: "hakone-town",
      prefecture: "Kanagawa",
      municipalityId: "Kanagawa:hakone",
      coordinates: { lat: 35.2324, lng: 139.1069 },
    });
    expect(
      getOriginAwareTransportEstimate(hakone, { homeStationCoords: TOKYO }, [
        "bus",
      ]),
    ).toBeNull();
  });
});

describe("getOriginAwareTransportEstimate — Shinkansen access hubs", () => {
  const SHINAGAWA = { lat: 35.6285, lng: 139.7387 };
  const NAKAYAMA = { lat: 35.514745, lng: 139.539692 };
  const KAWASAKI = { lat: 35.5308, lng: 139.7028 };
  const OMIYA = { lat: 35.9063, lng: 139.6239 };
  const TOKYO = { lat: 35.6812, lng: 139.7671 };

  const osaka = () =>
    dest({
      id: "osaka-city",
      prefecture: "Osaka",
      municipalityId: "Osaka:osaka",
      coordinates: { lat: 34.6937, lng: 135.5023 },
    });

  it("Shinagawa resolves to a supported Shinkansen boarding hub", () => {
    const estimate = getOriginAwareTransportEstimate(
      osaka(),
      { homeStationCoords: SHINAGAWA },
      ["shinkansen"],
    );
    expect(estimate).not.toBeNull();
    expect(estimate!.timeRange).toEqual([141, 270]);
    expect(estimate!.evidence).toBe("verified");
    expect(estimate!.corridorEvidence).toBe("verified");
    expect(estimate!.fare).toEqual([14400, 14720]);
  });

  it("Nakayama/Yokohama reaches Shin-Yokohama for verified corridors", () => {
    const estimate = getOriginAwareTransportEstimate(
      osaka(),
      { homeStationCoords: NAKAYAMA },
      ["shinkansen"],
    );
    expect(estimate).not.toBeNull();
    expect(estimate!.corridorEvidence).toBe("verified");
    expect(estimate!.timeRange[0]).toBeGreaterThanOrEqual(141);
  });

  it("Kawasaki can use its supported Tokyo-area Shinkansen hubs", () => {
    const estimate = getOriginAwareTransportEstimate(
      osaka(),
      { homeStationCoords: KAWASAKI },
      ["shinkansen"],
    );
    expect(estimate).not.toBeNull();
    expect(estimate!.corridorEvidence).toBe("verified");
  });

  it("Omiya reaches the Tokyo-endpoint Tohoku corridor", () => {
    const sendai = dest({
      id: "sendai-city",
      prefecture: "Miyagi",
      municipalityId: "Miyagi:sendai",
      coordinates: { lat: 38.268, lng: 140.87 },
    });
    const estimate = getOriginAwareTransportEstimate(
      sendai,
      { homeStationCoords: OMIYA },
      ["shinkansen"],
    );
    expect(estimate).not.toBeNull();
    expect(estimate!.timeRange).toEqual([89, 160]);
    expect(estimate!.corridorEvidence).toBe("verified");
    expect(estimate!.fare).toEqual([11110, 11430]);
  });

  it("an origin outside every supported station catchment stays unknown", () => {
    expect(
      getOriginAwareTransportEstimate(
        osaka(),
        { homeStationCoords: { lat: 35.55, lng: 140.95 } },
        ["shinkansen"],
      ),
    ).toBeNull();
  });

  it("destination arrival catchment is bounded and keeps corridor fare provenance", () => {
    const nara = dest({
      id: "nara-city",
      prefecture: "Nara",
      municipalityId: "Nara:nara",
      coordinates: { lat: 34.6851, lng: 135.8048 },
    });
    const estimate = getOriginAwareTransportEstimate(
      nara,
      { homeStationCoords: TOKYO },
      ["shinkansen"],
    );
    expect(estimate).not.toBeNull();
    expect(estimate!.evidence).toBe("estimated");
    expect(estimate!.corridorEvidence).toBe("verified");
    expect(estimate!.timeRange[0]).toBeGreaterThan(141);
    expect(estimate!.timeRange[1]).toBeGreaterThan(270);
    expect(estimate!.accessDistanceKm?.destination).toBeGreaterThan(0);
    expect(estimate!.fare).toEqual([14400, 14720]);
  });

  it("topology prevents a nearby geometric station from serving Sado", () => {
    const sado = dest({
      id: "sado-island-near-station",
      prefecture: "Niigata",
      municipalityId: "Niigata:sado",
      coordinates: { lat: 37.9121, lng: 139.0614 },
      transportZoneId: "sado",
    });
    expect(
      getOriginAwareTransportEstimate(sado, { homeStationCoords: TOKYO }, [
        "shinkansen",
      ]),
    ).toBeNull();
  });

  it("does not authorize Shinkansen into Shikoku without a topology edge", () => {
    const takamatsu = dest({
      id: "takamatsu-city",
      prefecture: "Kagawa",
      municipalityId: "Kagawa:takamatsu",
      coordinates: { lat: 34.3503, lng: 134.0469 },
    });
    expect(
      getOriginAwareTransportEstimate(takamatsu, { homeStationCoords: TOKYO }, [
        "shinkansen",
      ]),
    ).toBeNull();
  });
});
