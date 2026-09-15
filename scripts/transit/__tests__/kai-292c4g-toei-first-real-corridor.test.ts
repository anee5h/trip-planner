import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  auditRealMegurutoCorridor,
  type RealCorridorAudit,
} from "../audit-kai-292c4a-real-corridor";
import { buildKai292C4EPrerequisiteAudit } from "../audit-kai-292c4e-prerequisite";
import {
  resolveScheduledTransitEndpoint,
  SCHEDULED_TRANSIT_CROSSWALK,
  type ScheduledTransitCrosswalkEntry,
} from "../../../src/shared/services/transport/static/scheduledTransitEndpoint";
import { validateScheduledTransitDataset } from "../../../src/shared/services/transport/static/scheduledTransitDataset";
import { getScheduledTransitDatasetDescriptor } from "../../../src/shared/services/transport/static/scheduledTransitDatasetRegistry";

const ROOT = process.cwd();
const DATASET_KEY = "toei-oedo-gtfs-20260314" as const;
const DATASET = validateScheduledTransitDataset(
  JSON.parse(
    readFileSync(
      "src/shared/data/transit/toei-oedo-gtfs-20260314.json",
      "utf8",
    ),
  ) as unknown,
  getScheduledTransitDatasetDescriptor(DATASET_KEY),
);
const MAPPINGS = SCHEDULED_TRANSIT_CROSSWALK.mappings;
const ORIGIN_PRODUCT_ID = "toei-oedo-shinjuku-nishiguchi";
const DESTINATION_PRODUCT_ID = "hamarikyu-gardens";
const ACCESS_EVIDENCE = JSON.parse(
  readFileSync(
    "qa/kai-292c4g/hamarikyu-gardens-shiodome-access-evidence.json",
    "utf8",
  ),
) as {
  readonly evidence: readonly [
    {
      readonly destinationId: string;
      readonly dataset: {
        readonly datasetId: string;
        readonly provider: string;
        readonly identityNamespace: string;
        readonly providerStopId: string;
        readonly normalizedStopId: string;
      };
      readonly station: {
        readonly name: string;
        readonly line: string;
        readonly stationCode: string;
      };
      readonly bindingStatus: string;
      readonly identityEquivalence: { readonly reasoning: string };
    },
  ];
};

function mapping(
  kind: ScheduledTransitCrosswalkEntry["endpoint"]["kind"],
  productId: string,
): ScheduledTransitCrosswalkEntry {
  const entry = MAPPINGS.find(
    (candidate) =>
      candidate.endpoint.kind === kind &&
      candidate.endpoint.productId === productId,
  );
  if (entry === undefined)
    throw new Error(`missing ${kind} mapping ${productId}`);
  return entry;
}

const ORIGIN_MAPPING = mapping("origin", ORIGIN_PRODUCT_ID);
const DESTINATION_MAPPING = mapping("destination", DESTINATION_PRODUCT_ID);

function withMapping(
  replacement: ScheduledTransitCrosswalkEntry,
): readonly ScheduledTransitCrosswalkEntry[] {
  return MAPPINGS.map((entry) =>
    entry.mappingId === replacement.mappingId ? replacement : entry,
  );
}

