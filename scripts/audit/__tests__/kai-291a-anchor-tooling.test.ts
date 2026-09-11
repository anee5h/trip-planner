/**
 * KAI-291A — destination -> exact ODPT arrival-station identity tooling tests.
 *
 * These pin the FINAL anchorability policy and the properties that make the
 * registry trustworthy:
 *   - the policy is decided from `role`/`kind` alone, never from a destination id;
 *   - unique-within-bounded-radius anchors; nearest-of-several never does;
 *   - `hold_for_review` is a real, exclusionary status;
 *   - the six geographic statuses partition the catalogue exactly;
 *   - explicit/canonical evidence outranks geography.
 *
 * Offline and deterministic: no network, no clock, no filesystem writes.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  ANCHORABILITY_REASONS,
  ANCHOR_AUDIT_VERSION,
  ANCHOR_EVIDENCE_PATH,
  ANCHOR_STATUS,
  CANONICAL_EVIDENCE_PATH,
  buildAnchorArtifact,
  buildAnchorCoverageReport,
  buildAnchorReviewTable,
  buildRoleDriftReport,
  buildSemanticMatrix,
  classifyGeographicAnchor,
  classifySemanticGate,
  compareValidationCohort,
  GEOGRAPHIC_TOLERANCE_METERS,
  HOLD_REASONS,
  isGeographicallyAnchorable,
  isUnknownOrLegacyRole,
  KNOWN_DESTINATION_ROLES,
  loadCatalogue,
  loadStationIndex,
  NOT_GEOGRAPHICALLY_ANCHORABLE_KINDS,
  STATUS_PARTITION,
  stationNamesInText,
  stationsWithinTolerance,
  type AnchorDestination,
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

/** A point-like destination: role `poi`, so it reaches the geographic rule. */
function point(
  id: string,
  coordinates: { lat: number; lng: number } | null = SHINJUKU,
  overrides: Partial<AnchorDestination> = {},
): AnchorDestination {
  return { id, role: "poi", kind: "museum", coordinates, ...overrides };
}

const ONE_STATION = [station("odpt.Station:OnlyOne", NEAR)];

/* ────────────────────────────────────────────────────────────────────────────
 * The final policy, rule by rule.
 * ──────────────────────────────────────────────────────────────────────────── */
