import { describe, expect, it } from "vitest";
import type { OdptStation } from "../OdptProvider";
import {
  distanceMeters,
  normalizeStationName,
  resolveOdptStationIdentity,
} from "../odptStationIdentity";

/**
 * Fixtures mirror the shapes observed in the KAI-289 authenticated production
 * smoke:
 *  - JR-East records carry NO coordinates (0/134 measured).
 *  - TokyoMetro and Toei records carry coordinates.
 *  - The same station NAME (日本橋 / Nihombashi) exists across operators.
 */
function station(
  sameAs: string,
  overrides: Partial<OdptStation> = {},
): OdptStation {
  return {
    id: sameAs,
    sameAs,
    ucode: `urn:ucode:_fixture_${sameAs.replace(/[^A-Za-z0-9]/g, "_")}`,
    title: null,
    stationTitle: null,
    operator: null,
    operatorTitle: null,
    railway: null,
    railwayTitle: null,
    stationCode: null,
    coordinates: null,
    connectingRailway: [],
    connectingStation: [],
    date: "2024-06-27T08:00:00+09:00",
    validUntil: null,
    provenance: {
      provider: "odpt",
      providerId: sameAs,
      ucode: null,
      generatedAt: "2024-06-27T08:00:00+09:00",
      issuedAt: null,
      validUntil: null,
      fetchedAt: "2026-09-10T00:00:00.000Z",
      sourceResource: "odpt:Station",
      sourceUrl: "https://api.odpt.org/api/v4/odpt:Station",
      coverage: "unknown",
    },
    ...overrides,
  };
}

// Real production identities. JR-East has coordinates: null.
const JR_EAST_TOKYO = station("odpt.Station:JR-East.Keiyo.Tokyo", {
  title: "東京",
  stationTitle: { ja: "東京", en: "Tokyo" },
  operator: "odpt.Operator:JR-East",
  railway: "odpt.Railway:JR-East.Keiyo",
  stationCode: null,
  coordinates: null,
});

const JR_EAST_NIHOMBASHI = station(
  "odpt.Station:JR-East.ChuoSobuLocal.Nihombashi",
  {
    title: "新日本橋",
    stationTitle: { ja: "新日本橋", en: "Shin-Nihombashi" },
    operator: "odpt.Operator:JR-East",
    railway: "odpt.Railway:JR-East.ChuoSobuLocal",
    coordinates: null,
  },
);

const METRO_NIHOMBASHI = station("odpt.Station:TokyoMetro.Ginza.Nihombashi", {
  title: "日本橋",
  stationTitle: {
    ja: "日本橋",
    en: "Nihombashi",
    ko: "니혼바시",
    "ja-Hrkt": "にほんばし",
    "zh-Hans": "日本桥",
    "zh-Hant": "日本橋",
  },
  operator: "odpt.Operator:TokyoMetro",
  railway: "odpt.Railway:TokyoMetro.Ginza",
  stationCode: "G11",
  coordinates: { lat: 35.681879, lng: 139.773335 },
  connectingRailway: [
    "odpt.Railway:TokyoMetro.Tozai",
    "odpt.Railway:Toei.Asakusa",
  ],
  connectingStation: [
    "odpt.Station:TokyoMetro.Tozai.Nihombashi",
    "odpt.Station:Toei.Asakusa.Nihombashi",
  ],
});

const TOEI_NIHOMBASHI = station("odpt.Station:Toei.Asakusa.Nihombashi", {
  title: "日本橋",
  stationTitle: { ja: "日本橋", en: "Nihombashi" },
  operator: "odpt.Operator:Toei",
  railway: "odpt.Railway:Toei.Asakusa",
  stationCode: "A-13",
  coordinates: { lat: 35.681796, lng: 139.775814 },
});

const METRO_TOKYO = station("odpt.Station:TokyoMetro.Marunouchi.Tokyo", {
  title: "東京",
  stationTitle: { ja: "東京", en: "Tokyo" },
  operator: "odpt.Operator:TokyoMetro",
  railway: "odpt.Railway:TokyoMetro.Marunouchi",
  stationCode: "M17",
  coordinates: { lat: 35.6812, lng: 139.7671 },
});

