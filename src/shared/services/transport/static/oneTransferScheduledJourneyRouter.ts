/**
 * KAI-292B — pure one-transfer scheduled-journey routing over the C2/D1 graph.
 *
 * This module deliberately composes two already validated scheduled legs. It
 * does not add access/egress search, arbitrary transfer routing, or provider
 * integrations. The transfer connection is either explicit D1 evidence or the
 * narrow same-normalized-stop Meguruto policy.
 */

import type {
  Journey,
  JourneyEndpoint,
  JourneyLeg,
  JourneyProvenance,
} from "@/shared/types/journey";
import { journeyHandoffCapabilityForMode } from "../JourneyHandoff";
import {
  buildIndex,
  coverageReason,
  directPair,
  formatServiceSeconds,
  type IndexedGraph,
  type ValidPair,
  stopEndpoint,
  unknownSafeCost,
  validateService,
  type ValidatedService,
} from "./scheduledJourneyRouter";
import { GTFS_TRANSFER_SCHEMA_VERSION } from "./gtfsTransferImporter";
import {
  isRealGtfsServiceDate,
  type GtfsServiceDateEvaluation,
} from "./gtfsScheduleImporter";
import {
  resolveApplicableTransfers,
  type ApplicableTransferResult,
} from "./transitGraphQueries";
import type {
  GtfsTransferType,
  NormalizedTransitGraph,
  TransitCoverageReport,
  TransitProvider,
  TransitScheduledStopTime,
  TransitTransfer,
} from "./transitGraphTypes";

export const GTFS_ONE_TRANSFER_JOURNEY_SOURCE =
  "gtfs_scheduled_timetable" as const;
export const MEGURUTO_SAME_STOP_TRANSFER_MIN_SECONDS = 300 as const;

export interface RouteOneTransferScheduledJourneyInput {
  readonly graph: NormalizedTransitGraph;
  /** D1 coverage is required for a trustworthy transfer result. */
  readonly coverage?: TransitCoverageReport;
  readonly originStopId: string;
  readonly destinationStopId: string;
  readonly serviceDate: string;
  /** Absolute GTFS service-day seconds; no ambient clock or date conversion. */
  readonly earliestDepartureServiceSeconds: number;
}

export type OneTransferTransferBasis =
  | "gtfs_timed"
  | "gtfs_minimum"
  | "gtfs_recommended_with_minimum"
  | "meguruto_same_stop_policy";

export type OneTransferCoverageState =
  "imported" | "not_imported_in_this_slice";

export interface OneTransferScheduledJourneyLegEvidence {
  readonly provider: "gtfs" | "gtfs-jp";
  readonly serviceDate: string;
  readonly calendarReason: GtfsServiceDateEvaluation["reason"];
  readonly calendarId: string;
  readonly providerCalendarId: string;
  readonly serviceId: string;
  readonly providerServiceId: string;
  readonly routeId: string;
  readonly providerRouteId: string;
  readonly patternId: string;
  readonly operatorId: string;
  readonly providerOperatorId: string;
  readonly routeName: string | null;
  readonly scheduledDepartureServiceSeconds: number;
  readonly scheduledArrivalServiceSeconds: number;
  readonly durationServiceSeconds: number;
  readonly scheduledDepartureTime: string;
  readonly scheduledArrivalTime: string;
  readonly boardingRequiresArrangement: boolean;
  readonly alightingRequiresArrangement: boolean;
  readonly coverageState: OneTransferCoverageState;
  readonly topologyCoverageState: "imported";
  readonly timetableCoverageState: "imported";
}

export interface OneTransferScheduledJourneyEvidence {
  readonly source: typeof GTFS_ONE_TRANSFER_JOURNEY_SOURCE;
  readonly provider: "gtfs" | "gtfs-jp";
  readonly serviceDate: string;
  readonly transferCount: 1;
  readonly firstServiceId: string;
  readonly secondServiceId: string;
  readonly transferFromStopId: string;
  readonly transferToStopId: string;
  readonly incomingArrivalServiceSeconds: number;
  readonly outgoingDepartureServiceSeconds: number;
  /** Scheduled connection time, not walking time. */
  readonly transferWaitSeconds: number;
  readonly requiredTransferSeconds: number;
  readonly transferBasis: OneTransferTransferBasis;
  /** Conservative summary of the two relevant D1 transfer states. */
  readonly coverageState: OneTransferCoverageState;
  readonly firstCoverageState: OneTransferCoverageState;
  readonly secondCoverageState: OneTransferCoverageState;
  readonly topologyCoverageState: "imported";
  readonly timetableCoverageState: "imported";
  readonly transferRuleId?: string;
  readonly transferType?: GtfsTransferType;
  readonly totalDurationSeconds: number;
  readonly datasetId: string;
  readonly contentHash: string;
  readonly sourceType: NormalizedTransitGraph["datasetVersion"]["sourceType"];
  readonly completeness: NormalizedTransitGraph["datasetVersion"]["completeness"];
  readonly retrievedAt: string;
  readonly checkedAt: string;
  readonly firstLeg: OneTransferScheduledJourneyLegEvidence;
  readonly secondLeg: OneTransferScheduledJourneyLegEvidence;
}

