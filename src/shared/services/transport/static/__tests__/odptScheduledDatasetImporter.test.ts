import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { sha256Hex, stableStringify } from "../contentHash";

import {
  buildArtifact,
  ODPT_GINZA_A501_METADATA,
} from "../../../../../../scripts/transit/build-odpt-kai-292c4f";
import {
  buildKai292C4EPrerequisiteAudit,
  type Kai292C4ESyntheticScheduledTransitArtifact,
} from "../../../../../../scripts/transit/audit-kai-292c4e-prerequisite";
import {
  importOdptScheduledDataset,
  type OdptScheduledDatasetInput,
} from "../odptScheduledDatasetImporter";
import {
  loadScheduledTransitDataset,
  resetScheduledTransitDatasetCache,
  validateScheduledTransitDataset,
  type ScheduledTransitDatasetArtifact,
} from "../scheduledTransitDataset";
import {
  ODPT_TOKYOMETRO_GINZA_A501_B515_DATASET,
  SAKATA_RUNRUNBUS_DATASET,
} from "../scheduledTransitDatasetRegistry";

const ROOT = process.cwd();
const SOURCE_PATH = join(ROOT, "qa/kai-292c4f/odpt-ginza-a501-source.json");

type DeepMutable<T> = {
  -readonly [Key in keyof T]: T[Key] extends readonly (infer Item)[]
    ? DeepMutable<Item>[]
    : T[Key] extends object
      ? DeepMutable<T[Key]>
      : T[Key];
};

type MutableInput = DeepMutable<OdptScheduledDatasetInput>;
type MutableArtifact = DeepMutable<ScheduledTransitDatasetArtifact>;

function sourceInput(): OdptScheduledDatasetInput {
  const source = JSON.parse(readFileSync(SOURCE_PATH, "utf8")) as {
    readonly records: Record<string, unknown>;
  };
  return {
    operators: source.records
      .operators as OdptScheduledDatasetInput["operators"],
    stations: source.records.stations as OdptScheduledDatasetInput["stations"],
    railways: source.records.railways as OdptScheduledDatasetInput["railways"],
    calendars: source.records
      .calendars as OdptScheduledDatasetInput["calendars"],
    trainTimetables: source.records
      .trainTimetables as OdptScheduledDatasetInput["trainTimetables"],
    declaredTrainIdentities: [
      "odpt.Train:TokyoMetro.Ginza.A501",
      "odpt.Train:TokyoMetro.Ginza.B515",
    ],
  };
}

function mutableSourceInput(): MutableInput {
  return structuredClone(sourceInput()) as unknown as MutableInput;
}

function artifactFromInput(
  input: OdptScheduledDatasetInput,
  completeness = ODPT_GINZA_A501_METADATA.completeness,
): ScheduledTransitDatasetArtifact {
  const result = importOdptScheduledDataset(input, {
    ...ODPT_GINZA_A501_METADATA,
    completeness,
  });
  const metadata: ScheduledTransitDatasetArtifact["metadata"] = {
    ...ODPT_GINZA_A501_METADATA,
    completeness,
    issuedAt: ODPT_GINZA_A501_METADATA.issuedAt ?? null,
    validUntil: ODPT_GINZA_A501_METADATA.validUntil ?? null,
    datasetHash: result.graph.datasetVersion.contentHash,
    coverageHash: sha256Hex(stableStringify(result.coverage)),
  };
  return {
    artifactSchemaVersion: "kai-292c2-v1",
    metadata,
    graph: result.graph,
    coverage: result.coverage,
  };
}

function cloneArtifact(
  artifact: ScheduledTransitDatasetArtifact,
): MutableArtifact {
  return structuredClone(artifact) as unknown as MutableArtifact;
}

