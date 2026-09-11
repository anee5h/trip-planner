/**
 * KAI-291A — destination -> exact ODPT arrival-station identity tooling tests.
 *
 * These pin the AUTHORIZED rule and the two properties that make it safe:
 *   1. unique-within-bounded-radius anchors; nearest-of-several never does;
 *   2. a geographic anchor claims proximity only.
 *
 * Offline and deterministic: no network, no clock, no filesystem writes.
 */
import { describe, expect, it } from "vitest";

import {
  ANCHOR_AUDIT_VERSION,
  ANCHOR_EVIDENCE_PATH,
  ANCHOR_STATUS,
  buildAnchorArtifact,
  buildAnchorCoverageReport,
  classifyGeographicAnchor,
  compareValidationCohort,
  GEOGRAPHIC_TOLERANCE_METERS,
  loadCatalogue,
  loadStationIndex,
  stationNamesInText,
  stationsWithinTolerance,
  type PilotStationEntry,
} from "../kai-291a-destination-station-identity";

/** Shinjuku Station, as a reference point. */
const SHINJUKU = { lat: 35.6896, lng: 139.7006 };
/** ~111 m north of Shinjuku. */
const NEAR = { lat: 35.6906, lng: 139.7006 };
/** ~668 m north of Shinjuku — outside the 500 m tolerance. */
const FAR = { lat: 35.6956, lng: 139.7006 };

function station(
  sameAs: string,
  coordinates: { lat: number; lng: number },
  overrides: Partial<PilotStationEntry> = {},
): PilotStationEntry {
  return {
    sameAs,
    operator: "odpt.Operator:TokyoMetro",
    railway: "odpt.Railway:TokyoMetro.Marunouchi",
    stationCode: "M-01",
    coordinates,
    title: "新宿",
    stationTitle: { en: "Shinjuku", ja: "新宿" },
    ...overrides,
  };
}

const DESTINATION = { id: "test-destination", coordinates: SHINJUKU };

