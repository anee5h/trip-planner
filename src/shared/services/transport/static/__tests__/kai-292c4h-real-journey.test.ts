import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolveFeasibilityEvidence } from "@/shared/services/recommendation/ScheduledFeasibilityService";
import { getTransportDurationEvidence } from "@/shared/services/transport/TransportDurationEvidence";
import {
  buildKai292C4HRuntimeProof,
  KAI_292C4H_DESTINATION_PRODUCT_ID,
  KAI_292C4H_EARLIEST_DEPARTURE_TIME,
  KAI_292C4H_EVIDENCE_ID,
  KAI_292C4H_ORIGIN_PRODUCT_ID,
  KAI_292C4H_SERVICE_DATE,
} from "../../../../../../scripts/transit/audit-kai-292c4h-runtime-proof";
import {
  resolveScheduledRoutingTemporalContext,
  type ScheduledRoutingServiceDaySeconds,
} from "../scheduledRoutingTemporal";
import { routeScheduledTransitWithTemporalContext } from "../scheduledTransitRoutingBoundary";
import {
  loadScheduledTransitDataset,
  resetScheduledTransitDatasetCache,
  validateScheduledTransitDataset,
} from "../scheduledTransitDataset";
import { getScheduledTransitDatasetDescriptor } from "../scheduledTransitDatasetRegistry";
import { resolveScheduledTransitEndpoint } from "../scheduledTransitEndpoint";

const ROOT = process.cwd();
const TOEI_ASSET_PATH = join(
  ROOT,
  "src/shared/data/transit/toei-oedo-gtfs-20260314.json",
);
const SAKATA_ASSET_PATH = join(
  ROOT,
  "public/data/transit/sakata-runrunbus.json",
);
const TOEI_DATASET_KEY = "toei-oedo-gtfs-20260314" as const;

function committedAsset(path: string): string {
  return readFileSync(path, "utf8");
}

