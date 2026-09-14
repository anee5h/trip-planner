import {
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  auditRealMegurutoCorridor,
  assessScheduledRoutingCoverage,
  type RealCorridorAudit,
  type ScheduledRoutingCoverageResult,
} from "../audit-kai-292c4a-real-corridor";
import {
  resolveScheduledTransitEndpoint,
  SCHEDULED_TRANSIT_CROSSWALK,
  type ScheduledTransitCrosswalkEntry,
} from "../../../src/shared/services/transport/static/scheduledTransitEndpoint";
import { validateScheduledTransitDataset } from "../../../src/shared/services/transport/static/scheduledTransitDataset";
import { SAKATA_RUNRUNBUS_DATASET } from "../../../src/shared/services/transport/static/scheduledTransitDatasetRegistry";
import { MEGURUTO_SAME_STOP_TRANSFER_MIN_SECONDS } from "../../../src/shared/services/transport/static/oneTransferScheduledJourneyRouter";
import type {
  TransitCoverageState,
  TransitTransfer,
} from "../../../src/shared/services/transport/static/transitGraphTypes";

const REPOSITORY_ROOT = process.cwd();
const CATALOGUE_PATH = "src/shared/data/destinations-index.json";
const CROSSWALK_PATH =
  "src/shared/data/scheduled-transit-endpoint-crosswalk.json";
const IDENTITY_EVIDENCE_PATH =
  "qa/kai-292c4a/real-corridor-identity-evidence.json";
const PILOT_ANCHORS_PATH = "qa/kai-291/destination-station-anchors.json";
const DATASET_PATH = "public/data/transit/sakata-runrunbus.json";

const CATALOGUE = JSON.parse(
  readText(join(REPOSITORY_ROOT, CATALOGUE_PATH)),
) as readonly { id: string; name?: string; coordinates?: unknown }[];
const DATASET = validateScheduledTransitDataset(
  JSON.parse(readText(join(REPOSITORY_ROOT, DATASET_PATH))) as unknown,
  SAKATA_RUNRUNBUS_DATASET,
);
const PILOT_ORIGIN = SCHEDULED_TRANSIT_CROSSWALK.mappings[0];
const PILOT_DESTINATION = SCHEDULED_TRANSIT_CROSSWALK.mappings[1];
if (PILOT_ORIGIN === undefined || PILOT_DESTINATION === undefined) {
  throw new Error("C2 pilot crosswalk is incomplete");
}

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function readText(path: string): string {
  return readFileSync(path, "utf8");
}