describe("KAI-291A geographic anchor rule", () => {
  it("anchors when exactly ONE pilot station is inside the tolerance", () => {
    const verdict = classifyGeographicAnchor(DESTINATION, [
      station("odpt.Station:A", NEAR),
    ]);

    expect(verdict.status).toBe(ANCHOR_STATUS.ANCHORED);
    expect(verdict.blocker).toBeNull();
    expect(verdict.evidencePath).toBe(ANCHOR_EVIDENCE_PATH);
    expect(verdict.anchor?.odptStationId).toBe("odpt.Station:A");
    expect(verdict.candidateCount).toBe(1);
    expect(verdict.distanceMeters).toBeGreaterThan(100);
    expect(verdict.distanceMeters).toBeLessThan(120);
  });

  it("is unavailable when NO pilot station is inside the tolerance", () => {
    const verdict = classifyGeographicAnchor(DESTINATION, [
      station("odpt.Station:A", FAR),
    ]);

    expect(verdict.status).toBe(ANCHOR_STATUS.UNAVAILABLE);
    expect(verdict.blocker).toBe("no_pilot_station_within_tolerance");
    expect(verdict.anchor).toBeNull();
    expect(verdict.candidateCount).toBe(0);
  });

  it("is AMBIGUOUS when more than one candidate is inside the tolerance", () => {
    const verdict = classifyGeographicAnchor(DESTINATION, [
      station("odpt.Station:A", NEAR),
      station("odpt.Station:B", { lat: 35.6902, lng: 139.7006 }),
    ]);

    expect(verdict.status).toBe(ANCHOR_STATUS.AMBIGUOUS);
    expect(verdict.blocker).toBe("multiple_pilot_stations_within_tolerance");
    expect(verdict.anchor).toBeNull();
    expect(verdict.candidateIdentities).toEqual([
      "odpt.Station:A",
      "odpt.Station:B",
    ]);
  });

  it("NEVER picks the nearest of several — a much closer candidate must not win", () => {
    // 'closer' is ~11 m away, 'farther' is ~111 m away. Nearest-wins would anchor
    // to 'closer'; the authorized rule must refuse to choose.
    const verdict = classifyGeographicAnchor(DESTINATION, [
      station("odpt.Station:Farther", NEAR),
      station("odpt.Station:Closer", { lat: 35.6897, lng: 139.7006 }),
    ]);

    expect(verdict.status).toBe(ANCHOR_STATUS.AMBIGUOUS);
    expect(verdict.anchor).toBeNull();
  });

  it("does NOT break ambiguity by operator or railway", () => {
    // Two records for the SAME physical station on different railways. The
    // resolver is called without operator/railway, so these stay ambiguous rather
    // than being collapsed.
    const verdict = classifyGeographicAnchor(DESTINATION, [
      station("odpt.Station:TokyoMetro.Marunouchi.Shinjuku", NEAR, {
        operator: "odpt.Operator:TokyoMetro",
        railway: "odpt.Railway:TokyoMetro.Marunouchi",
      }),
      station(
        "odpt.Station:Toei.Shinjuku.Shinjuku",
        { lat: 35.6901, lng: 139.7006 },
        {
          operator: "odpt.Operator:Toei",
          railway: "odpt.Railway:Toei.Shinjuku",
        },
      ),
    ]);

    expect(verdict.status).toBe(ANCHOR_STATUS.AMBIGUOUS);
    expect(verdict.anchor).toBeNull();
  });

  it("reports a destination with no coordinates as coordinates_absent", () => {
    const verdict = classifyGeographicAnchor(
      { id: "no-coords", coordinates: null },
      [station("odpt.Station:A", NEAR)],
    );

    expect(verdict.status).toBe(ANCHOR_STATUS.COORDINATES_ABSENT);
    expect(verdict.blocker).toBe("destination_coordinates_absent");
    expect(verdict.candidateCount).toBe(0);
  });

  it("locks the tolerance to the existing resolver default at the boundary", () => {
    // Just inside 500 m anchors; just outside does not. If the resolver's real
    // default ever drifts from GEOGRAPHIC_TOLERANCE_METERS this fails.
    const insideMeters = 499;
    const outsideMeters = 501;
    const degreesPerMeter = 1 / 111_320;

    const inside = classifyGeographicAnchor(DESTINATION, [
      station("odpt.Station:Inside", {
        lat: SHINJUKU.lat + insideMeters * degreesPerMeter,
        lng: SHINJUKU.lng,
      }),
    ]);
    const outside = classifyGeographicAnchor(DESTINATION, [
      station("odpt.Station:Outside", {
        lat: SHINJUKU.lat + outsideMeters * degreesPerMeter,
        lng: SHINJUKU.lng,
      }),
    ]);

    expect(GEOGRAPHIC_TOLERANCE_METERS).toBe(500);
    expect(inside.status).toBe(ANCHOR_STATUS.ANCHORED);
    expect(outside.status).toBe(ANCHOR_STATUS.UNAVAILABLE);
  });

  it("uses an evidence path that claims proximity, not a curated mapping", () => {
    // Guards against a rename that would silently upgrade the semantic claim.
    expect(ANCHOR_EVIDENCE_PATH).toBe("geographic_unique_candidate");
    for (const forbidden of [
      "verified_access_station",
      "official_arrival_station",
      "recommended_station",
      "curated_mapping",
    ]) {
      expect(ANCHOR_EVIDENCE_PATH).not.toBe(forbidden);
    }
  });

  it("agrees with its own reporting helper on the candidate count", () => {
    const stations = [
      station("odpt.Station:A", NEAR),
      station("odpt.Station:B", FAR),
    ];
    const within = stationsWithinTolerance(
      SHINJUKU,
      stations,
      GEOGRAPHIC_TOLERANCE_METERS,
    );
    const verdict = classifyGeographicAnchor(DESTINATION, stations);

    expect(within).toHaveLength(1);
    expect(verdict.candidateCount).toBe(within.length);
    expect(verdict.status).toBe(ANCHOR_STATUS.ANCHORED);
  });
});

