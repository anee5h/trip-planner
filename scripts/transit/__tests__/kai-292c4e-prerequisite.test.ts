import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildKai292C4EPrerequisiteAudit,
  KAI_292C4E_ANCHOR_IDS,
  type Kai292C4EDatasetDescriptor,
  type Kai292C4EOriginIdentityEvidence,
} from "../audit-kai-292c4e-prerequisite";
import {
  resolveScheduledTransitEndpoint,
  type ScheduledTransitCrosswalkEntry,
} from "../../../src/shared/services/transport/static/scheduledTransitEndpoint";
import {
  validateScheduledTransitDataset,
  type ScheduledTransitDataset,
  type ScheduledTransitDatasetArtifact,
} from "../../../src/shared/services/transport/static/scheduledTransitDataset";
import {
  SAKATA_RUNRUNBUS_DATASET,
  SCHEDULED_TRANSIT_ARTIFACT_SCHEMA_VERSION,
} from "../../../src/shared/services/transport/static/scheduledTransitDatasetRegistry";
import { contentHashOf } from "../../../src/shared/services/transport/static/odptRailTopologyImporter";
import { makeTransitEntityId } from "../../../src/shared/services/transport/static/transitEntityId";
import {
  sha256Hex,
  stableStringify,
} from "../../../src/shared/services/transport/static/contentHash";
import type {
  NormalizedTransitGraph,
  TransitCoverageReport,
  TransitDatasetCompleteness,
} from "../../../src/shared/services/transport/static/transitGraphTypes";

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

type SyntheticArtifactOptions = {
  readonly completeness?: TransitDatasetCompleteness;
  readonly emptyGraph?: boolean;
};

