import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getScheduledProductJourney,
  type ScheduledProductJourneyResult,
} from "../ScheduledProductJourneyService";
import {
  resolveScheduledRoutingTemporalContext,
  type ScheduledRoutingTemporalResolution,
} from "../static/scheduledRoutingTemporal";
import * as endpointModule from "../static/scheduledTransitEndpoint";
import * as datasetModule from "../static/scheduledTransitDataset";
import { resetScheduledTransitDatasetCache } from "../static/scheduledTransitDataset";
import type { OriginAwareTransportEstimate } from "../OriginAwareTransportService";

const ROOT = process.cwd();
const TOEI_ASSET_PATH = join(
  ROOT,
  "public/data/transit/toei-oedo-gtfs-20260314.json",
);
const ORIGIN_PRODUCT_ID = "toei-oedo-shinjuku-nishiguchi";
const DESTINATION_PRODUCT_ID = "hamarikyu-gardens";

function resolvedTemporal(): ScheduledRoutingTemporalResolution {
  return resolveScheduledRoutingTemporalContext({
    serviceDate: "2026-09-15",
    earliestDepartureTime: "05:00:00",
    source: "explicit_planner_generated_time_window",
    evidenceId: "kai-292c4i-test-time",
  });
}

function legacyEstimate(): OriginAwareTransportEstimate {
  return {
    mode: "train",
    timeRange: [70, 90],
    source: "rough_transit_fallback",
    evidence: "estimated",
    estimateSource: "rough",
    confidence: "low",
    decisionSemantics: "conservative",
  };
}

function stubToeiAsset(): void {
  const body = readFileSync(TOEI_ASSET_PATH, "utf8");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toBe("/data/transit/toei-oedo-gtfs-20260314.json");
      return new Response(body, {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

function expectNotRouted(
  result: ScheduledProductJourneyResult,
  reason: NonNullable<
    Extract<ScheduledProductJourneyResult, { status: "not_routed" }>["reason"]
  >,
): Extract<ScheduledProductJourneyResult, { status: "not_routed" }> {
  expect(result.status).toBe("not_routed");
  if (result.status !== "not_routed") throw new Error("expected not_routed");
  expect(result.reason).toBe(reason);
  return result;
}

describe("KAI-292C4I scheduled product routing seam", () => {
  beforeEach(() => resetScheduledTransitDatasetCache());

  afterEach(() => {
    resetScheduledTransitDatasetCache();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("routes the real Toei product corridor with explicit C3 time", async () => {
    stubToeiAsset();
    const result = await getScheduledProductJourney({
      originProductId: ORIGIN_PRODUCT_ID,
      destinationProductId: DESTINATION_PRODUCT_ID,
      direction: "outbound",
      temporal: resolvedTemporal(),
    });

    expect(result.status).toBe("routed");
    if (result.status !== "routed") return;
    expect(result.scheduled.request).toMatchObject({
      originStopId: "gtfs:stop:toei-gtfs:402",
      destinationStopId: "gtfs:stop:toei-gtfs:420",
      serviceDate: "2026-09-15",
      earliestDepartureServiceSeconds: 18_000,
    });
    expect(result.scheduled.result).toMatchObject({
      kind: "verified",
      selected: "direct",
      transferCount: 0,
    });
    expect(result.durationEvidence).toMatchObject({
      kind: "scheduled_journey",
      evidence: "verified",
      transferCount: 0,
      totalDurationSeconds: 2_280,
    });
    expect(result.feasibility).toMatchObject({
      kind: "verified_scheduled_journey",
      selected: "direct",
      durationEvidence: {
        kind: "scheduled_journey",
        totalDurationSeconds: 2_280,
      },
    });
    if (result.feasibility.kind !== "verified_scheduled_journey") return;
    expect(result.feasibility.durationEvidence.journey.legs).toHaveLength(1);
  });

  it("keeps legacy evidence when the destination is unmapped", async () => {
    const result = await getScheduledProductJourney({
      originProductId: ORIGIN_PRODUCT_ID,
      destinationProductId: "not-a-scheduled-product",
      direction: "outbound",
      temporal: resolvedTemporal(),
      legacyEstimate: legacyEstimate(),
    });
    const notRouted = expectNotRouted(result, "destination_unresolved");
    expect(notRouted.durationEvidence).toMatchObject({
      kind: "legacy_estimate",
      evidence: "estimated",
    });
    expect(notRouted.feasibility).toMatchObject({
      kind: "legacy_estimate",
      source: "legacy",
      durationEvidence: { kind: "legacy_estimate" },
    });
  });

  it("returns no scheduled route when the origin is unmapped", async () => {
    const result = await getScheduledProductJourney({
      originProductId: "not-a-scheduled-origin",
      destinationProductId: DESTINATION_PRODUCT_ID,
      direction: "outbound",
      temporal: resolvedTemporal(),
    });
    expectNotRouted(result, "origin_unresolved");
  });

  it("fails closed before loading a dataset when time is missing", async () => {
    const missingTime = resolveScheduledRoutingTemporalContext({
      serviceDate: "2026-09-15",
      earliestDepartureTime: null,
      source: "explicit_planner_generated_time_window",
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await getScheduledProductJourney({
      originProductId: ORIGIN_PRODUCT_ID,
      destinationProductId: DESTINATION_PRODUCT_ID,
      direction: "outbound",
      temporal: missingTime,
    });
    expectNotRouted(result, "temporal_unresolved");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fails closed for an ambiguous endpoint", async () => {
    stubToeiAsset();
    vi.spyOn(endpointModule, "resolveScheduledTransitEndpoint").mockReturnValue(
      {
        kind: "ambiguous",
        endpoint: {
          kind: "origin",
          productId: ORIGIN_PRODUCT_ID,
        },
        mappingIds: ["a", "b"],
        reason: "multiple_explicit_crosswalks",
      },
    );
    const result = await getScheduledProductJourney({
      originProductId: ORIGIN_PRODUCT_ID,
      destinationProductId: DESTINATION_PRODUCT_ID,
      direction: "outbound",
      temporal: resolvedTemporal(),
    });
    expectNotRouted(result, "ambiguous_endpoint");
  });

  it("fails closed when the registered dataset is invalid", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ invalid: true }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    const loadSpy = vi.spyOn(datasetModule, "loadScheduledTransitDataset");
    const result = await getScheduledProductJourney({
      originProductId: ORIGIN_PRODUCT_ID,
      destinationProductId: DESTINATION_PRODUCT_ID,
      direction: "outbound",
      temporal: resolvedTemporal(),
    });
    expectNotRouted(result, "dataset_unresolved");
    expect(loadSpy).toHaveBeenCalledTimes(1);
  });
});
