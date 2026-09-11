/**
 * KAI-290 — eligibility audit tooling tests.
 *
 * Covers the pure helpers behind `scripts/audit/kai-290-odpt-eligibility.mjs`:
 * identity detection, destination-anchor classification, the fail-closed default,
 * blocker attribution, the eligible-cohort rule and the Markdown renderer. No
 * network and no filesystem is touched.
 */
import { describe, expect, it } from "vitest";
import {
  BLOCKER_REASONS,
  DESTINATION_ANCHOR_STATUS,
  ODPT_IDENTITY_PATTERN,
  buildEligibilityReport,
  classifyDestinationAnchor,
  classifyEligibility,
  collectStationIdentities,
  collectStationIdentitiesAnywhere,
  containsOdptIdentity,
  renderEligibilityMarkdown,
} from "../kai-290-odpt-eligibility.mjs";

const NO_INPUTS = {
  originIdentityAvailable: false,
  departureTimeInputAvailable: false,
  serviceDateContextAvailable: false,
};

describe("ODPT identity detection", () => {
  it("matches real ODPT identity values", () => {
    for (const value of [
      "odpt.Station:TokyoMetro.Marunouchi.Shinjuku",
      "odpt.Railway:Toei.Mita",
      "odpt.Operator:Toei",
      "odpt.Train:TokyoMetro.Marunouchi.B427",
    ]) {
      expect(ODPT_IDENTITY_PATTERN.test(value)).toBe(true);
    }
  });

  it("does NOT match display prose that merely says 'Station'", () => {
    // The exact trap this audit exists to avoid: a human-readable nearest-station
    // string is not an identity.
    for (const value of [
      "Kammata Station (then bus/car)",
      "Sendai Station (then express bus)",
      "Shin-Yamaguchi Station",
      "Asakusa Station",
      "Station",
      "the nearest station",
    ]) {
      expect(ODPT_IDENTITY_PATTERN.test(value)).toBe(false);
    }
    expect(
      containsOdptIdentity({ nearestStation: "Ashikaga Flower Park Station" }),
    ).toBe(false);
  });

  it("finds an identity nested anywhere in a record", () => {
    expect(
      containsOdptIdentity({
        localTransport: {
          kind: "verified_required_access",
          notes: "odpt.Station:Toei.Mita.Hakusan",
        },
      }),
    ).toBe(true);
  });

  it("collects only station identities from an explicit anchor or an odpt.Station value", () => {
    expect(
      collectStationIdentities({
        arrivalStationId: "odpt.Station:TokyoMetro.Marunouchi.Ikebukuro",
        railway: "odpt.Railway:TokyoMetro.Marunouchi",
        nearestStation: "Ikebukuro Station",
      }),
    ).toEqual(["odpt.Station:TokyoMetro.Marunouchi.Ikebukuro"]);
  });

  it("returns identities in deterministic sorted order", () => {
    expect(
      collectStationIdentities({
        arrivalStationIds: ["odpt.Station:Zzz.B", "odpt.Station:Aaa.A"],
      }),
    ).toEqual(["odpt.Station:Aaa.A", "odpt.Station:Zzz.B"]);
  });

  it("ignores an identity string that is not in a named anchor field", () => {
    // An identity buried in a note or a mapping is evidence a mapping EXISTS, not
    // evidence of which station this destination arrives at. It must not be
    // promoted to an exact anchor.
    expect(
      collectStationIdentities({
        id: "x",
        notes: "see odpt.Station:Toei.Mita.Hakusan for details",
        odptMapping: { station: "odpt.Station:Toei.Mita.Hakusan" },
      }),
    ).toEqual([]);
    expect(
      collectStationIdentitiesAnywhere({
        odptMapping: { station: "odpt.Station:Toei.Mita.Hakusan" },
      }),
    ).toEqual(["odpt.Station:Toei.Mita.Hakusan"]);
  });

  it("returns nothing for a record with no identity", () => {
    expect(collectStationIdentities({ id: "x", name: "Somewhere" })).toEqual(
      [],
    );
  });
});

