import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  auditRealMegurutoCorridor,
  type RealCorridorAudit,
} from "../audit-kai-292c4a-real-corridor";
import {
  resolveScheduledTransitEndpoint,
  SCHEDULED_TRANSIT_CROSSWALK,
  type ScheduledTransitCrosswalkEntry,
} from "../../../src/shared/services/transport/static/scheduledTransitEndpoint";
import { validateScheduledTransitDataset } from "../../../src/shared/services/transport/static/scheduledTransitDataset";
import { SAKATA_RUNRUNBUS_DATASET } from "../../../src/shared/services/transport/static/scheduledTransitDatasetRegistry";

const CATALOGUE = JSON.parse(
  readFileSync("src/shared/data/destinations-index.json", "utf8"),
) as readonly { id: string; name?: string; coordinates?: unknown }[];
const DATASET = validateScheduledTransitDataset(
  JSON.parse(
    readFileSync("public/data/transit/sakata-runrunbus.json", "utf8"),
  ) as unknown,
  SAKATA_RUNRUNBUS_DATASET,
);
const PILOT_ORIGIN = SCHEDULED_TRANSIT_CROSSWALK.mappings[0];
if (PILOT_ORIGIN === undefined) throw new Error("C2 origin mapping is missing");

function withCrosswalk(
  changes: Partial<ScheduledTransitCrosswalkEntry>,
): ScheduledTransitCrosswalkEntry {
  return { ...PILOT_ORIGIN, ...changes };
}

describe("KAI-292C4A real Meguruto corridor audit", () => {
  it("returns a concrete blocker instead of promoting the Sakata pilot", () => {
    const result: RealCorridorAudit = auditRealMegurutoCorridor();

    expect(result.status).toBe("blocked_no_real_catalogue_corridor");
    expect(result.catalogue).toMatchObject({
      destinationCount: 1130,
      uniqueDestinationIdCount: 1130,
      destinationMappings: [],
    });
    expect(result.normalizedEvidence).toMatchObject({
      registeredDatasetKeys: ["sakata-runrunbus"],
      validRegisteredDatasetKeys: ["sakata-runrunbus"],
      unregisteredAssetUrls: [],
    });
    expect(result.crosswalk).toMatchObject({
      mappingCount: 2,
      catalogueProductMappings: [],
      nonCatalogueMappingIds: [
        "kai-292c2-pilot-destination-sakata-17-01",
        "kai-292c2-pilot-origin-sakata-100-01",
      ],
    });
    expect(result.originIdentity).toMatchObject({
      status: "missing_canonical_product_identity",
      source: "src/shared/components/StationInput.tsx",
    });
    expect(result.realCorridors).toEqual([]);
    expect(result.blockers.map(({ code }) => code)).toEqual([
      "missing_catalogue_destination_crosswalk",
      "missing_canonical_origin_identity",
      "pilot_only_normalized_evidence",
    ]);
  });

  it("does not map a real catalogue id from a matching name or coordinates", () => {
    const chokai = CATALOGUE.find((record) => record.id === "chokai");
    expect(chokai).toMatchObject({ name: expect.any(String) });

    const result = resolveScheduledTransitEndpoint({
      dataset: DATASET,
      endpoint: { kind: "destination", productId: chokai!.id },
    });

    expect(result).toMatchObject({
      kind: "unmapped",
      reason: "no_explicit_crosswalk",
    });
  });

  it.each([
    ["dataset", { datasetId: "other-dataset" }],
    ["provider", { provider: "odpt" as const }],
    ["namespace", { identityNamespace: "gtfs:other-feed" }],
  ])("rejects a crosswalk with a wrong %s scope", (_label, changes) => {
    const result = resolveScheduledTransitEndpoint({
      dataset: DATASET,
      endpoint: PILOT_ORIGIN.endpoint,
      crosswalk: [withCrosswalk(changes)],
    });

    expect(result).toMatchObject({
      kind: "unmapped",
      reason: "no_explicit_crosswalk",
    });
  });

  it("returns unknown and ambiguous outcomes without selecting a fallback", () => {
    const unknown = resolveScheduledTransitEndpoint({
      dataset: DATASET,
      endpoint: { kind: "destination", productId: "chokai" },
    });
    const ambiguous = resolveScheduledTransitEndpoint({
      dataset: DATASET,
      endpoint: PILOT_ORIGIN.endpoint,
      crosswalk: [
        PILOT_ORIGIN,
        withCrosswalk({ mappingId: "second-explicit-origin" }),
      ],
    });

    expect(unknown).toMatchObject({
      kind: "unmapped",
      reason: "no_explicit_crosswalk",
    });
    expect(ambiguous).toMatchObject({
      kind: "ambiguous",
      reason: "multiple_explicit_crosswalks",
      mappingIds: [
        "kai-292c2-pilot-origin-sakata-100-01",
        "second-explicit-origin",
      ],
    });
  });
});
