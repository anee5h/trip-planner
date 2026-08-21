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
    // With bounded access to Shin-Osaka/Kyoto stations now added, the direct
    // JR train corridor [28,45] is the fastest canonical estimate — NOT
    // transportOptions.train 230.
    expect(estimate).not.toBeNull();
    expect(estimate!.source).toBe("verified_ground_route");
    expect(estimate!.mode).toBe("train");
    expect(estimate!.timeRange).toEqual([28, 45]);
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

  it("Osaka → Nagoya: verified shinkansen corridor with bounded access", () => {
    const nagoya = dest({
      id: "nagoya-city",
      prefecture: "Aichi",
      municipalityId: "Aichi:nagoya",
      coordinates: { lat: 35.1815, lng: 136.9066 },
    });
    const estimate = estimateFor(nagoya, OSAKA, ["train", "shinkansen"]);
    expect(estimate).not.toBeNull();
    expect(estimate!.mode).toBe("shinkansen");
    // osaka↔aichi corridor [50,75] + bounded access (Umeda→Shin-Osaka and
    // Nagoya-city→Nagoya Station): the complete journey is estimated while
    // the corridor stays verified.
    expect(estimate!.timeRange).toEqual([78, 120]);
    expect(estimate!.evidence).toBe("estimated");
    expect(estimate!.corridorEvidence).toBe("verified");
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

  it("Tokyo → Kyoto: verified shinkansen corridor with bounded arrival access", () => {
    const kyoto = dest({
      id: "kyoto-city",
      prefecture: "Kyoto",
      municipalityId: "Kyoto:kyoto",
      coordinates: { lat: 35.0116, lng: 135.7681 },
    });
    const estimate = estimateFor(kyoto, TOKYO, ["train", "shinkansen"]);
    expect(estimate).not.toBeNull();
    expect(estimate!.mode).toBe("shinkansen");
    // tokyo↔kyoto corridor [135,220] + ~3 km arrival access to Kyoto
    // Station: estimated complete journey, verified corridor.
    expect(estimate!.timeRange).toEqual([149, 243]);
    expect(estimate!.evidence).toBe("estimated");
    expect(estimate!.corridorEvidence).toBe("verified");
  });

  it("Fukuoka → Kyoto: verified shinkansen corridor with bounded access", () => {
    const kyoto = dest({
      id: "kyoto-city",
      prefecture: "Kyoto",
      municipalityId: "Kyoto:kyoto",
      coordinates: { lat: 35.0116, lng: 135.7681 },
    });
    const estimate = estimateFor(kyoto, FUKUOKA, ["train", "shinkansen"]);
    expect(estimate).not.toBeNull();
    expect(estimate!.mode).toBe("shinkansen");
    // fukuoka↔kyoto corridor [160,200] + bounded Hakata/Kyoto access.
    expect(estimate!.timeRange).toEqual([186, 243]);
    expect(estimate!.evidence).toBe("estimated");
    expect(estimate!.corridorEvidence).toBe("verified");
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

  it("reuses identical origin-aware estimates across authorization and evidence checks", () => {
    const kyoto = dest({
      id: "kyoto-cache-check",
      prefecture: "Kyoto",
      municipalityId: "Kyoto:kyoto",
      coordinates: { lat: 35.0116, lng: 135.7681 },
    });
    const first = estimateFor(kyoto, TOKYO, ["train", "shinkansen"]);
    const second = estimateFor(kyoto, TOKYO, ["shinkansen", "train"]);

    expect(first).not.toBeNull();
    expect(second).toBe(first);
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
  const busContext = (
    originMunicipalityId: string,
    coords = { lat: 35.6812, lng: 139.7671 },
  ) => ({
    homeStationCoords: coords,
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
      busContext(
        "Miyagi:sendai",
        { lat: 38.268, lng: 140.87 }, // Sendai bus terminal
      ),
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

  it("Hakodate Shinkansen uses Shin-Hakodate-Hokuto with bounded onward access", () => {
    // KAI-12: the Shinkansen hub for Hakodate is Shin-Hakodate-Hokuto
    // station, NOT ordinary Hakodate Station. A Hakodate-city destination is
    // ~18 km from the actual Shinkansen terminus, so it gets bounded onward
    // access and the complete journey is estimated.
    const hakodate = dest({
      id: "hakodate-city",
      prefecture: "Hokkaido",
      municipalityId: "Hokkaido:hakodate",
      coordinates: { lat: 41.7737, lng: 140.7264 }, // Hakodate Station
      transportZoneId: "hokkaido",
    });
    const estimate = getOriginAwareTransportEstimate(
      hakodate,
      busContext("Tokyo:chiyoda"),
      ["shinkansen"],
    );
    expect(estimate).not.toBeNull();
    expect(estimate!.evidence).toBe("estimated");
    expect(estimate!.corridorEvidence).toBe("verified");
    expect(estimate!.accessDistanceKm?.destination).toBeGreaterThan(10);
    expect(estimate!.timeRange[0]).toBeGreaterThan(235);
  });

  it("a location at Shin-Hakodate-Hokuto itself keeps corridor time", () => {
    const atTerminus = dest({
      id: "shin-hakodate-hokuto-area",
      prefecture: "Hokkaido",
      municipalityId: "Hokkaido:hakodate",
      coordinates: { lat: 41.9268, lng: 140.6479 }, // at the Shinkansen station
      transportZoneId: "hokkaido",
    });
    const estimate = getOriginAwareTransportEstimate(
      atTerminus,
      busContext("Tokyo:chiyoda"),
      ["shinkansen"],
    );
    expect(estimate).not.toBeNull();
    // 0.1 km is within the station tolerance → no fabricated access.
    expect(estimate!.accessDistanceKm).toBeUndefined();
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

  it("a location at the wired terminal keeps verified zero-access evidence", () => {
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

  it("preferred municipality hub still obeys actual physical distance", () => {
    // Osaka City (Namba-side destination, ~3.5 km from Shin-Osaka) must not
    // resolve to zero distance just because Osaka:osaka is wired to the
    // shin-osaka hub: the preferred hub is a canonical mapping, not proof
    // the user stands at the terminal (KAI-12).
    const namba = dest({
      id: "osaka-namba",
      prefecture: "Osaka",
      municipalityId: "Osaka:osaka",
      coordinates: { lat: 34.665, lng: 135.5012 },
    });
    const estimate = getOriginAwareTransportEstimate(
      namba,
      { homeStationCoords: TOKYO },
      ["shinkansen"],
    );
    expect(estimate).not.toBeNull();
    expect(estimate!.evidence).toBe("estimated");
    expect(estimate!.corridorEvidence).toBe("verified");
    expect(estimate!.accessDistanceKm?.destination).toBeGreaterThan(1);
    // Complete time exceeds the raw tokyo↔osaka corridor [141,270].
    expect(estimate!.timeRange[0]).toBeGreaterThan(141);
    expect(estimate!.timeRange[1]).toBeGreaterThan(270);
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

  it("Hiroshima bus coverage is corridor-graph bound, not radius-inflated", () => {
    // KAI-12 outcome audit: Hiroshima participates in exactly the verified
    // corridors registered for it (tokyo, osaka day+night, fukuoka, okayama,
    // takamatsu, izumo, matsue, kobe). A catchment exposes only registry
    // corridors — it must never fabricate new ones, and the Osaka corridor
    // must not dominate the distribution the way it did when it was the only
    // day-trip-feasible route.
    const HIROSHIMA = { lat: 34.3983, lng: 132.4756 };
    const osakaDest = dest({
      id: "osaka-city",
      prefecture: "Osaka",
      municipalityId: "Osaka:osaka",
      coordinates: { lat: 34.7025, lng: 135.4959 },
    });
    const okayamaDest = dest({
      id: "okayama-city",
      prefecture: "Okayama",
      municipalityId: "Okayama:okayama",
      coordinates: { lat: 34.6663, lng: 133.918 },
    });
    const fukuokaDest = dest({
      id: "fukuoka-city",
      prefecture: "Fukuoka",
      municipalityId: "Fukuoka:fukuoka",
      coordinates: { lat: 33.5902, lng: 130.4017 },
    });
    const matsueDest = dest({
      id: "matsue-city",
      prefecture: "Shimane",
      municipalityId: "Shimane:matsue",
      coordinates: { lat: 35.4646, lng: 133.064 },
    });
    // Newly registered corridors are usable from Hiroshima.
    for (const d of [osakaDest, okayamaDest, fukuokaDest, matsueDest]) {
      expect(
        getOriginAwareTransportEstimate(d, { homeStationCoords: HIROSHIMA }, [
          "bus",
        ]),
      ).not.toBeNull();
    }
    // A city with NO registered corridor (Nagoya) stays unknown even though
    // it is on the mainland — distance alone never creates a corridor.
    const nagoyaDest = dest({
      id: "nagoya-city",
      prefecture: "Aichi",
      municipalityId: "Aichi:nagoya",
      coordinates: { lat: 35.1815, lng: 136.9066 },
    });
    expect(
      getOriginAwareTransportEstimate(
        nagoyaDest,
        { homeStationCoords: HIROSHIMA },
        ["bus"],
      ),
    ).toBeNull();
  });

  it("Kochi and Koriyama bus coverage comes from newly registered corridors", () => {
    // KAI-12 extended audit: Kochi previously had ZERO bus corridors and
    // Koriyama was mis-served through the Aizu-Wakamatsu hub. Both now have
    // their own verified corridors (osaka/hiroshima/matsuyama for Kochi;
    // sendai/tokyo for Koriyama).
    const kochi = { lat: 33.5597, lng: 133.5311 };
    const koriyama = { lat: 37.4, lng: 140.36 };
    const osakaDest = dest({
      id: "osaka-city",
      prefecture: "Osaka",
      municipalityId: "Osaka:osaka",
      coordinates: { lat: 34.7025, lng: 135.4959 },
    });
    const matsuyamaDest = dest({
      id: "matsuyama-city",
      prefecture: "Ehime",
      municipalityId: "Ehime:matsuyama",
      coordinates: { lat: 33.8404, lng: 132.7657 },
    });
    const sendaiDest = dest({
      id: "sendai-city",
      prefecture: "Miyagi",
      municipalityId: "Miyagi:sendai",
      coordinates: { lat: 38.268, lng: 140.87 },
    });
    const tokyoDest = dest({
      id: "tokyo-station-area",
      prefecture: "Tokyo",
      municipalityId: "Tokyo:chiyoda",
      coordinates: { lat: 35.6812, lng: 139.7671 },
    });
    expect(
      getOriginAwareTransportEstimate(osakaDest, { homeStationCoords: kochi }, [
        "bus",
      ]),
    ).not.toBeNull();
    expect(
      getOriginAwareTransportEstimate(
        matsuyamaDest,
        { homeStationCoords: kochi },
        ["bus"],
      ),
    ).not.toBeNull();
    expect(
      getOriginAwareTransportEstimate(
        sendaiDest,
        { homeStationCoords: koriyama },
        ["bus"],
      ),
    ).not.toBeNull();
    expect(
      getOriginAwareTransportEstimate(
        tokyoDest,
        { homeStationCoords: koriyama },
        ["bus"],
      ),
    ).not.toBeNull();
    // Koriyama's own hub now beats the 39 km Aizu-Wakamatsu alternative for
    // Sendai: the selection must prefer the real 郡山⇔仙台 corridor.
    const koriyamaToSendai = getOriginAwareTransportEstimate(
      sendaiDest,
      { homeStationCoords: koriyama },
      ["bus"],
    );
    expect(koriyamaToSendai).not.toBeNull();
    expect(koriyamaToSendai!.timeRange[0]).toBeLessThan(130);
    expect(koriyamaToSendai!.fare).toEqual([2500, 2500]);
  });
});

describe("getOriginAwareTransportEstimate — KAI-63 bus eligibility regressions", () => {
  it("Naha postcode 900-8585 reaches Nago/Motobu by the verified Okinawa express bus", () => {
    // KAI-63: 900-8585 (Naha city centre, ~0.5 km from Naha Bus Terminal)
    // must resolve the verified naha⇔nago highway-bus corridor (111/117
    // 高速バス). Nago City sits at the terminal: corridor time, verified.
    const NAHA = { lat: 26.2124, lng: 127.6809 };
    const nagoCity = dest({
      id: "nago-city",
      prefecture: "Okinawa",
      municipalityId: "Okinawa:nago",
      coordinates: { lat: 26.5915, lng: 127.9774 }, // Nago Bus Terminal
      transportZoneId: "okinawa-main",
    });
    const estimate = getOriginAwareTransportEstimate(
      nagoCity,
      { homeStationCoords: NAHA },
      ["bus"],
    );
    expect(estimate).not.toBeNull();
    expect(estimate!.mode).toBe("bus");
    expect(estimate!.evidence).toBe("verified");
    expect(estimate!.timeRange).toEqual([95, 112]);
    expect(estimate!.fare).toEqual([2420, 2420]);
    expect(estimate!.servicePeriod).toBe("day");
    expect(estimate!.sourceUrl).toMatch(/^https?:\/\//);
  });

  it("Naha postcode origin reaches Motobu (Churaumi) with bounded onward access", () => {
    const NAHA = { lat: 26.2124, lng: 127.6809 };
    const churaumi = dest({
      id: "churaumi-aquarium-motobu",
      prefecture: "Okinawa",
      municipalityId: "Okinawa:motobu",
      coordinates: { lat: 26.6944, lng: 127.8779 },
      transportZoneId: "okinawa-main",
    });
    const estimate = getOriginAwareTransportEstimate(
      churaumi,
      { homeStationCoords: NAHA },
      ["bus"],
    );
    expect(estimate).not.toBeNull();
    expect(estimate!.evidence).toBe("estimated");
    expect(estimate!.corridorEvidence).toBe("verified");
    expect(estimate!.accessDistanceKm?.destination).toBeGreaterThan(10);
    expect(estimate!.timeRange[0]).toBeGreaterThan(95);
  });

  it("Naha local city-bus destinations and outer islands stay unknown — no fabricated connectivity", () => {
    // A Naha-city POI is served by local city bus only — that must never
    // prove an intercity corridor (KAI-67 boundary). Ishigaki is a separate
    // island with no bus edge from okinawa-main. A mainland destination must
    // not gain a bus from Naha either (no mainland bus to Okinawa).
    const NAHA = { lat: 26.2124, lng: 127.6809 };
    const nahaCityPoi = dest({
      id: "shuri-castle-okinawa",
      prefecture: "Okinawa",
      municipalityId: "Okinawa:naha",
      coordinates: { lat: 26.217, lng: 127.7195 },
      transportZoneId: "okinawa-main",
    });
    const ishigaki = dest({
      id: "ishigaki-city",
      prefecture: "Okinawa",
      municipalityId: "Okinawa:ishigaki",
      coordinates: { lat: 24.3448, lng: 124.1572 },
      transportZoneId: "ishigaki",
    });
    const osaka = dest({
      id: "osaka-city",
      prefecture: "Osaka",
      municipalityId: "Osaka:osaka",
      coordinates: OSAKA,
    });
    for (const d of [nahaCityPoi, ishigaki, osaka]) {
      expect(
        getOriginAwareTransportEstimate(d, { homeStationCoords: NAHA }, [
          "bus",
        ]),
      ).toBeNull();
    }
  });

  it("Iwakuni postcode origin resolves as mainland-honshu and uses the Hiroshima corridor", () => {
    // KAI-63: Iwakuni (Yamaguchi) sits east of lng 132.2 — inside the shikoku
    // box's west band. A coordinate-only/postcode origin previously resolved
    // to mainland-shikoku (no bus terminal within 50 km → every bus result
    // zeroed). With the Yamaguchi-honshu exclusion box it must resolve as
    // honshu and reach the Hiroshima hub (~33 km) and its verified corridors.
    const IWAKUNI = { lat: 34.1758, lng: 132.2251 };
    const fukuoka = dest({
      id: "fukuoka-city",
      prefecture: "Fukuoka",
      municipalityId: "Fukuoka:fukuoka",
      coordinates: { lat: 33.5902, lng: 130.4017 },
    });
    const estimate = getOriginAwareTransportEstimate(
      fukuoka,
      { homeStationCoords: IWAKUNI },
      ["bus"],
    );
    expect(estimate).not.toBeNull();
    expect(estimate!.mode).toBe("bus");
    expect(estimate!.evidence).toBe("estimated");
    expect(estimate!.corridorEvidence).toBe("verified");
    expect(estimate!.accessDistanceKm?.origin).toBeGreaterThan(20);
  });

  it("a corridor with a known route but unknown fare stays eligible (fare null ≠ no route)", () => {
    // オレンジライナーえひめ (osaka⇔matsuyama) has a verified timetable but
    // no verified standard fare. Missing fare evidence must not exclude the
    // destination: the estimate exists and carries fare null.
    const matsuyama = dest({
      id: "matsuyama-city",
      prefecture: "Ehime",
      municipalityId: "Ehime:matsuyama",
      coordinates: { lat: 33.8404, lng: 132.7657 },
    });
    const estimate = getOriginAwareTransportEstimate(
      matsuyama,
      { homeStationCoords: OSAKA },
      ["bus"],
    );
    expect(estimate).not.toBeNull();
    expect(estimate!.fare).toBeNull();
    expect(estimate!.fareVariability).toBeNull();
  });

  it("night-only highway coaches keep an estimate but never a same-day day trip", () => {
    // KAI-66 boundary: はかた号 (tokyo⇔fukuoka) is night-only. The corridor
    // estimate exists for browsing/weekend one-way evaluation, but the
    // day-trip feasibility gate must reject it.
    const fukuoka = dest({
      id: "fukuoka-city",
      prefecture: "Fukuoka",
      municipalityId: "Fukuoka:fukuoka",
      coordinates: { lat: 33.5902, lng: 130.4017 },
    });
    const estimate = getOriginAwareTransportEstimate(
      fukuoka,
      { homeStationCoords: TOKYO },
      ["bus"],
    );
    expect(estimate).not.toBeNull();
    expect(estimate!.servicePeriod).toBe("night");
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
    // Shinagawa is a physical boarding station, but the tokyo-endpoint
    // corridor row describes Tokyo Station's product. The complete journey
    // is bounded/estimated; the corridor stays verified. Arrival access to
    // Shin-Osaka from the Osaka city-center fixture is also included.
    expect(estimate!.timeRange).toEqual([157, 295]);
    expect(estimate!.evidence).toBe("estimated");
    expect(estimate!.corridorEvidence).toBe("verified");
    expect(estimate!.accessDistanceKm?.destination).toBeGreaterThan(0);
    expect(estimate!.fare).toEqual([14400, 14720]);
  });

  it("Nakayama/Yokohama reaches Shin-Yokohama with real bounded access", () => {
    const estimate = getOriginAwareTransportEstimate(
      osaka(),
      { homeStationCoords: NAKAYAMA },
      ["shinkansen"],
    );
    expect(estimate).not.toBeNull();
    expect(estimate!.corridorEvidence).toBe("verified");
    // Nakayama is ~7.1 km from Shin-Yokohama: mapped-hub wiring must not
    // collapse to zero physical distance. Access is recorded and the
    // complete journey is estimated (KAI-12).
    expect(estimate!.accessDistanceKm?.origin).toBeGreaterThan(5);
    expect(estimate!.accessDistanceKm?.origin).toBeLessThan(10);
    expect(estimate!.evidence).toBe("estimated");
    expect(estimate!.timeRange[0]).toBeGreaterThan(141);
    expect(estimate!.timeRange[1]).toBeGreaterThan(270);
  });

  it("Kawasaki mapped hubs never become zero-distance", () => {
    const estimate = getOriginAwareTransportEstimate(
      osaka(),
      { homeStationCoords: KAWASAKI },
      ["shinkansen"],
    );
    expect(estimate).not.toBeNull();
    expect(estimate!.corridorEvidence).toBe("verified");
    // Kawasaki Station is ~8-11 km from Shinagawa/Shin-Yokohama: whichever
    // hub wins the candidate comparison, the access distance is materially
    // nonzero and the complete journey is estimated.
    expect(estimate!.accessDistanceKm?.origin).toBeGreaterThan(5);
    expect(estimate!.evidence).toBe("estimated");
    expect(estimate!.timeRange[0]).toBeGreaterThan(141);
  });

  it("Omiya reaches the Tokyo-endpoint Tohoku corridor as bounded access", () => {
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
    // Omiya is not Tokyo Station: the tokyo-endpoint corridor's verified
    // duration/fare must not be presented as an Omiya-specific verified
    // product. The corridor stays verified; the journey is estimated, and
    // the fare remains corridor-only provenance.
    expect(estimate!.timeRange).toEqual([101, 180]);
    expect(estimate!.evidence).toBe("estimated");
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

  it("ferry-dependent islands never inherit mainland highway-bus corridors", () => {
    // KAI-12: localModes ["bus"] on an island is local-bus semantics.
    // Sado, Yakushima, Ogasawara and Miyajima must not receive a mainland
    // intercity coach corridor from any origin.
    const HIROSHIMA = { lat: 34.3983, lng: 132.4756 };
    const sado = dest({
      id: "sado-island",
      prefecture: "Niigata",
      municipalityId: "Niigata:sado",
      coordinates: { lat: 38.0, lng: 138.3 },
      transportZoneId: "sado",
    });
    const yakushima = dest({
      id: "yakushima-town",
      prefecture: "Kagoshima",
      municipalityId: "Kagoshima:yakushima",
      transportZoneId: "yakushima",
    });
    const ogasawara = dest({
      id: "ogasawara-islands",
      prefecture: "Tokyo",
      municipalityId: "Tokyo:ogasawara",
      coordinates: { lat: 27.0966, lng: 142.1917 },
      transportZoneId: "ogasawara",
    });
    const miyajima = dest({
      id: "miyajima-itsukushima",
      prefecture: "Hiroshima",
      kind: "island",
      coordinates: { lat: 34.2963, lng: 132.3196 },
    });
    expect(
      getOriginAwareTransportEstimate(sado, { homeStationCoords: TOKYO }, [
        "bus",
      ]),
    ).toBeNull();
    expect(
      getOriginAwareTransportEstimate(
        yakushima,
        { homeStationCoords: { lat: 33.5902, lng: 130.4017 } },
        ["bus"],
      ),
    ).toBeNull();
    expect(
      getOriginAwareTransportEstimate(ogasawara, { homeStationCoords: TOKYO }, [
        "bus",
      ]),
    ).toBeNull();
    expect(
      getOriginAwareTransportEstimate(
        miyajima,
        { homeStationCoords: HIROSHIMA },
        ["bus"],
      ),
    ).toBeNull();
  });

  it("candidate selection compares corridor + access, not first match", () => {
    // A Shinjuku-area location is ~6.3 km from both the Tokyo and Ikebukuro
    // terminals. The tokyo→osaka corridor [438,498] is ~90 minutes faster
    // than ikebukuro→osaka [552,570]; selection must pick the Tokyo corridor
    // rather than stopping at the nearest/first registry match.
    const shinjuku = { lat: 35.6909, lng: 139.7003 };
    const osaka = dest({
      id: "osaka-city",
      prefecture: "Osaka",
      municipalityId: "Osaka:osaka",
      coordinates: { lat: 34.7025, lng: 135.4959 },
    });
    const estimate = getOriginAwareTransportEstimate(
      osaka,
      { homeStationCoords: shinjuku },
      ["bus"],
    );
    expect(estimate).not.toBeNull();
    expect(estimate!.timeRange[0]).toBeLessThan(500);
    // The selected corridor is the fast tokyo→osaka JR row: its fare must be
    // the JR row's fare ([3300,19000]), not the ikebukuro night bus's.
    expect(estimate!.fare).toEqual([3300, 19000]);
  });

  it("duration and fare always come from the same selected corridor row", () => {
    // KAI-12 invariant: the returned duration and fare describe one product.
    // Tokyo→Osaka has a JR row ([438,498], ¥3,300–19,000) and a Willer row
    // ([420,540], ¥4,000–7,500). Whatever row the candidate selection picks,
    // the fare must be that row's fare — never a mix.
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
    // Midpoint comparison favors the JR row (468 vs 480 for Willer).
    expect(estimate!.fare).toEqual([3300, 19000]);
    expect(estimate!.timeRange).toEqual([438, 498]);
  });
});

describe("KAI-66 bus corridor-reversal and service-period semantics", () => {
  it("same-city destinations never ride a reversed intercity corridor (Sendai → Sendai)", () => {
    // Regression (KAI-66): the sendai↔yamagata corridor was usable in
    // reverse by "boarding" at the Yamagata terminal 48 km away to reach a
    // Sendai-area destination, fabricating a 2.5h bus to one's own city.
    const sendaiCity = dest({
      id: "sendai-city",
      prefecture: "Miyagi",
      municipalityId: "Miyagi:sendai",
      coordinates: { lat: 38.268, lng: 140.87 },
    });
    const estimate = getOriginAwareTransportEstimate(
      sendaiCity,
      {
        homeStationCoords: { lat: 38.268, lng: 140.87 },
        originMunicipalityId: "Miyagi:sendai",
      },
      ["bus"],
    );
    expect(estimate).toBeNull();
  });

  it("nearby same-prefecture destinations do not detour through a far boarding hub (Sendai → Matsushima)", () => {
    const matsushima = dest({
      id: "matsushima-bay",
      prefecture: "Miyagi",
      municipalityId: "Miyagi:matsushima",
      coordinates: { lat: 38.3312, lng: 141.0958 },
    });
    const estimate = getOriginAwareTransportEstimate(
      matsushima,
      {
        homeStationCoords: { lat: 38.268, lng: 140.87 },
        originMunicipalityId: "Miyagi:sendai",
      },
      ["bus"],
    );
    expect(estimate).toBeNull();
  });

  it("night-only corridors propagate servicePeriod for the day-trip gate", () => {
    const fukuoka = dest({
      id: "canal-city-hakata",
      prefecture: "Fukuoka",
      municipalityId: "Fukuoka:fukuoka",
      coordinates: { lat: 33.5892, lng: 130.4011 },
    });
    const estimate = getOriginAwareTransportEstimate(
      fukuoka,
      { homeStationCoords: TOKYO, originMunicipalityId: "Tokyo:chiyoda" },
      ["bus"],
    );
    expect(estimate).not.toBeNull();
    expect(estimate!.servicePeriod).toBe("night");
  });

  it("day-split Sendai corridor exposes the day product", () => {
    const sendaiCity = dest({
      id: "sendai-city",
      prefecture: "Miyagi",
      municipalityId: "Miyagi:sendai",
      coordinates: { lat: 38.268, lng: 140.87 },
    });
    const estimate = getOriginAwareTransportEstimate(
      sendaiCity,
      { homeStationCoords: TOKYO, originMunicipalityId: "Tokyo:chiyoda" },
      ["bus"],
    );
    expect(estimate).not.toBeNull();
    expect(estimate!.timeRange).toEqual([330, 342]);
    expect(estimate!.servicePeriod).toBe("day");
  });
});