function writeJson(root: string, relativePath: string, value: unknown): void {
  const path = join(root, relativePath);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function copyFixtureFile(root: string, relativePath: string): void {
  const destination = join(root, relativePath);
  mkdirSync(join(destination, ".."), { recursive: true });
  copyFileSync(join(REPOSITORY_ROOT, relativePath), destination);
}

function normalizedStopId(providerStopId: string): string {
  return `gtfs:stop:gtfs%3Asakata-runrunbus:${providerStopId}`;
}

function providerStopId(stopId: string): string {
  return `gtfs:stop:gtfs%3Asakata-runrunbus:${stopId}`;
}

function serviceFacts(serviceId: string) {
  return DATASET.graph
    .scheduledStopTimes!.filter((fact) => fact.serviceId === serviceId)
    .sort((left, right) => left.order - right.order);
}

function serviceWithFirstStop(stopId: string, secondStopId?: string) {
  const service = DATASET.graph.scheduledServices!.find((candidate) => {
    const facts = serviceFacts(candidate.id);
    return (
      facts[0]?.stopId === providerStopId(stopId) &&
      (secondStopId === undefined ||
        facts[1]?.stopId === providerStopId(secondStopId))
    );
  });
  if (service === undefined) {
    throw new Error(`synthetic service fixture is missing ${stopId}`);
  }
  return service;
}

function explicitTransfer(
  id: string,
  fromServiceId: string,
  toServiceId: string,
  fromStopId: string,
  toStopId: string,
  transferType: 0 | 1 | 2 | 3 | 4 | 5 = 0,
  minimumTransferSeconds: number | null = null,
): TransitTransfer {
  const fromService = DATASET.graph.scheduledServices!.find(
    (service) => service.id === fromServiceId,
  );
  const toService = DATASET.graph.scheduledServices!.find(
    (service) => service.id === toServiceId,
  );
  if (fromService === undefined || toService === undefined) {
    throw new Error("synthetic transfer fixture references an unknown service");
  }
  return {
    id,
    provider: "gtfs",
    fromStopId: providerStopId(fromStopId),
    toStopId: providerStopId(toStopId),
    fromRouteId: fromService.routeId,
    toRouteId: toService.routeId,
    fromServiceId,
    toServiceId,
    minimumTransferSeconds,
    sourceSemantics: { provider: "gtfs", transferType },
    provenance: fromService.provenance,
  };
}

function datasetWithTransfers(
  transfers: readonly TransitTransfer[],
  transferCoverage: TransitCoverageState = "imported",
) {
  return {
    ...DATASET,
    graph: { ...DATASET.graph, transfers },
    coverage: {
      ...DATASET.coverage,
      entries: DATASET.coverage.entries.map((entry) => ({
        ...entry,
        transfers: transferCoverage,
      })),
    },
  };
}

function datasetWithServices(
  serviceIds: readonly string[],
  transfers: readonly TransitTransfer[] = [],
  transferCoverage: TransitCoverageState = "imported",
) {
  const allowedServiceIds = new Set(serviceIds);
  const source = datasetWithTransfers(transfers, transferCoverage);
  return {
    ...source,
    graph: {
      ...source.graph,
      scheduledServices: source.graph.scheduledServices!.filter((service) =>
        allowedServiceIds.has(service.id),
      ),
      scheduledStopTimes: source.graph.scheduledStopTimes!.filter((fact) =>
        allowedServiceIds.has(fact.serviceId),
      ),
    },
  };
}

function datasetWithOutgoingDeparture(
  source: ReturnType<typeof datasetWithServices>,
  serviceId: string,
  stopId: string,
  departureServiceSeconds: number,
) {
  return {
    ...source,
    graph: {
      ...source.graph,
      scheduledStopTimes: source.graph.scheduledStopTimes!.map((fact) =>
        fact.serviceId === serviceId && fact.stopId === stopId
          ? { ...fact, departureServiceSeconds }
          : fact,
      ),
    },
  };
}

const STRUCTURAL_ORIGIN_STOP_ID = providerStopId("70_01");
const STRUCTURAL_DIRECT_ORIGIN_STOP_ID = providerStopId("100_01");
const STRUCTURAL_DIRECT_DESTINATION_STOP_ID = providerStopId("17_01");
const STRUCTURAL_TRANSFER_DESTINATION_STOP_ID = providerStopId("2_02");
const STRUCTURAL_TWO_TRANSFER_DESTINATION_STOP_ID = providerStopId("56_02");
const FIRST_STRUCTURAL_SERVICE = serviceWithFirstStop("70_01");
const SECOND_STRUCTURAL_SERVICE = serviceWithFirstStop("1_01", "2_02");
const THIRD_STRUCTURAL_SERVICE = serviceWithFirstStop("5_01", "56_02");

function productMapping(
  template: ScheduledTransitCrosswalkEntry,
  endpointProductId: string,
  mappingId: string,
  providerStopId: string,
  scopeChanges: Partial<
    Pick<
      ScheduledTransitCrosswalkEntry,
      "datasetId" | "provider" | "identityNamespace"
    >
  > = {},
): ScheduledTransitCrosswalkEntry {
  return {
    ...template,
    mappingId,
    endpoint: { ...template.endpoint, productId: endpointProductId },
    providerStopId,
    normalizedStopId: normalizedStopId(providerStopId),
    ...scopeChanges,
    provenance: {
      ...template.provenance,
      evidenceId: `${mappingId}-evidence`,
      statement: `Reviewed exact mapping for ${endpointProductId} to provider stop ${providerStopId}.`,
    },
  };
}

function futureFixture(
  options: {
    readonly originStopId?: string;
    readonly destinationStopId?: string;
    readonly scopeChanges?: Partial<
      Pick<
        ScheduledTransitCrosswalkEntry,
        "datasetId" | "provider" | "identityNamespace"
      >
    >;
  } = {},
): string {
  const root = mkdtempSync(join(REPOSITORY_ROOT, ".tmp-kai-292c4a-"));
  temporaryRoots.push(root);
  copyFixtureFile(root, CATALOGUE_PATH);
  copyFixtureFile(root, CROSSWALK_PATH);
  copyFixtureFile(root, IDENTITY_EVIDENCE_PATH);
  copyFixtureFile(root, PILOT_ANCHORS_PATH);
  copyFixtureFile(root, DATASET_PATH);

  const destinationId = "future-reviewed-destination";
  const originProductId = "future-reviewed-origin";
  const originMapping = productMapping(
    PILOT_ORIGIN,
    originProductId,
    "future-origin-exact-mapping",
    options.originStopId ?? "100_01",
    options.scopeChanges,
  );
  const destinationMapping = productMapping(
    PILOT_DESTINATION,
    destinationId,
    "future-destination-exact-mapping",
    options.destinationStopId ?? "17_01",
    options.scopeChanges,
  );

  const catalogue = JSON.parse(readText(join(root, CATALOGUE_PATH))) as {
    id: string;
  }[];
  catalogue.push({ id: destinationId });
  writeJson(root, CATALOGUE_PATH, catalogue);

  const crosswalk = JSON.parse(readText(join(root, CROSSWALK_PATH))) as {
    schemaVersion: number;
    mappings: ScheduledTransitCrosswalkEntry[];
  };
  crosswalk.mappings.push(originMapping, destinationMapping);
  writeJson(root, CROSSWALK_PATH, crosswalk);

  writeJson(root, IDENTITY_EVIDENCE_PATH, {
    schemaVersion: 1,
    originIdentities: [
      {
        identityKind: "product",
        identityStability: "stable_product_id",
        reviewStatus: "reviewed",
        productId: originProductId,
        evidenceId: "future-origin-product-evidence",
        statement:
          "Synthetic reviewed product identity used only to prove data-driven discovery.",
        sourceUrl: "https://example.invalid/future-origin-evidence",
        checkedAt: "2026-09-13T00:00:00.000Z",
      },
    ],
  });
  return root;
}

describe("KAI-292C4A real Meguruto corridor audit", () => {
  it("reports direct scheduled topology/timetable support without a Journey", () => {
    const result: ScheduledRoutingCoverageResult =
      assessScheduledRoutingCoverage(
        DATASET,
        STRUCTURAL_DIRECT_ORIGIN_STOP_ID,
        STRUCTURAL_DIRECT_DESTINATION_STOP_ID,
      );

    expect(result).toMatchObject({
      kind: "supported",
      topology: "direct",
      transferCount: 0,
    });
    expect("journey" in result).toBe(false);
  });

  it("reports an exact one-transfer scheduled topology when direct service is absent", () => {
    const result = assessScheduledRoutingCoverage(
      datasetWithTransfers([
        explicitTransfer(
          "synthetic-one-transfer",
          FIRST_STRUCTURAL_SERVICE.id,
          SECOND_STRUCTURAL_SERVICE.id,
          "69_01",
          "1_01",
          1,
        ),
      ]),
      STRUCTURAL_ORIGIN_STOP_ID,
      STRUCTURAL_TRANSFER_DESTINATION_STOP_ID,
    );

    expect(result).toMatchObject({
      kind: "supported",
      topology: "exactly_one_transfer",
      transferCount: 1,
      transfer: {
        fromStopId: providerStopId("69_01"),
        toStopId: providerStopId("1_01"),
        ruleId: "synthetic-one-transfer",
        transferBasis: "provider_transfer_rule",
      },
    });
    expect("journey" in result).toBe(false);
  });

  it("supports a type-1 timed transfer with non-negative chronology", () => {
    const result = assessScheduledRoutingCoverage(
      datasetWithServices(
        [FIRST_STRUCTURAL_SERVICE.id, SECOND_STRUCTURAL_SERVICE.id],
        [
          explicitTransfer(
            "synthetic-type-1-valid",
            FIRST_STRUCTURAL_SERVICE.id,
            SECOND_STRUCTURAL_SERVICE.id,
            "69_01",
            "1_01",
            1,
          ),
        ],
      ),
      STRUCTURAL_ORIGIN_STOP_ID,
      STRUCTURAL_TRANSFER_DESTINATION_STOP_ID,
    );

    expect(result).toMatchObject({
      kind: "supported",
      topology: "exactly_one_transfer",
      transfer: {
        ruleId: "synthetic-type-1-valid",
        transferType: 1,
        transferBasis: "provider_transfer_rule",
      },
    });
  });

  it("blocks a type-1 timed transfer with negative chronology", () => {
    const source = datasetWithServices(
      [FIRST_STRUCTURAL_SERVICE.id, SECOND_STRUCTURAL_SERVICE.id],
      [
        explicitTransfer(
          "synthetic-type-1-negative",
          FIRST_STRUCTURAL_SERVICE.id,
          SECOND_STRUCTURAL_SERVICE.id,
          "69_01",
          "1_01",
          1,
        ),
      ],
    );
    const result = assessScheduledRoutingCoverage(
      datasetWithOutgoingDeparture(
        source,
        SECOND_STRUCTURAL_SERVICE.id,
        providerStopId("1_01"),
        25260,
      ),
      STRUCTURAL_ORIGIN_STOP_ID,
      STRUCTURAL_TRANSFER_DESTINATION_STOP_ID,
    );

    expect(result).toMatchObject({
      kind: "blocked",
      reason: "transfer_evidence_inconclusive",
    });
  });

  it("supports a type-2 transfer when the provider minimum is satisfied", () => {
    const result = assessScheduledRoutingCoverage(
      datasetWithServices(
        [FIRST_STRUCTURAL_SERVICE.id, SECOND_STRUCTURAL_SERVICE.id],
        [
          explicitTransfer(
            "synthetic-type-2-satisfied",
            FIRST_STRUCTURAL_SERVICE.id,
            SECOND_STRUCTURAL_SERVICE.id,
            "69_01",
            "1_01",
            2,
            780,
          ),
        ],
      ),
      STRUCTURAL_ORIGIN_STOP_ID,
      STRUCTURAL_TRANSFER_DESTINATION_STOP_ID,
    );

    expect(result).toMatchObject({
      kind: "supported",
      transfer: {
        ruleId: "synthetic-type-2-satisfied",
        transferType: 2,
        transferBasis: "provider_transfer_rule",
      },
    });
  });

  it("blocks a type-2 transfer when the provider minimum is missing", () => {
    const result = assessScheduledRoutingCoverage(
      datasetWithServices(
        [FIRST_STRUCTURAL_SERVICE.id, SECOND_STRUCTURAL_SERVICE.id],
        [
          explicitTransfer(
            "synthetic-type-2-missing-minimum",
            FIRST_STRUCTURAL_SERVICE.id,
            SECOND_STRUCTURAL_SERVICE.id,
            "16_01",
            "16_01",
            2,
          ),
        ],
      ),
      STRUCTURAL_ORIGIN_STOP_ID,
      providerStopId("14_01"),
    );

    expect(result).toMatchObject({
      kind: "blocked",
      reason: "transfer_evidence_inconclusive",
    });
  });

  it("does not support a type-2 transfer with insufficient time", () => {
    const result = assessScheduledRoutingCoverage(
      datasetWithServices(
        [FIRST_STRUCTURAL_SERVICE.id, SECOND_STRUCTURAL_SERVICE.id],
        [
          explicitTransfer(
            "synthetic-type-2-insufficient",
            FIRST_STRUCTURAL_SERVICE.id,
            SECOND_STRUCTURAL_SERVICE.id,
            "16_01",
            "16_01",
            2,
            1681,
          ),
        ],
      ),
      STRUCTURAL_ORIGIN_STOP_ID,
      providerStopId("14_01"),
    );

    expect(result).toMatchObject({
      kind: "blocked",
      reason: "no_direct_or_one_transfer_supported_topology",
    });
  });

  it("supports a type-0 transfer when its provider minimum is satisfied", () => {
    const result = assessScheduledRoutingCoverage(
      datasetWithServices(
        [FIRST_STRUCTURAL_SERVICE.id, SECOND_STRUCTURAL_SERVICE.id],
        [
          explicitTransfer(
            "synthetic-type-0-satisfied",
            FIRST_STRUCTURAL_SERVICE.id,
            SECOND_STRUCTURAL_SERVICE.id,
            "69_01",
            "1_01",
            0,
            600,
          ),
        ],
      ),
      STRUCTURAL_ORIGIN_STOP_ID,
      STRUCTURAL_TRANSFER_DESTINATION_STOP_ID,
    );

    expect(result).toMatchObject({
      kind: "supported",
      transfer: {
        ruleId: "synthetic-type-0-satisfied",
        transferType: 0,
        transferBasis: "provider_transfer_rule",
      },
    });
  });

  it("does not support a type-0 transfer with insufficient time", () => {
    const result = assessScheduledRoutingCoverage(
      datasetWithServices(
        [FIRST_STRUCTURAL_SERVICE.id, SECOND_STRUCTURAL_SERVICE.id],
        [
          explicitTransfer(
            "synthetic-type-0-insufficient",
            FIRST_STRUCTURAL_SERVICE.id,
            SECOND_STRUCTURAL_SERVICE.id,
            "16_01",
            "16_01",
            0,
            1681,
          ),
        ],
      ),
      STRUCTURAL_ORIGIN_STOP_ID,
      providerStopId("14_01"),
    );

    expect(result).toMatchObject({
      kind: "blocked",
      reason: "no_direct_or_one_transfer_supported_topology",
    });
  });

  it("uses the Meguruto policy for a type-0 same-stop rule without a minimum", () => {
    const result = assessScheduledRoutingCoverage(
      datasetWithServices(
        [FIRST_STRUCTURAL_SERVICE.id, SECOND_STRUCTURAL_SERVICE.id],
        [
          explicitTransfer(
            "synthetic-type-0-same-stop-policy",
            FIRST_STRUCTURAL_SERVICE.id,
            SECOND_STRUCTURAL_SERVICE.id,
            "16_01",
            "16_01",
            0,
          ),
        ],
      ),
      STRUCTURAL_ORIGIN_STOP_ID,
      providerStopId("14_01"),
    );

    expect(result).toMatchObject({
      kind: "supported",
      transfer: {
        ruleId: "synthetic-type-0-same-stop-policy",
        transferType: 0,
        transferBasis: "meguruto_same_stop_policy",
      },
    });
  });

  it("blocks a type-0 rule without a minimum between different stops", () => {
    const result = assessScheduledRoutingCoverage(
      datasetWithServices(
        [FIRST_STRUCTURAL_SERVICE.id, SECOND_STRUCTURAL_SERVICE.id],
        [
          explicitTransfer(
            "synthetic-type-0-different-stops",
            FIRST_STRUCTURAL_SERVICE.id,
            SECOND_STRUCTURAL_SERVICE.id,
            "69_01",
            "1_01",
            0,
          ),
        ],
      ),
      STRUCTURAL_ORIGIN_STOP_ID,
      STRUCTURAL_TRANSFER_DESTINATION_STOP_ID,
    );

    expect(result).toMatchObject({
      kind: "blocked",
      reason: "transfer_evidence_inconclusive",
    });
  });

  it.each([4, 5] as const)(
    "blocks unsupported type-%s transfer evidence",
    (transferType) => {
      const result = assessScheduledRoutingCoverage(
        datasetWithServices(
          [FIRST_STRUCTURAL_SERVICE.id, SECOND_STRUCTURAL_SERVICE.id],
          [
            explicitTransfer(
              `synthetic-type-${transferType}-unsupported`,
              FIRST_STRUCTURAL_SERVICE.id,
              SECOND_STRUCTURAL_SERVICE.id,
              "16_01",
              "16_01",
              transferType,
            ),
          ],
        ),
        STRUCTURAL_ORIGIN_STOP_ID,
        providerStopId("14_01"),
      );

      expect(result).toMatchObject({
        kind: "blocked",
        reason: "transfer_evidence_inconclusive",
      });
    },
  );

  it.each([
    ["non-numeric", "600"],
    ["negative", -1],
    ["non-finite", Number.NaN],
  ] as const)(
    "treats %s provider minimum evidence as inconclusive",
    (_label, minimumTransferSeconds) => {
      const transfer = {
        ...explicitTransfer(
          "synthetic-malformed-minimum",
          FIRST_STRUCTURAL_SERVICE.id,
          SECOND_STRUCTURAL_SERVICE.id,
          "16_01",
          "16_01",
          0,
        ),
        minimumTransferSeconds,
      } as unknown as TransitTransfer;
      const result = assessScheduledRoutingCoverage(
        datasetWithServices(
          [FIRST_STRUCTURAL_SERVICE.id, SECOND_STRUCTURAL_SERVICE.id],
          [transfer],
        ),
        STRUCTURAL_ORIGIN_STOP_ID,
        providerStopId("14_01"),
      );

      expect(result).toMatchObject({
        kind: "blocked",
        reason: "transfer_evidence_inconclusive",
      });
    },
  );

  it("supports an exact same normalized stop without an explicit provider rule", () => {
    const result = assessScheduledRoutingCoverage(
      datasetWithTransfers([], "not_imported_in_this_slice"),
      STRUCTURAL_ORIGIN_STOP_ID,
      providerStopId("14_01"),
    );

    expect(MEGURUTO_SAME_STOP_TRANSFER_MIN_SECONDS).toBe(300);

    expect(result).toMatchObject({
      kind: "supported",
      topology: "exactly_one_transfer",
      transferCount: 1,
      transfer: {
        fromStopId: providerStopId("16_01"),
        toStopId: providerStopId("16_01"),
        firstServiceId: FIRST_STRUCTURAL_SERVICE.id,
        secondServiceId: SECOND_STRUCTURAL_SERVICE.id,
        transferBasis: "meguruto_same_stop_policy",
      },
    });
    if (result.kind !== "supported" || result.transfer === undefined) {
      throw new Error("expected same-stop structural support");
    }
    expect(result.transfer.fromStopId).toBe(result.transfer.toStopId);
    expect(result.transfer.ruleId).toBeUndefined();
    expect(result.transfer.transferType).toBeUndefined();
  });

  it("blocks different stops without an explicit provider rule", () => {
    const result = assessScheduledRoutingCoverage(
      datasetWithServices([
        FIRST_STRUCTURAL_SERVICE.id,
        THIRD_STRUCTURAL_SERVICE.id,
      ]),
      STRUCTURAL_ORIGIN_STOP_ID,
      providerStopId("27_02"),
    );

    expect(result).toMatchObject({
      kind: "blocked",
      reason: "transfer_evidence_missing",
    });
  });

  it("blocks an exact same stop when a type-3 provider rule prohibits it", () => {
    const result = assessScheduledRoutingCoverage(
      datasetWithServices(
        [FIRST_STRUCTURAL_SERVICE.id, SECOND_STRUCTURAL_SERVICE.id],
        [
          explicitTransfer(
            "synthetic-same-stop-prohibition",
            FIRST_STRUCTURAL_SERVICE.id,
            SECOND_STRUCTURAL_SERVICE.id,
            "16_01",
            "16_01",
            3,
          ),
        ],
      ),
      STRUCTURAL_ORIGIN_STOP_ID,
      providerStopId("14_01"),
    );

    expect(result).toMatchObject({
      kind: "blocked",
      reason: "transfer_evidence_inconclusive",
    });
  });

  it("blocks a structure that requires two explicit transfers", () => {
    const result = assessScheduledRoutingCoverage(
      datasetWithServices(
        [
          FIRST_STRUCTURAL_SERVICE.id,
          SECOND_STRUCTURAL_SERVICE.id,
          THIRD_STRUCTURAL_SERVICE.id,
        ],
        [
          explicitTransfer(
            "synthetic-first-transfer",
            FIRST_STRUCTURAL_SERVICE.id,
            SECOND_STRUCTURAL_SERVICE.id,
            "69_01",
            "1_01",
            1,
          ),
          explicitTransfer(
            "synthetic-second-transfer",
            SECOND_STRUCTURAL_SERVICE.id,
            THIRD_STRUCTURAL_SERVICE.id,
            "2_02",
            "5_01",
            1,
          ),
        ],
      ),
      STRUCTURAL_ORIGIN_STOP_ID,
      STRUCTURAL_TWO_TRANSFER_DESTINATION_STOP_ID,
    );

    expect(result).toMatchObject({
      kind: "blocked",
      reason: "no_direct_or_one_transfer_supported_topology",
    });
  });

  it.each([
    [
      "ambiguous",
      [
        explicitTransfer(
          "synthetic-ambiguous-transfer-a",
          FIRST_STRUCTURAL_SERVICE.id,
          SECOND_STRUCTURAL_SERVICE.id,
          "69_01",
          "1_01",
        ),
        explicitTransfer(
          "synthetic-ambiguous-transfer-b",
          FIRST_STRUCTURAL_SERVICE.id,
          SECOND_STRUCTURAL_SERVICE.id,
          "69_01",
          "1_01",
        ),
      ],
      "transfer_evidence_ambiguous",
    ],
    [
      "unsupported",
      [
        explicitTransfer(
          "synthetic-unsupported-transfer",
          FIRST_STRUCTURAL_SERVICE.id,
          SECOND_STRUCTURAL_SERVICE.id,
          "69_01",
          "1_01",
          4,
        ),
      ],
      "transfer_evidence_inconclusive",
    ],
    [
      "untrusted",
      [
        explicitTransfer(
          "synthetic-untrusted-transfer",
          FIRST_STRUCTURAL_SERVICE.id,
          SECOND_STRUCTURAL_SERVICE.id,
          "69_01",
          "1_01",
        ),
      ],
      "transfer_evidence_untrusted",
    ],
  ])(
    "blocks %s transfer evidence for an otherwise one-transfer topology",
    (_label, transfers, reason) => {
      const result = assessScheduledRoutingCoverage(
        datasetWithServices(
          [FIRST_STRUCTURAL_SERVICE.id, SECOND_STRUCTURAL_SERVICE.id],
          transfers,
          _label === "untrusted" ? "partial" : "imported",
        ),
        STRUCTURAL_ORIGIN_STOP_ID,
        STRUCTURAL_TRANSFER_DESTINATION_STOP_ID,
      );

      expect(result).toMatchObject({ kind: "blocked", reason });
    },
  );

  it("returns the current concrete blocker without promoting Sakata or anchors", () => {
    const result: RealCorridorAudit = auditRealMegurutoCorridor();

    expect(result.schemaVersion).toBe("kai-292c4a-v4");
    expect(result.status).toBe("blocked_no_real_catalogue_corridor");
    expect(result.catalogue).toMatchObject({
      destinationCount: 1130,
      uniqueDestinationIdCount: 1130,
      destinationMappings: [],
    });
    expect(result.normalizedEvidence).toMatchObject({
      registeredDatasetKeys: ["sakata-runrunbus"],
      validRegisteredDatasetKeys: ["sakata-runrunbus"],
      unregisteredAssetUrls: [],
    });
    expect(result.crosswalk).toMatchObject({
      mappingCount: 2,
      catalogueProductMappings: [],
      nonCatalogueMappingIds: [
        "kai-292c2-pilot-destination-sakata-17-01",
        "kai-292c2-pilot-origin-sakata-100-01",
      ],
    });
    expect(result.originIdentity).toMatchObject({
      status: "missing_canonical_product_identity",
      reviewedProductIds: [],
    });
    expect(result.realCorridors).toEqual([]);
    expect(result.candidateBlockers).toEqual([]);
    expect(result.blockers.map(({ code }) => code)).toEqual([
      "missing_catalogue_destination_crosswalk",
      "missing_canonical_origin_identity",
      "pilot_only_normalized_evidence",
    ]);
  });

  it("reports the seven reviewed KAI-291A anchors as insufficient evidence", () => {
    const result = auditRealMegurutoCorridor();

    expect(result.reviewedAnchors).toMatchObject({
      source: PILOT_ANCHORS_PATH,
      status: "reviewed_insufficient_for_corridor",
      productionCrosswalk: false,
      stationToPoiAccess: "unproven",
    });
    expect(
      result.reviewedAnchors.anchors.map((anchor) => anchor.destinationId),
    ).toEqual([
      "shinjuku-gyo-en",
      "teamlab-borderless-azabudai",
      "ueno-park",
      "hamarikyu-gardens",
      "sumida-hokusai-museum",
      "ryogoku-kokugikan-sumo-museum",
      "sugamo-jizo-dori",
    ]);
    expect(result.crosswalk.catalogueProductMappings).toEqual([]);
  });

  it("discovers a future valid corridor from reviewed data changes only", () => {
    const result = auditRealMegurutoCorridor(futureFixture());

    expect(result.status).toBe("real_corridor_evidenced");
    expect(result.blockers).toEqual([]);
    expect(result.candidateBlockers).toEqual([]);
    expect(result.realCorridors).toMatchObject([
      {
        origin: {
          productId: "future-reviewed-origin",
          providerStopId: "100_01",
        },
        destination: {
          productId: "future-reviewed-destination",
          providerStopId: "17_01",
        },
        dataset: {
          key: "sakata-runrunbus",
          datasetId: "gtfs-jp-sakata-runrunbus-20260401",
          provider: "gtfs",
          identityNamespace: "gtfs:sakata-runrunbus",
        },
        timetable: {
          scheduledServiceCount: 49,
          scheduledStopTimeCount: 1961,
        },
        scheduledRouting: {
          kind: "supported",
          topology: "direct",
          transferCount: 0,
        },
        runtimeVerification: {
          status: "not_evaluated",
          reason: "no_authoritative_service_date_or_departure_time",
        },
      },
    ]);
  });

  it.each([
    ["dataset", { datasetId: "unregistered-dataset" }],
    ["provider", { provider: "odpt" as const }],
    ["namespace", { identityNamespace: "gtfs:other-feed" }],
  ])(
    "blocks a future candidate with the wrong %s scope",
    (_label, scopeChanges) => {
      const result = auditRealMegurutoCorridor(futureFixture({ scopeChanges }));

      expect(result.status).toBe("blocked_no_real_catalogue_corridor");
      expect(result.realCorridors).toEqual([]);
      expect(result.candidateBlockers).toContainEqual(
        expect.objectContaining({ code: "unregistered_dataset_scope" }),
      );
    },
  );

  it("does not use names, coordinates, nearest, or reviewed geographic anchors as fallbacks", () => {
    const chokai = CATALOGUE.find((record) => record.id === "chokai");
    expect(chokai).toMatchObject({
      name: expect.any(String),
      coordinates: expect.anything(),
    });

    const result = resolveScheduledTransitEndpoint({
      dataset: DATASET,
      endpoint: { kind: "destination", productId: chokai!.id },
    });

    expect(result).toMatchObject({
      kind: "unmapped",
      reason: "no_explicit_crosswalk",
    });
    expect(auditRealMegurutoCorridor().realCorridors).toEqual([]);
  });
});
