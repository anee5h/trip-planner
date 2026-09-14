/**
 * KAI-292C1 — deterministic composition of direct and one-transfer journeys.
 *
 * This is intentionally only an orchestration layer. Direct and transfer
 * timetable semantics remain owned by the KAI-292A and KAI-292B primitives.
 * Product services must not infer missing graph, endpoint, date, or departure
 * inputs through this module.
 */

import type { Journey } from "@/shared/types/journey";
import * as directRouter from "./scheduledJourneyRouter";
import * as oneTransferRouter from "./oneTransferScheduledJourneyRouter";
import type {
  NormalizedTransitGraph,
  TransitCoverageReport,
} from "./transitGraphTypes";

export type SelectedScheduledJourneyEvidence =
  | directRouter.ScheduledJourneyEvidence
  | oneTransferRouter.OneTransferScheduledJourneyEvidence;

export interface RouteBestScheduledJourneyInput {
  readonly graph: NormalizedTransitGraph;
  readonly coverage: TransitCoverageReport;
  readonly originStopId: string;
  readonly destinationStopId: string;
  readonly serviceDate: string;
  /** Absolute GTFS service-day seconds; no formatted-clock comparison. */
  readonly earliestDepartureServiceSeconds: number;
}

export type ScheduledJourneyCompositionStrategy = "direct" | "one_transfer";

export type ScheduledJourneyCompositionSelectionReason =
  | "only_verified_candidate"
  | "earlier_final_arrival"
  | "fewer_transfers"
  | "earlier_initial_departure"
  | "higher_confidence"
  | "stable_strategy_order";

export interface ScheduledJourneyCompositionAttempt {
  readonly kind: "verified" | "no_match" | "inconclusive";
  readonly reason?: string;
}

export interface ScheduledJourneyCompositionDiagnostics {
  readonly datasetId: string;
  readonly contentHash: string;
  readonly directAttempt: ScheduledJourneyCompositionAttempt;
  readonly oneTransferAttempt: ScheduledJourneyCompositionAttempt;
}

export interface ScheduledJourneyCompositionEvidence extends ScheduledJourneyCompositionDiagnostics {
  readonly selected: ScheduledJourneyCompositionStrategy;
  readonly selectedJourneyEvidence?: SelectedScheduledJourneyEvidence;
  readonly selectionReason: ScheduledJourneyCompositionSelectionReason;
  readonly transferCount: 0 | 1;
  readonly initialDepartureServiceSeconds: number;
  readonly finalArrivalServiceSeconds: number;
  readonly totalDurationSeconds: number;
}

export type ScheduledJourneyCompositionResult =
  | {
      readonly kind: "verified";
      readonly journey: Journey;
      readonly selected: ScheduledJourneyCompositionStrategy;
      readonly transferCount: 0 | 1;
      readonly evidence: ScheduledJourneyCompositionEvidence;
    }
  | {
      readonly kind: "no_match";
      readonly reason: "no_scheduled_journey";
      readonly diagnostics: ScheduledJourneyCompositionDiagnostics;
    }
  | {
      readonly kind: "inconclusive";
      readonly reason: "no_verified_scheduled_journey";
      readonly diagnostics: ScheduledJourneyCompositionDiagnostics;
    };

type DirectResult = ReturnType<typeof directRouter.routeDirectScheduledJourney>;
type OneTransferResult = ReturnType<
  typeof oneTransferRouter.routeOneTransferScheduledJourney
>;
type AnyRouterResult = DirectResult | OneTransferResult;

type VerifiedCandidate = {
  readonly selected: ScheduledJourneyCompositionStrategy;
  readonly transferCount: 0 | 1;
  readonly journey: Journey;
  readonly evidence: SelectedScheduledJourneyEvidence;
  readonly initialDepartureServiceSeconds: number;
  readonly finalArrivalServiceSeconds: number;
};

function attempt(result: AnyRouterResult): ScheduledJourneyCompositionAttempt {
  if (result.kind === "verified") return { kind: "verified" };
  return { kind: result.kind, reason: result.reason };
}

function diagnostics(
  graph: NormalizedTransitGraph,
  directResult: DirectResult,
  oneTransferResult: OneTransferResult,
): ScheduledJourneyCompositionDiagnostics {
  return {
    datasetId: graph.datasetVersion.datasetId,
    contentHash: graph.datasetVersion.contentHash,
    directAttempt: attempt(directResult),
    oneTransferAttempt: attempt(oneTransferResult),
  };
}

