/**
 * KAI-292B — bounded local-only Sakata one-transfer audit.
 *
 * The feed is already present in the ignored cache. This script never downloads
 * data and prints only derived journey facts, never raw GTFS rows.
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
import { routeOneTransferScheduledJourney } from "../../src/shared/services/transport/static/oneTransferScheduledJourneyRouter";
import { formatServiceSeconds } from "../../src/shared/services/transport/static/scheduledJourneyRouter";

export const SAKATA_ONE_TRANSFER_FEED_PATH =
  ".cache/transit/gtfs/sakata-20260401/sakata_gtfs_jp_20260401.zip";
export const SAKATA_ONE_TRANSFER_SOURCE_URL =
  "https://www.city.sakata.lg.jp/shisei/opendata/opendata_busu.html";
export const SAKATA_ONE_TRANSFER_LICENSE =
  "Creative Commons Attribution 4.0 International (CC BY 4.0)";
export const SAKATA_ONE_TRANSFER_DATASET_ID =
  "gtfs-jp-sakata-runrunbus-20260401";
export const SAKATA_ONE_TRANSFER_IDENTITY_NAMESPACE = "gtfs:sakata-runrunbus";
export const SAKATA_ONE_TRANSFER_DATES = [
  "2026-04-01",
  "2026-04-02",
  "2026-04-04",
  "2026-04-06",
  "2026-04-10",
] as const;
export const SAKATA_ONE_TRANSFER_CANDIDATE_LIMIT = 2000;

const METADATA: GtfsScheduleMetadata = {
  provider: "gtfs",
  datasetId: SAKATA_ONE_TRANSFER_DATASET_ID,
  identityNamespace: SAKATA_ONE_TRANSFER_IDENTITY_NAMESPACE,
  sourceDescriptor: `official Sakata City GTFS-JP open data: ${SAKATA_ONE_TRANSFER_SOURCE_URL}`,
  sourceType: "data_dump",
  retrievedAt: "2026-09-13T00:00:00.000Z",
  checkedAt: "2026-09-13T00:00:00.000Z",
  completeness: "complete_provider_dump",
};

function candidateKeys(
  graph: ReturnType<typeof importGtfsTransfers>["graph"],
  date: string,
): string[] {
  const services = graph.scheduledServices ?? [];
  const factsByService = new Map<string, typeof graph.scheduledStopTimes>();
  for (const fact of graph.scheduledStopTimes ?? []) {
    const facts = factsByService.get(fact.serviceId) ?? [];
    facts.push(fact);
    factsByService.set(fact.serviceId, facts);
  }
  const active = services
    .filter(
      (service) =>
        isGtfsServiceActiveOnDate(
          graph.calendars.find(
            (calendar) => calendar.id === service.calendarId,
          )!,
          date,
        ).active,
    )
    .sort((left, right) =>
      left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
    );
  const keys = new Set<string>();
  for (const first of active) {
    const firstFacts = factsByService.get(first.id) ?? [];
    for (const second of active) {
      if (first.id === second.id) continue;
      const secondFacts = factsByService.get(second.id) ?? [];
      const secondByStop = new Map(
        secondFacts.map((fact) => [fact.stopId, fact]),
      );
      for (const firstTransfer of firstFacts) {
        const secondTransfer = secondByStop.get(firstTransfer.stopId);
        if (secondTransfer === undefined) continue;
        for (const origin of firstFacts) {
          if (origin.order >= firstTransfer.order) continue;
          for (const destination of secondFacts) {
            if (secondTransfer.order >= destination.order) continue;
            keys.add(`${origin.stopId}\u0000${destination.stopId}`);
          }
        }
      }
    }
  }
  return [...keys].sort().slice(0, SAKATA_ONE_TRANSFER_CANDIDATE_LIMIT);
}

function stopProviderId(
  graph: ReturnType<typeof importGtfsTransfers>["graph"],
  stopId: string,
): string {
  const stop = graph.stops.find((candidate) => candidate.id === stopId);
  if (stop === undefined) throw new Error(`unknown stop ${stopId}`);
  return stop.providerStopId;
}

export function auditSakataOneTransferJourneys(): Record<string, unknown> {
  const absolutePath = resolve(process.cwd(), SAKATA_ONE_TRANSFER_FEED_PATH);
  if (!existsSync(absolutePath)) {
    return {
      status: "local_cache_unavailable",
      path: SAKATA_ONE_TRANSFER_FEED_PATH,
      sourceUrl: SAKATA_ONE_TRANSFER_SOURCE_URL,
      license: SAKATA_ONE_TRANSFER_LICENSE,
      note: "No local Sakata feed was audited; no real-feed transfer result is claimed.",
    };
  }
  const bytes = readBoundedLocalGtfsFile(absolutePath);
  const entryNames = [...listBoundedGtfsZipEntryNames(bytes)].sort();
  const tables = parseGtfsFeed(readBoundedGtfsZip(bytes));
  const c2 = importGtfsSchedule(tables, METADATA);
  const d1 = importGtfsTransfers(c2, tables, METADATA);
  const results: Record<string, unknown>[] = [];
  let checkedCandidateCount = 0;
  for (const serviceDate of SAKATA_ONE_TRANSFER_DATES) {
    for (const key of candidateKeys(d1.graph, serviceDate)) {
      if (results.length >= 3) break;
      checkedCandidateCount += 1;
      const [originStopId, destinationStopId] = key.split("\u0000");
      if (originStopId === undefined || destinationStopId === undefined)
        continue;
      const result = routeOneTransferScheduledJourney({
        graph: d1.graph,
        coverage: d1.coverage,
        originStopId,
        destinationStopId,
        serviceDate,
        earliestDepartureServiceSeconds: 0,
      });
      if (
        result.kind !== "verified" ||
        result.evidence.transferBasis !== "meguruto_same_stop_policy"
      ) {
        continue;
      }
      results.push({
        serviceDate,
        firstServiceId: result.evidence.firstServiceId,
        firstProviderServiceId: result.evidence.firstLeg.providerServiceId,
        origin: stopProviderId(d1.graph, originStopId),
        transferStop: stopProviderId(
          d1.graph,
          result.evidence.transferFromStopId,
        ),
        firstArrival: result.evidence.incomingArrivalServiceSeconds,
        firstArrivalServiceTime: formatServiceSeconds(
          result.evidence.incomingArrivalServiceSeconds,
        ),
        secondServiceId: result.evidence.secondServiceId,
        secondProviderServiceId: result.evidence.secondLeg.providerServiceId,
        destination: stopProviderId(d1.graph, destinationStopId),
        secondDeparture: result.evidence.outgoingDepartureServiceSeconds,
        secondDepartureServiceTime: formatServiceSeconds(
          result.evidence.outgoingDepartureServiceSeconds,
        ),
        finalArrival: result.evidence.secondLeg.scheduledArrivalServiceSeconds,
        finalArrivalServiceTime: formatServiceSeconds(
          result.evidence.secondLeg.scheduledArrivalServiceSeconds,
        ),
        transferGap: result.evidence.transferWaitSeconds,
        requiredPolicyGap: result.evidence.requiredTransferSeconds,
        totalJourneyDuration: result.evidence.totalDurationSeconds,
        firstRoute: result.evidence.firstLeg.providerRouteId,
        secondRoute: result.evidence.secondLeg.providerRouteId,
        firstOperator: result.evidence.firstLeg.providerOperatorId,
        secondOperator: result.evidence.secondLeg.providerOperatorId,
        transferBasis: result.evidence.transferBasis,
        transferCount: result.evidence.transferCount,
      });
    }
    if (results.length >= 3) break;
  }
  return {
    status: results.length === 0 ? "no_defensible_example" : "audited",
    source: "official Sakata City GTFS-JP feed",
    sourceUrl: SAKATA_ONE_TRANSFER_SOURCE_URL,
    license: SAKATA_ONE_TRANSFER_LICENSE,
    path: SAKATA_ONE_TRANSFER_FEED_PATH,
    containedTransfersFile: entryNames.includes("transfers.txt"),
    transferRows: tables.transfers?.length ?? 0,
    checkedDates: SAKATA_ONE_TRANSFER_DATES,
    checkedCandidateCount,
    results,
    note:
      results.length === 0
        ? "No defensible Sakata exact-same-stop one-transfer example was found in the bounded fixed-date audit; synthetic proof only."
        : "Only exact-same-stop Meguruto-policy results are reported; scheduled connection time is not walking time.",
  };
}

process.stdout.write(
  `${JSON.stringify(auditSakataOneTransferJourneys(), null, 2)}\n`,
);
