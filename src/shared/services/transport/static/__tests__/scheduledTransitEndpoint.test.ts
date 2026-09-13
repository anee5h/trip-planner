import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { routeBestScheduledJourney } from "../scheduledJourneyComposer";
import {
  resolveScheduledTransitEndpoint,
  SCHEDULED_TRANSIT_CROSSWALK,
  type ScheduledTransitCrosswalkEntry,
} from "../scheduledTransitEndpoint";
import { validateScheduledTransitDataset } from "../scheduledTransitDataset";
import { SAKATA_RUNRUNBUS_DATASET } from "../scheduledTransitDatasetRegistry";
import { makeTransitEntityId } from "../transitEntityId";

const DATASET = validateScheduledTransitDataset(
  JSON.parse(
    readFileSync("public/data/transit/sakata-runrunbus.json", "utf8"),
  ) as unknown,
  SAKATA_RUNRUNBUS_DATASET,
);
const [PILOT_ORIGIN, PILOT_DESTINATION] = SCHEDULED_TRANSIT_CROSSWALK.mappings;
if (PILOT_ORIGIN === undefined || PILOT_DESTINATION === undefined) {
  throw new Error("C2 crosswalk pilot is incomplete");
}

function resolvedStopId(
  result: ReturnType<typeof resolveScheduledTransitEndpoint>,
): string {
  if (result.kind !== "resolved") {
    throw new Error(`expected resolved endpoint, got ${result.kind}`);
  }
  return result.normalizedStopId;
}

describe("scheduled transit endpoint identity bridge", () => {
  it("resolves explicit origin and destination identities with provenance", () => {
    const origin = resolveScheduledTransitEndpoint({
      dataset: DATASET,
      endpoint: PILOT_ORIGIN.endpoint,
    });
    const destination = resolveScheduledTransitEndpoint({
      dataset: DATASET,
      endpoint: PILOT_DESTINATION.endpoint,
    });

    expect(origin).toMatchObject({
      kind: "resolved",
      normalizedStopId: "gtfs:stop:gtfs%3Asakata-runrunbus:100_01",
      providerStopId: "100_01",
      identityNamespace: "gtfs:sakata-runrunbus",
      mappingId: PILOT_ORIGIN.mappingId,
    });
    expect(destination).toMatchObject({
      kind: "resolved",
      normalizedStopId: "gtfs:stop:gtfs%3Asakata-runrunbus:17_01",
      providerStopId: "17_01",
      identityNamespace: "gtfs:sakata-runrunbus",
      mappingId: PILOT_DESTINATION.mappingId,
    });
    expect(origin.kind === "resolved" && origin.provenance.kind).toBe(
      "explicit_crosswalk",
    );
  });

  it("returns explicit unmapped for unknown destinations and origins", () => {
    for (const endpoint of [
      { kind: "destination" as const, productId: "catalogue:yamagata-city" },
      { kind: "origin" as const, productId: "unmapped:current-user-origin" },
    ]) {
      expect(
        resolveScheduledTransitEndpoint({ dataset: DATASET, endpoint }),
      ).toMatchObject({
        kind: "unmapped",
        reason: "no_explicit_crosswalk",
      });
    }
  });

  it("returns ambiguous instead of selecting among conflicting mappings", () => {
    const conflicting: ScheduledTransitCrosswalkEntry = {
      ...PILOT_ORIGIN,
      mappingId: "conflicting-origin-mapping",
      providerStopId: "17_01",
      normalizedStopId: "gtfs:stop:gtfs%3Asakata-runrunbus:17_01",
    };

    expect(
      resolveScheduledTransitEndpoint({
        dataset: DATASET,
        endpoint: PILOT_ORIGIN.endpoint,
        crosswalk: [PILOT_ORIGIN, conflicting],
      }),
    ).toMatchObject({
      kind: "ambiguous",
      mappingIds: [
        "conflicting-origin-mapping",
        "kai-292c2-pilot-origin-sakata-100-01",
      ],
    });
  });

  it("keeps equal raw stop IDs separate across feed namespaces", () => {
    const feedA = makeTransitEntityId("gtfs", "stop", "gtfs:feed-a", "100");
    const feedB = makeTransitEntityId("gtfs", "stop", "gtfs:feed-b", "100");
    expect(feedA).not.toBe(feedB);

    const sameProductInOtherFeed: ScheduledTransitCrosswalkEntry = {
      ...PILOT_ORIGIN,
      mappingId: "same-raw-id-other-feed",
      endpoint: { ...PILOT_ORIGIN.endpoint, productId: "collision-check" },
      datasetId: "other-dataset",
      identityNamespace: "gtfs:feed-a",
      providerStopId: "100",
      normalizedStopId: feedA,
    };
    const sameProductInPilot: ScheduledTransitCrosswalkEntry = {
      ...PILOT_ORIGIN,
      mappingId: "same-raw-id-pilot-feed",
      endpoint: { ...PILOT_ORIGIN.endpoint, productId: "collision-check" },
      normalizedStopId: PILOT_ORIGIN.normalizedStopId,
    };
    const resolved = resolveScheduledTransitEndpoint({
      dataset: DATASET,
      endpoint: sameProductInPilot.endpoint,
      crosswalk: [sameProductInOtherFeed, sameProductInPilot],
    });

    expect(resolved).toMatchObject({
      kind: "resolved",
      normalizedStopId: PILOT_ORIGIN.normalizedStopId,
    });
    expect(sameProductInOtherFeed.normalizedStopId).toBe(feedA);
    expect(feedB).not.toBe(feedA);
  });

  it("rejects a crosswalk that rewrites an exact provider identity", () => {
    const invalid: ScheduledTransitCrosswalkEntry = {
      ...PILOT_DESTINATION,
      normalizedStopId: "gtfs:stop:gtfs%3Asakata-runrunbus:does-not-exist",
    };

    expect(
      resolveScheduledTransitEndpoint({
        dataset: DATASET,
        endpoint: invalid.endpoint,
        crosswalk: [invalid],
      }),
    ).toMatchObject({ kind: "invalid_query", reason: "invalid_crosswalk" });
  });

  it("rejects malformed crosswalk records instead of treating them as unmapped", () => {
    const malformed = {
      ...PILOT_ORIGIN,
      normalizedStopId: "",
    } as ScheduledTransitCrosswalkEntry;

    expect(
      resolveScheduledTransitEndpoint({
        dataset: DATASET,
        endpoint: malformed.endpoint,
        crosswalk: [malformed],
      }),
    ).toMatchObject({ kind: "invalid_query", reason: "invalid_crosswalk" });
  });

  it("proves the production-style seam into the existing composer", () => {
    const origin = resolveScheduledTransitEndpoint({
      dataset: DATASET,
      endpoint: PILOT_ORIGIN.endpoint,
    });
    const destination = resolveScheduledTransitEndpoint({
      dataset: DATASET,
      endpoint: PILOT_DESTINATION.endpoint,
    });

    const result = routeBestScheduledJourney({
      graph: DATASET.graph,
      coverage: DATASET.coverage,
      originStopId: resolvedStopId(origin),
      destinationStopId: resolvedStopId(destination),
      serviceDate: "2026-04-10",
      earliestDepartureServiceSeconds: 0,
    });

    expect(result).toMatchObject({
      kind: "verified",
      selected: "direct",
      transferCount: 0,
    });
    expect(result.kind === "verified" && result.evidence.datasetId).toBe(
      "gtfs-jp-sakata-runrunbus-20260401",
    );
  });
});