export type OneTransferScheduledJourneyNoMatchReason =
  | "origin_equals_destination"
  | "origin_stop_absent"
  | "destination_stop_absent"
  | "destination_before_origin"
  | "no_one_transfer_service"
  | "departure_window_miss"
  | "transfer_connection_miss"
  | "inactive_service"
  | "missing_origin_departure"
  | "missing_destination_arrival"
  | "transfer_prohibited";

export type OneTransferScheduledJourneyInconclusiveReason =
  | "invalid_service_date"
  | "invalid_earliest_departure"
  | "unsupported_coverage"
  | "partial_timetable"
  | "transfer_coverage_untrusted"
  | "invalid_transfer_query"
  | "ambiguous_transfer_rule"
  | "transfer_minimum_unknown"
  | "transfer_type_not_supported"
  | "unmodeled_transfer_movement"
  | "chronology_invalid"
  | "ambiguous_stop_pair"
  | "pickup_prohibited"
  | "dropoff_prohibited"
  | "unsupported_pickup_dropoff"
  | "broken_graph_reference"
  | "unsupported_route_mode";

export type OneTransferScheduledJourneyResult =
  | {
      readonly kind: "verified";
      readonly journey: Journey;
      readonly evidence: OneTransferScheduledJourneyEvidence;
      readonly durationSeconds: number;
      readonly totalDurationSeconds: number;
    }
  | {
      readonly kind: "no_match";
      readonly reason: OneTransferScheduledJourneyNoMatchReason;
      readonly notes: readonly string[];
    }
  | {
      readonly kind: "inconclusive";
      readonly reason: OneTransferScheduledJourneyInconclusiveReason;
      readonly notes: readonly string[];
    };

type TransferCandidateOutcome =
  | {
      readonly kind: "valid";
      readonly candidate: ValidTransferCandidate;
    }
  | {
      readonly kind: "no_match";
      readonly reason: OneTransferScheduledJourneyNoMatchReason;
      readonly notes: readonly string[];
    }
  | {
      readonly kind: "inconclusive";
      readonly reason: OneTransferScheduledJourneyInconclusiveReason;
      readonly notes: readonly string[];
    };

interface ValidTransferCandidate {
  readonly first: ValidatedService;
  readonly second: ValidatedService;
  readonly firstPair: ValidPair;
  readonly secondPair: ValidPair;
  readonly transferFromStopId: string;
  readonly transferToStopId: string;
  readonly transferWaitSeconds: number;
  readonly requiredTransferSeconds: number;
  readonly transferBasis: OneTransferTransferBasis;
  readonly transferRule: TransitTransfer | null;
}

type TransferConnectionOutcome =
  | {
      readonly kind: "valid";
      readonly requiredTransferSeconds: number;
      readonly transferBasis: OneTransferTransferBasis;
      readonly transferRule: TransitTransfer | null;
    }
  | {
      readonly kind: "no_match";
      readonly reason: OneTransferScheduledJourneyNoMatchReason;
      readonly notes: readonly string[];
    }
  | {
      readonly kind: "inconclusive";
      readonly reason: OneTransferScheduledJourneyInconclusiveReason;
      readonly notes: readonly string[];
    };

