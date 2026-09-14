import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildKai292C4EPrerequisiteAudit,
  KAI_292C4E_ANCHOR_IDS,
} from "../audit-kai-292c4e-prerequisite";
import {
  resolveScheduledTransitEndpoint,
  type ScheduledTransitCrosswalkEntry,
} from "../../../src/shared/services/transport/static/scheduledTransitEndpoint";
import {
  validateScheduledTransitDataset,
  type ScheduledTransitDataset,
} from "../../../src/shared/services/transport/static/scheduledTransitDataset";
import { SAKATA_RUNRUNBUS_DATASET } from "../../../src/shared/services/transport/static/scheduledTransitDatasetRegistry";

const ROOT = process.cwd();

function readSakataDataset(): ScheduledTransitDataset {
  const artifact = JSON.parse(
    readFileSync(
      join(ROOT, "public/data/transit/sakata-runrunbus.json"),
      "utf8",
    ),
  ) as unknown;
  return validateScheduledTransitDataset(artifact, SAKATA_RUNRUNBUS_DATASET);
}

describe("KAI-292C4E real scheduled-transit corridor prerequisite audit", () => {
  it("audits the seven anchors in the requested order without promoting them", () => {
    const report = buildKai292C4EPrerequisiteAudit(ROOT);

    expect(report.schemaVersion).toBe("kai-292c4e-v1");
    expect(report.status).toBe("blocked_prerequisite");
    expect(report.anchors.map(({ destinationId }) => destinationId)).toEqual(
      KAI_292C4E_ANCHOR_IDS,
    );
    expect(report.anchors).toHaveLength(7);
    expect(
      report.anchors.every(({ productionCrosswalk }) => !productionCrosswalk),
    ).toBe(true);
    expect(report.c4a.corridorCount).toBe(0);
    expect(report.promotedAnchorCount).toBe(0);
  });

  it("uses checked reviewed product evidence for exact origin options and the origin gate", () => {
    const report = buildKai292C4EPrerequisiteAudit(ROOT, {
      originIdentities: [
        {
          identityKind: "product",
          identityStability: "stable_product_id",
          reviewStatus: "reviewed",
          productId: "synthetic-origin-product",
        },
      ],
    });

    expect(report.origin).toMatchObject({
      status: "available",
      reviewedProductIds: ["synthetic-origin-product"],
      exactProductOriginOptions: ["synthetic-origin-product"],
    });
    expect(report.gates).toContainEqual(
      expect.objectContaining({
        gate: "real_meguruto_origin",
        satisfied: true,
      }),
    );
    expect(report.corridorReadinessBlockers).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "missing_canonical_product_origin_identity",
        }),
      ]),
    );
  });

  it("derives C2 registration state from injected descriptors without trusting an unloadable ODPT artifact", () => {
    const report = buildKai292C4EPrerequisiteAudit(ROOT, {
      scheduledTransitDatasets: [
        {
          ...SAKATA_RUNRUNBUS_DATASET,
          key: "synthetic-odpt-scheduled",
          assetUrl: "/data/transit/missing-synthetic-odpt.json",
          provider: "odpt",
          datasetId: "odpt-synthetic-scheduled-v1",
          identityNamespace: "odpt:synthetic",
        },
      ],
    });

    expect(report.c2Boundary).toMatchObject({
      registeredDatasetKeys: ["synthetic-odpt-scheduled"],
      registeredProviders: ["odpt"],
      reason: "registered_odpt_dataset_not_loadable",
      odptEvidenceCanEnterTrustedDataset: false,
    });
    for (const anchor of report.anchors) {
      expect(anchor.c2ScheduledTransitDataset).toMatchObject({
        reason: report.c2Boundary.reason,
        registeredDatasetKeys: report.c2Boundary.registeredDatasetKeys,
        registeredProviders: report.c2Boundary.registeredProviders,
      });
    }
    expect(report.corridorReadinessBlockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "odpt_timetable_not_representable_in_trusted_c2",
        }),
      ]),
    );
    expect(report.c2Boundary.reason).not.toBe(
      "no_registered_odpt_scheduled_dataset",
    );
  });

  it("distinguishes catalogue identity, reviewed station identity, access, ODPT evidence, and C2 representation", () => {
    const report = buildKai292C4EPrerequisiteAudit(ROOT);
    const ueno = report.anchors.find(
      ({ destinationId }) => destinationId === "ueno-park",
    );
    const ryogoku = report.anchors.find(
      ({ destinationId }) => destinationId === "ryogoku-kokugikan-sumo-museum",
    );

    expect(ueno).toMatchObject({
      catalogue: { status: "present", productId: "ueno-park" },
      reviewedStation: {
        provider: "odpt",
        stationId: "odpt.Station:TokyoMetro.Ginza.Ueno",
        operator: "odpt.Operator:TokyoMetro",
        productionCrosswalk: false,
      },
      stationToDestinationAccess: {
        status: "source_backed_station_label_only",
        exactStationIdentityBound: false,
      },
      odptTimetableEvidence: {
        operatorPilotStatus: "included",
        exactStationTimetableStatus: "not_evidenced",
      },
      c2ScheduledTransitDataset: {
        canEnterTrustedC2: false,
        reason: "no_registered_odpt_scheduled_dataset",
      },
    });
    expect(ryogoku).toMatchObject({
      stationToDestinationAccess: {
        status: "unavailable",
        exactStationIdentityBound: false,
      },
      reviewedStation: {
        provider: "odpt",
        operator: "odpt.Operator:Toei",
      },
    });
    for (const anchor of report.anchors.filter(
      ({ destinationId }) => destinationId !== "ueno-park",
    )) {
      expect(anchor.stationToDestinationAccess).toMatchObject({
        status: "unavailable",
        exactStationIdentityBound: false,
        sourceUrls: [],
        statement:
          "No reviewed station-to-destination access evidence is bound to the exact ODPT station identity.",
      });
      expect(anchor.stationToDestinationAccess.statement).not.toContain(
        "Canonical arrival",
      );
    }
    expect(report.odptBoundary.liveResultReplayed).toBe(false);
    expect(report.odptBoundary.credentialExposed).toBe(false);
    expect(report.c2Boundary.odptEvidenceCanEnterTrustedDataset).toBe(false);
  });

  it("records product-safe origin choices and rejects free text, coordinates, nearest, and Sakata pilot identities", () => {
    const report = buildKai292C4EPrerequisiteAudit(ROOT);

    expect(report.origin).toMatchObject({
      status: "missing_canonical_product_identity",
      freeTextLabelAndCoordinates: "insufficient",
      exactProductOriginOptions: [],
    });
    expect(report.origin.rejectedOptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "free_text_label_and_coordinates" }),
        expect.objectContaining({ kind: "nearest_station" }),
        expect.objectContaining({ kind: "sakata_pilot_identity" }),
      ]),
    );
    expect(report.identityResolutionPolicy).toEqual({
      nameFallback: false,
      coordinateFallback: false,
      nearestFallback: false,
      geographicAnchorPromotion: false,
    });
  });

  it("fails closed for provider, dataset, namespace, and missing provenance mismatches", () => {
    const dataset = readSakataDataset();
    const base: ScheduledTransitCrosswalkEntry = {
      mappingId: "synthetic-exact-origin",
      endpoint: { kind: "origin", productId: "synthetic-origin" },
      datasetId: SAKATA_RUNRUNBUS_DATASET.datasetId,
      provider: "gtfs",
      identityNamespace: SAKATA_RUNRUNBUS_DATASET.identityNamespace,
      providerStopId: "100_01",
      normalizedStopId: "gtfs:stop:gtfs%3Asakata-runrunbus:100_01",
      provenance: {
        kind: "explicit_crosswalk",
        evidenceId: "synthetic-evidence",
        statement: "Synthetic exact crosswalk for fail-closed testing.",
        sourceUrl: "https://example.test/evidence",
        checkedAt: "2026-09-13T00:00:00.000Z",
      },
    };

    expect(
      resolveScheduledTransitEndpoint({
        dataset,
        endpoint: base.endpoint,
        crosswalk: [base],
      }),
    ).toMatchObject({ kind: "resolved", provider: "gtfs" });
    expect(
      resolveScheduledTransitEndpoint({
        dataset,
        endpoint: base.endpoint,
        crosswalk: [{ ...base, provider: "odpt" }],
      }),
    ).toMatchObject({ kind: "unmapped", reason: "no_explicit_crosswalk" });
    expect(
      resolveScheduledTransitEndpoint({
        dataset,
        endpoint: base.endpoint,
        crosswalk: [{ ...base, datasetId: "wrong-dataset" }],
      }),
    ).toMatchObject({ kind: "unmapped", reason: "no_explicit_crosswalk" });
    expect(
      resolveScheduledTransitEndpoint({
        dataset,
        endpoint: base.endpoint,
        crosswalk: [{ ...base, identityNamespace: "gtfs:wrong-feed" }],
      }),
    ).toMatchObject({ kind: "unmapped", reason: "no_explicit_crosswalk" });
    expect(
      resolveScheduledTransitEndpoint({
        dataset,
        endpoint: base.endpoint,
        crosswalk: [
          {
            ...base,
            provenance: { ...base.provenance, evidenceId: "" },
          },
        ],
      }),
    ).toMatchObject({ kind: "invalid_query", reason: "invalid_crosswalk" });
  });

  it("reports the exact blockers, candidate ranking, and the C3/C4D boundary", () => {
    const report = buildKai292C4EPrerequisiteAudit(ROOT);

    expect(report.blockers.map(({ code }) => code)).toEqual([
      "missing_canonical_product_origin_identity",
      "missing_catalogue_destination_crosswalk",
      "station_to_destination_access_not_exactly_bound",
      "odpt_timetable_not_representable_in_trusted_c2",
      "missing_direct_or_one_transfer_scheduled_support",
    ]);
    expect(report.ranking[0]).toMatchObject({
      rank: 1,
      destinationId: "ueno-park",
      infrastructureGapScore: 1,
      tier: "Tier 1",
    });
    const tierTwo = report.ranking.filter(
      ({ infrastructureGapScore }) => infrastructureGapScore === 2,
    );
    expect(tierTwo).toHaveLength(6);
    expect(new Set(tierTwo.map(({ rank }) => rank))).toEqual(new Set([2]));
    expect(new Set(tierTwo.map(({ tier }) => tier))).toEqual(
      new Set(["Tier 2"]),
    );
    expect(new Set(tierTwo.map(({ tieGroup }) => tieGroup))).toEqual(
      new Set(["tier-2-gap-score-2"]),
    );
    expect(
      new Set(tierTwo.map(({ tieBreakOrder }) => tieBreakOrder)).size,
    ).toBe(6);
    expect(
      report.corridorReadinessBlockers.map(({ code }) => code),
    ).not.toContain("no_authoritative_service_date_or_departure_time");
    expect(report.c4dBlockers.map(({ code }) => code)).toEqual([
      "no_authoritative_service_date_or_departure_time",
      "runtime_journey_verification_not_evaluated",
    ]);
    expect(report.c4d).toMatchObject({
      status: "blocked",
      reason: "c4e_prerequisites_not_satisfied",
    });
    expect(report.gates.every(({ satisfied }) => !satisfied)).toBe(false);
    expect(
      report.gates.find(({ gate }) => gate === "real_catalogue_destination"),
    ).toMatchObject({
      satisfied: true,
    });
  });
});