describe("KAI-292C4F ODPT scheduled dataset bridge", () => {
  it("imports and validates the real exact-scope production artifact", () => {
    const artifact = buildArtifact();
    const loaded = validateScheduledTransitDataset(
      artifact,
      ODPT_TOKYOMETRO_GINZA_A501_B515_DATASET,
    );
    expect(
      loaded.graph.operators.map(
        ({ providerOperatorId }) => providerOperatorId,
      ),
    ).toEqual(["odpt.Operator:TokyoMetro"]);
    expect(loaded.graph.stops).toHaveLength(19);
    expect(loaded.graph.routes).toHaveLength(1);
    expect(loaded.graph.routeStops).toHaveLength(23);
    expect(loaded.graph.calendars).toHaveLength(2);
    expect(loaded.graph.scheduledServices).toHaveLength(3);
    expect(loaded.graph.scheduledStopTimes).toHaveLength(42);
    expect(loaded.coverage.entries).toMatchObject([
      {
        provider: "odpt",
        operator: "odpt.Operator:TokyoMetro",
        topology: "imported",
        timetable: "imported",
      },
    ]);
    expect(
      loaded.graph.scheduledServices?.every(
        ({ provider }) => provider === "odpt",
      ),
    ).toBe(true);
  });

  it.each([
    ["wrong graph hash", "datasetHash", "hash_mismatch"],
    ["wrong coverage hash", "coverageHash", "coverage_mismatch"],
  ] as const)("rejects %s", (_name, field, code) => {
    const artifact = cloneArtifact(buildArtifact());
    artifact.metadata[field] = "0".repeat(64);
    expect(() =>
      validateScheduledTransitDataset(
        artifact,
        ODPT_TOKYOMETRO_GINZA_A501_B515_DATASET,
      ),
    ).toThrow(new RegExp(`\\[${code}\\]`));
  });

  it.each([
    ["wrong provider", { provider: "gtfs" }],
    ["wrong namespace", { identityNamespace: "odpt:wrong-scope" }],
    ["wrong dataset id", { datasetId: "odpt-wrong-dataset" }],
  ] as const)("rejects %s", (_name, changes) => {
    const artifact = cloneArtifact(buildArtifact());
    Object.assign(artifact.metadata, changes);
    expect(() =>
      validateScheduledTransitDataset(
        artifact,
        ODPT_TOKYOMETRO_GINZA_A501_B515_DATASET,
      ),
    ).toThrow(/dataset_mismatch|namespace_mismatch/);
  });

  it("rejects missing schedules and broken references before creating a graph", () => {
    const input = sourceInput();
    expect(() =>
      importOdptScheduledDataset(
        { ...input, trainTimetables: [] },
        ODPT_GINZA_A501_METADATA,
      ),
    ).toThrow(/empty_family/);
    const missingStation = mutableSourceInput();
    missingStation.stations = missingStation.stations.slice(1);
    expect(() =>
      importOdptScheduledDataset(missingStation, ODPT_GINZA_A501_METADATA),
    ).toThrow(/unknown_station_reference|invalid_station_order/);
    expect(() =>
      validateScheduledTransitDataset(
        {
          ...cloneArtifact(buildArtifact()),
          graph: { ...buildArtifact().graph, scheduledServices: [] },
        },
        ODPT_TOKYOMETRO_GINZA_A501_B515_DATASET,
      ),
    ).toThrow(/hash_mismatch/);
    expect(() =>
      validateScheduledTransitDataset(
        {
          ...cloneArtifact(buildArtifact()),
          graph: { ...buildArtifact().graph, scheduledStopTimes: [] },
        },
        ODPT_TOKYOMETRO_GINZA_A501_B515_DATASET,
      ),
    ).toThrow(/hash_mismatch/);
    const brokenService = mutableSourceInput();
    brokenService.trainTimetables[0]!.objects[3]!.arrivalStation =
      "odpt.Station:TokyoMetro.Ginza.NotAStation";
    brokenService.trainTimetables[0]!.objects[3]!.departureStation =
      "odpt.Station:TokyoMetro.Ginza.NotAStation";
    expect(() =>
      importOdptScheduledDataset(brokenService, ODPT_GINZA_A501_METADATA),
    ).toThrow(/unknown_station_reference/);
  });

  it("rejects schedule/calendar inconsistencies", () => {
    const wrongCalendar = mutableSourceInput();
    wrongCalendar.trainTimetables[0]!.calendar = "odpt.Calendar:Missing";
    expect(() =>
      importOdptScheduledDataset(wrongCalendar, ODPT_GINZA_A501_METADATA),
    ).toThrow(/unknown_calendar_reference|calendar_scope_mismatch/);
    const wrongTime = mutableSourceInput();
    wrongTime.trainTimetables[0]!.objects[1]!.departureTime = "04:00";
    expect(() =>
      importOdptScheduledDataset(wrongTime, ODPT_GINZA_A501_METADATA),
    ).toThrow(/inconsistent_schedule|invalid_schedule_time/);
  });

  it("does not qualify partial/bounded completeness as production eligibility", () => {
    const bounded = artifactFromInput(sourceInput(), "bounded_subset");
    const descriptor = {
      ...ODPT_TOKYOMETRO_GINZA_A501_B515_DATASET,
      key: "synthetic-c4f-bounded",
      completeness: "bounded_subset" as const,
      expectedContentHash: bounded.metadata.datasetHash,
      expectedCoverageHash: bounded.metadata.coverageHash,
      assetUrl: "/data/transit/missing-c4f-bounded.json",
    };
    const report = buildKai292C4EPrerequisiteAudit(ROOT, {
      scheduledTransitDatasets: [descriptor],
      scheduledTransitArtifacts: [
        { key: descriptor.key, artifact: bounded },
      ] as readonly Kai292C4ESyntheticScheduledTransitArtifact[],
    });
    expect(report.c2Boundary).toMatchObject({
      artifactValidOdptDatasetKeys: [descriptor.key],
      productionEligibleOdptDatasetKeys: [],
      odptEvidenceCanEnterTrustedDataset: false,
    });
  });

  it("clears only the C2 ODPT blocker while preserving the prerequisite result", () => {
    const report = buildKai292C4EPrerequisiteAudit(ROOT);
    expect(report.status).toBe("blocked_prerequisite");
    expect(report.c2Boundary.odptEvidenceCanEnterTrustedDataset).toBe(true);
    expect(report.c2Boundary.productionEligibleOdptDatasetKeys).toEqual([
      "odpt-tokyometro-ginza-a501-b515",
    ]);
    expect(report.c4a.corridorCount).toBe(0);
    expect(report.exactEndpointIdentityPairs).toEqual([]);
    expect(report.corridorReadinessBlockers).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "odpt_timetable_not_representable_in_trusted_c2",
        }),
      ]),
    );
    expect(report.corridorReadinessBlockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "missing_canonical_product_origin_identity",
        }),
        expect.objectContaining({
          code: "missing_catalogue_destination_crosswalk",
        }),
      ]),
    );
  });

  it("loads the ODPT artifact and leaves Sakata behavior isolated", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        const path = String(input).includes("sakata-runrunbus")
          ? "public/data/transit/sakata-runrunbus.json"
          : "public/data/transit/odpt-tokyometro-ginza-a501.json";
        return new Response(readFileSync(join(ROOT, path), "utf8"), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );
    try {
      resetScheduledTransitDatasetCache();
      const odpt = await loadScheduledTransitDataset(
        "odpt-tokyometro-ginza-a501-b515",
      );
      expect(odpt.metadata.provider).toBe("odpt");
      expect(odpt.graph.scheduledServices?.length).toBe(3);
      resetScheduledTransitDatasetCache();
      const sakata = await loadScheduledTransitDataset("sakata-runrunbus");
      expect(sakata.metadata.provider).toBe(SAKATA_RUNRUNBUS_DATASET.provider);
      expect(sakata.metadata.datasetId).toBe(
        SAKATA_RUNRUNBUS_DATASET.datasetId,
      );
      expect(sakata.graph.scheduledServices?.length).toBeGreaterThan(0);
    } finally {
      resetScheduledTransitDatasetCache();
      vi.unstubAllGlobals();
    }
  });
});
