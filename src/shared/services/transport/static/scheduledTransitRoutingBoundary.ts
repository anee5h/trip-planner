import * as scheduledJourneyComposer from "./scheduledJourneyComposer";
import type { ScheduledTransitEndpointResolution } from "./scheduledTransitEndpoint";
import type { ScheduledTransitDataset } from "./scheduledTransitDataset";
import type {
  ScheduledRoutingTemporalContext,
  ScheduledRoutingTemporalResolution,
} from "./scheduledRoutingTemporal";

export type ScheduledTransitRoutingDirection = "outbound" | "return";

type ResolvedEndpoint = Extract<
  ScheduledTransitEndpointResolution,
  { kind: "resolved" }
>;

export interface ScheduledTransitRouterRequest {
  readonly dataset: ScheduledTransitDataset;
  readonly direction: ScheduledTransitRoutingDirection;
  readonly originStopId: string;
  readonly destinationStopId: string;
  readonly serviceDate: ScheduledRoutingTemporalContext["serviceDate"];
  readonly earliestDepartureServiceSeconds: ScheduledRoutingTemporalContext["earliestDepartureServiceSeconds"];
  readonly temporal: ScheduledRoutingTemporalContext;
}

export interface ScheduledTransitRoutingBoundaryInput {
  /** Already validated by the C2 dataset loader; absent means no route. */
  readonly dataset: ScheduledTransitDataset | null | undefined;
  readonly origin: ScheduledTransitEndpointResolution;
  readonly destination: ScheduledTransitEndpointResolution;
  readonly temporal: ScheduledRoutingTemporalResolution;
  readonly direction: ScheduledTransitRoutingDirection;
}

export type ScheduledTransitRoutingBoundaryResult =
  | {
      readonly status: "routed";
      readonly direction: ScheduledTransitRoutingDirection;
      readonly request: ScheduledTransitRouterRequest;
      readonly result: ReturnType<
        typeof scheduledJourneyComposer.routeBestScheduledJourney
      >;
    }
  | {
      readonly status: "not_routed";
      readonly direction: ScheduledTransitRoutingDirection;
      readonly reason:
        | "dataset_unresolved"
        | "origin_unresolved"
        | "destination_unresolved"
        | "temporal_unresolved";
      readonly diagnostics: {
        readonly dataset: "available" | "unresolved";
        readonly origin: ScheduledTransitEndpointResolution["kind"];
        readonly destination: ScheduledTransitEndpointResolution["kind"];
        readonly temporal: ScheduledRoutingTemporalResolution["status"];
      };
      readonly endpoint?: ScheduledTransitEndpointResolution;
      readonly temporal?: ScheduledRoutingTemporalResolution;
    };

function isResolvedEndpoint(
  value: ScheduledTransitEndpointResolution,
): value is ResolvedEndpoint {
  return value.kind === "resolved";
}

type BlockedReason =
  | "dataset_unresolved"
  | "origin_unresolved"
  | "destination_unresolved"
  | "temporal_unresolved";

function blocked(
  input: ScheduledTransitRoutingBoundaryInput,
  reason: BlockedReason,
): Extract<ScheduledTransitRoutingBoundaryResult, { status: "not_routed" }> {
  return {
    status: "not_routed",
    direction: input.direction,
    reason,
    diagnostics: {
      dataset:
        input.dataset === null || input.dataset === undefined
          ? "unresolved"
          : "available",
      origin: input.origin.kind,
      destination: input.destination.kind,
      temporal: input.temporal.status,
    },
    ...(reason === "origin_unresolved" ? { endpoint: input.origin } : {}),
    ...(reason === "destination_unresolved"
      ? { endpoint: input.destination }
      : {}),
    ...(reason === "temporal_unresolved" ? { temporal: input.temporal } : {}),
  };
}

/**
 * The only C3 route invocation seam. It refuses to call the router until the
 * C2 dataset, both exact endpoint identities, and C3 temporal context resolve.
 */
export function routeScheduledTransitWithTemporalContext(
  input: ScheduledTransitRoutingBoundaryInput,
): ScheduledTransitRoutingBoundaryResult {
  if (input.dataset === null || input.dataset === undefined) {
    return blocked(input, "dataset_unresolved");
  }
  if (!isResolvedEndpoint(input.origin)) {
    return blocked(input, "origin_unresolved");
  }
  if (!isResolvedEndpoint(input.destination)) {
    return blocked(input, "destination_unresolved");
  }
  if (input.temporal.status !== "resolved") {
    return blocked(input, "temporal_unresolved");
  }

  const from =
    input.direction === "outbound" ? input.origin : input.destination;
  const to = input.direction === "outbound" ? input.destination : input.origin;
  const request: ScheduledTransitRouterRequest = {
    dataset: input.dataset,
    direction: input.direction,
    originStopId: from.normalizedStopId,
    destinationStopId: to.normalizedStopId,
    serviceDate: input.temporal.context.serviceDate,
    earliestDepartureServiceSeconds:
      input.temporal.context.earliestDepartureServiceSeconds,
    temporal: input.temporal.context,
  };
  return {
    status: "routed",
    direction: input.direction,
    request,
    result: scheduledJourneyComposer.routeBestScheduledJourney({
      graph: input.dataset.graph,
      coverage: input.dataset.coverage,
      originStopId: request.originStopId,
      destinationStopId: request.destinationStopId,
      serviceDate: request.serviceDate,
      earliestDepartureServiceSeconds: request.earliestDepartureServiceSeconds,
    }),
  };
}