function syntheticLoadableOdptState(
  key: string,
  assetUrl: string,
  options: SyntheticArtifactOptions = {},
): {
  readonly descriptor: Kai292C4EDatasetDescriptor;
  readonly artifact: ScheduledTransitDatasetArtifact;
} {
  const datasetId = "odpt-synthetic-scheduled-v1";
  const schemaVersion = "kai-292c2-v1";
  const identityNamespace = "odpt:synthetic";
  const completeness = options.completeness ?? "complete_provider_dump";
  const sourceType =
    completeness === "complete_provider_dump" ? "data_dump" : "fixture";
  const retrievedAt = "2026-09-13T00:00:00.000Z";
  const providerOperatorId = "odpt.Operator:Synthetic";
  const providerRouteId = "odpt.Railway:Synthetic";
  const providerCalendarId = "odpt.Calendar:Synthetic";
  const providerServiceId = "odpt.Train:Synthetic.1";
  const providerStopIds = [
    "odpt.Station:Synthetic.A",
    "odpt.Station:Synthetic.B",
  ] as const;
  const operatorId = makeTransitEntityId(
    "odpt",
    "operator",
    identityNamespace,
    providerOperatorId,
  );
  const routeId = makeTransitEntityId(
    "odpt",
    "route",
    identityNamespace,
    providerRouteId,
  );
  const calendarId = makeTransitEntityId(
    "odpt",
    "calendar",
    identityNamespace,
    providerCalendarId,
  );
  const serviceId = makeTransitEntityId(
    "odpt",
    "scheduled_service",
    identityNamespace,
    providerServiceId,
  );
  const stopIds = providerStopIds.map((providerStopId) =>
    makeTransitEntityId("odpt", "stop", identityNamespace, providerStopId),
  );
  const provenance = (providerId: string, sourceResourceType: string) => ({
    provider: "odpt" as const,
    identityNamespace,
    providerId,
    sourceResourceType,
    datasetId,
    retrievedAt,
    checkedAt: retrievedAt,
  });
  const productionGraph = {
    operators: [
      {
        id: operatorId,
        provider: "odpt" as const,
        providerOperatorId,
        names: { en: "Synthetic ODPT" },
        provenance: provenance(providerOperatorId, "odpt:Operator"),
      },
    ],
    stops: providerStopIds.map((providerStopId, index) => ({
      id: stopIds[index]!,
      provider: "odpt" as const,
      providerStopId,
      stopType: "station" as const,
      coordinates: null,
      operatorIds: [operatorId],
      names: { en: `Synthetic ${index === 0 ? "A" : "B"}` },
      stationCode: null,
      provenance: provenance(providerStopId, "odpt:Station"),
    })),
    routes: [
      {
        id: routeId,
        provider: "odpt" as const,
        providerRouteId,
        operatorId,
        mode: "rail" as const,
        names: { en: "Synthetic ODPT Line" },
        sourceSemantics: {
          provider: "odpt" as const,
          ascendingDirectionId: null,
          descendingDirectionId: null,
        },
        provenance: provenance(providerRouteId, "odpt:Railway"),
      },
    ],
    routeStops: stopIds.map((stopId, index) => ({
      routeId,
      stopId,
      patternId: "synthetic-pattern-1",
      order: index + 1,
      provenance: provenance(providerRouteId, "odpt:Railway"),
    })),
    calendars: [
      {
        id: calendarId,
        provider: "odpt" as const,
        providerCalendarId,
        sourceSemantics: {
          provider: "odpt" as const,
          kind: "base" as const,
          day: ["odpt:Day:Monday"],
          duration: null,
        },
        provenance: provenance(providerCalendarId, "odpt:Calendar"),
      },
    ],
    scheduledServices: [
      {
        id: serviceId,
        provider: "odpt" as const,
        providerServiceId,
        routeId,
        patternId: "synthetic-pattern-1",
        calendarId,
        sourceSemantics: {
          provider: "odpt" as const,
          tripHeadsign: "Synthetic B",
          directionId: null,
          blockId: null,
        },
        provenance: provenance(providerServiceId, "odpt:Train"),
      },
    ],
    scheduledStopTimes: stopIds.map((stopId, index) => ({
      serviceId,
      stopId,
      patternId: "synthetic-pattern-1",
      order: index + 1,
      provider: "odpt" as const,
      arrivalServiceSeconds: index === 0 ? 9 * 3600 : 9 * 3600 + 600,
      departureServiceSeconds: index === 0 ? 9 * 3600 + 60 : 9 * 3600 + 660,
      sourceSemantics: {
        provider: "odpt" as const,
        rawArrivalTime: index === 0 ? "09:00:00" : "09:10:00",
        rawDepartureTime: index === 0 ? "09:01:00" : "09:11:00",
        rawStopSequence: index + 1,
        pickupType: null,
        dropOffType: null,
        timepoint: 1 as const,
      },
      provenance: provenance(providerStopIds[index]!, "odpt:StationTimetable"),
    })),
    transfers: [],
    fares: [],
  };
  const emptyGraph = {
    operators: [],
    stops: [],
    routes: [],
    routeStops: [],
    calendars: [],
    scheduledServices: [],
    scheduledStopTimes: [],
    transfers: [],
    fares: [],
  };
  const graphContent = options.emptyGraph ? emptyGraph : productionGraph;
  const datasetHash = contentHashOf(graphContent);
  const coverage: TransitCoverageReport = {
    datasetId,
    schemaVersion,
    entries: [
      {
        provider: "odpt",
        operator: providerOperatorId,
        mode: "rail",
        topology:
          completeness === "complete_provider_dump" ? "imported" : "partial",
        timetable:
          completeness === "complete_provider_dump" ? "imported" : "partial",
        fare: "not_evaluated",
        realtime: "not_evaluated",
        datasetId,
        notes:
          completeness === "complete_provider_dump" ? [] : ["subset fixture"],
      },
    ],
  };
  const coverageHash = sha256Hex(stableStringify(coverage));
  // C4E only exercises envelope/eligibility here. ODPT scheduled-service
  // normalization remains outside this slice and is intentionally not added to
  // the production transit type union.
  const graph = {
    datasetVersion: {
      provider: "odpt" as const,
      datasetId,
      sourceType,
      sourceDescriptor: "in-memory synthetic ODPT audit artifact",
      retrievedAt,
      checkedAt: retrievedAt,
      issuedAt: null,
      validUntil: null,
      schemaVersion,
      completeness,
      contentHash: datasetHash,
    },
    ...graphContent,
  } as unknown as NormalizedTransitGraph;
  const artifact = {
    artifactSchemaVersion: SCHEDULED_TRANSIT_ARTIFACT_SCHEMA_VERSION,
    metadata: {
      provider: "odpt" as const,
      datasetId,
      sourceType,
      sourceDescriptor: "in-memory synthetic ODPT audit artifact",
      retrievedAt,
      checkedAt: retrievedAt,
      issuedAt: null,
      validUntil: null,
      schemaVersion,
      completeness,
      datasetHash,
      coverageHash,
      identityNamespace,
    },
    graph,
    coverage,
  } as ScheduledTransitDatasetArtifact;
  const descriptor: Kai292C4EDatasetDescriptor = {
    key,
    assetUrl,
    artifactSchemaVersion: SCHEDULED_TRANSIT_ARTIFACT_SCHEMA_VERSION,
    provider: "odpt",
    identityNamespace,
    datasetId,
    schemaVersion,
    expectedContentHash: datasetHash,
    expectedCoverageHash: coverageHash,
    sourceType,
    completeness,
  };
  return { descriptor, artifact };
}

