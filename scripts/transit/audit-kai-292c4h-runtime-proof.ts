#!/usr/bin/env node
/**
 * KAI-292C4H — deterministic controlled runtime proof for the real Toei Oedo
 * product corridor. The proof is generated from the committed trusted dataset
 * through the C2 endpoint resolver, C3 temporal resolver, scheduled Journey
 * boundary, C4B duration evidence, and C4C feasibility interpreter.
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { format, resolveConfig } from "prettier";

import {
  resolveFeasibilityEvidence,
  type ScheduledFeasibilityOutcome,
} from "../../src/shared/services/recommendation/ScheduledFeasibilityService";
import {
  getTransportDurationEvidence,
  type ScheduledTransportDurationEvidence,
} from "../../src/shared/services/transport/TransportDurationEvidence";
import {
  resolveScheduledRoutingTemporalContext,
  type ScheduledRoutingTemporalContext,
  type ScheduledRoutingServiceDaySeconds,
} from "../../src/shared/services/transport/static/scheduledRoutingTemporal";
import {
  routeScheduledTransitWithTemporalContext,
  type ScheduledTransitRoutingBoundaryResult,
} from "../../src/shared/services/transport/static/scheduledTransitRoutingBoundary";
import {
  validateScheduledTransitDataset,
  type ScheduledTransitDataset,
} from "../../src/shared/services/transport/static/scheduledTransitDataset";
import { getScheduledTransitDatasetDescriptor } from "../../src/shared/services/transport/static/scheduledTransitDatasetRegistry";
import { resolveScheduledTransitEndpoint } from "../../src/shared/services/transport/static/scheduledTransitEndpoint";

export const KAI_292C4H_RUNTIME_PROOF_PATH =
  "qa/kai-292c4h/controlled-runtime-proof.json" as const;
export const KAI_292C4H_RUNTIME_PROOF_SCHEMA_VERSION = "kai-292c4h-v1" as const;
export const KAI_292C4H_DATASET_KEY = "toei-oedo-gtfs-20260314" as const;
export const KAI_292C4H_ORIGIN_PRODUCT_ID =
  "toei-oedo-shinjuku-nishiguchi" as const;
export const KAI_292C4H_DESTINATION_PRODUCT_ID = "hamarikyu-gardens" as const;
export const KAI_292C4H_SERVICE_DATE = "2026-09-15" as const;
export const KAI_292C4H_EARLIEST_DEPARTURE_TIME = "05:00:00" as const;
export const KAI_292C4H_EVIDENCE_ID =
  "kai-292c4h-toei-oedo-controlled-runtime" as const;

export interface Kai292C4HRuntimeProof {
  readonly schemaVersion: typeof KAI_292C4H_RUNTIME_PROOF_SCHEMA_VERSION;
  readonly status: "verified_controlled_runtime";
  readonly generatedBy: "scripts/transit/audit-kai-292c4h-runtime-proof.ts";
  readonly corridor: {
    readonly originProductId: typeof KAI_292C4H_ORIGIN_PRODUCT_ID;
    readonly destinationProductId: typeof KAI_292C4H_DESTINATION_PRODUCT_ID;
    readonly direction: "outbound";
    readonly datasetKey: typeof KAI_292C4H_DATASET_KEY;
    readonly datasetId: string;
    readonly provider: "gtfs";
    readonly identityNamespace: string;
  };
  readonly temporal: {
    readonly source: "controlled_internal_test_fixture";
    readonly evidenceId: typeof KAI_292C4H_EVIDENCE_ID;
    readonly serviceDate: string;
    readonly earliestDepartureTime: typeof KAI_292C4H_EARLIEST_DEPARTURE_TIME;
    readonly earliestDepartureServiceSeconds: number;
    readonly timeZone: "Asia/Tokyo";
  };
  readonly journey: {
    readonly kind: "journey";
    readonly selected: "direct";
    readonly legCount: number;
    readonly transferCount: 0;
    readonly serviceId: string;
    readonly providerServiceId: string;
    readonly routeId: string;
    readonly providerRouteId: string;
    readonly routeName: string | null;
    readonly operatorId: string;
    readonly providerOperatorId: string;
    readonly originStopId: string;
    readonly originProviderStopId: string;
    readonly destinationStopId: string;
    readonly destinationProviderStopId: string;
    readonly actualDepartureServiceSeconds: number;
    readonly actualArrivalServiceSeconds: number;
    readonly durationSeconds: number;
    readonly durationMinutes: number;
    readonly checkedAt: string;
    readonly journeySource: "gtfs_scheduled_timetable";
  };
  readonly c4b: {
    readonly kind: "scheduled_journey";
    readonly evidence: "verified";
    readonly transferCount: number;
    readonly serviceDate: string;
    readonly departureServiceSeconds: number;
    readonly arrivalServiceSeconds: number;
    readonly durationSeconds: number;
    readonly durationMinutes: readonly [number, number];
  };
  readonly c4c: {
    readonly kind: "verified_scheduled_journey";
    readonly source: "scheduled";
    readonly selected: "direct";
    readonly datasetId: string;
    readonly contentHash: string;
  };
  readonly safety: {
    readonly productionBoundary: true;
    readonly mockedJourney: false;
    readonly syntheticTransitGraph: false;
    readonly sakataSubstitute: false;
    readonly returnTimeInvented: false;
  };
}

const ROOT = process.cwd();

function readCommittedDataset(rootDir: string): ScheduledTransitDataset {
  const descriptor = getScheduledTransitDatasetDescriptor(
    KAI_292C4H_DATASET_KEY,
  );
  const assetPath = resolve(rootDir, "public", descriptor.assetUrl.slice(1));
  return validateScheduledTransitDataset(
    JSON.parse(readFileSync(assetPath, "utf8")) as unknown,
    descriptor,
  );
}

function resolvedTemporal(): Extract<
  ReturnType<typeof resolveScheduledRoutingTemporalContext>,
  { status: "resolved" }
> {
  const temporal = resolveScheduledRoutingTemporalContext({
    serviceDate: KAI_292C4H_SERVICE_DATE,
    earliestDepartureTime: KAI_292C4H_EARLIEST_DEPARTURE_TIME,
    source: "controlled_internal_test_fixture",
    evidenceId: KAI_292C4H_EVIDENCE_ID,
  });
  if (temporal.status !== "resolved") {
    throw new Error(
      `C4H controlled temporal input did not resolve: ${JSON.stringify(temporal)}`,
    );
  }
  return temporal;
}

function resolvedBoundary(
  dataset: ScheduledTransitDataset,
  temporal: Extract<
    ReturnType<typeof resolveScheduledRoutingTemporalContext>,
    { status: "resolved" }
  >,
): Extract<ScheduledTransitRoutingBoundaryResult, { status: "routed" }> {
  const origin = resolveScheduledTransitEndpoint({
    dataset,
    endpoint: {
      kind: "origin",
      productId: KAI_292C4H_ORIGIN_PRODUCT_ID,
    },
  });
  const destination = resolveScheduledTransitEndpoint({
    dataset,
    endpoint: {
      kind: "destination",
      productId: KAI_292C4H_DESTINATION_PRODUCT_ID,
    },
  });
  if (origin.kind !== "resolved" || destination.kind !== "resolved") {
    throw new Error(
      `C4H endpoint resolution did not resolve: ${JSON.stringify({ origin, destination })}`,
    );
  }
  const boundary = routeScheduledTransitWithTemporalContext({
    dataset,
    origin,
    destination,
    temporal,
    direction: "outbound",
  });
  if (boundary.status !== "routed") {
    throw new Error(
      `C4H routing boundary did not route: ${JSON.stringify(boundary)}`,
    );
  }
  if (boundary.result.kind !== "verified") {
    throw new Error(
      `C4H route was not verified: ${JSON.stringify(boundary.result)}`,
    );
  }
  if (boundary.result.selected !== "direct") {
    throw new Error("C4H requires the direct Journey strategy.");
  }
  return boundary;
}

function c4bEvidence(
  boundary: Extract<
    ScheduledTransitRoutingBoundaryResult,
    { status: "routed" }
  >,
  temporal: ScheduledRoutingTemporalContext,
): ScheduledTransportDurationEvidence {
  if (boundary.result.kind !== "verified") {
    throw new Error("C4B requires a verified scheduled Journey.");
  }
  const evidence = getTransportDurationEvidence({
    scheduledJourney: {
      journey: boundary.result.journey,
      transferCount: boundary.result.transferCount,
      schedule: {
        serviceDate: temporal.serviceDate,
        departureServiceSeconds: boundary.result.evidence
          .initialDepartureServiceSeconds as ScheduledRoutingServiceDaySeconds,
        arrivalServiceSeconds: boundary.result.evidence
          .finalArrivalServiceSeconds as ScheduledRoutingServiceDaySeconds,
      },
      totalDurationSeconds: boundary.result.evidence.totalDurationSeconds,
    },
  });
  if (evidence.kind !== "scheduled_journey") {
    throw new Error(
      `C4B rejected the real Journey: ${JSON.stringify(evidence)}`,
    );
  }
  return evidence;
}

function c4cEvidence(
  boundary: ScheduledTransitRoutingBoundaryResult,
): Extract<
  ScheduledFeasibilityOutcome,
  { kind: "verified_scheduled_journey" }
> {
  const evidence = resolveFeasibilityEvidence({ scheduled: boundary });
  if (evidence.kind !== "verified_scheduled_journey") {
    throw new Error(
      `C4C rejected the real Journey: ${JSON.stringify(evidence)}`,
    );
  }
  return evidence;
}

export function buildKai292C4HRuntimeProof(
  rootDir = ROOT,
): Kai292C4HRuntimeProof {
  const dataset = readCommittedDataset(rootDir);
  const temporal = resolvedTemporal();
  const boundary = resolvedBoundary(dataset, temporal);
  const c4b = c4bEvidence(boundary, temporal.context);
  const c4c = c4cEvidence(boundary);
  if (boundary.result.kind !== "verified") {
    throw new Error("C4H proof requires a verified result.");
  }
  if (boundary.result.transferCount !== 0) {
    throw new Error("C4H proof requires a direct zero-transfer Journey.");
  }
  if (boundary.result.selected !== "direct" || c4c.selected !== "direct") {
    throw new Error("C4H proof requires the direct Journey strategy.");
  }
  const selected = boundary.result.evidence.selectedJourneyEvidence;
  if (
    selected === undefined ||
    selected.source !== "gtfs_scheduled_timetable" ||
    !("serviceId" in selected)
  ) {
    throw new Error("C4H proof requires direct GTFS scheduled evidence.");
  }
  const leg = boundary.result.journey.legs[0];
  if (leg === undefined || leg.routeMetadata === undefined) {
    throw new Error(
      "C4H proof requires one canonical Journey leg with route metadata.",
    );
  }
  const origin = boundary.result.journey.origin;
  const destination = boundary.result.journey.destination;
  if (origin.id === undefined || destination.id === undefined) {
    throw new Error(
      "C4H proof requires canonical origin and destination stop ids.",
    );
  }
  const originStop = dataset.graph.stops.find((stop) => stop.id === origin.id);
  const destinationStop = dataset.graph.stops.find(
    (stop) => stop.id === destination.id,
  );
  if (originStop === undefined || destinationStop === undefined) {
    throw new Error("C4H proof requires both exact graph endpoint stops.");
  }
  return {
    schemaVersion: KAI_292C4H_RUNTIME_PROOF_SCHEMA_VERSION,
    status: "verified_controlled_runtime",
    generatedBy: "scripts/transit/audit-kai-292c4h-runtime-proof.ts",
    corridor: {
      originProductId: KAI_292C4H_ORIGIN_PRODUCT_ID,
      destinationProductId: KAI_292C4H_DESTINATION_PRODUCT_ID,
      direction: "outbound",
      datasetKey: KAI_292C4H_DATASET_KEY,
      datasetId: dataset.metadata.datasetId,
      provider: "gtfs",
      identityNamespace: dataset.metadata.identityNamespace,
    },
    temporal: {
      source: "controlled_internal_test_fixture",
      evidenceId: KAI_292C4H_EVIDENCE_ID,
      serviceDate: temporal.context.serviceDate,
      earliestDepartureTime: KAI_292C4H_EARLIEST_DEPARTURE_TIME,
      earliestDepartureServiceSeconds:
        temporal.context.earliestDepartureServiceSeconds,
      timeZone: "Asia/Tokyo",
    },
    journey: {
      kind: "journey",
      selected: "direct",
      legCount: boundary.result.journey.legs.length,
      transferCount: 0,
      serviceId: selected.serviceId,
      providerServiceId: selected.providerServiceId,
      routeId: selected.routeId,
      providerRouteId: selected.providerRouteId,
      routeName: selected.routeName,
      operatorId: selected.operatorId,
      providerOperatorId: selected.providerOperatorId,
      originStopId: origin.id,
      originProviderStopId: originStop.providerStopId,
      destinationStopId: destination.id,
      destinationProviderStopId: destinationStop.providerStopId,
      actualDepartureServiceSeconds: selected.scheduledDepartureServiceSeconds,
      actualArrivalServiceSeconds: selected.scheduledArrivalServiceSeconds,
      durationSeconds: selected.durationServiceSeconds,
      durationMinutes: selected.durationServiceSeconds / 60,
      checkedAt: selected.checkedAt,
      journeySource: "gtfs_scheduled_timetable",
    },
    c4b: {
      kind: c4b.kind,
      evidence: c4b.evidence,
      transferCount: c4b.transferCount,
      serviceDate: c4b.schedule.serviceDate,
      departureServiceSeconds: c4b.schedule.departureServiceSeconds,
      arrivalServiceSeconds: c4b.schedule.arrivalServiceSeconds,
      durationSeconds: c4b.totalDurationSeconds,
      durationMinutes: c4b.durationMinutes,
    },
    c4c: {
      kind: c4c.kind,
      source: c4c.source,
      selected: c4c.selected,
      datasetId: c4c.datasetId,
      contentHash: c4c.contentHash,
    },
    safety: {
      productionBoundary: true,
      mockedJourney: false,
      syntheticTransitGraph: false,
      sakataSubstitute: false,
      returnTimeInvented: false,
    },
  };
}

async function serializedProof(rootDir: string): Promise<string> {
  const config = (await resolveConfig(rootDir)) ?? {};
  return format(JSON.stringify(buildKai292C4HRuntimeProof(rootDir)), {
    ...config,
    parser: "json",
  });
}

async function runCli(): Promise<void> {
  const outputPath = resolve(process.cwd(), KAI_292C4H_RUNTIME_PROOF_PATH);
  const serialized = await serializedProof(process.cwd());
  if (process.argv.includes("--check")) {
    const existing = readFileSync(outputPath, "utf8");
    if (existing !== serialized) {
      throw new Error(
        `${KAI_292C4H_RUNTIME_PROOF_PATH} is stale; run with --write.`,
      );
    }
    return;
  }
  if (process.argv.includes("--write")) {
    mkdirSync(resolve(process.cwd(), "qa/kai-292c4h"), { recursive: true });
    writeFileSync(outputPath, serialized, "utf8");
    return;
  }
  process.stdout.write(serialized);
}

if (process.argv[1]?.endsWith("audit-kai-292c4h-runtime-proof.ts")) {
  await runCli();
}