const ALL = [
  JR_EAST_TOKYO,
  JR_EAST_NIHOMBASHI,
  METRO_NIHOMBASHI,
  TOEI_NIHOMBASHI,
  METRO_TOKYO,
];

describe("normalizeStationName", () => {
  it("case-folds, NFKC-folds and collapses whitespace", () => {
    expect(normalizeStationName("  Tokyo  ")).toBe("tokyo");
    expect(normalizeStationName("ＴＯＫＹＯ")).toBe("tokyo");
    expect(normalizeStationName("New   Delhi")).toBe("new delhi");
  });

  it("returns null for unusable values", () => {
    expect(normalizeStationName(null)).toBeNull();
    expect(normalizeStationName("   ")).toBeNull();
    expect(normalizeStationName(undefined)).toBeNull();
  });
});

describe("distanceMeters", () => {
  it("measures a short real-world distance", () => {
    const distance = distanceMeters(
      { lat: 35.681879, lng: 139.773335 },
      { lat: 35.681796, lng: 139.775814 },
    );
    expect(distance).toBeGreaterThan(100);
    expect(distance).toBeLessThan(300);
  });

  it("is zero for identical coordinates", () => {
    expect(distanceMeters({ lat: 35, lng: 139 }, { lat: 35, lng: 139 })).toBe(
      0,
    );
  });
});

describe("exact_identity path", () => {
  it("resolves from a known owl:sameAs", () => {
    const result = resolveOdptStationIdentity(
      { odptId: "odpt.Station:TokyoMetro.Ginza.Nihombashi" },
      ALL,
    );
    expect(result.status).toBe("matched");
    expect(result.evidencePath).toBe("exact_identity");
    expect(result.station?.sameAs).toBe(
      "odpt.Station:TokyoMetro.Ginza.Nihombashi",
    );
  });

  it("resolves a coordinate-less JR-East station by identity", () => {
    const result = resolveOdptStationIdentity(
      { odptId: "odpt.Station:JR-East.Keiyo.Tokyo" },
      ALL,
    );
    expect(result.status).toBe("matched");
    expect(result.evidencePath).toBe("exact_identity");
    expect(result.station?.coordinates).toBeNull();
  });

  it("resolves from a ucode", () => {
    const result = resolveOdptStationIdentity(
      { odptId: METRO_NIHOMBASHI.ucode as string },
      ALL,
    );
    expect(result.status).toBe("matched");
    expect(result.evidencePath).toBe("exact_identity");
  });

  it("falls through to weaker evidence when the identity is absent", () => {
    const result = resolveOdptStationIdentity(
      { odptId: "odpt.Station:JR-East.Yamanote.Shibuya" },
      ALL,
    );
    expect(result.status).toBe("unmatched");
    expect(result.notes).toContain("exact_identity_not_present_in_candidates");
  });
});

describe("canonical_mapping path", () => {
  it("resolves only when an explicit mapping is supplied", () => {
    const result = resolveOdptStationIdentity(
      { canonicalStationId: "nihombashi-station" },
      ALL,
      {
        canonicalMappings: {
          "nihombashi-station": "odpt.Station:TokyoMetro.Ginza.Nihombashi",
        },
      },
    );
    expect(result.status).toBe("matched");
    expect(result.evidencePath).toBe("canonical_mapping");
  });

  it("does not guess a mapping when none is supplied", () => {
    const result = resolveOdptStationIdentity(
      { canonicalStationId: "nihombashi-station" },
      ALL,
    );
    expect(result.status).toBe("unmatched");
    expect(result.notes).toContain("no_canonical_mapping_for_id");
  });

  it("reports a mapping whose target is absent from the candidates", () => {
    const result = resolveOdptStationIdentity(
      { canonicalStationId: "shibuya" },
      ALL,
      {
        canonicalMappings: { shibuya: "odpt.Station:JR-East.Yamanote.Shibuya" },
      },
    );
    expect(result.status).toBe("unmatched");
    expect(result.notes).toContain(
      "canonical_mapping_target_not_present_in_candidates",
    );
  });

  it("prefers exact identity over canonical mapping", () => {
    const result = resolveOdptStationIdentity(
      {
        odptId: "odpt.Station:Toei.Asakusa.Nihombashi",
        canonicalStationId: "nihombashi-station",
      },
      ALL,
      {
        canonicalMappings: {
          "nihombashi-station": "odpt.Station:TokyoMetro.Ginza.Nihombashi",
        },
      },
    );
    expect(result.evidencePath).toBe("exact_identity");
    expect(result.station?.sameAs).toBe("odpt.Station:Toei.Asakusa.Nihombashi");
  });
});

