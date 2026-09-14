import {
  getTransportDurationEvidence,
  type TransportDurationEvidence,
} from "./TransportDurationEvidence";
import type { OriginAwareTransportEstimate } from "./OriginAwareTransportService";
import {
  resolveFeasibilityEvidence,
  type FeasibilityEvidence,
} from "../recommendation/ScheduledFeasibilityService";
import {
  resolveScheduledTransitEndpoint,
  SCHEDULED_TRANSIT_CROSSWALK,
  type ScheduledTransitCrosswalkEntry,
} from "./static/scheduledTransitEndpoint";
import {
  loadScheduledTransitDataset,
  type ScheduledTransitDataset,
} from "./static/scheduledTransitDataset";
import {
  SCHEDULED_TRANSIT_DATASETS,
  type ScheduledTransitDatasetKey,
} from "./static/scheduledTransitDatasetRegistry";
import {
  routeScheduledTransitWithTemporalContext,
  type ScheduledTransitRoutingBoundaryResult,
  type ScheduledTransitRoutingDirection,
} from "./static/scheduledTransitRoutingBoundary";
import type { ScheduledRoutingTemporalResolution } from "./static/scheduledRoutingTemporal";

export interface ScheduledProductJourneyInput {
  /** Exact stable Meguruto product identity; never a display name. */
  readonly originProductId: string;
  /** Exact stable Meguruto product identity; never a display name. */
  readonly destinationProductId: string;
  readonly direction: ScheduledTransitRoutingDirection;
  /** The caller must provide the already-resolved C3 temporal result. */
  readonly temporal: ScheduledRoutingTemporalResolution;
  /** Existing compatibility evidence is retained but never used as schedule input. */
  readonly legacyEstimate?: OriginAwareTransportEstimate | null;
}

export type ScheduledProductJourneyNotRoutedReason =
  | "invalid_product_identity"
  | "origin_unresolved"
  | "destination_unresolved"
  | "ambiguous_endpoint"
  | "dataset_unresolved"
  | "temporal_unresolved"
  | "invalid_direction";

export type ScheduledProductJourneyResult =
  | {
      readonly status: "routed";
      readonly scheduled: Extract<
        ScheduledTransitRoutingBoundaryResult,
        { status: "routed" }
      >;
      readonly durationEvidence: TransportDurationEvidence;
      readonly feasibility: FeasibilityEvidence;
    }
  | {
      readonly status: "not_routed";
      readonly reason: ScheduledProductJourneyNotRoutedReason;
      readonly scheduled?: ScheduledTransitRoutingBoundaryResult;
      readonly durationEvidence: TransportDurationEvidence;
      readonly feasibility: FeasibilityEvidence;
    };

type ProductMappingScope = Pick<
  ScheduledTransitCrosswalkEntry,
  "datasetId" | "provider" | "identityNamespace"
>;

function compatibilityEvidence(
  legacyEstimate: OriginAwareTransportEstimate | null | undefined,
): TransportDurationEvidence {
  return getTransportDurationEvidence({ legacyEstimate });
}

function endpointMappings(
  kind: "origin" | "destination",
  productId: string,
): readonly ScheduledTransitCrosswalkEntry[] {
  return SCHEDULED_TRANSIT_CROSSWALK.mappings.filter(
    (mapping) =>
      mapping.endpoint.kind === kind &&
      mapping.endpoint.productId === productId,
  );
}

function sameScope(
  left: ProductMappingScope,
  right: ProductMappingScope,
): boolean {
  return (
    left.datasetId === right.datasetId &&
    left.provider === right.provider &&
    left.identityNamespace === right.identityNamespace
  );
}

function datasetKeysForProducts(
  originProductId: string,
  destinationProductId: string,
): {
  readonly originMappings: readonly ScheduledTransitCrosswalkEntry[];
  readonly destinationMappings: readonly ScheduledTransitCrosswalkEntry[];
  readonly keys: readonly ScheduledTransitDatasetKey[];
} {
  const originMappings = endpointMappings("origin", originProductId);
  const destinationMappings = endpointMappings(
    "destination",
    destinationProductId,
  );
  const keys = Object.values(SCHEDULED_TRANSIT_DATASETS)
    .filter((descriptor) =>
      originMappings.some(
        (origin) =>
          origin.datasetId === descriptor.datasetId &&
          origin.provider === descriptor.provider &&
          origin.identityNamespace === descriptor.identityNamespace &&
          destinationMappings.some((destination) =>
            sameScope(origin, destination),
          ),
      ),
    )
    .map(({ key }) => key);
  return { originMappings, destinationMappings, keys };
}