describe("destination anchor classification is fail-closed", () => {
  it("is unavailable by default, even with rich non-identity metadata", () => {
    const verdict = classifyDestinationAnchor({
      id: "x",
      nearestStation: "Asakusa Station",
      localTransport: {
        kind: "verified_walking",
        walkingEvidence: "station adjacent",
      },
      coordinates: { lat: 35.71, lng: 139.79 },
      municipalityId: "m-1",
    });
    expect(verdict.status).toBe(DESTINATION_ANCHOR_STATUS.UNAVAILABLE);
    expect(verdict.identities).toEqual([]);
  });

  it("is exact only for exactly one station identity", () => {
    const verdict = classifyDestinationAnchor({
      id: "x",
      arrivalStationId: "odpt.Station:Toei.Mita.Hakusan",
    });
    expect(verdict.status).toBe(DESTINATION_ANCHOR_STATUS.EXACT);
    expect(verdict.path).toBe("explicit_odpt_station_id");
  });

  it("is ambiguous — never a silent pick — for several competing identities", () => {
    const verdict = classifyDestinationAnchor({
      id: "x",
      arrivalStationId: "odpt.Station:Toei.Mita.A",
      alternateStationId: "odpt.Station:Toei.Mita.B",
    });
    expect(verdict.status).toBe(DESTINATION_ANCHOR_STATUS.AMBIGUOUS);
    expect(verdict.identities).toHaveLength(2);
  });

  it("treats an array of arrival stations as ambiguous rather than taking the first", () => {
    const verdict = classifyDestinationAnchor({
      id: "x",
      arrivalStationIds: [
        "odpt.Station:Toei.Mita.A",
        "odpt.Station:Toei.Mita.B",
      ],
    });
    expect(verdict.status).toBe(DESTINATION_ANCHOR_STATUS.AMBIGUOUS);
  });

  it("is deterministically_resolvable only with an explicit mapping", () => {
    expect(
      classifyDestinationAnchor({
        id: "x",
        odptMapping: { station: "odpt.Station:Toei.Mita.Hakusan" },
      }).status,
    ).toBe(DESTINATION_ANCHOR_STATUS.DETERMINISTICALLY_RESOLVABLE);
    // An EMPTY mapping is not evidence.
    expect(classifyDestinationAnchor({ id: "x", odptMapping: {} }).status).toBe(
      DESTINATION_ANCHOR_STATUS.UNAVAILABLE,
    );
  });

  it("never promotes a record on coordinates or a municipality alone", () => {
    expect(
      classifyDestinationAnchor({ coordinates: { lat: 1, lng: 2 } }).status,
    ).toBe(DESTINATION_ANCHOR_STATUS.UNAVAILABLE);
    expect(classifyDestinationAnchor({ municipalityId: "m" }).status).toBe(
      DESTINATION_ANCHOR_STATUS.UNAVAILABLE,
    );
  });
});

describe("eligibility attribution", () => {
  it("marks an exact anchor eligible and attributes no blocker", () => {
    const verdict = classifyEligibility({
      id: "x",
      arrivalStationId: "odpt.Station:Toei.Mita.Hakusan",
    });
    expect(verdict.eligible).toBe(true);
    expect(verdict.blocker).toBeNull();
  });

  it("attributes the precise blocker for each non-exact case", () => {
    expect(classifyEligibility({ id: "x" }).blocker).toBe(
      "destination_station_identity_missing",
    );
    expect(
      classifyEligibility({
        id: "x",
        arrivalStationId: "odpt.Station:Toei.Mita.A",
        alternateStationId: "odpt.Station:Toei.Mita.B",
      }).blocker,
    ).toBe("destination_station_identity_ambiguous");
    expect(
      classifyEligibility({
        id: "x",
        odptMapping: { s: "odpt.Station:Toei.Mita.A" },
      }).blocker,
    ).toBe("origin_station_identity_missing");
  });

  it("uses only declared blocker reasons", () => {
    const reasons = new Set(BLOCKER_REASONS);
    for (const record of [
      { id: "a" },
      { id: "b", odptMapping: { s: "odpt.Station:Toei.Mita.A" } },
      {
        id: "c",
        arrivalStationId: "odpt.Station:Toei.Mita.A",
        alternateStationId: "odpt.Station:Toei.Mita.B",
      },
    ]) {
      expect(reasons.has(classifyEligibility(record).blocker)).toBe(true);
    }
  });
});