describe("operator_railway_identity path", () => {
  it("resolves from exact name + operator + railway", () => {
    const result = resolveOdptStationIdentity(
      {
        name: "日本橋",
        operator: "odpt.Operator:TokyoMetro",
        railway: "odpt.Railway:TokyoMetro.Ginza",
      },
      ALL,
    );
    expect(result.status).toBe("matched");
    expect(result.evidencePath).toBe("operator_railway_identity");
    expect(result.station?.sameAs).toBe(
      "odpt.Station:TokyoMetro.Ginza.Nihombashi",
    );
  });

  it("resolves a coordinate-less JR-East station without coordinates", () => {
    // The central KAI-290 regression: JR-East has no geo fields, so identity
    // must work from name + operator + railway alone.
    const result = resolveOdptStationIdentity(
      {
        name: "東京",
        operator: "odpt.Operator:JR-East",
        railway: "odpt.Railway:JR-East.Keiyo",
      },
      ALL,
    );
    expect(result.status).toBe("matched");
    expect(result.evidencePath).toBe("operator_railway_identity");
    expect(result.station?.sameAs).toBe("odpt.Station:JR-East.Keiyo.Tokyo");
    expect(result.station?.coordinates).toBeNull();
  });

  it("matches a localized name in any supplied language key", () => {
    for (const name of [
      "日本橋",
      "Nihombashi",
      "니혼바시",
      "日本桥",
      "日本橋",
    ]) {
      const result = resolveOdptStationIdentity(
        {
          name,
          operator: "odpt.Operator:TokyoMetro",
          railway: "odpt.Railway:TokyoMetro.Ginza",
        },
        ALL,
      );
      expect(result.status, `name ${name}`).toBe("matched");
    }
  });

  it("uses stationCode as an additional discriminator when supplied", () => {
    const result = resolveOdptStationIdentity(
      {
        name: "日本橋",
        operator: "odpt.Operator:Toei",
        railway: "odpt.Railway:Toei.Asakusa",
        stationCode: "A-13",
      },
      ALL,
    );
    expect(result.status).toBe("matched");
    expect(result.station?.sameAs).toBe("odpt.Station:Toei.Asakusa.Nihombashi");
  });

  it("stays unmatched when the stationCode contradicts the record", () => {
    const result = resolveOdptStationIdentity(
      {
        name: "日本橋",
        operator: "odpt.Operator:Toei",
        railway: "odpt.Railway:Toei.Asakusa",
        stationCode: "A-99",
      },
      ALL,
    );
    expect(result.status).toBe("unmatched");
  });

  it("stays unmatched when the operator contradicts the record", () => {
    const result = resolveOdptStationIdentity(
      {
        name: "日本橋",
        operator: "odpt.Operator:JR-East",
        railway: "odpt.Railway:TokyoMetro.Ginza",
      },
      ALL,
    );
    expect(result.status).toBe("unmatched");
  });
});