async function loadRealToeiDataset() {
  const body = committedAsset(TOEI_ASSET_PATH);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toBe(
        "/data/transit/toei-oedo-gtfs-20260314.json.gz",
      );
      return new Response(body, {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return loadScheduledTransitDataset(TOEI_DATASET_KEY);
}

describe("KAI-292C4H first real Toei Oedo Journey", () => {
  beforeEach(() => {
    resetScheduledTransitDatasetCache();
  });

  afterEach(() => {
    resetScheduledTransitDatasetCache();
    vi.unstubAllGlobals();
  });

  it("loads the committed Toei dataset and routes the real corridor through C2, C3, C4B, and C4C", async () => {
    const dataset = await loadRealToeiDataset();
    expect(dataset.metadata).toMatchObject({
      datasetId: "toei-oedo-gtfs-20260314",
      provider: "gtfs",
      identityNamespace: "toei-gtfs",
      completeness: "complete_provider_dump",
    });

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
    expect(origin).toMatchObject({
      kind: "resolved",
      normalizedStopId: "gtfs:stop:toei-gtfs:402",
      providerStopId: "402",
    });
    expect(destination).toMatchObject({
      kind: "resolved",
      normalizedStopId: "gtfs:stop:toei-gtfs:420",
      providerStopId: "420",
    });
    if (origin.kind !== "resolved" || destination.kind !== "resolved") return;

    const temporal = resolveScheduledRoutingTemporalContext({
      serviceDate: KAI_292C4H_SERVICE_DATE,
      earliestDepartureTime: KAI_292C4H_EARLIEST_DEPARTURE_TIME,
      source: "controlled_internal_test_fixture",
      evidenceId: KAI_292C4H_EVIDENCE_ID,
    });
    expect(temporal).toMatchObject({
      status: "resolved",
      context: {
        serviceDate: KAI_292C4H_SERVICE_DATE,
        earliestDepartureServiceSeconds: 18_000,
        provenance: {
          source: "controlled_internal_test_fixture",
          evidenceId: KAI_292C4H_EVIDENCE_ID,
        },
      },
    });
    if (temporal.status !== "resolved") return;

    const boundary = routeScheduledTransitWithTemporalContext({
      dataset,
      origin,
      destination,
      temporal,
      direction: "outbound",
    });
    expect(boundary.status).toBe("routed");
    if (boundary.status !== "routed") return;
    expect(boundary.request).toMatchObject({
      direction: "outbound",
      originStopId: "gtfs:stop:toei-gtfs:402",
      destinationStopId: "gtfs:stop:toei-gtfs:420",
      serviceDate: KAI_292C4H_SERVICE_DATE,
      earliestDepartureServiceSeconds: 18_000,
    });
    expect(boundary.result.kind).toBe("verified");
    if (boundary.result.kind !== "verified") return;
    expect(boundary.result.selected).toBe("direct");
    expect(boundary.result.transferCount).toBe(0);
    expect(boundary.result.journey).toMatchObject({
      kind: "journey",
      directionality: "one_way",
      completeness: "complete",
      availability: "available",
      confidence: "high",
      provenance: {
        source: "gtfs_scheduled_timetable",
        duration: "verified",
      },
    });
    expect(boundary.result.journey.legs).toHaveLength(1);

    const scheduled = boundary.result.evidence.selectedJourneyEvidence;
    expect(scheduled).toMatchObject({
      source: "gtfs_scheduled_timetable",
      provider: "gtfs",
      serviceDate: KAI_292C4H_SERVICE_DATE,
      serviceId: "gtfs:scheduled_service:toei-gtfs:400501B0",
      providerServiceId: "400501B0",
      routeId: "gtfs:route:toei-gtfs:4",
      providerRouteId: "4",
      operatorId: "gtfs:operator:toei-gtfs:toei",
      providerOperatorId: "toei",
      scheduledDepartureServiceSeconds: 18_540,
      scheduledArrivalServiceSeconds: 20_820,
      durationServiceSeconds: 2_280,
      transferCount: 0,
    });
    expect(boundary.result.journey.origin).toMatchObject({
      id: "gtfs:stop:toei-gtfs:402",
      name: "新宿西口",
    });
    expect(boundary.result.journey.destination).toMatchObject({
      id: "gtfs:stop:toei-gtfs:420",
      name: "汐留",
    });
    if (scheduled === undefined) return;

    const c4b = getTransportDurationEvidence({
      scheduledJourney: {
        journey: boundary.result.journey,
        transferCount: boundary.result.transferCount,
        schedule: {
          serviceDate: temporal.context.serviceDate,
          departureServiceSeconds: boundary.result.evidence
            .initialDepartureServiceSeconds as ScheduledRoutingServiceDaySeconds,
          arrivalServiceSeconds: boundary.result.evidence
            .finalArrivalServiceSeconds as ScheduledRoutingServiceDaySeconds,
        },
        totalDurationSeconds: boundary.result.evidence.totalDurationSeconds,
      },
    });
    expect(c4b).toMatchObject({
      kind: "scheduled_journey",
      evidence: "verified",
      transferCount: 0,
      schedule: {
        serviceDate: KAI_292C4H_SERVICE_DATE,
        departureServiceSeconds: 18_540,
        arrivalServiceSeconds: 20_820,
      },
      totalDurationSeconds: 2_280,
      durationMinutes: [38, 38],
    });
    if (c4b.kind !== "scheduled_journey") return;

    const c4c = resolveFeasibilityEvidence({ scheduled: boundary });
    expect(c4c).toMatchObject({
      kind: "verified_scheduled_journey",
      source: "scheduled",
      selected: "direct",
      durationEvidence: {
        kind: "scheduled_journey",
        evidence: "verified",
        transferCount: 0,
        totalDurationSeconds: 2_280,
      },
    });

    const proof = buildKai292C4HRuntimeProof(ROOT);
    expect(proof).toMatchObject({
      status: "verified_controlled_runtime",
      corridor: {
        originProductId: KAI_292C4H_ORIGIN_PRODUCT_ID,
        destinationProductId: KAI_292C4H_DESTINATION_PRODUCT_ID,
      },
      journey: {
        providerServiceId: "400501B0",
        actualDepartureServiceSeconds: 18_540,
        actualArrivalServiceSeconds: 20_820,
        durationSeconds: 2_280,
      },
      safety: {
        productionBoundary: true,
        mockedJourney: false,
        syntheticTransitGraph: false,
        sakataSubstitute: false,
        returnTimeInvented: false,
      },
    });
  });

  it("fails closed when temporal context is missing or the service date is invalid", async () => {
    const dataset = await loadRealToeiDataset();
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

    const missingTime = resolveScheduledRoutingTemporalContext({
      serviceDate: KAI_292C4H_SERVICE_DATE,
      earliestDepartureTime: null,
      source: "controlled_internal_test_fixture",
    });
    expect(missingTime).toEqual({
      status: "unresolved",
      reason: "missing_departure_time",
    });
    const missingResult = routeScheduledTransitWithTemporalContext({
      dataset,
      origin,
      destination,
      temporal: missingTime,
      direction: "outbound",
    });
    expect(missingResult).toMatchObject({
      status: "not_routed",
      reason: "temporal_unresolved",
    });

    const invalidDate = resolveScheduledRoutingTemporalContext({
      serviceDate: "2026-02-30",
      earliestDepartureTime: KAI_292C4H_EARLIEST_DEPARTURE_TIME,
      source: "controlled_internal_test_fixture",
    });
    expect(invalidDate).toEqual({
      status: "invalid_query",
      reason: "invalid_service_date",
    });
    const invalidResult = routeScheduledTransitWithTemporalContext({
      dataset,
      origin,
      destination,
      temporal: invalidDate,
      direction: "outbound",
    });
    expect(invalidResult).toMatchObject({
      status: "not_routed",
      reason: "temporal_unresolved",
    });
  });

  it("keeps the Sakata pilot unrelated to the Toei product corridor", () => {
    const descriptor = getScheduledTransitDatasetDescriptor("sakata-runrunbus");
    const sakata = validateScheduledTransitDataset(
      JSON.parse(committedAsset(SAKATA_ASSET_PATH)) as unknown,
      descriptor,
    );
    expect(
      resolveScheduledTransitEndpoint({
        dataset: sakata,
        endpoint: {
          kind: "origin",
          productId: KAI_292C4H_ORIGIN_PRODUCT_ID,
        },
      }),
    ).toMatchObject({ kind: "unmapped", reason: "no_explicit_crosswalk" });
    expect(
      resolveScheduledTransitEndpoint({
        dataset: sakata,
        endpoint: {
          kind: "destination",
          productId: KAI_292C4H_DESTINATION_PRODUCT_ID,
        },
      }),
    ).toMatchObject({ kind: "unmapped", reason: "no_explicit_crosswalk" });
  });
});