describe("buildEligibilityReport", () => {
  const records = [
    { id: "unavailable-1" },
    { id: "unavailable-2", nearestStation: "Asakusa Station" },
    {
      id: "ambiguous-1",
      arrivalStationId: "odpt.Station:Toei.Mita.A",
      alternateStationId: "odpt.Station:Toei.Mita.B",
    },
    { id: "resolvable-1", odptMapping: { s: "odpt.Station:Toei.Mita.A" } },
  ];

  it("counts every destination-anchor bucket and totals the records", () => {
    const report = buildEligibilityReport(records, NO_INPUTS);
    expect(report.totalCatalogueRecords).toBe(4);
    expect(report.destinationAnchors).toEqual({
      exact: 0,
      deterministicallyResolvable: 1,
      ambiguous: 1,
      unavailable: 2,
    });
  });

  it("keeps the eligible cohort empty when the anchor is absent everywhere", () => {
    const report = buildEligibilityReport(records, NO_INPUTS);
    expect(report.userFacingEligibleCohort).toBe(0);
    expect(report.eligibleRecordIds).toEqual([]);
  });

  it("requires EVERY input before a record counts as eligible", () => {
    const withAnchor = [
      { id: "ok", arrivalStationId: "odpt.Station:Toei.Mita.Hakusan" },
    ];
    // Anchor alone is not enough — the missing scheduling inputs still block it.
    expect(
      buildEligibilityReport(withAnchor, NO_INPUTS).userFacingEligibleCohort,
    ).toBe(0);
    expect(
      buildEligibilityReport(withAnchor, {
        originIdentityAvailable: true,
        departureTimeInputAvailable: true,
        serviceDateContextAvailable: false,
      }).userFacingEligibleCohort,
    ).toBe(0);
    const fully = buildEligibilityReport(withAnchor, {
      originIdentityAvailable: true,
      departureTimeInputAvailable: true,
      serviceDateContextAvailable: true,
    });
    expect(fully.userFacingEligibleCohort).toBe(1);
    expect(fully.eligibleRecordIds).toEqual(["ok"]);
  });

  it("lists only notable (non-unavailable) records, so the artifact stays diffable", () => {
    const report = buildEligibilityReport(records, NO_INPUTS);
    expect(report.notableRecords.map((entry) => entry.id).sort()).toEqual([
      "ambiguous-1",
      "resolvable-1",
    ]);
  });

  it("is deterministic across runs", () => {
    const a = buildEligibilityReport(records, NO_INPUTS);
    const b = buildEligibilityReport(records, NO_INPUTS);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("handles an empty catalogue without inventing eligibility", () => {
    const report = buildEligibilityReport([], NO_INPUTS);
    expect(report.totalCatalogueRecords).toBe(0);
    expect(report.userFacingEligibleCohort).toBe(0);
  });

  it("never reports an input as available unless it was passed as available", () => {
    const report = buildEligibilityReport(records);
    for (const value of Object.values(report.inputs)) {
      expect(value.available).toBe(false);
      expect(value.classification).toBe("unavailable");
    }
  });
});

describe("renderEligibilityMarkdown", () => {
  const report = buildEligibilityReport([{ id: "a" }], NO_INPUTS);

  it("records the headline counts and cohort", () => {
    const md = renderEligibilityMarkdown(report);
    expect(md).toContain("Total catalogue records: **1**");
    expect(md).toContain("Current user-facing eligible cohort: **0**");
  });

  it("records the departure-time input as absent", () => {
    expect(renderEligibilityMarkdown(report)).toContain(
      "Current departure-time input: **absent**",
    );
  });

  it("lists every declared blocking reason", () => {
    const md = renderEligibilityMarkdown(report);
    for (const reason of BLOCKER_REASONS) expect(md).toContain(reason);
  });

  it("states that no network or credential was used", () => {
    const md = renderEligibilityMarkdown(report);
    expect(md).toContain("No network, no provider call, no credential");
  });
});