function lexical(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function noMatch(
  reason: OneTransferScheduledJourneyNoMatchReason,
  notes: readonly string[] = [],
): Extract<TransferCandidateOutcome, { readonly kind: "no_match" }> {
  return { kind: "no_match", reason, notes };
}

function inconclusive(
  reason: OneTransferScheduledJourneyInconclusiveReason,
  notes: readonly string[] = [],
): Extract<TransferCandidateOutcome, { readonly kind: "inconclusive" }> {
  return { kind: "inconclusive", reason, notes };
}

function stopScopeIds(
  graph: NormalizedTransitGraph,
  stopId: string,
): ReadonlySet<string> {
  const stop = graph.stops.find((candidate) => candidate.id === stopId);
  if (stop === undefined) return new Set([stopId]);
  const semantics = stop.sourceSemantics;
  if (semantics === undefined || semantics.locationType !== 1) {
    return new Set([stopId]);
  }
  const childIds = graph.stops
    .filter((candidate) => {
      const candidateSemantics = candidate.sourceSemantics;
      return (
        candidate.id === stopId ||
        (candidate.provider === stop.provider &&
          candidate.provenance.identityNamespace ===
            stop.provenance.identityNamespace &&
          candidateSemantics !== undefined &&
          candidateSemantics.locationType === 0 &&
          candidateSemantics.parentStation === stop.providerStopId)
      );
    })
    .map((candidate) => candidate.id);
  return new Set(childIds.length === 0 ? [stopId] : childIds);
}

function stopScopeMatches(
  graph: NormalizedTransitGraph,
  ruleStopId: string | null,
  queryStopId: string,
): boolean {
  if (ruleStopId === null) return false;
  return stopScopeIds(graph, ruleStopId).has(queryStopId);
}

function explicitTransferTargets(
  graph: NormalizedTransitGraph,
  fromStopId: string,
): string[] {
  const targetIds = new Set<string>();
  for (const transfer of graph.transfers) {
    if (
      transfer.fromStopId === null ||
      transfer.toStopId === null ||
      !stopScopeMatches(graph, transfer.fromStopId, fromStopId)
    ) {
      continue;
    }
    for (const targetId of stopScopeIds(graph, transfer.toStopId)) {
      targetIds.add(targetId);
    }
  }
  return [...targetIds].sort(lexical);
}

function linkedTripTransferType(
  graph: NormalizedTransitGraph,
  incomingServiceId: string,
  outgoingServiceId: string,
): GtfsTransferType | null {
  const types = graph.transfers
    .filter(
      (transfer) =>
        transfer.fromServiceId === incomingServiceId &&
        transfer.toServiceId === outgoingServiceId &&
        (transfer.sourceSemantics.transferType === 4 ||
          transfer.sourceSemantics.transferType === 5),
    )
    .map((transfer) => transfer.sourceSemantics.transferType)
    .sort((left, right) => left - right);
  return types[0] ?? null;
}

function coverageIssue(
  graph: NormalizedTransitGraph,
  coverage: TransitCoverageReport | undefined,
  candidate: ValidatedService,
  index: IndexedGraph,
): OneTransferScheduledJourneyInconclusiveReason | null {
  if (
    coverage === undefined ||
    coverage.datasetId !== graph.datasetVersion.datasetId ||
    coverage.schemaVersion !== GTFS_TRANSFER_SCHEMA_VERSION
  ) {
    return "unsupported_coverage";
  }
  if (graph.datasetVersion.completeness !== "complete_provider_dump") {
    return graph.datasetVersion.completeness === "fixture_subset" ||
      graph.datasetVersion.completeness === "bounded_subset"
      ? "partial_timetable"
      : "unsupported_coverage";
  }
  const baseIssue = coverageReason(
    graph,
    coverage,
    candidate.route,
    candidate.operator,
    index,
  );
  if (baseIssue !== null) {
    return baseIssue === "partial_timetable"
      ? "partial_timetable"
      : baseIssue === "broken_graph_reference"
        ? "broken_graph_reference"
        : "transfer_coverage_untrusted";
  }
  const entries = coverage.entries.filter(
    (entry) =>
      entry.provider === candidate.route.provider &&
      entry.operator === candidate.operator.providerOperatorId &&
      entry.mode === candidate.route.mode,
  );
  if (entries.length !== 1) return "transfer_coverage_untrusted";
  const entry = entries[0];
  if (
    entry === undefined ||
    entry.datasetId !== graph.datasetVersion.datasetId ||
    entry.topology !== "imported" ||
    entry.timetable !== "imported"
  ) {
    return "transfer_coverage_untrusted";
  }
  if (entry.transfers === "imported") return null;
  if (
    entry.transfers === "not_imported_in_this_slice" &&
    graph.datasetVersion.schemaVersion === GTFS_TRANSFER_SCHEMA_VERSION
  ) {
    return null;
  }
  return "transfer_coverage_untrusted";
}

function serviceEndpointFact(
  facts: readonly TransitScheduledStopTime[],
  stopId: string,
): TransitScheduledStopTime | null {
  const matches = facts.filter((fact) => fact.stopId === stopId);
  return matches.length === 1 ? (matches[0] ?? null) : null;
}

function evaluateConnection(
  graph: NormalizedTransitGraph,
  transferFromStopId: string,
  transferToStopId: string,
  incoming: ValidatedService,
  outgoing: ValidatedService,
  incomingArrivalSeconds: number,
  outgoingDepartureSeconds: number,
): TransferConnectionOutcome {
  const query: ApplicableTransferResult = resolveApplicableTransfers(graph, {
    fromStopId: transferFromStopId,
    toStopId: transferToStopId,
    incomingRouteId: incoming.route.id,
    outgoingRouteId: outgoing.route.id,
    incomingServiceId: incoming.service.id,
    outgoingServiceId: outgoing.service.id,
  });
  if (query.status === "invalid_query") {
    return {
      kind: "inconclusive",
      reason: "invalid_transfer_query",
      notes: [`invalid_query:${query.reason}`],
    };
  }
  if (query.transfers.length > 1) {
    return inconclusive("ambiguous_transfer_rule", [
      `transfer_rules:${query.transfers.length}`,
    ]);
  }

  const transferRule = query.transfers[0] ?? null;
  const linkedType = linkedTripTransferType(
    graph,
    incoming.service.id,
    outgoing.service.id,
  );
  if (linkedType === 4 || linkedType === 5) {
    return inconclusive("transfer_type_not_supported", [
      `transfer_type:${linkedType}`,
    ]);
  }

  const transferWaitSeconds = outgoingDepartureSeconds - incomingArrivalSeconds;
  if (transferRule === null) {
    if (transferFromStopId !== transferToStopId) {
      return inconclusive("unmodeled_transfer_movement");
    }
    return transferWaitSeconds >= MEGURUTO_SAME_STOP_TRANSFER_MIN_SECONDS
      ? {
          kind: "valid",
          requiredTransferSeconds: MEGURUTO_SAME_STOP_TRANSFER_MIN_SECONDS,
          transferBasis: "meguruto_same_stop_policy",
          transferRule: null,
        }
      : {
          kind: "no_match",
          reason: "transfer_connection_miss",
          notes: [
            `required_transfer_seconds:${MEGURUTO_SAME_STOP_TRANSFER_MIN_SECONDS}`,
            `actual_transfer_seconds:${transferWaitSeconds}`,
          ],
        };
  }

  const transferType = transferRule.sourceSemantics.transferType;
  if (transferType === 3) {
    return noMatch("transfer_prohibited", [`transfer_rule:${transferRule.id}`]);
  }
  if (transferType === 4 || transferType === 5) {
    return inconclusive("transfer_type_not_supported", [
      `transfer_type:${transferType}`,
    ]);
  }
  if (transferWaitSeconds < 0) {
    return inconclusive("chronology_invalid", [
      `transfer_wait_seconds:${transferWaitSeconds}`,
    ]);
  }

  if (transferType === 1) {
    return {
      kind: "valid",
      requiredTransferSeconds: 0,
      transferBasis: "gtfs_timed",
      transferRule,
    };
  }

  if (transferType === 2) {
    if (transferRule.minimumTransferSeconds === null) {
      return inconclusive("transfer_minimum_unknown", [
        `transfer_rule:${transferRule.id}`,
      ]);
    }
    return transferWaitSeconds >= transferRule.minimumTransferSeconds
      ? {
          kind: "valid",
          requiredTransferSeconds: transferRule.minimumTransferSeconds,
          transferBasis: "gtfs_minimum",
          transferRule,
        }
      : {
          kind: "no_match",
          reason: "transfer_connection_miss",
          notes: [
            `required_transfer_seconds:${transferRule.minimumTransferSeconds}`,
            `actual_transfer_seconds:${transferWaitSeconds}`,
          ],
        };
  }

  if (transferRule.minimumTransferSeconds !== null) {
    return transferWaitSeconds >= transferRule.minimumTransferSeconds
      ? {
          kind: "valid",
          requiredTransferSeconds: transferRule.minimumTransferSeconds,
          transferBasis: "gtfs_recommended_with_minimum",
          transferRule,
        }
      : {
          kind: "no_match",
          reason: "transfer_connection_miss",
          notes: [
            `required_transfer_seconds:${transferRule.minimumTransferSeconds}`,
            `actual_transfer_seconds:${transferWaitSeconds}`,
          ],
        };
  }
  if (transferFromStopId !== transferToStopId) {
    return inconclusive("unmodeled_transfer_movement", [
      `transfer_rule:${transferRule.id}`,
    ]);
  }
  return transferWaitSeconds >= MEGURUTO_SAME_STOP_TRANSFER_MIN_SECONDS
    ? {
        kind: "valid",
        requiredTransferSeconds: MEGURUTO_SAME_STOP_TRANSFER_MIN_SECONDS,
        transferBasis: "meguruto_same_stop_policy",
        transferRule,
      }
    : {
        kind: "no_match",
        reason: "transfer_connection_miss",
        notes: [
          `required_transfer_seconds:${MEGURUTO_SAME_STOP_TRANSFER_MIN_SECONDS}`,
          `actual_transfer_seconds:${transferWaitSeconds}`,
        ],
      };
}

function legEvidence(
  candidate: ValidatedService,
  pair: ValidPair,
  serviceDate: string,
  coverageState: OneTransferCoverageState,
): OneTransferScheduledJourneyLegEvidence {
  return {
    provider: candidate.service.provider,
    serviceDate,
    calendarReason: candidate.calendarEvaluation.reason,
    calendarId: candidate.calendar.id,
    providerCalendarId: candidate.calendar.providerCalendarId,
    serviceId: candidate.service.id,
    providerServiceId: candidate.service.providerServiceId,
    routeId: candidate.route.id,
    providerRouteId: candidate.route.providerRouteId,
    patternId: candidate.service.patternId,
    operatorId: candidate.operator.id,
    providerOperatorId: candidate.operator.providerOperatorId,
    routeName: candidate.routeName,
    scheduledDepartureServiceSeconds: pair.departureSeconds,
    scheduledArrivalServiceSeconds: pair.arrivalSeconds,
    durationServiceSeconds: pair.durationSeconds,
    scheduledDepartureTime: formatServiceSeconds(pair.departureSeconds),
    scheduledArrivalTime: formatServiceSeconds(pair.arrivalSeconds),
    boardingRequiresArrangement: pair.boardingRequiresArrangement,
    alightingRequiresArrangement: pair.alightingRequiresArrangement,
    coverageState,
    topologyCoverageState: "imported",
    timetableCoverageState: "imported",
  };
}

function transferCoverageStateFor(
  coverage: TransitCoverageReport,
  candidate: ValidatedService,
): OneTransferCoverageState {
  const entry = coverage.entries.find(
    (item) =>
      item.provider === candidate.route.provider &&
      item.operator === candidate.operator.providerOperatorId &&
      item.mode === candidate.route.mode,
  );
  return entry?.transfers === "imported"
    ? "imported"
    : "not_imported_in_this_slice";
}

function leg(
  candidate: ValidatedService,
  pair: ValidPair,
  origin: JourneyEndpoint,
  destination: JourneyEndpoint,
  provenance: JourneyProvenance,
  source: string,
): JourneyLeg {
  return {
    mode: candidate.mode,
    direction: "one_way",
    origin,
    destination,
    duration: {
      minutes: [pair.durationSeconds / 60, pair.durationSeconds / 60],
      evidence: "verified",
      source,
      checkedAt: provenance.checkedAt,
    },
    cost: unknownSafeCost(),
    availability: "available",
    confidence: "high",
    provenance,
    routeMetadata: {
      source,
      serviceName: candidate.routeName ?? undefined,
      operator: candidate.operator.providerOperatorId,
    },
  };
}

function makeVerifiedResult(
  input: RouteOneTransferScheduledJourneyInput,
  index: IndexedGraph,
  candidate: ValidTransferCandidate,
): Extract<OneTransferScheduledJourneyResult, { readonly kind: "verified" }> {
  const originStop = index.stops.get(candidate.firstPair.origin.stopId);
  const transferFromStop = index.stops.get(candidate.transferFromStopId);
  const transferToStop = index.stops.get(candidate.transferToStopId);
  const destinationStop = index.stops.get(
    candidate.secondPair.destination.stopId,
  );
  if (
    originStop === undefined ||
    transferFromStop === undefined ||
    transferToStop === undefined ||
    destinationStop === undefined
  ) {
    throw new Error("validated transfer candidate references an unknown stop");
  }
  const origin = stopEndpoint(originStop);
  const transferFrom = stopEndpoint(transferFromStop);
  const transferTo = stopEndpoint(transferToStop);
  const destination = stopEndpoint(destinationStop);
  const provenance: JourneyProvenance = {
    source: GTFS_ONE_TRANSFER_JOURNEY_SOURCE,
    confidence: "high",
    duration: "verified",
    cost: "unknown",
    checkedAt: input.graph.datasetVersion.checkedAt,
  };
  if (input.coverage === undefined) {
    throw new Error("validated transfer candidate is missing coverage");
  }
  const firstCoverageState = transferCoverageStateFor(
    input.coverage,
    candidate.first,
  );
  const secondCoverageState = transferCoverageStateFor(
    input.coverage,
    candidate.second,
  );
  const firstLeg = leg(
    candidate.first,
    candidate.firstPair,
    origin,
    transferFrom,
    provenance,
    GTFS_ONE_TRANSFER_JOURNEY_SOURCE,
  );
  const secondLeg = leg(
    candidate.second,
    candidate.secondPair,
    transferTo,
    destination,
    provenance,
    GTFS_ONE_TRANSFER_JOURNEY_SOURCE,
  );
  const journey: Journey = {
    kind: "journey",
    origin,
    destination,
    scope: "complete_journey",
    directionality: "multi_leg",
    completeness: "complete",
    externalHandoff: journeyHandoffCapabilityForMode(
      candidate.first.mode,
      "complete",
      "available",
    ),
    legs: [firstLeg, secondLeg],
    availability: "available",
    confidence: "high",
    provenance,
  };
  const firstEvidence = legEvidence(
    candidate.first,
    candidate.firstPair,
    input.serviceDate,
    firstCoverageState,
  );
  const secondEvidence = legEvidence(
    candidate.second,
    candidate.secondPair,
    input.serviceDate,
    secondCoverageState,
  );
  const totalDurationSeconds =
    candidate.secondPair.arrivalSeconds - candidate.firstPair.departureSeconds;
  const evidence: OneTransferScheduledJourneyEvidence = {
    source: GTFS_ONE_TRANSFER_JOURNEY_SOURCE,
    provider: candidate.first.service.provider,
    serviceDate: input.serviceDate,
    transferCount: 1,
    firstServiceId: candidate.first.service.id,
    secondServiceId: candidate.second.service.id,
    transferFromStopId: candidate.transferFromStopId,
    transferToStopId: candidate.transferToStopId,
    incomingArrivalServiceSeconds: candidate.firstPair.arrivalSeconds,
    outgoingDepartureServiceSeconds: candidate.secondPair.departureSeconds,
    transferWaitSeconds: candidate.transferWaitSeconds,
    requiredTransferSeconds: candidate.requiredTransferSeconds,
    transferBasis: candidate.transferBasis,
    coverageState:
      firstCoverageState === "imported" && secondCoverageState === "imported"
        ? "imported"
        : "not_imported_in_this_slice",
    firstCoverageState,
    secondCoverageState,
    topologyCoverageState: "imported",
    timetableCoverageState: "imported",
    ...(candidate.transferRule === null
      ? {}
      : {
          transferRuleId: candidate.transferRule.id,
          transferType: candidate.transferRule.sourceSemantics.transferType,
        }),
    totalDurationSeconds,
    datasetId: input.graph.datasetVersion.datasetId,
    contentHash: input.graph.datasetVersion.contentHash,
    sourceType: input.graph.datasetVersion.sourceType,
    completeness: input.graph.datasetVersion.completeness,
    retrievedAt: input.graph.datasetVersion.retrievedAt,
    checkedAt: input.graph.datasetVersion.checkedAt,
    firstLeg: firstEvidence,
    secondLeg: secondEvidence,
  };
  return {
    kind: "verified",
    journey,
    evidence,
    durationSeconds: totalDurationSeconds,
    totalDurationSeconds,
  };
}

function outcomePriority(outcome: TransferCandidateOutcome): number {
  if (outcome.kind === "inconclusive") return 0;
  if (outcome.kind === "valid") return Number.MAX_SAFE_INTEGER;
  const priority: readonly OneTransferScheduledJourneyNoMatchReason[] = [
    "transfer_prohibited",
    "transfer_connection_miss",
    "departure_window_miss",
    "inactive_service",
    "destination_before_origin",
    "no_one_transfer_service",
    "origin_stop_absent",
    "destination_stop_absent",
    "missing_origin_departure",
    "missing_destination_arrival",
    "origin_equals_destination",
  ];
  return 1 + priority.indexOf(outcome.reason);
}

function aggregateOutcomes(
  outcomes: readonly TransferCandidateOutcome[],
  sawInactive: boolean,
): Extract<
  OneTransferScheduledJourneyResult,
  { readonly kind: "no_match" | "inconclusive" }
> {
  const firstInconclusive = outcomes
    .filter((outcome) => outcome.kind === "inconclusive")
    .sort((left, right) => {
      const leftReason = left.kind === "inconclusive" ? left.reason : "";
      const rightReason = right.kind === "inconclusive" ? right.reason : "";
      return lexical(leftReason, rightReason);
    })[0];
  if (firstInconclusive?.kind === "inconclusive") {
    return inconclusive(firstInconclusive.reason, firstInconclusive.notes);
  }
  const noMatches = outcomes
    .filter((outcome) => outcome.kind === "no_match")
    .sort(
      (left, right) =>
        outcomePriority(left) - outcomePriority(right) ||
        lexical(
          left.kind === "no_match" ? left.reason : "",
          right.kind === "no_match" ? right.reason : "",
        ),
    );
  const first = noMatches[0];
  if (first?.kind === "no_match") return noMatch(first.reason, first.notes);
  return noMatch(sawInactive ? "inactive_service" : "no_one_transfer_service");
}

function resultFromDirectOutcome(
  outcome: ReturnType<typeof directPair>,
): Extract<
  TransferCandidateOutcome,
  { readonly kind: "no_match" | "inconclusive" }
> | null {
  if (outcome.kind === "valid") return null;
  return outcome.kind === "no_match"
    ? noMatch(
        outcome.reason as OneTransferScheduledJourneyNoMatchReason,
        outcome.notes,
      )
    : inconclusive(
        outcome.reason as OneTransferScheduledJourneyInconclusiveReason,
        outcome.notes,
      );
}

function candidateComparator(
  left: ValidTransferCandidate,
  right: ValidTransferCandidate,
): number {
  return (
    left.secondPair.arrivalSeconds - right.secondPair.arrivalSeconds ||
    left.firstPair.departureSeconds - right.firstPair.departureSeconds ||
    left.transferWaitSeconds - right.transferWaitSeconds ||
    lexical(left.first.service.id, right.first.service.id) ||
    lexical(left.second.service.id, right.second.service.id) ||
    lexical(left.transferFromStopId, right.transferFromStopId) ||
    lexical(left.transferToStopId, right.transferToStopId)
  );
}

/**
 * Route one scheduled passenger transfer using two distinct services.
 * Coverage must prove a complete C2 feed plus D1 transfer evaluation.
 */
export function routeOneTransferScheduledJourney(
  input: RouteOneTransferScheduledJourneyInput,
): OneTransferScheduledJourneyResult {
  if (!isRealGtfsServiceDate(input.serviceDate)) {
    return inconclusive("invalid_service_date");
  }
  if (
    !Number.isSafeInteger(input.earliestDepartureServiceSeconds) ||
    input.earliestDepartureServiceSeconds < 0
  ) {
    return inconclusive("invalid_earliest_departure");
  }
  if (input.originStopId === input.destinationStopId) {
    return noMatch("origin_equals_destination");
  }
  const provider: TransitProvider = input.graph.datasetVersion.provider;
  if (provider !== "gtfs" && provider !== "gtfs-jp") {
    return inconclusive("unsupported_coverage");
  }
  if (
    input.graph.scheduledServices === undefined ||
    input.graph.scheduledStopTimes === undefined ||
    input.graph.scheduledServices.length === 0 ||
    input.graph.scheduledStopTimes.length === 0
  ) {
    return inconclusive("unsupported_coverage");
  }
  let index: IndexedGraph | null;
  try {
    index = buildIndex(input.graph);
  } catch {
    index = null;
  }
  if (index === null) return inconclusive("broken_graph_reference");
  if (!index.stops.has(input.originStopId))
    return noMatch("origin_stop_absent");
  if (!index.stops.has(input.destinationStopId)) {
    return noMatch("destination_stop_absent");
  }
  const incomingIds = [
    ...(index.serviceIdsByStop.get(input.originStopId) ?? new Set<string>()),
  ].sort(lexical);
  if (incomingIds.length === 0) return noMatch("no_one_transfer_service");

  const outcomes: TransferCandidateOutcome[] = [];
  const valid: ValidTransferCandidate[] = [];
  let sawInactive = false;
  for (const incomingId of incomingIds) {
    const incomingService = index.services.get(incomingId);
    if (incomingService === undefined) {
      outcomes.push(inconclusive("broken_graph_reference"));
      continue;
    }
    const incoming = validateService(
      input.graph,
      index,
      incomingService,
      input.serviceDate,
    );
    if ("kind" in incoming) {
      outcomes.push(inconclusive(incoming.reason, incoming.notes));
      continue;
    }
    if (!incoming.calendarEvaluation.active) {
      sawInactive = true;
      outcomes.push(noMatch("inactive_service"));
      continue;
    }
    const incomingCoverage = coverageIssue(
      input.graph,
      input.coverage,
      incoming,
      index,
    );
    if (incomingCoverage !== null) {
      outcomes.push(inconclusive(incomingCoverage));
      continue;
    }
    const incomingFacts = index.factsByService.get(incoming.service.id) ?? [];
    const originFact = serviceEndpointFact(incomingFacts, input.originStopId);
    if (originFact === null) {
      outcomes.push(noMatch("origin_stop_absent"));
      continue;
    }
    const laterFacts = incomingFacts.filter(
      (fact) => fact.order > originFact.order,
    );
    if (laterFacts.length === 0) {
      outcomes.push(noMatch("no_one_transfer_service"));
      continue;
    }
    for (const transferFromFact of laterFacts) {
      const firstPairOutcome = directPair(
        incoming,
        input.originStopId,
        transferFromFact.stopId,
        input.earliestDepartureServiceSeconds,
      );
      const firstPairError = resultFromDirectOutcome(firstPairOutcome);
      if (firstPairError !== null) {
        outcomes.push(firstPairError);
        continue;
      }
      if (firstPairOutcome.kind !== "valid") continue;
      const transferFromStopId = transferFromFact.stopId;
      const transferToIds = [
        transferFromStopId,
        ...explicitTransferTargets(input.graph, transferFromStopId),
      ]
        .filter((stopId, position, all) => all.indexOf(stopId) === position)
        .sort(lexical);
      for (const transferToStopId of transferToIds) {
        const outgoingIds = [
          ...(index.serviceIdsByStop.get(transferToStopId) ??
            new Set<string>()),
        ].sort(lexical);
        for (const outgoingId of outgoingIds) {
          if (outgoingId === incoming.service.id) {
            outcomes.push(
              noMatch("no_one_transfer_service", ["same_service_not_transfer"]),
            );
            continue;
          }
          const outgoingService = index.services.get(outgoingId);
          if (outgoingService === undefined) {
            outcomes.push(inconclusive("broken_graph_reference"));
            continue;
          }
          const outgoing = validateService(
            input.graph,
            index,
            outgoingService,
            input.serviceDate,
          );
          if ("kind" in outgoing) {
            outcomes.push(inconclusive(outgoing.reason, outgoing.notes));
            continue;
          }
          if (!outgoing.calendarEvaluation.active) {
            sawInactive = true;
            outcomes.push(noMatch("inactive_service"));
            continue;
          }
          const outgoingCoverage = coverageIssue(
            input.graph,
            input.coverage,
            outgoing,
            index,
          );
          if (outgoingCoverage !== null) {
            outcomes.push(inconclusive(outgoingCoverage));
            continue;
          }
          const secondPairOutcome = directPair(
            outgoing,
            transferToStopId,
            input.destinationStopId,
            0,
          );
          const secondPairError = resultFromDirectOutcome(secondPairOutcome);
          if (secondPairError !== null) {
            outcomes.push(secondPairError);
            continue;
          }
          if (secondPairOutcome.kind !== "valid") continue;
          const connection = evaluateConnection(
            input.graph,
            transferFromStopId,
            transferToStopId,
            incoming,
            outgoing,
            firstPairOutcome.pair.arrivalSeconds,
            secondPairOutcome.pair.departureSeconds,
          );
          if (connection.kind !== "valid") {
            outcomes.push(connection);
            continue;
          }
          const transferWaitSeconds =
            secondPairOutcome.pair.departureSeconds -
            firstPairOutcome.pair.arrivalSeconds;
          valid.push({
            first: incoming,
            second: outgoing,
            firstPair: firstPairOutcome.pair,
            secondPair: secondPairOutcome.pair,
            transferFromStopId,
            transferToStopId,
            transferWaitSeconds,
            requiredTransferSeconds: connection.requiredTransferSeconds,
            transferBasis: connection.transferBasis,
            transferRule: connection.transferRule,
          });
        }
      }
    }
  }
  if (valid.length === 0) return aggregateOutcomes(outcomes, sawInactive);
  valid.sort(candidateComparator);
  const selected = valid[0];
  if (selected === undefined) return noMatch("no_one_transfer_service");
  try {
    return makeVerifiedResult(input, index, selected);
  } catch {
    return inconclusive("broken_graph_reference");
  }
}
