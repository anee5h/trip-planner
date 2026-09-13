/**
 * KAI-292C1 — bounded local-only Sakata composer audit.
 *
 * The feed is already present in the ignored cache. This script never downloads
 * data and reports only derived journey/composition facts.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";

import {
  listBoundedGtfsZipEntryNames,
  parseGtfsFeed,
  readBoundedGtfsZip,
} from "./gtfsFeedReader";
import { readBoundedLocalGtfsFile } from "./readBoundedLocalGtfsFile";
import {
  importGtfsSchedule,
  isGtfsServiceActiveOnDate,
  type GtfsScheduleMetadata,
} from "../../src/shared/services/transport/static/gtfsScheduleImporter";
import { importGtfsTransfers } from "../../src/shared/services/transport/static/gtfsTransferImporter";
import { routeBestScheduledJourney } from "../../src/shared/services/transport/static/scheduledJourneyComposer";
import { formatServiceSeconds } from "../../src/shared/services/transport/static/scheduledJourneyRouter";
import type {
  NormalizedTransitGraph,
  TransitScheduledStopTime,
} from "../../src/shared/services/transport/static/transitGraphTypes";

export const SAKATA_COMPOSER_FEED_PATH =
  ".cache/transit/gtfs/sakata-20260401/sakata_gtfs_jp_20260401.zip";
export const SAKATA_COMPOSER_SOURCE_URL =
  "https://www.city.sakata.lg.jp/shisei/opendata/opendata_busu.html";
export const SAKATA_COMPOSER_LICENSE =
  "Creative Commons Attribution 4.0 International (CC BY 4.0)";
export const SAKATA_COMPOSER_DATASET_ID = "gtfs-jp-sakata-runrunbus-20260401";
export const SAKATA_COMPOSER_IDENTITY_NAMESPACE = "gtfs:sakata-runrunbus";
export const SAKATA_COMPOSER_DATES = [
  "2026-04-01",
  "2026-04-02",
  "2026-04-04",
  "2026-04-06",
  "2026-04-10",
] as const;
export const SAKATA_COMPOSER_CANDIDATE_LIMIT = 2000;

const METADATA: GtfsScheduleMetadata = {
  provider: "gtfs",
  datasetId: SAKATA_COMPOSER_DATASET_ID,
  identityNamespace: SAKATA_COMPOSER_IDENTITY_NAMESPACE,
  sourceDescriptor: `official Sakata City GTFS-JP open data: ${SAKATA_COMPOSER_SOURCE_URL}`,
  sourceType: "data_dump",
  retrievedAt: "2026-09-13T00:00:00.000Z",
  checkedAt: "2026-09-13T00:00:00.000Z",
  completeness: "complete_provider_dump",
};

function serviceFacts(
  graph: NormalizedTransitGraph,
): Map<string, TransitScheduledStopTime[]> {
  const factsByService = new Map<string, TransitScheduledStopTime[]>();
  for (const fact of graph.scheduledStopTimes ?? []) {
    const facts = factsByService.get(fact.serviceId) ?? [];
    facts.push(fact);
    factsByService.set(fact.serviceId, facts);
  }
  return factsByService;
}

function activeServices(graph: NormalizedTransitGraph, date: string) {
  return (graph.scheduledServices ?? [])
    .filter((service) => {
      const calendar = graph.calendars.find(
        (candidate) => candidate.id === service.calendarId,
      );
      return (
        calendar !== undefined &&
        isGtfsServiceActiveOnDate(calendar, date).active
      );
    })
    .sort((left, right) =>
      left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
    );
}

function addDirectCandidateKeys(
  keys: Set<string>,
  factsByService: ReadonlyMap<string, readonly TransitScheduledStopTime[]>,
  serviceIds: readonly string[],
): void {
  for (const serviceId of serviceIds) {
    const facts = factsByService.get(serviceId) ?? [];
    for (const origin of facts) {
      for (const destination of facts) {
        if (origin.order < destination.order) {
          keys.add(`${origin.stopId}\u0000${destination.stopId}`);
        }
      }
    }
  }
}

function addTransferCandidateKeys(
  graph: NormalizedTransitGraph,
  keys: Set<string>,
  factsByService: ReadonlyMap<string, readonly TransitScheduledStopTime[]>,
  serviceIds: readonly string[],
): void {
  const transferTargets = new Map<string, string[]>();
  for (const transfer of graph.transfers ?? []) {
    if (transfer.fromStopId === null || transfer.toStopId === null) continue;
    const targets = transferTargets.get(transfer.fromStopId) ?? [];
    targets.push(transfer.toStopId);
    transferTargets.set(transfer.fromStopId, targets);
  }
  for (const firstServiceId of serviceIds) {
    const firstFacts = factsByService.get(firstServiceId) ?? [];
    for (const secondServiceId of serviceIds) {
      if (firstServiceId === secondServiceId) continue;
      const secondFacts = factsByService.get(secondServiceId) ?? [];
      for (const transferFrom of firstFacts) {
        const targets = [
          transferFrom.stopId,
          ...(transferTargets.get(transferFrom.stopId) ?? []),
        ];
        for (const transferTo of new Set(targets)) {
          const secondTransferFacts = secondFacts.filter(
            (fact) => fact.stopId === transferTo,
          );
          for (const origin of firstFacts) {
            if (origin.order >= transferFrom.order) continue;
            for (const secondTransfer of secondTransferFacts) {
              for (const destination of secondFacts) {
                if (secondTransfer.order < destination.order) {
                  keys.add(`${origin.stopId}\u0000${destination.stopId}`);
                }
              }
            }
          }
        }
      }
    }
  }
}

function candidateKeys(graph: NormalizedTransitGraph, date: string): string[] {
  const services = activeServices(graph, date);
  const serviceIds = services.map((service) => service.id);
  const factsByService = serviceFacts(graph);
  const keys = new Set<string>();
  addDirectCandidateKeys(keys, factsByService, serviceIds);
  addTransferCandidateKeys(graph, keys, factsByService, serviceIds);
  return [...keys].sort().slice(0, SAKATA_COMPOSER_CANDIDATE_LIMIT);
}

function providerStopId(graph: NormalizedTransitGraph, stopId: string): string {
  const stop = graph.stops.find((candidate) => candidate.id === stopId);
  if (stop === undefined) throw new Error(`unknown stop ${stopId}`);
  return stop.providerStopId;
}

function attemptSummary(attempt: {
  readonly kind: "verified" | "no_match" | "inconclusive";
  readonly reason?: string;
}): Record<string, string> {
  return {
    kind: attempt.kind,
    ...(attempt.reason === undefined ? {} : { reason: attempt.reason }),
  };
}

type AuditExample = {
  readonly directAvailable: boolean;
  readonly oneTransferAvailable: boolean;
  readonly record: Record<string, unknown>;
};

function representativeExamples(
  candidates: readonly AuditExample[],
): Record<string, unknown>[] {
  const selected: AuditExample[] = [];
  const used = new Set<AuditExample>();
  const preferred = [
    (candidate: AuditExample) =>
      candidate.directAvailable && candidate.oneTransferAvailable,
    (candidate: AuditExample) =>
      candidate.directAvailable && !candidate.oneTransferAvailable,
    (candidate: AuditExample) =>
      !candidate.directAvailable && candidate.oneTransferAvailable,
  ];
  for (const predicate of preferred) {
    const candidate = candidates.find(
      (item) => !used.has(item) && predicate(item),
    );
    if (candidate !== undefined) {
      used.add(candidate);
      selected.push(candidate);
    }
  }
  for (const candidate of candidates) {
    if (selected.length >= 5) break;
    if (!used.has(candidate)) {
      used.add(candidate);
      selected.push(candidate);
    }
  }
  return selected.map((candidate) => candidate.record);
}

export function auditSakataCompositions(): Record<string, unknown> {
  const absolutePath = resolve(process.cwd(), SAKATA_COMPOSER_FEED_PATH);
  if (!existsSync(absolutePath)) {
    return {
      status: "local_cache_unavailable",
      path: SAKATA_COMPOSER_FEED_PATH,
      sourceUrl: SAKATA_COMPOSER_SOURCE_URL,
      license: SAKATA_COMPOSER_LICENSE,
      note: "No local Sakata feed was audited; no real-feed composition result is claimed.",
    };
  }

  const bytes = readBoundedLocalGtfsFile(absolutePath);
  const entryNames = [...listBoundedGtfsZipEntryNames(bytes)].sort();
  const tables = parseGtfsFeed(readBoundedGtfsZip(bytes));
  const c2 = importGtfsSchedule(tables, METADATA);
  const d1 = importGtfsTransfers(c2, tables, METADATA);
  const candidateExamples: AuditExample[] = [];
  let directAvailableCount = 0;
  let oneTransferAvailableCount = 0;
  let bothAvailableCount = 0;
  let checkedCandidateCount = 0;

  for (const serviceDate of SAKATA_COMPOSER_DATES) {
    for (const key of candidateKeys(d1.graph, serviceDate)) {
      checkedCandidateCount += 1;
      const [originStopId, destinationStopId] = key.split("\u0000");
      if (originStopId === undefined || destinationStopId === undefined)
        continue;
      const result = routeBestScheduledJourney({
        graph: d1.graph,
        coverage: d1.coverage,
        originStopId,
        destinationStopId,
        serviceDate,
        earliestDepartureServiceSeconds: 0,
      });
      const directAttempt =
        result.kind === "verified"
          ? result.evidence.directAttempt
          : result.diagnostics.directAttempt;
      const oneTransferAttempt =
        result.kind === "verified"
          ? result.evidence.oneTransferAttempt
          : result.diagnostics.oneTransferAttempt;
      const directAvailable = directAttempt.kind === "verified";
      const oneTransferAvailable = oneTransferAttempt.kind === "verified";
      if (directAvailable) directAvailableCount += 1;
      if (oneTransferAvailable) oneTransferAvailableCount += 1;
      if (directAvailable && oneTransferAvailable) bothAvailableCount += 1;
      if (!directAvailable && !oneTransferAvailable) continue;

      const selectedEvidence =
        result.kind === "verified" ? result.evidence : undefined;
      candidateExamples.push({
        directAvailable,
        oneTransferAvailable,
        record: {
          serviceDate,
          origin: providerStopId(d1.graph, originStopId),
          destination: providerStopId(d1.graph, destinationStopId),
          directResult: attemptSummary(directAttempt),
          transferResult: attemptSummary(oneTransferAttempt),
          selectedStrategy: result.kind === "verified" ? result.selected : null,
          departure:
            selectedEvidence === undefined
              ? null
              : selectedEvidence.initialDepartureServiceSeconds,
          departureServiceTime:
            selectedEvidence === undefined
              ? null
              : formatServiceSeconds(
                  selectedEvidence.initialDepartureServiceSeconds,
                ),
          finalArrival:
            selectedEvidence === undefined
              ? null
              : selectedEvidence.finalArrivalServiceSeconds,
          finalArrivalServiceTime:
            selectedEvidence === undefined
              ? null
              : formatServiceSeconds(
                  selectedEvidence.finalArrivalServiceSeconds,
                ),
          totalDuration:
            selectedEvidence === undefined
              ? null
              : selectedEvidence.totalDurationSeconds,
          transferCount: selectedEvidence?.transferCount ?? null,
          confidence:
            result.kind === "verified" ? result.journey.confidence : null,
          reasonForSelection: selectedEvidence?.selectionReason ?? null,
        },
      });
    }
  }

  return {
    status: "audited",
    source: "official Sakata City GTFS-JP feed",
    sourceUrl: SAKATA_COMPOSER_SOURCE_URL,
    license: SAKATA_COMPOSER_LICENSE,
    path: SAKATA_COMPOSER_FEED_PATH,
    containedTransfersFile: entryNames.includes("transfers.txt"),
    transferRows: tables.transfers?.length ?? 0,
    checkedDates: SAKATA_COMPOSER_DATES,
    candidateLimit: SAKATA_COMPOSER_CANDIDATE_LIMIT,
    checkedCandidateCount,
    directAvailableCount,
    oneTransferAvailableCount,
    bothAvailableCount,
    examples: representativeExamples(candidateExamples),
    note:
      bothAvailableCount === 0
        ? "No Sakata candidate had both direct and one-transfer results available in the bounded scan; selection competition is validated synthetically."
        : "Examples include direct-versus-one-transfer competition selected by the composer; counts are bounded by the candidate limit.",
  };
}

process.stdout.write(`${JSON.stringify(auditSakataCompositions(), null, 2)}\n`);
