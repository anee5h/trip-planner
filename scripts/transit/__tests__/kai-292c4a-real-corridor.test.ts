import {
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

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

const REPOSITORY_ROOT = process.cwd();
const CATALOGUE_PATH = "src/shared/data/destinations-index.json";
const CROSSWALK_PATH =
  "src/shared/data/scheduled-transit-endpoint-crosswalk.json";
const IDENTITY_EVIDENCE_PATH =
  "qa/kai-292c4a/real-corridor-identity-evidence.json";
const PILOT_ANCHORS_PATH = "qa/kai-291/destination-station-anchors.json";
const DATASET_PATH = "public/data/transit/sakata-runrunbus.json";

const CATALOGUE = JSON.parse(
  readText(join(REPOSITORY_ROOT, CATALOGUE_PATH)),
) as readonly { id: string; name?: string; coordinates?: unknown }[];
const DATASET = validateScheduledTransitDataset(
  JSON.parse(readText(join(REPOSITORY_ROOT, DATASET_PATH))) as unknown,
  SAKATA_RUNRUNBUS_DATASET,
);
const PILOT_ORIGIN = SCHEDULED_TRANSIT_CROSSWALK.mappings[0];
const PILOT_DESTINATION = SCHEDULED_TRANSIT_CROSSWALK.mappings[1];
if (PILOT_ORIGIN === undefined || PILOT_DESTINATION === undefined) {
  throw new Error("C2 pilot crosswalk is incomplete");
}

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function readText(path: string): string {
  return readFileSync(path, "utf8");
}

function writeJson(root: string, relativePath: string, value: unknown): void {
  const path = join(root, relativePath);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function copyFixtureFile(root: string, relativePath: string): void {
  const destination = join(root, relativePath);
  mkdirSync(join(destination, ".."), { recursive: true });
  copyFileSync(join(REPOSITORY_ROOT, relativePath), destination);
}

function normalizedStopId(providerStopId: string): string {
  return `gtfs:stop:gtfs%3Asakata-runrunbus:${providerStopId}`;
}

function productMapping(
  template: ScheduledTransitCrosswalkEntry,
  endpointProductId: string,
  mappingId: string,
  providerStopId: string,
  scopeChanges: Partial<
    Pick<
      ScheduledTransitCrosswalkEntry,
      "datasetId" | "provider" | "identityNamespace"
    >
  > = {},
): ScheduledTransitCrosswalkEntry {
  return {
    ...template,
    mappingId,
    endpoint: { ...template.endpoint, productId: endpointProductId },
    providerStopId,
    normalizedStopId: normalizedStopId(providerStopId),
    ...scopeChanges,
    provenance: {
      ...template.provenance,
      evidenceId: `${mappingId}-evidence`,
      statement: `Reviewed exact mapping for ${endpointProductId} to provider stop ${providerStopId}.`,
    },
  };
}

function futureFixture(
  options: {
    readonly originStopId?: string;
    readonly destinationStopId?: string;
    readonly scopeChanges?: Partial<
      Pick<
        ScheduledTransitCrosswalkEntry,
        "datasetId" | "provider" | "identityNamespace"
      >
    >;
  } = {},
): string {
  const root = mkdtempSync(join(REPOSITORY_ROOT, ".tmp-kai-292c4a-"));
  temporaryRoots.push(root);
  copyFixtureFile(root, CATALOGUE_PATH);
  copyFixtureFile(root, CROSSWALK_PATH);
  copyFixtureFile(root, IDENTITY_EVIDENCE_PATH);
  copyFixtureFile(root, PILOT_ANCHORS_PATH);
  copyFixtureFile(root, DATASET_PATH);

  const destinationId = "future-reviewed-destination";
  const originProductId = "future-reviewed-origin";
  const originMapping = productMapping(
    PILOT_ORIGIN,
    originProductId,
    "future-origin-exact-mapping",
    options.originStopId ?? "100_01",
    options.scopeChanges,
  );
  const destinationMapping = productMapping(
    PILOT_DESTINATION,
    destinationId,
    "future-destination-exact-mapping",
    options.destinationStopId ?? "17_01",
    options.scopeChanges,
  );

  const catalogue = JSON.parse(readText(join(root, CATALOGUE_PATH))) as {
    id: string;
  }[];
  catalogue.push({ id: destinationId });
  writeJson(root, CATALOGUE_PATH, catalogue);

  const crosswalk = JSON.parse(readText(join(root, CROSSWALK_PATH))) as {
    schemaVersion: number;
    mappings: ScheduledTransitCrosswalkEntry[];
  };
  crosswalk.mappings.push(originMapping, destinationMapping);
  writeJson(root, CROSSWALK_PATH, crosswalk);

  writeJson(root, IDENTITY_EVIDENCE_PATH, {
    schemaVersion: 1,
    originIdentities: [
      {
        identityKind: "product",
        identityStability: "stable_product_id",
        reviewStatus: "reviewed",
        productId: originProductId,
        evidenceId: "future-origin-product-evidence",
        statement:
          "Synthetic reviewed product identity used only to prove data-driven discovery.",
        sourceUrl: "https://example.invalid/future-origin-evidence",
        checkedAt: "2026-09-13T00:00:00.000Z",
      },
    ],
  });
  return root;
}

describe("KAI-292C4A real Meguruto corridor audit", () => {
  it("returns the current concrete blocker without promoting Sakata or anchors", () => {
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
      reviewedProductIds: [],
    });
    expect(result.realCorridors).toEqual([]);
    expect(result.candidateBlockers).toEqual([]);
    expect(result.blockers.map(({ code }) => code)).toEqual([
      "missing_catalogue_destination_crosswalk",
      "missing_canonical_origin_identity",
      "pilot_only_normalized_evidence",
    ]);
  });

  it("reports the seven reviewed KAI-291A anchors as insufficient evidence", () => {
    const result = auditRealMegurutoCorridor();

    expect(result.reviewedAnchors).toMatchObject({
      source: PILOT_ANCHORS_PATH,
      status: "reviewed_insufficient_for_corridor",
      productionCrosswalk: false,
      stationToPoiAccess: "unproven",
    });
    expect(
      result.reviewedAnchors.anchors.map((anchor) => anchor.destinationId),
    ).toEqual([
      "shinjuku-gyo-en",
      "teamlab-borderless-azabudai",
      "ueno-park",
      "hamarikyu-gardens",
      "sumida-hokusai-museum",
      "ryogoku-kokugikan-sumo-museum",
      "sugamo-jizo-dori",
    ]);
    expect(result.crosswalk.catalogueProductMappings).toEqual([]);
  });

  it("discovers a future valid corridor from reviewed data changes only", () => {
    const result = auditRealMegurutoCorridor(futureFixture());

    expect(result.status).toBe("real_corridor_evidenced");
    expect(result.blockers).toEqual([]);
    expect(result.candidateBlockers).toEqual([]);
    expect(result.realCorridors).toMatchObject([
      {
        origin: {
          productId: "future-reviewed-origin",
          providerStopId: "100_01",
        },
        destination: {
          productId: "future-reviewed-destination",
          providerStopId: "17_01",
        },
        dataset: {
          key: "sakata-runrunbus",
          datasetId: "gtfs-jp-sakata-runrunbus-20260401",
          provider: "gtfs",
          identityNamespace: "gtfs:sakata-runrunbus",
        },
        timetable: { commonServiceCount: 3 },
      },
    ]);
  });

  it.each([
    ["dataset", { datasetId: "unregistered-dataset" }],
    ["provider", { provider: "odpt" as const }],
    ["namespace", { identityNamespace: "gtfs:other-feed" }],
  ])(
    "blocks a future candidate with the wrong %s scope",
    (_label, scopeChanges) => {
      const result = auditRealMegurutoCorridor(futureFixture({ scopeChanges }));

      expect(result.status).toBe("blocked_no_real_catalogue_corridor");
      expect(result.realCorridors).toEqual([]);
      expect(result.candidateBlockers).toContainEqual(
        expect.objectContaining({ code: "unregistered_dataset_scope" }),
      );
    },
  );

  it("blocks a candidate whose exact stops have no shared scheduled timetable", () => {
    const result = auditRealMegurutoCorridor(
      futureFixture({ originStopId: "70_01", destinationStopId: "1_01" }),
    );

    expect(result.realCorridors).toEqual([]);
    expect(result.candidateBlockers).toContainEqual(
      expect.objectContaining({ code: "missing_scheduled_timetable" }),
    );
  });

  it("does not use names, coordinates, nearest, or reviewed geographic anchors as fallbacks", () => {
    const chokai = CATALOGUE.find((record) => record.id === "chokai");
    expect(chokai).toMatchObject({
      name: expect.any(String),
      coordinates: expect.anything(),
    });

    const result = resolveScheduledTransitEndpoint({
      dataset: DATASET,
      endpoint: { kind: "destination", productId: chokai!.id },
    });

    expect(result).toMatchObject({
      kind: "unmapped",
      reason: "no_explicit_crosswalk",
    });
    expect(auditRealMegurutoCorridor().realCorridors).toEqual([]);
  });
});