describe("KAI-291A final policy — the semantic gate", () => {
  it("rule 4: standalone is NOT geographically anchorable", () => {
    const verdict = classifySemanticGate({
      id: "s",
      role: "standalone",
      kind: "nature",
    });

    expect(verdict.outcome).toBe("not_anchorable_by_geography");
    expect(verdict.reason).toBe(ANCHORABILITY_REASONS.STANDALONE_REGIONAL_ROLE);
  });

  it("rule 4: standalone is excluded even with a point-like kind", () => {
    for (const kind of ["museum", "temple", "park", "garden", "castle", null]) {
      const verdict = classifySemanticGate({
        id: "s",
        role: "standalone",
        kind,
      });
      expect(verdict.outcome).toBe("not_anchorable_by_geography");
      expect(verdict.reason).toBe(
        ANCHORABILITY_REASONS.STANDALONE_REGIONAL_ROLE,
      );
    }
  });

  it("rule 5: poi IS anchorable even when kind is null", () => {
    const verdict = classifySemanticGate({ id: "p", role: "poi", kind: null });

    expect(verdict.outcome).toBe("anchorable");
    expect(verdict.reason).toBeNull();
  });

  it("rule 3: hub is NOT geographically anchorable, including with kind null", () => {
    for (const kind of [null, "museum", "park"]) {
      const verdict = classifySemanticGate({ id: "h", role: "hub", kind });
      expect(verdict.outcome).toBe("not_anchorable_by_geography");
      expect(verdict.reason).toBe(ANCHORABILITY_REASONS.HUB_ROLE);
    }
  });

  it("rule 6: null role + null kind is HELD, not anchorable and not excluded", () => {
    const verdict = classifySemanticGate({ id: "u", role: null, kind: null });

    expect(verdict.outcome).toBe("hold_for_review");
    expect(verdict.reason).toBe(
      HOLD_REASONS.DESTINATION_SEMANTICS_UNCLASSIFIED,
    );
  });

  it("rule 7: null role + known non-administrative kind IS anchorable", () => {
    for (const kind of [
      "museum",
      "temple",
      "park",
      "street",
      "nature",
      "garden",
    ]) {
      const verdict = classifySemanticGate({ id: "n", role: null, kind });
      expect(verdict.outcome).toBe("anchorable");
      expect(verdict.reason).toBeNull();
    }
  });

  it("rule 8: legacy/unknown role + non-administrative kind is HELD", () => {
    for (const role of ["destination", "legacy_thing", "DESTINATION"]) {
      const verdict = classifySemanticGate({ id: "l", role, kind: "museum" });
      expect(verdict.outcome).toBe("hold_for_review");
      expect(verdict.reason).toBe(HOLD_REASONS.UNKNOWN_OR_LEGACY_ROLE);
    }
  });

  it("rule 2 outranks rule 8: legacy role + administrative kind is NOT anchorable", () => {
    for (const kind of NOT_GEOGRAPHICALLY_ANCHORABLE_KINDS) {
      const verdict = classifySemanticGate({
        id: "l",
        role: "destination",
        kind,
      });
      expect(verdict.outcome).toBe("not_anchorable_by_geography");
      expect(verdict.reason).toBe(
        ANCHORABILITY_REASONS.ADMINISTRATIVE_OR_LOCALITY_KIND,
      );
    }
  });

  it("rule 2 excludes every administrative/locality kind regardless of role", () => {
    for (const kind of NOT_GEOGRAPHICALLY_ANCHORABLE_KINDS) {
      for (const role of ["poi", "hub", "standalone", "destination", null]) {
        const verdict = classifySemanticGate({
          id: `${role}-${kind}`,
          role,
          kind,
        });
        expect(verdict.outcome).toBe("not_anchorable_by_geography");
        expect(verdict.reason).toBe(
          ANCHORABILITY_REASONS.ADMINISTRATIVE_OR_LOCALITY_KIND,
        );
      }
    }
  });

  it("does NOT treat a missing kind alone as suspicious", () => {
    // A defined role plus a missing kind is fully decidable: `poi` anchors and
    // `hub`/`standalone` do not. Only a missing ROLE and KIND is undecidable.
    expect(
      classifySemanticGate({ id: "a", role: "poi", kind: null }).outcome,
    ).toBe("anchorable");
    expect(
      classifySemanticGate({ id: "b", role: "hub", kind: null }).outcome,
    ).toBe("not_anchorable_by_geography");
    expect(
      classifySemanticGate({ id: "c", role: "standalone", kind: null }).outcome,
    ).toBe("not_anchorable_by_geography");
  });

  it("does NOT extend exclusion to kinds with physical extent", () => {
    for (const kind of [
      "park",
      "garden",
      "mountain",
      "lake",
      "island",
      "beach",
      "market",
      "street",
      "nature",
      "natural",
      "mixed",
    ]) {
      expect(
        classifySemanticGate({ id: `k-${kind}`, role: "poi", kind }).outcome,
      ).toBe("anchorable");
    }
  });

  it("recognises exactly the defined roles", () => {
    expect([...KNOWN_DESTINATION_ROLES].sort()).toEqual([
      "hub",
      "poi",
      "standalone",
    ]);
    expect(isUnknownOrLegacyRole("destination")).toBe(true);
    expect(isUnknownOrLegacyRole("poi")).toBe(false);
    expect(isUnknownOrLegacyRole(null)).toBe(false);
  });

  it("isGeographicallyAnchorable reflects the gate", () => {
    expect(
      isGeographicallyAnchorable({ id: "a", role: "poi", kind: "park" })
        .anchorable,
    ).toBe(true);
    expect(
      isGeographicallyAnchorable({ id: "b", role: "hub", kind: "park" })
        .anchorable,
    ).toBe(false);
    expect(
      isGeographicallyAnchorable({ id: "c", role: null, kind: null })
        .anchorable,
    ).toBe(false);
    expect(
      isGeographicallyAnchorable({
        id: "d",
        role: "destination",
        kind: "museum",
      }).anchorable,
    ).toBe(false);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * Rule 1 — explicit/canonical evidence outranks geography, but only when the
 * target is PROVEN in the reviewed pilot index.
 * ──────────────────────────────────────────────────────────────────────────── */
describe("KAI-291A rule 1 — canonical evidence must be proven in the pilot index", () => {
  it("anchors when the canonical target is present EXACTLY ONCE in the pilot index", () => {
    const verdict = classifyGeographicAnchor(
      point("canonical-proven", SHINJUKU, {
        odptMapping: { station: "odpt.Station:OnlyOne" },
      }),
      ONE_STATION,
    );

    expect(verdict.status).toBe(ANCHOR_STATUS.CANONICAL_EXPLICIT_STATION);
    expect(verdict.evidencePath).toBe(CANONICAL_EVIDENCE_PATH);
    expect(verdict.anchor?.odptStationId).toBe("odpt.Station:OnlyOne");
    expect(verdict.anchor?.operator).toBe("odpt.Operator:TokyoMetro");
  });

  it("anchors on a proven canonical target even for an otherwise-excluded record", () => {
    const verdict = classifyGeographicAnchor(
      point("hub-with-proven-mapping", SHINJUKU, {
        role: "hub",
        kind: "ward",
        odptMapping: { station: "odpt.Station:OnlyOne" },
      }),
      ONE_STATION,
    );

    // Canonical outranks the geographic exclusion when the target is proven.
    expect(verdict.status).toBe(ANCHOR_STATUS.CANONICAL_EXPLICIT_STATION);
    expect(verdict.evidencePath).toBe(CANONICAL_EVIDENCE_PATH);
    expect(verdict.anchor?.odptStationId).toBe("odpt.Station:OnlyOne");
  });

  it("anchors on proven canonical evidence for a held (unclassified) record too", () => {
    const verdict = classifyGeographicAnchor(
      point("unclassified-with-proven-mapping", SHINJUKU, {
        role: null,
        kind: null,
        canonicalMapping: {
          odptStationId: "odpt.Station:OnlyOne",
        },
      }),
      ONE_STATION,
    );

    expect(verdict.status).toBe(ANCHOR_STATUS.CANONICAL_EXPLICIT_STATION);
  });

  it("HOLDS when the canonical target is absent from the pilot index — never production-ready", () => {
    const verdict = classifyGeographicAnchor(
      point("canonical-absent", SHINJUKU, {
        odptMapping: { station: "odpt.Station:Toei.Mita.Sugamo" },
      }),
      ONE_STATION,
    );

    expect(verdict.status).toBe(ANCHOR_STATUS.HOLD_FOR_REVIEW);
    expect(verdict.blocker).toBe(
      HOLD_REASONS.CANONICAL_STATION_NOT_IN_PILOT_INDEX,
    );
    expect(verdict.anchor).toBeNull();
    expect(verdict.evidencePath).toBeNull();

    // Held records never enter the production-ready totals.
    const report = buildAnchorCoverageReport(
      [
        point("canonical-absent", SHINJUKU, {
          odptMapping: { station: "odpt.Station:Toei.Mita.Sugamo" },
        }),
      ],
      ONE_STATION,
    );
    expect(report.productionReadyAnchors).toBe(0);
    expect(report.holdForReview).toBe(1);
    expect(
      report.holdReasons[HOLD_REASONS.CANONICAL_STATION_NOT_IN_PILOT_INDEX],
    ).toBe(1);
  });

  it("HOLDS when the canonical target is syntactically ODPT but outside the pilot", () => {
    // A JR-East identity is well-formed ODPT evidence, but this pilot reviews
    // only TokyoMetro + Toei — so it is unverifiable here.
    const verdict = classifyGeographicAnchor(
      point("canonical-outside-pilot", SHINJUKU, {
        odptMapping: { station: "odpt.Station:JR-East.Yamanote.Shinjuku" },
      }),
      ONE_STATION,
    );

    expect(verdict.status).toBe(ANCHOR_STATUS.HOLD_FOR_REVIEW);
    expect(verdict.blocker).toBe(
      HOLD_REASONS.CANONICAL_STATION_NOT_IN_PILOT_INDEX,
    );
    expect(verdict.anchor).toBeNull();
  });

  it("HOLDS an invalid canonical target for a hub/admin record — NO geographic fallback anchor", () => {
    // Even though ONE_STATION sits ~111 m away (a geographic anchor if the
    // mapping were absent), the explicit-but-unverifiable mapping forbids
    // falling back to geography: the mapping says where it belongs.
    const verdict = classifyGeographicAnchor(
      point("hub-with-unproven-mapping", SHINJUKU, {
        role: "hub",
        kind: "ward",
        odptMapping: { station: "odpt.Station:Toei.Mita.Sugamo" },
      }),
      ONE_STATION,
    );

    expect(verdict.status).toBe(ANCHOR_STATUS.HOLD_FOR_REVIEW);
    expect(verdict.blocker).toBe(
      HOLD_REASONS.CANONICAL_STATION_NOT_IN_PILOT_INDEX,
    );
    expect(verdict.anchor).toBeNull();
    expect(verdict.status).not.toBe(ANCHOR_STATUS.GEOGRAPHIC_UNIQUE_CANDIDATE);
  });

  it("is AMBIGUOUS when the reviewed index holds duplicate records for the same identity", () => {
    const duplicated = [
      station("odpt.Station:Dupe", NEAR),
      station("odpt.Station:Dupe", { lat: 35.6902, lng: 139.7006 }),
    ];
    const verdict = classifyGeographicAnchor(
      point("canonical-dupe", SHINJUKU, {
        odptMapping: { station: "odpt.Station:Dupe" },
      }),
      duplicated,
    );

    // Fail closed: never pick one of several records sharing the identity.
    expect(verdict.status).toBe(ANCHOR_STATUS.AMBIGUOUS);
    expect(verdict.blocker).toBe(
      "multiple_pilot_records_for_canonical_identity",
    );
    expect(verdict.anchor).toBeNull();
  });

  it("does NOT run the geographic search for a canonically anchored record", () => {
    const verdict = classifyGeographicAnchor(
      point("canonical", SHINJUKU, {
        odptMapping: { station: "odpt.Station:OnlyOne" },
      }),
      ONE_STATION,
    );

    // Metadata only — no geographic candidate was sought, so the gate is irrelevant.
    expect(verdict.status).toBe(ANCHOR_STATUS.CANONICAL_EXPLICIT_STATION);
    expect(verdict.candidateCount).toBe(0);
    expect(verdict.evidencePath).not.toBe(ANCHOR_EVIDENCE_PATH);
  });

  it("treats competing canonical targets as ambiguous rather than picking one", () => {
    const verdict = classifyGeographicAnchor(
      point("two-targets", SHINJUKU, {
        odptMapping: {
          station: "odpt.Station:Toei.Mita.Sugamo",
          arrivalStation: "odpt.Station:TokyoMetro.Ginza.Ueno",
        },
      }),
      ONE_STATION,
    );

    expect(verdict.status).toBe(ANCHOR_STATUS.AMBIGUOUS);
    expect(verdict.anchor).toBeNull();
    expect(verdict.blocker).toBe("multiple_canonical_station_targets");
  });

  it("does NOT treat unrelated mapping metadata as station evidence", () => {
    const verdict = classifyGeographicAnchor(
      point("operator-only", SHINJUKU, {
        role: "hub",
        kind: "ward",
        odptMapping: {
          operator: "odpt.Operator:Toei",
          note: "operator scope only",
        },
      }),
      ONE_STATION,
    );

    expect(verdict.status).toBe(ANCHOR_STATUS.NOT_ANCHORABLE_BY_GEOGRAPHY);
    expect(verdict.anchor).toBeNull();
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * The geographic rule (unchanged geometry).
 * ──────────────────────────────────────────────────────────────────────────── */
describe("KAI-291A geographic rule", () => {
  it("anchors when exactly ONE pilot station is inside the tolerance", () => {
    const verdict = classifyGeographicAnchor(point("d"), ONE_STATION);

    expect(verdict.status).toBe(ANCHOR_STATUS.GEOGRAPHIC_UNIQUE_CANDIDATE);
    expect(verdict.blocker).toBeNull();
    expect(verdict.evidencePath).toBe(ANCHOR_EVIDENCE_PATH);
    expect(verdict.candidateCount).toBe(1);
    expect(verdict.distanceMeters).toBeGreaterThan(100);
    expect(verdict.distanceMeters).toBeLessThan(120);
  });

  it("is unavailable when NO pilot station is inside the tolerance", () => {
    const verdict = classifyGeographicAnchor(point("d"), [
      station("odpt.Station:A", FAR),
    ]);

    expect(verdict.status).toBe(ANCHOR_STATUS.UNAVAILABLE);
    expect(verdict.blocker).toBe("no_pilot_station_within_tolerance");
    expect(verdict.anchor).toBeNull();
  });

  it("is AMBIGUOUS when more than one candidate is inside the tolerance", () => {
    const verdict = classifyGeographicAnchor(point("d"), [
      station("odpt.Station:A", NEAR),
      station("odpt.Station:B", { lat: 35.6902, lng: 139.7006 }),
    ]);

    expect(verdict.status).toBe(ANCHOR_STATUS.AMBIGUOUS);
    expect(verdict.anchor).toBeNull();
    expect(verdict.candidateIdentities).toEqual([
      "odpt.Station:A",
      "odpt.Station:B",
    ]);
  });

  it("NEVER picks the nearest of several — a much closer candidate must not win", () => {
    const verdict = classifyGeographicAnchor(point("d"), [
      station("odpt.Station:Farther", NEAR),
      station("odpt.Station:Closer", { lat: 35.6897, lng: 139.7006 }),
    ]);

    expect(verdict.status).toBe(ANCHOR_STATUS.AMBIGUOUS);
    expect(verdict.anchor).toBeNull();
  });

  it("does NOT collapse station complexes by operator or railway", () => {
    const verdict = classifyGeographicAnchor(point("d"), [
      station("odpt.Station:TokyoMetro.Marunouchi.Shinjuku", NEAR, {
        operator: "odpt.Operator:TokyoMetro",
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

  it("reports coordinates_absent for an anchorable record with no coordinates", () => {
    const verdict = classifyGeographicAnchor(
      point("no-coords", null),
      ONE_STATION,
    );

    expect(verdict.status).toBe(ANCHOR_STATUS.COORDINATES_ABSENT);
    expect(verdict.blocker).toBe("destination_coordinates_absent");
  });

  it("locks the tolerance to the existing resolver default at the boundary", () => {
    const degreesPerMeter = 1 / 111_320;
    const inside = classifyGeographicAnchor(point("in"), [
      station("odpt.Station:Inside", {
        lat: SHINJUKU.lat + 499 * degreesPerMeter,
        lng: SHINJUKU.lng,
      }),
    ]);
    const outside = classifyGeographicAnchor(point("out"), [
      station("odpt.Station:Outside", {
        lat: SHINJUKU.lat + 501 * degreesPerMeter,
        lng: SHINJUKU.lng,
      }),
    ]);

    expect(GEOGRAPHIC_TOLERANCE_METERS).toBe(500);
    expect(inside.status).toBe(ANCHOR_STATUS.GEOGRAPHIC_UNIQUE_CANDIDATE);
    expect(outside.status).toBe(ANCHOR_STATUS.UNAVAILABLE);
  });

  it("uses ONE tolerance truth: resolver and helper agree at a non-default tolerance", () => {
    // API-consistency proof only — the production/audit policy stays at 500 m.
    // A station ~300 m away with tolerance = 100 m must be unavailable by BOTH
    // the shared resolver result and the audit candidate count/status.
    const degreesPerMeter = 1 / 111_320;
    const threeHundredMetersNorth = {
      lat: SHINJUKU.lat + 300 * degreesPerMeter,
      lng: SHINJUKU.lng,
    };
    const stations = [
      station("odpt.Station:ThreeHundred", threeHundredMetersNorth),
    ];
    const verdict = classifyGeographicAnchor(point("d"), stations, 100);

    expect(verdict.toleranceMeters).toBe(100);
    expect(verdict.candidateCount).toBe(0);
    expect(verdict.candidateIdentities).toEqual([]);
    expect(verdict.status).toBe(ANCHOR_STATUS.UNAVAILABLE);
    expect(verdict.blocker).toBe("no_pilot_station_within_tolerance");
    expect(verdict.anchor).toBeNull();
    // And the reporting helper agrees at the same tolerance.
    expect(stationsWithinTolerance(SHINJUKU, stations, 100)).toHaveLength(0);
  });

  it("uses an evidence path that claims proximity, not a curated mapping", () => {
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
    const verdict = classifyGeographicAnchor(point("d"), stations);

    expect(within).toHaveLength(1);
    expect(verdict.candidateCount).toBe(within.length);
    expect(verdict.status).toBe(ANCHOR_STATUS.GEOGRAPHIC_UNIQUE_CANDIDATE);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * The status partition, and holds as a real status.
 * ──────────────────────────────────────────────────────────────────────────── */
describe("KAI-291A status partition", () => {
  const stations = [
    station("odpt.Station:UniqueA", { lat: 35.6906, lng: 139.7006 }),
    station("odpt.Station:UniqueD", { lat: 35.6896, lng: 139.75 }),
    station("odpt.Station:PairX", { lat: 35.8, lng: 139.7006 }),
    station("odpt.Station:PairY", { lat: 35.802, lng: 139.7006 }),
  ];

  const catalogue: AnchorDestination[] = [
    point("anchored-1", { lat: 35.6906, lng: 139.7006 }),
    point("anchored-2", { lat: 35.6896, lng: 139.75 }),
    point("ambiguous-1", { lat: 35.801, lng: 139.7006 }),
    point("unavailable-1", { lat: 35.75, lng: 139.7006 }),
    point("no-coords", null),
    point("standalone-1", SHINJUKU, { role: "standalone", kind: "nature" }),
    point("ward-1", SHINJUKU, { role: "hub", kind: "ward" }),
    point("unclassified-1", SHINJUKU, { role: null, kind: null }),
    point("legacy-1", SHINJUKU, { role: "destination", kind: "museum" }),
  ];

  it("partitions the catalogue exactly — sums to the catalogue size", () => {
    const report = buildAnchorCoverageReport(catalogue, stations);
    const sum = Object.values(report.statusPartition).reduce(
      (a, b) => a + b,
      0,
    );

    expect(sum).toBe(report.destinationsEvaluated);
    expect(sum).toBe(catalogue.length);
  });

  it("uses exactly the six geographic statuses and no others", () => {
    const report = buildAnchorCoverageReport(catalogue, stations);

    expect(Object.keys(report.statusPartition).sort()).toEqual(
      [...STATUS_PARTITION].sort(),
    );
    expect(STATUS_PARTITION).toHaveLength(6);
  });

  it("gives each destination exactly one of the six statuses", () => {
    const report = buildAnchorCoverageReport(catalogue, stations);

    expect(report.uniqueAnchors).toBe(2);
    expect(report.ambiguous).toBe(1);
    expect(report.unavailable).toBe(1);
    expect(report.coordinatesAbsent).toBe(1);
    expect(report.notAnchorableByGeography).toBe(2);
    expect(report.holdForReview).toBe(2);
    expect(report.productionReadyAnchors).toBe(2);
  });

  it("holds are excluded from anchors, operator/railway tallies and the anchor total", () => {
    const report = buildAnchorCoverageReport(catalogue, stations);
    const anchoredIds = report.anchors.map((verdict) => verdict.destinationId);
    const heldIds = report.holdDestinations.map((entry) => entry.destinationId);

    expect([...heldIds].sort()).toEqual(["legacy-1", "unclassified-1"]);
    for (const id of heldIds) {
      expect(anchoredIds).not.toContain(id);
      expect(report.unavailable).toBeGreaterThanOrEqual(0);
    }
    expect(report.productionReadyAnchors).toBe(report.anchors.length);
    expect(
      Object.values(report.anchorsByOperator).reduce((a, b) => a + b, 0),
    ).toBe(report.productionReadyAnchors);
    expect(
      Object.values(report.anchorsByRailway).reduce((a, b) => a + b, 0),
    ).toBe(report.productionReadyAnchors);
    // Observational metadata is retained for held records.
    expect(
      report.holdDestinations.every((entry) => entry.reason !== null),
    ).toBe(true);
  });

  it("keeps held and excluded records out of the candidate distribution", () => {
    const report = buildAnchorCoverageReport(catalogue, stations);
    const distributed = Object.values(report.candidateCountDistribution).reduce(
      (a, b) => a + b,
      0,
    );

    // Only the four point-like records reach the geographic rule.
    expect(distributed).toBe(4);
  });

  it("groups the exclusion and hold reasons", () => {
    const report = buildAnchorCoverageReport(catalogue, stations);

    // The ward fixture is role=hub AND kind=ward, so rule 2 (administrative kind)
    // outranks rule 3 — an area kind is never reported as merely a hub.
    expect(report.notAnchorableReasons).toEqual({
      [ANCHORABILITY_REASONS.STANDALONE_REGIONAL_ROLE]: 1,
      [ANCHORABILITY_REASONS.ADMINISTRATIVE_OR_LOCALITY_KIND]: 1,
    });
    expect(report.holdReasons).toEqual({
      [HOLD_REASONS.DESTINATION_SEMANTICS_UNCLASSIFIED]: 1,
      [HOLD_REASONS.UNKNOWN_OR_LEGACY_ROLE]: 1,
    });
    expect(
      Object.values(report.notAnchorableReasons).reduce((a, b) => a + b, 0),
    ).toBe(report.notAnchorableByGeography);
    expect(Object.values(report.holdReasons).reduce((a, b) => a + b, 0)).toBe(
      report.holdForReview,
    );
  });

  it("reports coordinate absence across all statuses, not only its own status", () => {
    // A hub with no coordinates is `not_anchorable_by_geography` (the gate runs
    // first), so counting coordinates only via `coordinates_absent` would report 0.
    const report = buildAnchorCoverageReport(
      [point("hub-no-coords", null, { role: "hub", kind: "ward" })],
      stations,
    );

    expect(report.coordinatesAbsent).toBe(0);
    expect(report.notAnchorableByGeography).toBe(1);
    expect(report.destinationsWithoutCoordinates).toBe(1);
  });

  it("partitions the REAL committed catalogue exactly", () => {
    const records = loadCatalogue((path) => readFileSync(path, "utf8"));
    const { stations: index } = loadStationIndex((path) =>
      readFileSync(path, "utf8"),
    );
    const report = buildAnchorCoverageReport(records, index);
    const sum = Object.values(report.statusPartition).reduce(
      (a, b) => a + b,
      0,
    );

    expect(report.destinationsEvaluated).toBe(records.length);
    expect(sum + report.canonicalExplicitStation).toBe(records.length);
    expect(report.holdForReview).toBeGreaterThan(0);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * No destination-id special cases.
 * ──────────────────────────────────────────────────────────────────────────── */
describe("KAI-291A no destination-id special cases", () => {
  it("classifies identical semantics identically for different ids", () => {
    const ids = [
      "meguro-city",
      "ueno-park",
      "takanawa-gateway-minato",
      "tokyo-metropolitan-government-building-shinjuku",
      "some-totally-new-place",
    ];

    for (const semantics of [
      { role: "hub", kind: "ward" },
      { role: "poi", kind: "museum" },
      { role: "standalone", kind: "nature" },
      { role: null, kind: null },
      { role: "destination", kind: "museum" },
    ]) {
      const outcomes = ids.map(
        (id) => classifySemanticGate({ id, ...semantics }).outcome,
      );
      expect(new Set(outcomes).size).toBe(1);
    }
  });

  it("lets a known-bad id anchor when its semantics are point-like", () => {
    // The six wards are excluded by the GENERAL rule, not by their ids: the same
    // id with point-like semantics anchors.
    const asWard = classifyGeographicAnchor(
      point("meguro-city", SHINJUKU, { role: "hub", kind: "ward" }),
      ONE_STATION,
    );
    const asPoint = classifyGeographicAnchor(
      point("meguro-city", SHINJUKU, { role: "poi", kind: "museum" }),
      ONE_STATION,
    );

    expect(asWard.status).toBe(ANCHOR_STATUS.NOT_ANCHORABLE_BY_GEOGRAPHY);
    expect(asPoint.status).toBe(ANCHOR_STATUS.GEOGRAPHIC_UNIQUE_CANDIDATE);
  });

  it("does not reference any destination id in the audit source", () => {
    const source = readFileSync(
      "scripts/audit/kai-291a-destination-station-identity.ts",
      "utf8",
    );

    for (const id of [
      "takanawa-gateway-minato",
      "tokyo-metropolitan-government-building-shinjuku",
      "meguro-city",
      "ueno-park",
      "itabashi-city",
      "sugamo-jizo-dori",
    ]) {
      expect(source).not.toContain(id);
    }
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * Review table, matrix, role drift.
 * ──────────────────────────────────────────────────────────────────────────── */
describe("KAI-291A review table", () => {
  const stations = [
    station("odpt.Station:UniqueA", { lat: 35.6906, lng: 139.7006 }),
  ];

  it("includes excluded and held records so nothing disappears from the audit", () => {
    const rows = buildAnchorReviewTable(
      [
        point("a-museum"),
        point("meguro-city", SHINJUKU, { role: "hub", kind: "ward" }),
        point("unclassified", SHINJUKU, { role: null, kind: null }),
      ],
      stations,
    );

    expect(rows).toHaveLength(3);
    const byId = new Map(rows.map((row) => [row.destinationId, row]));
    expect(byId.get("a-museum")?.proposedOutcome).toBe(
      ANCHOR_STATUS.GEOGRAPHIC_UNIQUE_CANDIDATE,
    );
    expect(byId.get("meguro-city")?.proposedOutcome).toBe(
      ANCHOR_STATUS.NOT_ANCHORABLE_BY_GEOGRAPHY,
    );
    // role=hub AND kind=ward: the administrative-kind reason wins (rule 2).
    expect(byId.get("meguro-city")?.reason).toBe(
      ANCHORABILITY_REASONS.ADMINISTRATIVE_OR_LOCALITY_KIND,
    );
    expect(byId.get("unclassified")?.proposedOutcome).toBe(
      ANCHOR_STATUS.HOLD_FOR_REVIEW,
    );
    expect(byId.get("unclassified")?.reason).toBe(
      HOLD_REASONS.DESTINATION_SEMANTICS_UNCLASSIFIED,
    );
  });

  it("uses the classifier's own status, never a second parallel decision", () => {
    const destinations = [
      point("a"),
      point("b", SHINJUKU, { role: "standalone", kind: "museum" }),
      point("c", SHINJUKU, { role: "destination", kind: "museum" }),
    ];
    const rows = buildAnchorReviewTable(destinations, stations);

    for (const row of rows) {
      const verdict = classifyGeographicAnchor(
        destinations.find((d) => d.id === row.destinationId)!,
        stations,
      );
      expect(row.proposedOutcome).toBe(verdict.status);
      expect(row.reason).toBe(verdict.blocker);
    }
  });

  it("retains observational candidate metadata for held records", () => {
    const rows = buildAnchorReviewTable(
      [point("unclassified", SHINJUKU, { role: null, kind: null })],
      stations,
    );

    expect(rows[0].observedCandidateCount).toBe(1);
    expect(rows[0].anchorStationId).toBe("odpt.Station:UniqueA");
  });
});

describe("KAI-291A semantic matrix", () => {
  const stations = [
    station("odpt.Station:UniqueA", { lat: 35.6906, lng: 139.7006 }),
    station("odpt.Station:PairX", { lat: 35.8, lng: 139.7006 }),
    station("odpt.Station:PairY", { lat: 35.802, lng: 139.7006 }),
  ];

  it("counts all three gate outcomes per role x kind cell", () => {
    const matrix = buildSemanticMatrix(
      [
        point("w1", SHINJUKU, { role: "hub", kind: "ward" }),
        point("w2", SHINJUKU, { role: "hub", kind: "ward" }),
        point("p1"),
        point("l1", SHINJUKU, { role: "destination", kind: "museum" }),
      ],
      stations,
    );

    const ward = matrix.find(
      (row) => row.role === "hub" && row.kind === "ward",
    );
    expect(ward?.totalRecords).toBe(2);
    expect(ward?.notAnchorableByGeography).toBe(2);
    expect(ward?.anchorable).toBe(0);
    // BOTH wards sit where geography alone would have anchored them, which is
    // exactly why the gate exists.
    expect(ward?.uniqueGeographicCandidates).toBe(2);

    const legacy = matrix.find((row) => row.role === "destination");
    expect(legacy?.holdForReview).toBe(1);
    expect(legacy?.legacyRole).toBe(true);

    const poi = matrix.find(
      (row) => row.role === "poi" && row.kind === "museum",
    );
    expect(poi?.anchorable).toBe(1);
    expect(poi?.legacyRole).toBe(false);
  });

  it("sums each cell's candidate distribution and totals the catalogue", () => {
    const destinations = [
      point("a"),
      point("b"),
      point("c", null, { role: null, kind: null }),
    ];
    const matrix = buildSemanticMatrix(destinations, stations);

    expect(matrix.reduce((sum, row) => sum + row.totalRecords, 0)).toBe(
      destinations.length,
    );
    for (const row of matrix) {
      expect(
        Object.values(row.candidateCounts).reduce((a, b) => a + b, 0),
      ).toBe(row.totalRecords);
      expect(
        row.anchorable + row.notAnchorableByGeography + row.holdForReview,
      ).toBe(row.totalRecords);
    }
  });
});

describe("KAI-291A role drift report", () => {
  it("reports every observed role with its kind distribution", () => {
    const rows = buildRoleDriftReport([
      point("a", SHINJUKU, { role: "poi", kind: "museum" }),
      point("b", SHINJUKU, { role: "poi", kind: null }),
      point("c", SHINJUKU, { role: "destination", kind: "temple" }),
      point("d", SHINJUKU, { role: null, kind: null }),
    ]);

    const poi = rows.find((row) => row.role === "poi");
    expect(poi?.totalRecords).toBe(2);
    expect(poi?.knownRole).toBe(true);
    expect(poi?.withMissingKind).toBe(1);

    const legacy = rows.find((row) => row.role === "destination");
    expect(legacy?.knownRole).toBe(false);
    expect(legacy?.kindCounts).toEqual({ temple: 1 });

    const missing = rows.find((row) => row.role === null);
    expect(missing?.knownRole).toBe(true);
    expect(missing?.withMissingKind).toBe(1);
  });

  it("counts the real catalogue's legacy role truthfully", () => {
    const records = loadCatalogue((path) => readFileSync(path, "utf8"));
    const rows = buildRoleDriftReport(records);
    const legacy = rows.filter((row) => !row.knownRole);

    // `destination` is real schema drift and must be reported, not normalised away.
    expect(legacy.map((row) => row.role)).toEqual(["destination"]);
    expect(legacy[0].totalRecords).toBeGreaterThan(0);
    expect(rows.reduce((sum, row) => sum + row.totalRecords, 0)).toBe(
      records.length,
    );
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * Artifact + validation cohort.
 * ──────────────────────────────────────────────────────────────────────────── */
describe("KAI-291A artifact", () => {
  const stations = [
    station("odpt.Station:UniqueA", { lat: 35.6906, lng: 139.7006 }),
    station("odpt.Station:PairX", { lat: 35.8, lng: 139.7006 }),
    station("odpt.Station:PairY", { lat: 35.802, lng: 139.7006 }),
  ];

  it("omits non-anchors and lists them explicitly", () => {
    const report = buildAnchorCoverageReport(
      [
        point("anchored"),
        point("ambiguous", { lat: 35.801, lng: 139.7006 }),
        point("ward", SHINJUKU, { role: "hub", kind: "ward" }),
        point("held", SHINJUKU, { role: null, kind: null }),
        point("none", null),
      ],
      stations,
    );
    const artifact = buildAnchorArtifact({
      report,
      validation: [],
      stationIndex: { sourceBoundary: "https://meguruto.app/api/odpt" },
      stationCount: 3,
      catalogueCount: 5,
    }) as Record<string, never>;

    expect(artifact.anchors).toHaveLength(1);
    expect(artifact.ambiguousDestinations).toHaveLength(1);
    expect(artifact.notAnchorableDestinations).toHaveLength(1);
    expect(artifact.holdForReviewDestinations).toHaveLength(1);
    expect(artifact.coordinatesAbsentDestinations).toEqual(["none"]);
    expect(artifact.auditVersion).toBe(ANCHOR_AUDIT_VERSION);
    expect(artifact.networkCalls).toBe(0);
    expect(artifact.providerCalls).toBe(0);
  });

  it("carries full provenance on every anchor", () => {
    const report = buildAnchorCoverageReport([point("anchored")], stations);
    const artifact = buildAnchorArtifact({
      report,
      validation: [],
      stationIndex: { sourceBoundary: "https://meguruto.app/api/odpt" },
      stationCount: 3,
      catalogueCount: 1,
    }) as unknown as { anchors: { provenance: Record<string, unknown> }[] };

    for (const key of [
      "evidencePath",
      "toleranceMeters",
      "candidateCount",
      "candidateIdentities",
      "providerBoundary",
      "providerRetrievedAt",
      "auditVersion",
    ]) {
      expect(artifact.anchors[0].provenance).toHaveProperty(key);
    }
  });

  it("is environment independent: identical inputs give identical bytes", () => {
    const args = {
      report: buildAnchorCoverageReport([point("anchored")], stations),
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

    expect(second).toBe(first);
  });
});

describe("KAI-291A input loading — the reviewed pilot index boundary", () => {
  const PILOT = ["odpt.Operator:TokyoMetro", "odpt.Operator:Toei"];
  const metroStation = (sameAs: string, overrides = {}) => ({
    sameAs,
    operator: "odpt.Operator:TokyoMetro",
    railway: "odpt.Railway:TokyoMetro.Marunouchi",
    stationCode: "M-01",
    coordinates: { lat: 35.6906, lng: 139.7006 },
    title: "X",
    stationTitle: { en: "X", ja: "X" },
    ...overrides,
  });
  const toeiStation = (sameAs: string, overrides = {}) => ({
    sameAs,
    operator: "odpt.Operator:Toei",
    railway: "odpt.Railway:Toei.Mita",
    stationCode: "I-01",
    coordinates: { lat: 35.6896, lng: 139.7006 },
    title: "Y",
    stationTitle: { en: "Y", ja: "Y" },
    ...overrides,
  });
  const validFile = (overrides = {}) => ({
    pilotOperators: PILOT,
    stationCount: 2,
    perOperatorCounts: {
      "odpt.Operator:TokyoMetro": 1,
      "odpt.Operator:Toei": 1,
    },
    stations: [
      metroStation("odpt.Station:TokyoMetro.Marunouchi.A"),
      toeiStation("odpt.Station:Toei.Mita.B"),
    ],
    ...overrides,
  });
  const load = (file: unknown) => loadStationIndex(() => JSON.stringify(file));

  it("refuses an empty station index instead of reporting zero coverage", () => {
    expect(() =>
      loadStationIndex(() => JSON.stringify({ stations: [] })),
    ).toThrow(/carries no stations/);
  });

  it("accepts a valid TokyoMetro + Toei index", () => {
    const { stations } = load(validFile());
    expect(stations).toHaveLength(2);
  });

  it("accepts the committed 335-station reviewed index unchanged", () => {
    const { stations } = loadStationIndex((path) => readFileSync(path, "utf8"));
    expect(stations).toHaveLength(335);
  });

  it("refuses an index whose pilotOperators are not exactly the authorized set", () => {
    expect(() =>
      load(validFile({ pilotOperators: ["odpt.Operator:TokyoMetro"] })),
    ).toThrow(/pilotOperators/);
    expect(() => load(validFile({ pilotOperators: undefined }))).toThrow(
      /pilotOperators/,
    );
  });

  it("refuses an unexpected operator entry (e.g. JR-East)", () => {
    const file = validFile();
    (file.stations as ReturnType<typeof metroStation>[])[1] = toeiStation(
      "odpt.Station:JR-East.Yamanote.Shinjuku",
      {
        operator: "odpt.Operator:JR-East",
        railway: "odpt.Railway:JR-East.Yamanote",
      },
    );
    expect(() => load(file)).toThrow(/outside the reviewed pilot/);
  });

  it("refuses a railway outside its operator namespace", () => {
    const file = validFile();
    (file.stations as ReturnType<typeof metroStation>[])[0] = metroStation(
      "odpt.Station:TokyoMetro.Marunouchi.A",
      { railway: "odpt.Railway:Toei.Mita" },
    );
    expect(() => load(file)).toThrow(/outside the reviewed pilot/);
  });

  it("refuses a duplicate exact station identity", () => {
    const dupe = metroStation("odpt.Station:TokyoMetro.Marunouchi.A");
    const file = validFile({
      stationCount: 2,
      perOperatorCounts: { "odpt.Operator:TokyoMetro": 2 },
      stations: [dupe, { ...dupe }],
    });
    expect(() => load(file)).toThrow(/repeats .* exact station/);
  });

  it("refuses a stationCount mismatch", () => {
    expect(() => load(validFile({ stationCount: 3 }))).toThrow(/stationCount/);
  });

  it("refuses a perOperatorCounts mismatch", () => {
    expect(() =>
      load(
        validFile({
          perOperatorCounts: {
            "odpt.Operator:TokyoMetro": 2,
            "odpt.Operator:Toei": 0,
          },
        }),
      ),
    ).toThrow(/perOperatorCounts/);
  });

  it("refuses a coordinate-less entry: the reviewed index must be fully coordinate-bearing", () => {
    const file = validFile();
    (file.stations as ReturnType<typeof metroStation>[])[0] = metroStation(
      "odpt.Station:TokyoMetro.Marunouchi.A",
      { coordinates: null },
    );
    expect(() => load(file)).toThrow(/coordinate-less/);
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
  const destinationWith = (
    id: string,
    evidence: Record<string, string>,
    semantics: Partial<AnchorDestination> = { role: "poi", kind: "museum" },
  ) => ({
    id,
    coordinates: NEAR,
    ...semantics,
    localTransport: { kind: "verified_walking", ...evidence },
  });

  it("extracts station names from free-text evidence", () => {
    expect(
      stationNamesInText("Ueno Station is the closest access point"),
    ).toContain("Ueno");
    expect(stationNamesInText("no station mentioned here")).toEqual([]);
    expect(stationNamesInText(null)).toEqual([]);
  });

  it("reports agreement when the evidence names the anchored station", () => {
    const rows = compareValidationCohort(
      [destinationWith("ueno-park", { walkingEvidence: "Ueno Station" })],
      stations,
    );

    expect(rows[0].verdict).toBe("agreement");
  });

  it("flags a contradiction when the record names a different station", () => {
    const rows = compareValidationCohort(
      [
        destinationWith("somewhere-else", {
          walkingEvidence: "Sapporo Station",
        }),
      ],
      stations,
    );

    expect(rows[0].verdict).toBe("contradiction");
  });

  it("treats a missing anchor as not comparable, never as agreement", () => {
    const rows = compareValidationCohort(
      [
        destinationWith(
          "held",
          { walkingEvidence: "Ueno Station" },
          {
            role: null,
            kind: null,
          },
        ),
      ],
      stations,
    );

    expect(rows[0].verdict).toBe("not_comparable_anchor_absent");
  });

  it("does NOT let localTransport availability decide anchorability", () => {
    // Identical semantics, opposite access-evidence states: the GEOGRAPHIC outcome
    // must be identical, because anchorability is a semantic decision. (The cohort
    // comparison verdict may legitimately differ — that is a different question.)
    const withEvidence = destinationWith("a", {
      walkingEvidence: "Ueno Station",
    });
    const withoutEvidence = destinationWith("b", {});

    expect(classifyGeographicAnchor(withEvidence, stations).status).toBe(
      classifyGeographicAnchor(withoutEvidence, stations).status,
    );
    expect(classifySemanticGate(withEvidence).outcome).toBe(
      classifySemanticGate(withoutEvidence).outcome,
    );
  });
});