describe("KAI-292C4G first real Toei product corridor", () => {
  it("resolves the reviewed origin to the exact normalized Oedo stop", () => {
    expect(
      resolveScheduledTransitEndpoint({
        dataset: DATASET,
        endpoint: ORIGIN_MAPPING.endpoint,
        crosswalk: MAPPINGS,
      }),
    ).toMatchObject({
      kind: "resolved",
      mappingId: ORIGIN_MAPPING.mappingId,
      provider: "gtfs",
      identityNamespace: "toei-gtfs",
      providerStopId: "402",
      normalizedStopId: "gtfs:stop:toei-gtfs:402",
    });
    expect(ORIGIN_MAPPING.providerStationCode).toBe("E-01");
  });

  it("resolves Hamarikyu to Shiodome and recognizes exact access evidence", () => {
    const resolution = resolveScheduledTransitEndpoint({
      dataset: DATASET,
      endpoint: DESTINATION_MAPPING.endpoint,
      crosswalk: MAPPINGS,
    });
    expect(resolution).toMatchObject({
      kind: "resolved",
      mappingId: DESTINATION_MAPPING.mappingId,
      provider: "gtfs",
      identityNamespace: "toei-gtfs",
      providerStopId: "420",
      normalizedStopId: "gtfs:stop:toei-gtfs:420",
    });
    expect(DESTINATION_MAPPING.providerStationCode).toBe("E-19");
    expect(ACCESS_EVIDENCE.evidence[0]).toMatchObject({
      destinationId: DESTINATION_PRODUCT_ID,
      bindingStatus: "bound_to_exact_provider_station_identity",
      station: {
        name: "Shiodome",
        line: "Toei Oedo Line",
        stationCode: "E-19",
      },
      dataset: {
        datasetId: "toei-oedo-gtfs-20260314",
        provider: "gtfs",
        identityNamespace: "toei-gtfs",
        providerStopId: "420",
        normalizedStopId: "gtfs:stop:toei-gtfs:420",
      },
    });
    expect(
      ACCESS_EVIDENCE.evidence[0]!.identityEquivalence.reasoning,
    ).toContain("not geographic proximity");
  });

  it.each([
    ["dataset", { datasetId: "wrong-dataset" }],
    ["provider", { provider: "odpt" as const }],
    ["namespace", { identityNamespace: "wrong-namespace" }],
  ])("rejects a destination mapping with the wrong %s", (_label, changes) => {
    const altered = { ...DESTINATION_MAPPING, ...changes };
    expect(
      resolveScheduledTransitEndpoint({
        dataset: DATASET,
        endpoint: altered.endpoint,
        crosswalk: withMapping(altered),
      }),
    ).toMatchObject({ kind: "unmapped", reason: "no_explicit_crosswalk" });
  });

  it("marks duplicate origin and destination mappings ambiguous", () => {
    const duplicateOrigin = {
      ...ORIGIN_MAPPING,
      mappingId: `${ORIGIN_MAPPING.mappingId}-duplicate`,
    };
    expect(
      resolveScheduledTransitEndpoint({
        dataset: DATASET,
        endpoint: ORIGIN_MAPPING.endpoint,
        crosswalk: [...MAPPINGS, duplicateOrigin],
      }),
    ).toMatchObject({
      kind: "ambiguous",
      reason: "multiple_explicit_crosswalks",
    });

    const duplicateDestination = {
      ...DESTINATION_MAPPING,
      mappingId: `${DESTINATION_MAPPING.mappingId}-duplicate`,
    };
    expect(
      resolveScheduledTransitEndpoint({
        dataset: DATASET,
        endpoint: DESTINATION_MAPPING.endpoint,
        crosswalk: [...MAPPINGS, duplicateDestination],
      }),
    ).toMatchObject({
      kind: "ambiguous",
      reason: "multiple_explicit_crosswalks",
    });
  });

  it("does not use name, coordinate, nearest, or fuzzy fallback", () => {
    expect(
      resolveScheduledTransitEndpoint({
        dataset: DATASET,
        endpoint: { kind: "destination", productId: "Shiodome" },
        crosswalk: MAPPINGS,
      }),
    ).toMatchObject({ kind: "unmapped", reason: "no_explicit_crosswalk" });
  });

  it("keeps exactly two Toei production mappings and no extra C4G destination", () => {
    const productionMappings = MAPPINGS.filter(
      (entry) => entry.datasetId === DATASET_KEY,
    );
    expect(productionMappings).toHaveLength(2);
    expect(
      productionMappings.map((entry) => entry.endpoint.kind).sort(),
    ).toEqual(["destination", "origin"]);
    expect(
      productionMappings.find((entry) => entry.endpoint.kind === "destination")
        ?.endpoint.productId,
    ).toBe(DESTINATION_PRODUCT_ID);
  });

  it("reports exactly one direct real corridor with runtime verification unevaluated", () => {
    const report: RealCorridorAudit = auditRealMegurutoCorridor(ROOT);
    expect(report.status).toBe("real_corridor_evidenced");
    expect(report.realCorridors).toHaveLength(1);
    expect(report.candidateBlockers).toEqual([]);
    expect(report.stationAccessEvidence).toMatchObject({
      status: "reviewed_exact_binding",
      reviewedDestinationIds: [DESTINATION_PRODUCT_ID],
    });
    expect(report.realCorridors[0]).toMatchObject({
      selection: "preferred",
      origin: {
        productId: ORIGIN_PRODUCT_ID,
        normalizedStopId: "gtfs:stop:toei-gtfs:402",
        providerStopId: "402",
      },
      destination: {
        productId: DESTINATION_PRODUCT_ID,
        normalizedStopId: "gtfs:stop:toei-gtfs:420",
        providerStopId: "420",
      },
      dataset: {
        key: DATASET_KEY,
        provider: "gtfs",
        identityNamespace: "toei-gtfs",
      },
      scheduledRouting: {
        kind: "supported",
        topology: "direct",
        transferCount: 0,
        scheduledServiceCount: 839,
        scheduledStopTimeCount: 30323,
      },
      runtimeVerification: {
        status: "not_evaluated",
        reason: "no_authoritative_service_date_or_departure_time",
      },
    });
  });

  it("clears C4E product gates while retaining only C4D runtime blockers", () => {
    const report = buildKai292C4EPrerequisiteAudit(ROOT);
    expect(report.status).toBe("prerequisites_satisfied");
    expect(report.exactEndpointIdentityPairs).toHaveLength(1);
    expect(report.exactEndpointIdentityPairs[0]).toMatchObject({
      originProductId: ORIGIN_PRODUCT_ID,
      destinationProductId: DESTINATION_PRODUCT_ID,
      datasetId: DATASET_KEY,
      provider: "gtfs",
      identityNamespace: "toei-gtfs",
    });
    expect(report.gates.every(({ satisfied }) => satisfied)).toBe(true);
    expect(report.blockers).toEqual([]);
    expect(report.c4d.blockers.map(({ code }) => code)).toEqual([
      "no_authoritative_service_date_or_departure_time",
    ]);
    expect(report.c4d.status).toBe("controlled_runtime_proof_verified");
  });

  it("keeps Sakata as non-product evidence", () => {
    const report = auditRealMegurutoCorridor(ROOT);
    expect(report.normalizedEvidence.validRegisteredDatasetKeys).toEqual([
      "sakata-runrunbus",
      DATASET_KEY,
    ]);
    expect(report.crosswalk.nonCatalogueMappingIds).toEqual([
      "kai-292c2-pilot-destination-sakata-17-01",
      "kai-292c2-pilot-origin-sakata-100-01",
      "kai-292c4g-origin-toei-oedo-shinjuku-nishiguchi",
    ]);
    expect(
      report.realCorridors.every(({ dataset }) => dataset.key === DATASET_KEY),
    ).toBe(true);
  });
});