describe("KAI-291A coverage report", () => {
  // Deliberately SEPARATED stations: a unique anchor requires that no other pilot
  // station is also inside the 500 m radius, so co-located fixtures would all be
  // ambiguous instead.
  const uniqueA = station("odpt.Station:UniqueA", {
    lat: 35.6906,
    lng: 139.7006,
  });
  const uniqueD = station("odpt.Station:UniqueD", {
    lat: 35.6896,
    lng: 139.75,
  });
  const pairX = station("odpt.Station:PairX", { lat: 35.8, lng: 139.7006 });
  const pairY = station("odpt.Station:PairY", { lat: 35.802, lng: 139.7006 });
  const stations = [uniqueA, pairX, pairY, uniqueD];

  const destinations = [
    { id: "anchored-1", coordinates: { lat: 35.6906, lng: 139.7006 } },
    { id: "anchored-2", coordinates: { lat: 35.6896, lng: 139.75 } },
    { id: "ambiguous-1", coordinates: { lat: 35.801, lng: 139.7006 } },
    { id: "unavailable-1", coordinates: { lat: 35.75, lng: 139.7006 } },
    { id: "no-coords", coordinates: null },
  ];

  it("aggregates coverage and the candidate-count distribution", () => {
    const report = buildAnchorCoverageReport(destinations, stations);

    expect(report.toleranceMeters).toBe(500);
    expect(report.destinationsEvaluated).toBe(5);
    expect(report.uniqueAnchors).toBe(2);
    expect(report.ambiguous).toBe(1);
    expect(report.unavailable).toBe(1);
    expect(report.coordinatesAbsent).toBe(1);

    // Distribution covers only destinations the rule could run for.
    const distributionTotal = Object.values(
      report.candidateCountDistribution,
    ).reduce((sum, value) => sum + value, 0);
    expect(distributionTotal).toBe(4);
    expect(report.candidateCountDistribution["1"]).toBe(2);
    expect(report.candidateCountDistribution["2"]).toBe(1);
    expect(report.candidateCountDistribution["0"]).toBe(1);
  });

  it("records distance statistics for unique anchors only", () => {
    const report = buildAnchorCoverageReport(destinations, stations);

    expect(report.distanceMetersStats.min).not.toBeNull();
    expect(report.distanceMetersStats.max).not.toBeNull();
    expect(report.distanceMetersStats.max).toBeLessThanOrEqual(500);
    expect(
      report.anchors.every((verdict) => verdict.distanceMeters !== null),
    ).toBe(true);
    expect(report.distanceMetersStats.bucketUnder50).toBe(2);
  });

  it("counts anchors per operator and per railway", () => {
    const report = buildAnchorCoverageReport(destinations, stations);

    const operatorTotal = Object.values(report.anchorsByOperator).reduce(
      (sum, value) => sum + value,
      0,
    );
    expect(operatorTotal).toBe(report.uniqueAnchors);
  });
});

describe("KAI-291A artifact", () => {
  const stations = [
    station("odpt.Station:UniqueA", { lat: 35.6906, lng: 139.7006 }),
    station("odpt.Station:PairX", { lat: 35.8, lng: 139.7006 }),
    station("odpt.Station:PairY", { lat: 35.802, lng: 139.7006 }),
  ];

  it("omits non-anchored destinations and lists them explicitly", () => {
    const stationIndex = {
      pilotOperators: ["odpt.Operator:TokyoMetro"],
      sourceBoundary: "https://meguruto.app/api/odpt",
      providerRetrievedAt: {
        "odpt.Operator:TokyoMetro": ["2026-09-11T05:23:38.334Z"],
      },
    };
    const report = buildAnchorCoverageReport(
      [
        { id: "anchored", coordinates: { lat: 35.6906, lng: 139.7006 } },
        { id: "ambiguous", coordinates: { lat: 35.801, lng: 139.7006 } },
        { id: "none", coordinates: null },
      ],
      stations,
    );
    const artifact = buildAnchorArtifact({
      report,
      validation: [],
      stationIndex,
      stationCount: 3,
      catalogueCount: 3,
    }) as Record<string, never>;

    expect(artifact.anchors).toHaveLength(1);
    expect(artifact.ambiguousDestinations).toHaveLength(1);
    expect(artifact.coordinatesAbsentDestinations).toEqual(["none"]);
    expect(artifact.auditVersion).toBe(ANCHOR_AUDIT_VERSION);
    expect(artifact.networkCalls).toBe(0);
    expect(artifact.providerCalls).toBe(0);
  });

  it("carries full provenance on every anchor", () => {
    const stationIndex = {
      sourceBoundary: "https://meguruto.app/api/odpt",
      providerRetrievedAt: {
        "odpt.Operator:TokyoMetro": ["2026-09-11T05:23:38.334Z"],
      },
    };
    const report = buildAnchorCoverageReport(
      [{ id: "anchored", coordinates: { lat: 35.6906, lng: 139.7006 } }],
      stations,
    );
    const artifact = buildAnchorArtifact({
      report,
      validation: [],
      stationIndex,
      stationCount: 3,
      catalogueCount: 1,
    }) as unknown as { anchors: { provenance: Record<string, unknown> }[] };

    const provenance = artifact.anchors[0].provenance;
    for (const key of [
      "evidencePath",
      "toleranceMeters",
      "candidateCount",
      "candidateIdentities",
      "providerBoundary",
      "providerRetrievedAt",
      "auditVersion",
    ]) {
      expect(provenance).toHaveProperty(key);
    }
    expect(provenance.evidencePath).toBe(ANCHOR_EVIDENCE_PATH);
  });

  it("is environment independent: identical inputs give identical bytes", () => {
    const args = {
      report: buildAnchorCoverageReport(
        [{ id: "anchored", coordinates: { lat: 35.6906, lng: 139.7006 } }],
        stations,
      ),
      validation: [],
      stationIndex: { sourceBoundary: "https://meguruto.app/api/odpt" },
      stationCount: 3,
      catalogueCount: 1,
    };

    const previous = process.env.GITHUB_SHA;
    const first = JSON.stringify(buildAnchorArtifact(args));
    process.env.GITHUB_SHA = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
    const second = JSON.stringify(buildAnchorArtifact(args));
    if (previous === undefined) delete process.env.GITHUB_SHA;
    else process.env.GITHUB_SHA = previous;

    // No clock, no env: the artifact must not vary with the environment.
    expect(second).toBe(first);
  });
});