function syntheticCrosswalkEntry(
  kind: "origin" | "destination",
  productId: string,
  mappingId: string,
  overrides: Partial<
    Pick<
      ScheduledTransitCrosswalkEntry,
      "datasetId" | "provider" | "identityNamespace"
    >
  > = {},
): ScheduledTransitCrosswalkEntry {
  const providerStopId = kind === "origin" ? "100_01" : "17_01";
  return {
    mappingId,
    endpoint: { kind, productId },
    datasetId: overrides.datasetId ?? SAKATA_RUNRUNBUS_DATASET.datasetId,
    provider: overrides.provider ?? SAKATA_RUNRUNBUS_DATASET.provider,
    identityNamespace:
      overrides.identityNamespace ?? SAKATA_RUNRUNBUS_DATASET.identityNamespace,
    providerStopId,
    normalizedStopId: `synthetic:${kind}:${providerStopId}`,
    provenance: {
      kind: "explicit_crosswalk",
      evidenceId: `${mappingId}-evidence`,
      statement: "Synthetic exact crosswalk for C4E gate testing.",
      sourceUrl: "https://example.test/c4e-crosswalk",
      checkedAt: "2026-09-13T00:00:00.000Z",
    },
  };
}

const SYNTHETIC_REVIEWED_ORIGIN: Kai292C4EOriginIdentityEvidence = {
  identityKind: "product",
  identityStability: "stable_product_id",
  reviewStatus: "reviewed",
  productId: "synthetic-origin-product",
};

function exactIdentityGateReport(
  mappings: readonly ScheduledTransitCrosswalkEntry[],
): ReturnType<typeof buildKai292C4EPrerequisiteAudit> {
  return buildKai292C4EPrerequisiteAudit(ROOT, {
    originIdentities: [SYNTHETIC_REVIEWED_ORIGIN],
    scheduledTransitCrosswalkMappings: mappings,
  });
}

