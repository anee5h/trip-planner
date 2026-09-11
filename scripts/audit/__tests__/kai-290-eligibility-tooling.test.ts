/**
 * KAI-290 — eligibility audit tooling tests.
 *
 * Covers the pure helpers behind `scripts/audit/kai-290-odpt-eligibility.mjs`:
 * identity detection, destination-anchor classification, the fail-closed default,
 * blocker attribution, the eligible-cohort rule and the Markdown renderer. No
 * network and no filesystem is touched.
 */
import { afterAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BLOCKER_REASONS,
  DESTINATION_ANCHOR_STATUS,
  ODPT_IDENTITY_PATTERN,
  buildEligibilityReport,
  classifyDestinationAnchor,
  classifyEligibility,
  INPUT_AVAILABILITY,
  UnsupportedCatalogueShapeError,
  buildEligibilityContext,
  collectCanonicalMappingStationTargets,
  collectStationIdentities,
  collectStationIdentitiesAnywhere,
  containsOdptIdentity,
  hasExplicitCanonicalMapping,
  loadCatalogueRecords,
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

describe("eligibility precedence — one source of truth", () => {
  const EXACT = { id: "x", arrivalStationId: "odpt.Station:Toei.Mita.Hakusan" };
  const ALL = {
    originIdentity: "available",
    departureWindow: "available",
    serviceDate: "available",
  };
  const NONE = {
    originIdentity: "unavailable",
    departureWindow: "unavailable",
    serviceDate: "unavailable",
  };

  it("is NOT eligible from an exact anchor alone", () => {
    const verdict = classifyEligibility(EXACT, NONE);
    expect(verdict.eligible).toBe(false);
    expect(verdict.blocker).toBe("origin_station_identity_missing");
  });

  it("escalates to departure_time_input_absent once the origin exists", () => {
    const verdict = classifyEligibility(EXACT, {
      ...NONE,
      originIdentity: "available",
    });
    expect(verdict.eligible).toBe(false);
    expect(verdict.blocker).toBe("departure_time_input_absent");
  });

  it("escalates to service_date_context_absent once origin+departure exist", () => {
    const verdict = classifyEligibility(EXACT, {
      ...NONE,
      originIdentity: "available",
      departureWindow: "available",
    });
    expect(verdict.eligible).toBe(false);
    expect(verdict.blocker).toBe("service_date_context_absent");
  });

  it("is eligible ONLY when all four requirements are satisfied", () => {
    const verdict = classifyEligibility(EXACT, ALL);
    expect(verdict.eligible).toBe(true);
    expect(verdict.blocker).toBeNull();
  });

  it("keeps destination blockers ahead of the input gates", () => {
    // A missing destination anchor is the first gate, even when every input exists.
    expect(classifyEligibility({ id: "y" }, ALL).blocker).toBe(
      "destination_station_identity_missing",
    );
    expect(
      classifyEligibility(
        {
          id: "y",
          arrivalStationId: "odpt.Station:Toei.Mita.A",
          alternateStationId: "odpt.Station:Toei.Mita.B",
        },
        ALL,
      ).blocker,
    ).toBe("destination_station_identity_ambiguous");
  });

  it("never calls a resolvable-only anchor eligible, even with all inputs", () => {
    const verdict = classifyEligibility(
      { id: "r", odptMapping: { station: "odpt.Station:Toei.Mita.Hakusan" } },
      ALL,
    );
    expect(verdict.anchor.status).toBe("deterministically_resolvable");
    expect(verdict.eligible).toBe(false);
    expect(verdict.blocker).toBe("destination_station_identity_missing");
  });

  it("treats a FLOW-DEPENDENT service date as satisfied only in a flow scope", () => {
    const ctx = {
      originIdentity: "available",
      departureWindow: "available",
      serviceDate: "flow_dependent",
    };
    // Catalogue-wide: a date is NOT assumed present for every request.
    expect(classifyEligibility(EXACT, ctx).blocker).toBe(
      "service_date_context_absent",
    );
    // Evaluated for a flow that actually supplies a date.
    const inFlow = classifyEligibility(EXACT, {
      ...ctx,
      eligibilityScope: "flow",
    });
    expect(inFlow.eligible).toBe(true);
  });

  it("models availability fail-closed", () => {
    expect(buildEligibilityContext({})).toEqual({
      originIdentity: "unavailable",
      departureWindow: "unavailable",
      serviceDate: "unavailable",
    });
    expect(
      buildEligibilityContext({ originIdentity: "nonsense" }).originIdentity,
    ).toBe("unavailable");
    for (const value of Object.values(INPUT_AVAILABILITY)) {
      expect(
        buildEligibilityContext({ originIdentity: value }).originIdentity,
      ).toBe(value);
    }
  });
});

describe("buildEligibilityReport — one truth, no second calculation", () => {
  const records = [
    { id: "unavailable-1" },
    { id: "unavailable-2", nearestStation: "Asakusa Station" },
    {
      id: "ambiguous-1",
      arrivalStationId: "odpt.Station:Toei.Mita.A",
      alternateStationId: "odpt.Station:Toei.Mita.B",
    },
    {
      id: "resolvable-1",
      odptMapping: { station: "odpt.Station:Toei.Mita.A" },
    },
  ];
  const NONE = {
    originIdentity: "unavailable",
    departureWindow: "unavailable",
    serviceDate: "unavailable",
  };

  it("counts every destination-anchor bucket and totals the records", () => {
    const report = buildEligibilityReport(records, NONE);
    expect(report.totalCatalogueRecords).toBe(4);
    expect(report.destinationAnchors).toEqual({
      exact: 0,
      deterministicallyResolvable: 1,
      ambiguous: 1,
      unavailable: 2,
    });
  });

  it("derives the cohort from the per-record verdicts", () => {
    // Every non-eligible record must carry a blocker, and the cohort must equal
    // the number of records whose OWN verdict said eligible.
    const report = buildEligibilityReport(records, NONE);
    expect(report.userFacingEligibleCohort).toBe(0);
    expect(report.eligibleRecordIds).toEqual([]);
    for (const entry of report.notableRecords) {
      if (!entry.eligible) expect(entry.blocker).not.toBeNull();
    }
  });

  it("updates blocker counts as input gates are progressively unlocked", () => {
    const withAnchor = [
      { id: "ok", arrivalStationId: "odpt.Station:Toei.Mita.Hakusan" },
    ];
    // 1. nothing available -> origin gate
    expect(buildEligibilityReport(withAnchor, NONE).blockers).toMatchObject({
      origin_station_identity_missing: 1,
    });
    // 2. origin available -> departure gate
    const step2 = buildEligibilityReport(withAnchor, {
      ...NONE,
      originIdentity: "available",
    });
    expect(step2.blockers).toMatchObject({
      departure_time_input_absent: 1,
      origin_station_identity_missing: 0,
    });
    expect(step2.userFacingEligibleCohort).toBe(0);
    // 3. origin + departure -> date gate
    const step3 = buildEligibilityReport(withAnchor, {
      ...NONE,
      originIdentity: "available",
      departureWindow: "available",
    });
    expect(step3.blockers).toMatchObject({
      service_date_context_absent: 1,
      departure_time_input_absent: 0,
    });
    expect(step3.userFacingEligibleCohort).toBe(0);
    // 4. all four -> eligible
    const step4 = buildEligibilityReport(withAnchor, {
      originIdentity: "available",
      departureWindow: "available",
      serviceDate: "available",
    });
    expect(step4.userFacingEligibleCohort).toBe(1);
    expect(step4.eligibleRecordIds).toEqual(["ok"]);
    expect(Object.values(step4.blockers).every((n) => n === 0)).toBe(true);
  });

  it("does not assume a flow-dependent date for every record", () => {
    const withAnchor = [
      { id: "ok", arrivalStationId: "odpt.Station:Toei.Mita.Hakusan" },
    ];
    const report = buildEligibilityReport(withAnchor, {
      originIdentity: "available",
      departureWindow: "available",
      serviceDate: "flow_dependent",
    });
    // Catalogue scope: a date exists only in some flows, so the cohort stays 0.
    expect(report.eligibleCohortScope).toBe("catalogue");
    expect(report.userFacingEligibleCohort).toBe(0);
    // The same records ARE eligible when evaluated for a date-bearing flow.
    const inFlow = buildEligibilityReport(withAnchor, {
      originIdentity: "available",
      departureWindow: "available",
      serviceDate: "flow_dependent",
      eligibilityScope: "flow",
    });
    expect(inFlow.userFacingEligibleCohort).toBe(1);
  });

  it("models the service date truthfully — flow_dependent, not a global boolean", () => {
    const report = buildEligibilityReport(records, {
      serviceDate: "flow_dependent",
    });
    expect(report.inputs.serviceDate.availability).toBe("flow_dependent");
    expect(report.inputs.serviceDate.classification).toBe(
      "deterministically_resolvable",
    );
    expect(report.inputs.serviceDate.evidence).toContain("travelDate");
    expect(report.inputs.serviceDate.flowDependent).toBe(true);
    // NOT claimed present for every request.
    expect(report.inputs.serviceDate.available).toBe(false);
  });

  it("lists only notable (non-unavailable) records, so the artifact stays diffable", () => {
    const report = buildEligibilityReport(records, NONE);
    expect(report.notableRecords.map((entry) => entry.id).sort()).toEqual([
      "ambiguous-1",
      "resolvable-1",
    ]);
  });

  it("is deterministic across runs", () => {
    const a = buildEligibilityReport(records, NONE);
    const b = buildEligibilityReport(records, NONE);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("does not read any ambient environment", () => {
    const before = process.env.GITHUB_SHA;
    process.env.GITHUB_SHA = "deadbeef";
    const a = JSON.stringify(buildEligibilityReport(records, NONE));
    process.env.GITHUB_SHA = "cafebabe";
    const b = JSON.stringify(buildEligibilityReport(records, NONE));
    if (before === undefined) delete process.env.GITHUB_SHA;
    else process.env.GITHUB_SHA = before;
    expect(a).toBe(b);
  });

  it("handles an empty catalogue without inventing eligibility", () => {
    const report = buildEligibilityReport([], NONE);
    expect(report.totalCatalogueRecords).toBe(0);
    expect(report.userFacingEligibleCohort).toBe(0);
  });

  it("never reports an input as available unless it was declared available", () => {
    const report = buildEligibilityReport(records);
    for (const value of Object.values(report.inputs)) {
      expect(value.available).toBe(false);
    }
  });
});

describe("canonical mapping must name a station target", () => {
  it("accepts exactly one explicit station target", () => {
    expect(
      collectCanonicalMappingStationTargets({
        odptMapping: { station: "odpt.Station:Toei.Mita.Hakusan" },
      }),
    ).toEqual(["odpt.Station:Toei.Mita.Hakusan"]);
    expect(
      hasExplicitCanonicalMapping({
        canonicalMapping: { stationId: "odpt.Station:Toei.Mita.Hakusan" },
      }),
    ).toBe(true);
  });

  it("rejects a non-empty mapping that names NO station → unavailable", () => {
    // The exact over-broad case: an operator mapping describes the operator, not
    // the arrival station.
    for (const record of [
      { id: "x", odptMapping: { operator: "odpt.Operator:Toei" } },
      {
        id: "x",
        odptMapping: {
          operator: "odpt.Operator:Toei",
          railway: "odpt.Railway:Toei.Mita",
        },
      },
      { id: "x", odptMapping: { checkedAt: "2026-01-01" } },
    ]) {
      expect(hasExplicitCanonicalMapping(record)).toBe(false);
      expect(classifyDestinationAnchor(record).status).toBe(
        DESTINATION_ANCHOR_STATUS.UNAVAILABLE,
      );
    }
  });

  it("is ambiguous for several competing station targets", () => {
    const verdict = classifyDestinationAnchor({
      id: "x",
      odptMapping: {
        station: "odpt.Station:Toei.Mita.A",
        alternateStation: "odpt.Station:Toei.Mita.B",
      },
    });
    expect(verdict.status).toBe(DESTINATION_ANCHOR_STATUS.AMBIGUOUS);
    expect(verdict.identities).toHaveLength(2);
  });

  it("keeps an identity buried in notes diagnostic only", () => {
    const record = {
      id: "x",
      notes: "served by odpt.Station:Toei.Mita.Hakusan",
      odptMapping: { operator: "odpt.Operator:Toei" },
    };
    expect(classifyDestinationAnchor(record).status).toBe(
      DESTINATION_ANCHOR_STATUS.UNAVAILABLE,
    );
  });

  it("prefers a real anchor field over a mapping", () => {
    const verdict = classifyDestinationAnchor({
      id: "x",
      arrivalStationId: "odpt.Station:Toei.Mita.Hakusan",
      odptMapping: { station: "odpt.Station:Toei.Mita.Other" },
    });
    expect(verdict.status).toBe(DESTINATION_ANCHOR_STATUS.EXACT);
  });
});

describe("loadCatalogueRecords fails loudly on an unknown shape", () => {
  const dir = mkdtempSync(join(tmpdir(), "kai290-elig-"));
  const catalogueDir = join(dir, "src", "shared", "data");
  mkdirSync(catalogueDir, { recursive: true });
  const cataloguePath = join(catalogueDir, "destinations-index.json");

  const writeCatalogue = (value: unknown) =>
    writeFileSync(cataloguePath, JSON.stringify(value), "utf8");

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("accepts a top-level array", () => {
    writeCatalogue([{ id: "a" }]);
    expect(loadCatalogueRecords(dir)).toHaveLength(1);
  });

  it("accepts an object with a destinations array", () => {
    writeCatalogue({ destinations: [{ id: "a" }, { id: "b" }] });
    expect(loadCatalogueRecords(dir)).toHaveLength(2);
  });

  it("accepts an object with an items array", () => {
    writeCatalogue({ items: [{ id: "a" }] });
    expect(loadCatalogueRecords(dir)).toHaveLength(1);
  });

  it.each([
    ["an unrelated object", { foo: "bar" }],
    ["a nested-but-unsupported object", { data: [{ id: "a" }] }],
    ["a string", "nonsense"],
    ["a number", 42],
    ["null", null],
  ])("THROWS rather than reporting zero records for %s", (_label, value) => {
    writeCatalogue(value);
    // Silently returning [] would let an unreadable input masquerade as a
    // confident "no eligible records" result.
    expect(() => loadCatalogueRecords(dir)).toThrow(
      UnsupportedCatalogueShapeError,
    );
  });

  it("throws for an EMPTY catalogue, without asserting a specific count", () => {
    writeCatalogue([]);
    expect(() => loadCatalogueRecords(dir)).toThrow(
      UnsupportedCatalogueShapeError,
    );
    writeCatalogue({ destinations: [] });
    expect(() => loadCatalogueRecords(dir)).toThrow(
      UnsupportedCatalogueShapeError,
    );
  });

  it("reads the REAL committed catalogue as a non-empty array", () => {
    const records = loadCatalogueRecords();
    expect(Array.isArray(records)).toBe(true);
    expect(records.length).toBeGreaterThan(0);
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