describe("name alone is never identity evidence", () => {
  it("keeps a shared station name ambiguous across operators", () => {
    const result = resolveOdptStationIdentity({ name: "日本橋" }, ALL);
    expect(result.status).toBe("ambiguous");
    expect(result.evidencePath).toBeNull();
    expect(result.station).toBeNull();
    expect(result.notes).toContain("name_alone_is_not_identity_evidence");
  });

  it("keeps a name ambiguous even with only one candidate present", () => {
    const result = resolveOdptStationIdentity({ name: "東京" }, [
      JR_EAST_TOKYO,
    ]);
    expect(result.status).toBe("ambiguous");
    expect(result.station).toBeNull();
  });

  it("does not resolve a name + operator without a railway", () => {
    const result = resolveOdptStationIdentity(
      { name: "東京", operator: "odpt.Operator:JR-East" },
      ALL,
    );
    expect(result.status).toBe("ambiguous");
    expect(result.station).toBeNull();
  });

  it("keeps same-name JR-East / TokyoMetro / Toei situations ambiguous without railway evidence", () => {
    const result = resolveOdptStationIdentity(
      { name: "日本橋", operator: "odpt.Operator:TokyoMetro" },
      ALL,
    );
    expect(result.status).toBe("ambiguous");
  });

  it("never fuzzy-matches a partial name", () => {
    const result = resolveOdptStationIdentity(
      {
        name: "Nihon",
        operator: "odpt.Operator:TokyoMetro",
        railway: "odpt.Railway:TokyoMetro.Ginza",
      },
      ALL,
    );
    expect(result.status).toBe("unmatched");
    expect(result.station).toBeNull();
  });

  it("never fuzzy-matches a near-miss name", () => {
    const result = resolveOdptStationIdentity(
      {
        name: "Nihombashi Station",
        operator: "odpt.Operator:TokyoMetro",
        railway: "odpt.Railway:TokyoMetro.Ginza",
      },
      ALL,
    );
    expect(result.status).toBe("unmatched");
  });
});

describe("geographic path", () => {
  it("resolves a single candidate within tolerance", () => {
    const result = resolveOdptStationIdentity(
      { coordinates: { lat: 35.681879, lng: 139.773335 } },
      [JR_EAST_TOKYO, METRO_NIHOMBASHI],
      { defaultMaxDistanceMeters: 200 },
    );
    expect(result.status).toBe("matched");
    expect(result.evidencePath).toBe("geographic");
    expect(result.station?.sameAs).toBe(
      "odpt.Station:TokyoMetro.Ginza.Nihombashi",
    );
  });

  it("skips candidate records that carry no coordinates", () => {
    const result = resolveOdptStationIdentity(
      { coordinates: { lat: 35.6812, lng: 139.7671 } },
      [JR_EAST_TOKYO, METRO_TOKYO],
      { defaultMaxDistanceMeters: 200 },
    );
    expect(result.status).toBe("matched");
    expect(result.station?.sameAs).toBe(
      "odpt.Station:TokyoMetro.Marunouchi.Tokyo",
    );
    expect(result.notes).toContain("geographic_path_skipped_1_coordinate_less");
  });

  it("cannot fabricate a JR-East match from coordinates alone", () => {
    // JR-East has no coordinates, so a coordinate-only request must never
    // resolve to a JR-East station — and must never invent coordinates for it.
    const result = resolveOdptStationIdentity(
      { coordinates: { lat: 35.6812, lng: 139.7671 } },
      [JR_EAST_TOKYO],
      { defaultMaxDistanceMeters: 1000 },
    );
    expect(result.status).toBe("unmatched");
    expect(result.station).toBeNull();
    expect(result.notes).toContain("no_geographic_candidate_within_tolerance");
  });

  it("leaves multiple geographic candidates ambiguous rather than picking the nearest", () => {
    const result = resolveOdptStationIdentity(
      { coordinates: { lat: 35.68184, lng: 139.774 } },
      [METRO_NIHOMBASHI, TOEI_NIHOMBASHI],
      { defaultMaxDistanceMeters: 1000 },
    );
    expect(result.status).toBe("ambiguous");
    expect(result.candidateCount).toBe(2);
    expect(result.notes).toContain("geographic_multiple_candidates");
  });

  it("narrows multiple geographic candidates using explicit operator evidence", () => {
    const result = resolveOdptStationIdentity(
      {
        coordinates: { lat: 35.68184, lng: 139.774 },
        operator: "odpt.Operator:Toei",
      },
      [METRO_NIHOMBASHI, TOEI_NIHOMBASHI],
      { defaultMaxDistanceMeters: 1000 },
    );
    expect(result.status).toBe("matched");
    expect(result.evidencePath).toBe("geographic");
    expect(result.station?.sameAs).toBe("odpt.Station:Toei.Asakusa.Nihombashi");
  });

  it("stays unmatched when nothing is within tolerance", () => {
    const result = resolveOdptStationIdentity(
      { coordinates: { lat: 34.6937, lng: 135.5023 } },
      ALL,
      { defaultMaxDistanceMeters: 500 },
    );
    expect(result.status).toBe("unmatched");
    expect(result.notes).toContain("no_geographic_candidate_within_tolerance");
  });

  it("honours a per-request tolerance override", () => {
    const near = resolveOdptStationIdentity(
      { coordinates: { lat: 35.6812, lng: 139.7671 }, maxDistanceMeters: 10 },
      [METRO_NIHOMBASHI],
    );
    expect(near.status).toBe("unmatched");
  });
});