describe("KAI-292C4E real scheduled-transit corridor prerequisite audit", () => {
  it("audits the seven anchors in the requested order without promoting them", () => {
    const report = buildKai292C4EPrerequisiteAudit(ROOT);

    expect(report.schemaVersion).toBe("kai-292c4e-v1");
    expect(report.status).toBe("prerequisites_satisfied");
    expect(report.anchors.map(({ destinationId }) => destinationId)).toEqual(
      KAI_292C4E_ANCHOR_IDS,
    );
    expect(report.anchors).toHaveLength(7);
    expect(
      report.anchors.every(({ productionCrosswalk }) => !productionCrosswalk),
    ).toBe(true);
    expect(report.c4a.corridorCount).toBe(1);
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
    expect(
      report.anchors.every(
        ({ missingPrerequisites }) =>
          !missingPrerequisites.includes(
            "reviewed_stable_product_origin_identity",
          ),
      ),
    ).toBe(true);
  });

  it("separates artifact validity from production scheduled-dataset eligibility", () => {
    const cases = [
      {
        completeness: "fixture_subset" as const,
        emptyGraph: false,
        expectedReason: "registered_odpt_dataset_not_production_eligible",
      },
      {
        completeness: "bounded_subset" as const,
        emptyGraph: false,
        expectedReason: "registered_odpt_dataset_not_production_eligible",
      },
      {
        completeness: "complete_provider_dump" as const,
        emptyGraph: true,
        expectedReason: "registered_odpt_dataset_not_production_eligible",
      },
    ];

    for (const [index, testCase] of cases.entries()) {
      const { descriptor, artifact } = syntheticLoadableOdptState(
        `synthetic-ineligible-odpt-${index}`,
        `/data/transit/missing-ineligible-odpt-${index}.json`,
        testCase,
      );
      expect(
        validateScheduledTransitDataset(artifact, descriptor),
      ).toBeDefined();
      const report = buildKai292C4EPrerequisiteAudit(ROOT, {
        scheduledTransitDatasets: [descriptor],
        scheduledTransitArtifacts: [{ key: descriptor.key, artifact }],
      });

      expect(report.c2Boundary).toMatchObject({
        artifactValidOdptDatasetKeys: [descriptor.key],
        productionEligibleOdptDatasetKeys: [],
        reason: testCase.expectedReason,
        odptEvidenceCanEnterTrustedDataset: false,
      });
      expect(report.gates).toContainEqual(
        expect.objectContaining({
          gate: "production_loadable_scheduled_dataset",
          satisfied: false,
        }),
      );
      expect(report.corridorReadinessBlockers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "odpt_timetable_not_representable_in_trusted_c2",
          }),
        ]),
      );
    }
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
      artifactValidOdptDatasetKeys: [],
      productionEligibleOdptDatasetKeys: [],
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

  it.each([
    {
      key: "synthetic-loadable-odpt-a",
      assetUrl: "/data/transit/missing-synthetic-loadable-odpt-a.json",
    },
    {
      key: "synthetic-loadable-odpt-b",
      assetUrl: "/data/transit/missing-synthetic-loadable-odpt-b.json",
    },
  ])(
    "accepts a parameterized production-shaped in-memory ODPT descriptor/artifact state ($key)",
    ({ key, assetUrl }) => {
      const { descriptor, artifact } = syntheticLoadableOdptState(
        key,
        assetUrl,
      );
      const report = buildKai292C4EPrerequisiteAudit(ROOT, {
        scheduledTransitDatasets: [descriptor],
        scheduledTransitArtifacts: [{ key, artifact }],
      });

      expect(report.c2Boundary).toMatchObject({
        registeredDatasetKeys: [key],
        registeredProviders: ["odpt"],
        artifactValidOdptDatasetKeys: [key],
        productionEligibleOdptDatasetKeys: [key],
        reason: "registered_odpt_scheduled_dataset",
        odptEvidenceCanEnterTrustedDataset: true,
      });
      expect(report.status).toBe("blocked_prerequisite");
      expect(report.c4a.corridorCount).toBe(1);
      expect(
        report.anchors.every(({ productionCrosswalk }) => !productionCrosswalk),
      ).toBe(true);
      expect(report.corridorReadinessBlockers.map(({ code }) => code)).toEqual([
        "missing_catalogue_destination_crosswalk",
      ]);
      for (const anchor of report.anchors) {
        expect(anchor.c2ScheduledTransitDataset).toMatchObject({
          canEnterTrustedC2:
            report.c2Boundary.odptEvidenceCanEnterTrustedDataset,
          artifactValid: true,
          productionScheduledDatasetEligible: true,
          registeredDatasetKeys: report.c2Boundary.registeredDatasetKeys,
          registeredProviders: report.c2Boundary.registeredProviders,
          reason: report.c2Boundary.reason,
        });
        expect(anchor.missingPrerequisites).not.toContain(
          "registered_odpt_scheduled_dataset_artifact",
        );
      }
      expect(report.gates).toContainEqual(
        expect.objectContaining({
          gate: "production_loadable_scheduled_dataset",
          satisfied: true,
        }),
      );
    },
  );

  it.each([
    {
      name: "one unrelated destination mapping only",
      mappings: [
        syntheticCrosswalkEntry("destination", "ueno-park", "destination-only"),
      ],
      expected: false,
    },
    {
      name: "one unrelated origin mapping only",
      mappings: [
        syntheticCrosswalkEntry(
          "origin",
          "other-origin",
          "unrelated-origin-only",
        ),
      ],
      expected: false,
    },
    {
      name: "reviewed origin with exact origin mapping but no destination",
      mappings: [
        syntheticCrosswalkEntry(
          "origin",
          SYNTHETIC_REVIEWED_ORIGIN.productId!,
          "origin-only",
        ),
      ],
      expected: false,
    },
    {
      name: "destination with reviewed origin but no exact origin mapping",
      mappings: [
        syntheticCrosswalkEntry("destination", "ueno-park", "destination-only"),
      ],
      expected: false,
    },
    {
      name: "different dataset",
      mappings: [
        syntheticCrosswalkEntry(
          "origin",
          SYNTHETIC_REVIEWED_ORIGIN.productId!,
          "origin-dataset",
        ),
        syntheticCrosswalkEntry(
          "destination",
          "ueno-park",
          "destination-dataset",
          {
            datasetId: "wrong-dataset",
          },
        ),
      ],
      expected: false,
    },
    {
      name: "different provider",
      mappings: [
        syntheticCrosswalkEntry(
          "origin",
          SYNTHETIC_REVIEWED_ORIGIN.productId!,
          "origin-provider",
        ),
        syntheticCrosswalkEntry(
          "destination",
          "ueno-park",
          "destination-provider",
          {
            provider: "odpt",
          },
        ),
      ],
      expected: false,
    },
    {
      name: "different identity namespace",
      mappings: [
        syntheticCrosswalkEntry(
          "origin",
          SYNTHETIC_REVIEWED_ORIGIN.productId!,
          "origin-namespace",
        ),
        syntheticCrosswalkEntry(
          "destination",
          "ueno-park",
          "destination-namespace",
          {
            identityNamespace: "gtfs:other-feed",
          },
        ),
      ],
      expected: false,
    },
    {
      name: "ambiguous origin mapping",
      mappings: [
        syntheticCrosswalkEntry(
          "origin",
          SYNTHETIC_REVIEWED_ORIGIN.productId!,
          "origin-ambiguous-a",
        ),
        syntheticCrosswalkEntry(
          "origin",
          SYNTHETIC_REVIEWED_ORIGIN.productId!,
          "origin-ambiguous-b",
        ),
        syntheticCrosswalkEntry(
          "destination",
          "ueno-park",
          "destination-ambiguous-origin",
        ),
      ],
      expected: false,
    },
    {
      name: "ambiguous destination mapping",
      mappings: [
        syntheticCrosswalkEntry(
          "origin",
          SYNTHETIC_REVIEWED_ORIGIN.productId!,
          "origin-ambiguous-destination",
        ),
        syntheticCrosswalkEntry(
          "destination",
          "ueno-park",
          "destination-ambiguous-a",
        ),
        syntheticCrosswalkEntry(
          "destination",
          "ueno-park",
          "destination-ambiguous-b",
        ),
      ],
      expected: false,
    },
    {
      name: "compatible exact pair",
      mappings: [
        syntheticCrosswalkEntry(
          "origin",
          SYNTHETIC_REVIEWED_ORIGIN.productId!,
          "origin-compatible",
        ),
        syntheticCrosswalkEntry(
          "destination",
          "ueno-park",
          "destination-compatible",
        ),
      ],
      expected: true,
    },
  ])(
    "requires a compatible unambiguous exact endpoint identity pair ($name)",
    ({ mappings, expected }) => {
      const report = exactIdentityGateReport(mappings);
      expect(
        report.gates.find(({ gate }) => gate === "exact_transit_identities"),
      ).toMatchObject({ satisfied: expected });
      expect(report.exactEndpointIdentityPairs).toHaveLength(expected ? 1 : 0);
    },
  );

  it("derives ODPT evidence summaries from the committed KAI-290 probes", () => {
    const report = buildKai292C4EPrerequisiteAudit(ROOT);
    expect(report.odptBoundary.broadTimetableResult).toBe(
      "provider_response_too_large",
    );
    expect(report.odptBoundary.exactTrainProbeResult).toBe("records");
    expect(report.odptBoundary.broadTrainTimetableProbes).toHaveLength(4);
    expect(report.odptBoundary.broadTrainTimetableProbes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operator: "odpt.Operator:Toei",
          state: "too_large",
          detail: "provider_response_too_large",
          scope: { railway: "odpt.Railway:Toei.Mita" },
        }),
      ]),
    );
    expect(report.odptBoundary.exactTrainIdentityProbes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operator: "odpt.Operator:TokyoMetro",
          trainIdentity: "odpt.Train:TokyoMetro.Marunouchi.B427",
          state: "records",
          recordCount: 1,
        }),
      ]),
    );
  });

  it("changes the C4E summary when temporary KAI-290 evidence changes", () => {
    const source = JSON.parse(
      readFileSync(join(ROOT, "qa/kai-290/odpt-coverage.json"), "utf8"),
    ) as Record<string, unknown>;
    const operators = source.operators as Record<string, unknown>[];
    const pilotScope = source.pilotScope as Record<string, unknown>;
    const included = pilotScope.included as Record<string, unknown>[];
    for (const operator of operators) {
      const timetable = operator.timetable as Record<string, unknown>;
      const trainTimetable = timetable.trainTimetable as Record<
        string,
        unknown
      >;
      const results = trainTimetable.results as Record<string, unknown>[];
      trainTimetable.results = results.map((result) => {
        const changed = { ...result };
        changed.state = "records";
        changed.recordCount = 1;
        delete changed.detail;
        return changed;
      });
      trainTimetable.byState = { records: results.length };
      trainTimetable.conclusiveCount = results.length;
      trainTimetable.coverageKnown = true;
      const includedEntry = included.find(
        (candidate) => candidate.operator === operator.operator,
      );
      if (includedEntry !== undefined) {
        const evidence = includedEntry.evidence as Record<string, unknown>;
        evidence.trainTimetableWithRecords = results.length;
        const resourceCoverage = evidence.resourceCoverage as Record<
          string,
          unknown
        >;
        resourceCoverage.TrainTimetable = "records";
      }
    }
    const current = buildKai292C4EPrerequisiteAudit(ROOT);
    const changed = buildKai292C4EPrerequisiteAudit(ROOT, {
      odptCoverage: source,
    });
    expect(current.odptBoundary.broadTimetableResult).toBe(
      "provider_response_too_large",
    );
    expect(changed.odptBoundary.broadTimetableResult).toBe("records");
    expect(changed.odptBoundary.broadTrainTimetableProbes).not.toEqual(
      current.odptBoundary.broadTrainTimetableProbes,
    );
  });

  it("fails closed when included KAI-290 evidence lacks expected probe structure", () => {
    const source = JSON.parse(
      readFileSync(join(ROOT, "qa/kai-290/odpt-coverage.json"), "utf8"),
    ) as Record<string, unknown>;
    const operators = source.operators as Record<string, unknown>[];
    const pilotScope = source.pilotScope as Record<string, unknown>;
    const included = pilotScope.included as Record<string, unknown>[];
    const firstIncludedOperator = included[0]!.operator;
    const firstOperator = operators.find(
      (operator) => operator.operator === firstIncludedOperator,
    )!;
    const timetable = firstOperator.timetable as Record<string, unknown>;
    delete timetable.trainTimetable;
    expect(() =>
      buildKai292C4EPrerequisiteAudit(ROOT, { odptCoverage: source }),
    ).toThrow(/trainTimetable/);
  });
  it("fails closed when KAI-290 aggregate counts disagree with probe results", () => {
    const source = JSON.parse(
      readFileSync(join(ROOT, "qa/kai-290/odpt-coverage.json"), "utf8"),
    ) as Record<string, unknown>;
    const operators = source.operators as Record<string, unknown>[];
    const pilotScope = source.pilotScope as Record<string, unknown>;
    const included = pilotScope.included as Record<string, unknown>[];
    const firstIncludedOperator = included[0]!.operator;
    const firstOperator = operators.find(
      (operator) => operator.operator === firstIncludedOperator,
    )!;
    const timetable = firstOperator.timetable as Record<string, unknown>;
    const trainTimetable = timetable.trainTimetable as Record<string, unknown>;
    trainTimetable.byState = { records: 2 };
    expect(() =>
      buildKai292C4EPrerequisiteAudit(ROOT, { odptCoverage: source }),
    ).toThrow(/disagrees/);
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
        canEnterTrustedC2: true,
        artifactValid: true,
        productionScheduledDatasetEligible: true,
        reason: "registered_trusted_scheduled_dataset",
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
    expect(report.c2Boundary.odptEvidenceCanEnterTrustedDataset).toBe(true);
  });

  it("records product-safe origin choices and rejects free text, coordinates, nearest, and Sakata pilot identities", () => {
    const report = buildKai292C4EPrerequisiteAudit(ROOT);

    expect(report.origin).toMatchObject({
      status: "available",
      reviewedProductIds: ["toei-oedo-shinjuku-nishiguchi"],
      exactProductOriginOptions: ["toei-oedo-shinjuku-nishiguchi"],
      freeTextLabelAndCoordinates: "insufficient",
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

    expect(report.blockers).toEqual([]);
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
      reason: "runtime_evidence_absent",
    });
    expect(report.gates.every(({ satisfied }) => !satisfied)).toBe(false);
    expect(
      report.gates.find(({ gate }) => gate === "real_catalogue_destination"),
    ).toMatchObject({
      satisfied: true,
    });
  });
});
