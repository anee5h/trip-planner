import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import * as composer from "../scheduledJourneyComposer";
import {
  resolveScheduledTransitEndpoint,
  SCHEDULED_TRANSIT_CROSSWALK,
  type ScheduledTransitEndpointResolution,
} from "../scheduledTransitEndpoint";
import { validateScheduledTransitDataset } from "../scheduledTransitDataset";
import { SAKATA_RUNRUNBUS_DATASET } from "../scheduledTransitDatasetRegistry";
import {
  resolveScheduledRoutingTemporalContext,
  type ScheduledRoutingTemporalResolution,
} from "../scheduledRoutingTemporal";
import {
  routeScheduledTransitWithTemporalContext,
  type ScheduledTransitRoutingBoundaryInput,
} from "../scheduledTransitRoutingBoundary";

const DATASET = validateScheduledTransitDataset(
  JSON.parse(
    readFileSync("public/data/transit/sakata-runrunbus.json", "utf8"),
  ) as unknown,
  SAKATA_RUNRUNBUS_DATASET,
);
const pilotOrigin = SCHEDULED_TRANSIT_CROSSWALK.mappings[0];
const pilotDestination = SCHEDULED_TRANSIT_CROSSWALK.mappings[1];
if (pilotOrigin === undefined || pilotDestination === undefined) {
  throw new Error("C2 pilot crosswalk is incomplete");
}

const origin = resolveScheduledTransitEndpoint({
  dataset: DATASET,
  endpoint: pilotOrigin.endpoint,
});
const destination = resolveScheduledTransitEndpoint({
  dataset: DATASET,
  endpoint: pilotDestination.endpoint,
});
const outboundTemporal = resolveScheduledRoutingTemporalContext({
  serviceDate: "2026-04-10",
  earliestDepartureTime: "09:21",
  source: "controlled_internal_test_fixture",
  evidenceId: "kai-292c3-sakata-seam",
});

function baseInput(): ScheduledTransitRoutingBoundaryInput {
  return {
    dataset: DATASET,
    origin,
    destination,
    temporal: outboundTemporal,
    direction: "outbound",
  };
}

const unmappedOrigin: ScheduledTransitEndpointResolution = {
  kind: "unmapped",
  endpoint: { kind: "origin", productId: "unmapped-origin" },
  reason: "no_explicit_crosswalk",
};
const unmappedDestination: ScheduledTransitEndpointResolution = {
  kind: "unmapped",
  endpoint: { kind: "destination", productId: "unmapped-destination" },
  reason: "no_explicit_crosswalk",
};
const unresolvedTemporal: ScheduledRoutingTemporalResolution = {
  status: "unresolved",
  reason: "missing_departure_time",
};

const blockedCases: readonly {
  readonly reason:
    | "dataset_unresolved"
    | "origin_unresolved"
    | "destination_unresolved"
    | "temporal_unresolved";
  readonly override: Partial<ScheduledTransitRoutingBoundaryInput>;
}[] = [
  { reason: "dataset_unresolved", override: { dataset: null } },
  { reason: "origin_unresolved", override: { origin: unmappedOrigin } },
  {
    reason: "destination_unresolved",
    override: { destination: unmappedDestination },
  },
  { reason: "temporal_unresolved", override: { temporal: unresolvedTemporal } },
];

describe("scheduled transit temporal routing boundary", () => {
  it("passes exact resolved IDs and temporal values to the existing composer", () => {
    const result = routeScheduledTransitWithTemporalContext(baseInput());

    expect(result).toMatchObject({
      status: "routed",
      direction: "outbound",
      request: {
        originStopId: "gtfs:stop:gtfs%3Asakata-runrunbus:100_01",
        destinationStopId: "gtfs:stop:gtfs%3Asakata-runrunbus:17_01",
        serviceDate: "2026-04-10",
        earliestDepartureServiceSeconds: 33660,
      },
      result: { kind: "verified", selected: "direct" },
    });
  });

  it("uses an independent return context and swaps the endpoint direction", () => {
    const returnTemporal = resolveScheduledRoutingTemporalContext({
      serviceDate: "2026-04-11",
      earliestDepartureTime: "25:10",
      source: "persisted_itinerary_time",
      evidenceId: "saved-return-window",
    });
    const result = routeScheduledTransitWithTemporalContext({
      ...baseInput(),
      direction: "return",
      temporal: returnTemporal,
    });

    expect(result).toMatchObject({
      status: "routed",
      direction: "return",
      request: {
        originStopId: "gtfs:stop:gtfs%3Asakata-runrunbus:17_01",
        destinationStopId: "gtfs:stop:gtfs%3Asakata-runrunbus:100_01",
        serviceDate: "2026-04-11",
        earliestDepartureServiceSeconds: 90600,
      },
    });
  });

  it.each(blockedCases)(
    "does not route when $reason",
    ({ reason, override }) => {
      const routeSpy = vi.spyOn(composer, "routeBestScheduledJourney");
      const result = routeScheduledTransitWithTemporalContext({
        ...baseInput(),
        ...override,
      });

      expect(result).toMatchObject({ status: "not_routed", reason });
      expect(routeSpy).not.toHaveBeenCalled();
      routeSpy.mockRestore();
    },
  );

  it("retains invalid temporal resolution as an explicit non-routed outcome", () => {
    const invalidTemporal: ScheduledRoutingTemporalResolution = {
      status: "invalid_query",
      reason: "invalid_service_date",
    };

    expect(
      routeScheduledTransitWithTemporalContext({
        ...baseInput(),
        temporal: invalidTemporal,
      }),
    ).toMatchObject({
      status: "not_routed",
      reason: "temporal_unresolved",
      temporal: invalidTemporal,
    });
  });
});