function confidenceRank(journey: Journey): number {
  switch (journey.confidence) {
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
    case "unknown":
      return 0;
  }
}

function candidateComparator(
  left: VerifiedCandidate,
  right: VerifiedCandidate,
): number {
  return (
    left.finalArrivalServiceSeconds - right.finalArrivalServiceSeconds ||
    left.transferCount - right.transferCount ||
    left.initialDepartureServiceSeconds -
      right.initialDepartureServiceSeconds ||
    confidenceRank(right.journey) - confidenceRank(left.journey) ||
    (left.selected < right.selected
      ? -1
      : left.selected > right.selected
        ? 1
        : 0)
  );
}

function selectionReason(
  selected: VerifiedCandidate,
  candidates: readonly VerifiedCandidate[],
): ScheduledJourneyCompositionSelectionReason {
  if (candidates.length < 2) return "only_verified_candidate";
  const other = candidates.find((candidate) => candidate !== selected);
  if (other === undefined) return "only_verified_candidate";
  if (
    selected.finalArrivalServiceSeconds !== other.finalArrivalServiceSeconds
  ) {
    return "earlier_final_arrival";
  }
  if (selected.transferCount !== other.transferCount) {
    return "fewer_transfers";
  }
  if (
    selected.initialDepartureServiceSeconds !==
    other.initialDepartureServiceSeconds
  ) {
    return "earlier_initial_departure";
  }
  if (confidenceRank(selected.journey) !== confidenceRank(other.journey)) {
    return "higher_confidence";
  }
  return "stable_strategy_order";
}

function directCandidate(result: DirectResult): VerifiedCandidate | undefined {
  if (result.kind !== "verified") return undefined;
  return {
    selected: "direct",
    transferCount: 0,
    journey: result.journey,
    evidence: result.evidence,
    initialDepartureServiceSeconds:
      result.evidence.scheduledDepartureServiceSeconds,
    finalArrivalServiceSeconds: result.evidence.scheduledArrivalServiceSeconds,
  };
}

function oneTransferCandidate(
  result: OneTransferResult,
): VerifiedCandidate | undefined {
  if (result.kind !== "verified") return undefined;
  return {
    selected: "one_transfer",
    transferCount: 1,
    journey: result.journey,
    evidence: result.evidence,
    initialDepartureServiceSeconds:
      result.evidence.firstLeg.scheduledDepartureServiceSeconds,
    finalArrivalServiceSeconds:
      result.evidence.secondLeg.scheduledArrivalServiceSeconds,
  };
}

export function routeBestScheduledJourney(
  input: RouteBestScheduledJourneyInput,
): ScheduledJourneyCompositionResult {
  const directResult = directRouter.routeDirectScheduledJourney(input);
  const oneTransferResult =
    oneTransferRouter.routeOneTransferScheduledJourney(input);
  const baseDiagnostics = diagnostics(
    input.graph,
    directResult,
    oneTransferResult,
  );
  const candidates = [
    directCandidate(directResult),
    oneTransferCandidate(oneTransferResult),
  ].filter(
    (candidate): candidate is VerifiedCandidate => candidate !== undefined,
  );

  if (candidates.length === 0) {
    if (
      directResult.kind === "inconclusive" ||
      oneTransferResult.kind === "inconclusive"
    ) {
      return {
        kind: "inconclusive",
        reason: "no_verified_scheduled_journey",
        diagnostics: baseDiagnostics,
      };
    }
    return {
      kind: "no_match",
      reason: "no_scheduled_journey",
      diagnostics: baseDiagnostics,
    };
  }

  candidates.sort(candidateComparator);
  const selected = candidates[0];
  if (selected === undefined) {
    return {
      kind: "inconclusive",
      reason: "no_verified_scheduled_journey",
      diagnostics: baseDiagnostics,
    };
  }
  const evidence: ScheduledJourneyCompositionEvidence = {
    ...baseDiagnostics,
    selected: selected.selected,
    selectedJourneyEvidence: selected.evidence,
    selectionReason: selectionReason(selected, candidates),
    transferCount: selected.transferCount,
    initialDepartureServiceSeconds: selected.initialDepartureServiceSeconds,
    finalArrivalServiceSeconds: selected.finalArrivalServiceSeconds,
    totalDurationSeconds:
      selected.finalArrivalServiceSeconds -
      selected.initialDepartureServiceSeconds,
  };
  return {
    kind: "verified",
    journey: selected.journey,
    selected: selected.selected,
    transferCount: selected.transferCount,
    evidence,
  };
}