function boundaryForFailure(
  result: ScheduledTransitRoutingBoundaryResult,
  legacyEstimate: OriginAwareTransportEstimate | null | undefined,
): ScheduledProductJourneyResult {
  const durationEvidence = compatibilityEvidence(legacyEstimate);
  return {
    status: "not_routed",
    reason:
      result.status === "not_routed"
        ? result.reason === "invalid_direction"
          ? "invalid_direction"
          : result.reason === "temporal_unresolved"
            ? "temporal_unresolved"
            : result.reason === "origin_unresolved"
              ? "origin_unresolved"
              : result.reason === "destination_unresolved"
                ? "destination_unresolved"
                : "dataset_unresolved"
        : "dataset_unresolved",
    scheduled: result,
    durationEvidence,
    feasibility: resolveFeasibilityEvidence({
      scheduled: result,
      durationEvidence:
        durationEvidence.kind === "legacy_estimate" ? durationEvidence : null,
    }),
  };
}

function durationEvidenceFromFeasibility(
  feasibility: FeasibilityEvidence,
  compatibility: TransportDurationEvidence,
): TransportDurationEvidence {
  if (feasibility.kind === "verified_scheduled_journey") {
    return feasibility.durationEvidence;
  }
  if (
    "durationEvidence" in feasibility &&
    feasibility.durationEvidence !== undefined
  ) {
    return feasibility.durationEvidence;
  }
  return compatibility;
}

function notRouted(
  reason: ScheduledProductJourneyNotRoutedReason,
  legacyEstimate: OriginAwareTransportEstimate | null | undefined,
): ScheduledProductJourneyResult {
  const durationEvidence = compatibilityEvidence(legacyEstimate);
  return {
    status: "not_routed",
    reason,
    durationEvidence,
    feasibility: resolveFeasibilityEvidence({
      durationEvidence:
        durationEvidence.kind === "legacy_estimate" ? durationEvidence : null,
    }),
  };
}

async function loadProductDataset(
  key: ScheduledTransitDatasetKey,
): Promise<ScheduledTransitDataset> {
  return loadScheduledTransitDataset(key);
}

/**
 * Production-facing scheduled product seam. It accepts only exact product
 * identities, an explicit direction, and a C3 temporal resolution. Dataset
 * selection, C2 loading, endpoint resolution, Journey composition, C4B, and
 * C4C remain owned by their existing modules.
 */
export async function getScheduledProductJourney(
  input: ScheduledProductJourneyInput,
): Promise<ScheduledProductJourneyResult> {
  const compatibility = compatibilityEvidence(input.legacyEstimate);
  if (
    typeof input.originProductId !== "string" ||
    input.originProductId.trim() !== input.originProductId ||
    input.originProductId.length === 0 ||
    typeof input.destinationProductId !== "string" ||
    input.destinationProductId.trim() !== input.destinationProductId ||
    input.destinationProductId.length === 0
  ) {
    return notRouted("invalid_product_identity", input.legacyEstimate);
  }
  if (input.temporal.status !== "resolved") {
    return notRouted("temporal_unresolved", input.legacyEstimate);
  }
  if (input.direction !== "outbound" && input.direction !== "return") {
    return notRouted("invalid_direction", input.legacyEstimate);
  }

  const { originMappings, destinationMappings, keys } = datasetKeysForProducts(
    input.originProductId,
    input.destinationProductId,
  );
  if (originMappings.length === 0) {
    return notRouted("origin_unresolved", input.legacyEstimate);
  }
  if (destinationMappings.length === 0) {
    return notRouted("destination_unresolved", input.legacyEstimate);
  }
  if (keys.length !== 1) {
    return notRouted(
      keys.length === 0 ? "dataset_unresolved" : "ambiguous_endpoint",
      input.legacyEstimate,
    );
  }

  let dataset: ScheduledTransitDataset;
  try {
    dataset = await loadProductDataset(keys[0]);
  } catch {
    return notRouted("dataset_unresolved", input.legacyEstimate);
  }

  const origin = resolveScheduledTransitEndpoint({
    dataset,
    endpoint: {
      kind: "origin",
      productId: input.originProductId,
    },
  });
  const destination = resolveScheduledTransitEndpoint({
    dataset,
    endpoint: {
      kind: "destination",
      productId: input.destinationProductId,
    },
  });
  if (origin.kind === "ambiguous" || destination.kind === "ambiguous") {
    return notRouted("ambiguous_endpoint", input.legacyEstimate);
  }
  if (origin.kind !== "resolved") {
    return notRouted("origin_unresolved", input.legacyEstimate);
  }
  if (destination.kind !== "resolved") {
    return notRouted("destination_unresolved", input.legacyEstimate);
  }

  const boundary = routeScheduledTransitWithTemporalContext({
    dataset,
    origin,
    destination,
    temporal: input.temporal,
    direction: input.direction,
  });

  if (boundary.status !== "routed") {
    return boundaryForFailure(boundary, input.legacyEstimate);
  }

  const feasibility = resolveFeasibilityEvidence({
    scheduled: boundary,
    durationEvidence:
      compatibility.kind === "legacy_estimate" ? compatibility : null,
  });
  return {
    status: "routed",
    scheduled: boundary,
    durationEvidence: durationEvidenceFromFeasibility(
      feasibility,
      compatibility,
    ),
    feasibility,
  };
}