describe("KAI-291A input loading", () => {
  it("refuses an empty station index instead of reporting zero coverage", () => {
    expect(() =>
      loadStationIndex(() => JSON.stringify({ stations: [] })),
    ).toThrow(/carries no stations/);
  });

  it("refuses a station index whose entries have no coordinates", () => {
    expect(() =>
      loadStationIndex(() =>
        JSON.stringify({
          stations: [{ sameAs: "odpt.Station:A", coordinates: null }],
        }),
      ),
    ).toThrow(/no coordinate-bearing stations/);
  });

  it("refuses an unrecognized catalogue shape", () => {
    expect(() =>
      loadCatalogue(() => JSON.stringify({ unexpected: true })),
    ).toThrow(/non-empty record array/);
  });

  it("accepts a bare array catalogue and a wrapped one", () => {
    expect(loadCatalogue(() => JSON.stringify([{ id: "a" }]))).toHaveLength(1);
    expect(
      loadCatalogue(() => JSON.stringify({ destinations: [{ id: "a" }] })),
    ).toHaveLength(1);
  });
});

describe("KAI-291A validation cohort", () => {
  const stations = [
    station("odpt.Station:Ueno", NEAR, {
      title: "上野",
      stationTitle: { en: "Ueno", ja: "上野" },
    }),
  ];

  it("extracts station names from free-text evidence", () => {
    expect(
      stationNamesInText("Ueno Station is the closest access point"),
    ).toContain("Ueno");
    expect(stationNamesInText("no station mentioned here")).toEqual([]);
    expect(stationNamesInText(null)).toEqual([]);
  });

  it("reports agreement when the evidence names the anchored station", () => {
    const rows = compareValidationCohort(
      [
        {
          id: "ueno-park",
          coordinates: { lat: 35.6906, lng: 139.7016 },
          localTransport: {
            kind: "verified_walking",
            walkingEvidence: "Ueno Station",
          },
        },
      ],
      stations,
    );

    expect(rows[0].verdict).toBe("agrees");
  });

  it("flags an anchor that contradicts the record's named station", () => {
    const rows = compareValidationCohort(
      [
        {
          id: "somewhere-else",
          coordinates: { lat: 35.6906, lng: 139.7016 },
          localTransport: {
            kind: "verified_walking",
            walkingEvidence: "Sapporo Station",
          },
        },
      ],
      stations,
    );

    expect(rows[0].verdict).toBe("names_other_station");
    expect(rows[0].anchorStationTitleEn).toBe("Ueno");
  });

  it("reports non-comparable rows rather than treating them as agreement", () => {
    const rows = compareValidationCohort(
      [
        {
          id: "outside-pilot",
          coordinates: { lat: 43.06, lng: 141.35 },
          localTransport: {
            kind: "verified_walking",
            walkingEvidence: "Sapporo Station",
          },
        },
      ],
      stations,
    );

    expect(rows[0].verdict).toBe("anchor_unavailable");
  });

  it("documents that AREA records do anchor today (known open decision)", () => {
    // A `kind: ward` record is an administrative area whose coordinate is a
    // representative point, not a destination entrance. The authorized rule has no
    // kind-awareness, so it anchors such a record when exactly one station is in
    // range. Pinned here so the behaviour is explicit and cannot change silently.
    const rows = compareValidationCohort(
      [{ id: "example-city", coordinates: { lat: 35.6906, lng: 139.7016 } }],
      stations,
    );

    expect(rows[0].verdict).toBe("no_station_named");
    expect(
      classifyGeographicAnchor(
        { id: "example-city", coordinates: { lat: 35.6906, lng: 139.7016 } },
        stations,
      ).status,
    ).toBe(ANCHOR_STATUS.ANCHORED);
  });
});