describe("connecting_station path", () => {
  it("resolves from an explicit connectingStation cross-reference", () => {
    const result = resolveOdptStationIdentity(
      { connectingStationIds: ["odpt.Station:Toei.Asakusa.Nihombashi"] },
      [JR_EAST_TOKYO, TOEI_NIHOMBASHI, METRO_TOKYO],
    );
    expect(result.status).toBe("matched");
    expect(result.evidencePath).toBe("connecting_station");
    expect(result.station?.sameAs).toBe("odpt.Station:Toei.Asakusa.Nihombashi");
  });

  it("resolves from an explicit connectingRailway cross-reference", () => {
    const result = resolveOdptStationIdentity(
      { connectingRailwayIds: ["odpt.Railway:Toei.Asakusa"] },
      [JR_EAST_TOKYO, TOEI_NIHOMBASHI, METRO_NIHOMBASHI],
    );
    expect(result.status).toBe("matched");
    expect(result.evidencePath).toBe("connecting_station");
    expect(result.station?.sameAs).toBe("odpt.Station:Toei.Asakusa.Nihombashi");
  });

  it("stays ambiguous when a connecting railway matches several stations", () => {
    // Two stations on the SAME railway: a railway-level reference alone cannot
    // pick one of them.
    const secondGinza = station("odpt.Station:TokyoMetro.Ginza.Kyobashi", {
      title: "京橋",
      stationTitle: { ja: "京橋", en: "Kyobashi" },
      operator: "odpt.Operator:TokyoMetro",
      railway: "odpt.Railway:TokyoMetro.Ginza",
      stationCode: "G10",
      coordinates: { lat: 35.676704, lng: 139.77011 },
    });
    const result = resolveOdptStationIdentity(
      { connectingRailwayIds: ["odpt.Railway:TokyoMetro.Ginza"] },
      [...ALL, secondGinza],
    );
    expect(result.status).toBe("ambiguous");
    expect(result.candidateCount).toBe(2);
    expect(result.notes).toContain("connecting_railway_multiple_candidates");
  });

  it("does not invent a transfer from unrelated candidates", () => {
    const result = resolveOdptStationIdentity(
      { connectingStationIds: ["odpt.Station:JR-East.Yamanote.Shibuya"] },
      ALL,
    );
    expect(result.status).toBe("unmatched");
    expect(result.notes).toContain("no_connecting_station_reference_found");
  });
});

describe("/places absence is not evidence of being unsupported", () => {
  it("resolves JR-East identity even though geographic discovery omits it", () => {
    // The KAI-289 smoke returned zero JR-East candidates from /places at every
    // radius, because JR-East records carry no coordinates. Identity evidence
    // must still resolve the station.
    const result = resolveOdptStationIdentity(
      {
        name: "東京",
        operator: "odpt.Operator:JR-East",
        railway: "odpt.Railway:JR-East.Keiyo",
      },
      [JR_EAST_TOKYO],
    );
    expect(result.status).toBe("matched");
    expect(result.station?.coordinates).toBeNull();
    expect(result.station?.sameAs).toBe("odpt.Station:JR-East.Keiyo.Tokyo");
  });

  it("never writes coordinates onto a coordinate-less record", () => {
    const result = resolveOdptStationIdentity(
      { odptId: "odpt.Station:JR-East.Keiyo.Tokyo" },
      [JR_EAST_TOKYO],
    );
    expect(result.station?.coordinates).toBeNull();
    // The candidate object itself must be untouched.
    expect(JR_EAST_TOKYO.coordinates).toBeNull();
  });

  it("distinguishes an unsupported operator from an unmatched station", () => {
    // No candidates at all means the caller passed none; that is not proof the
    // operator lacks coverage.
    const result = resolveOdptStationIdentity(
      {
        name: "東京",
        operator: "odpt.Operator:JR-East",
        railway: "odpt.Railway:JR-East.Keiyo",
      },
      [],
    );
    expect(result.status).toBe("unmatched");
    expect(result.candidateCount).toBe(0);
  });
});

describe("evidence precedence", () => {
  const candidates = [JR_EAST_TOKYO, METRO_NIHOMBASHI, TOEI_NIHOMBASHI];

  it("prefers exact identity over every weaker path", () => {
    const result = resolveOdptStationIdentity(
      {
        odptId: "odpt.Station:JR-East.Keiyo.Tokyo",
        name: "日本橋",
        operator: "odpt.Operator:TokyoMetro",
        railway: "odpt.Railway:TokyoMetro.Ginza",
        coordinates: { lat: 35.681879, lng: 139.773335 },
        connectingStationIds: ["odpt.Station:Toei.Asakusa.Nihombashi"],
      },
      candidates,
    );
    expect(result.evidencePath).toBe("exact_identity");
  });

  it("prefers canonical mapping over name/operator/railway", () => {
    const result = resolveOdptStationIdentity(
      {
        canonicalStationId: "toei-nihombashi",
        name: "日本橋",
        operator: "odpt.Operator:TokyoMetro",
        railway: "odpt.Railway:TokyoMetro.Ginza",
      },
      candidates,
      {
        canonicalMappings: {
          "toei-nihombashi": "odpt.Station:Toei.Asakusa.Nihombashi",
        },
      },
    );
    expect(result.evidencePath).toBe("canonical_mapping");
  });

  it("prefers name/operator/railway over geographic", () => {
    const result = resolveOdptStationIdentity(
      {
        name: "日本橋",
        operator: "odpt.Operator:TokyoMetro",
        railway: "odpt.Railway:TokyoMetro.Ginza",
        coordinates: { lat: 35.68184, lng: 139.774 },
      },
      candidates,
      { defaultMaxDistanceMeters: 1000 },
    );
    expect(result.evidencePath).toBe("operator_railway_identity");
  });

  it("prefers geographic over connecting references", () => {
    const result = resolveOdptStationIdentity(
      {
        coordinates: { lat: 35.681879, lng: 139.773335 },
        connectingStationIds: ["odpt.Station:Toei.Asakusa.Nihombashi"],
      },
      candidates,
      { defaultMaxDistanceMeters: 100 },
    );
    expect(result.evidencePath).toBe("geographic");
  });
});

describe("result contract", () => {
  it("reports the evidence path on every match", () => {
    const result = resolveOdptStationIdentity(
      { odptId: "odpt.Station:Toei.Asakusa.Nihombashi" },
      ALL,
    );
    expect(result.evidencePath).toBe("exact_identity");
    expect(result.candidateCount).toBe(1);
    expect(result.candidates).toHaveLength(1);
  });

  it("returns no station for ambiguous and unmatched results", () => {
    for (const input of [
      { name: "東京" },
      { odptId: "odpt.Station:Nope.Nope" },
    ]) {
      const result = resolveOdptStationIdentity(input, ALL);
      expect(result.status).not.toBe("matched");
      expect(result.station).toBeNull();
      expect(result.evidencePath).toBeNull();
    }
  });

  it("handles an empty input and empty candidates without throwing", () => {
    expect(resolveOdptStationIdentity({}, []).status).toBe("unmatched");
    expect(resolveOdptStationIdentity({}, ALL).status).toBe("unmatched");
  });

  it("ignores candidate records without an ODPT identity", () => {
    const broken = { ...METRO_NIHOMBASHI, id: "", sameAs: "" } as OdptStation;
    const result = resolveOdptStationIdentity(
      { coordinates: { lat: 35.681879, lng: 139.773335 } },
      [broken],
      { defaultMaxDistanceMeters: 100 },
    );
    expect(result.status).toBe("unmatched");
  });

  it("is deterministic for the same input", () => {
    const input = {
      name: "日本橋",
      operator: "odpt.Operator:TokyoMetro",
      railway: "odpt.Railway:TokyoMetro.Ginza",
    };
    const first = resolveOdptStationIdentity(input, ALL);
    const second = resolveOdptStationIdentity(input, ALL);
    expect(first).toEqual(second);
  });
});
