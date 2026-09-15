import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { buildKai292C4EPrerequisiteAudit } from "../../../../../../scripts/transit/audit-kai-292c4e-prerequisite";
import {
  validateScheduledTransitDataset,
  loadScheduledTransitDataset,
  resetScheduledTransitDatasetCache,
  type ScheduledTransitDatasetArtifact,
} from "../scheduledTransitDataset";
import {
  getScheduledTransitDatasetDescriptor,
  type ScheduledTransitDatasetDescriptor,
} from "../scheduledTransitDatasetRegistry";

const ROOT = process.cwd();
const DATASET_KEY = "toei-oedo-gtfs-20260314" as const;
const DESCRIPTOR = getScheduledTransitDatasetDescriptor(DATASET_KEY);
const ARTIFACT_PATH = join(
  ROOT,
  "src/shared/data/transit/toei-oedo-gtfs-20260314.json",
);

type DeepMutable<T> = T extends readonly (infer Item)[]
  ? DeepMutable<Item>[]
  : T extends object
    ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
    : T;

function artifact(): ScheduledTransitDatasetArtifact {
  return JSON.parse(
    readFileSync(ARTIFACT_PATH, "utf8"),
  ) as ScheduledTransitDatasetArtifact;
}

function mutableArtifact(): DeepMutable<ScheduledTransitDatasetArtifact> {
  return structuredClone(
    artifact(),
  ) as DeepMutable<ScheduledTransitDatasetArtifact>;
}

describe("KAI-292C4F Toei Oedo trusted dataset", () => {
  it("loads the real artifact through the pinned registry", () => {
    const loaded = validateScheduledTransitDataset(artifact(), DESCRIPTOR);
    expect(loaded.metadata).toMatchObject({
      provider: "gtfs",
      datasetId: "toei-oedo-gtfs-20260314",
      identityNamespace: "toei-gtfs",
      completeness: "complete_provider_dump",
    });
    expect(loaded.graph.operators).toHaveLength(1);
    expect(loaded.graph.stops).toHaveLength(38);
    expect(loaded.graph.routes).toHaveLength(1);
    expect(loaded.graph.routeStops).toHaveLength(347);
    expect(loaded.graph.calendars).toHaveLength(2);
    expect(loaded.graph.scheduledServices).toHaveLength(839);
    expect(loaded.graph.scheduledStopTimes).toHaveLength(30323);
    expect(loaded.graph.transfers).toHaveLength(0);
    expect(loaded.coverage.entries).toEqual([
      expect.objectContaining({
        operator: "toei",
        mode: "rail",
        topology: "imported",
        timetable: "imported",
      }),
    ]);
  });

  it("accepts correct hashes and rejects changed graph or coverage hashes", () => {
    expect(() =>
      validateScheduledTransitDataset(artifact(), DESCRIPTOR),
    ).not.toThrow();

    const wrongGraphHash = mutableArtifact();
    wrongGraphHash.metadata.datasetHash = "0".repeat(64);
    expect(() =>
      validateScheduledTransitDataset(wrongGraphHash, DESCRIPTOR),
    ).toThrow();

    const wrongCoverageHash = mutableArtifact();
    wrongCoverageHash.metadata.coverageHash = "0".repeat(64);
    expect(() =>
      validateScheduledTransitDataset(wrongCoverageHash, DESCRIPTOR),
    ).toThrow();
  });

  it("rejects provider, namespace, missing schedule, and broken references", () => {
    const wrongProvider: ScheduledTransitDatasetDescriptor = {
      ...DESCRIPTOR,
      provider: "odpt",
    };
    expect(() =>
      validateScheduledTransitDataset(artifact(), wrongProvider),
    ).toThrow();

    const wrongNamespace: ScheduledTransitDatasetDescriptor = {
      ...DESCRIPTOR,
      identityNamespace: "odpt",
    };
    expect(() =>
      validateScheduledTransitDataset(artifact(), wrongNamespace),
    ).toThrow();

    const missingServices = mutableArtifact();
    missingServices.graph.scheduledServices = [];
    expect(() =>
      validateScheduledTransitDataset(missingServices, DESCRIPTOR),
    ).toThrow();

    const missingStopTimes = mutableArtifact();
    missingStopTimes.graph.scheduledStopTimes = [];
    expect(() =>
      validateScheduledTransitDataset(missingStopTimes, DESCRIPTOR),
    ).toThrow();

    const brokenReference = mutableArtifact();
    brokenReference.graph.scheduledServices![0]!.routeId =
      "gtfs:route:toei-gtfs:missing";
    expect(() =>
      validateScheduledTransitDataset(brokenReference, DESCRIPTOR),
    ).toThrow();
  });

  it("does not promote bounded Toei data to production eligibility", () => {
    const bounded = mutableArtifact();
    bounded.metadata.completeness = "bounded_subset";
    bounded.graph.datasetVersion.completeness = "bounded_subset";
    const boundedDescriptor = {
      ...DESCRIPTOR,
      completeness: "bounded_subset" as const,
      upstreamSource: "odpt" as const,
    };
    const report = buildKai292C4EPrerequisiteAudit(ROOT, {
      scheduledTransitDatasets: [boundedDescriptor],
      scheduledTransitArtifacts: [{ key: DATASET_KEY, artifact: bounded }],
    });
    expect(report.c2Boundary.productionEligibleOdptDatasetKeys).toEqual([]);
  });

  it("loads through the normal ScheduledTransitDataset loader", async () => {
    const body = readFileSync(ARTIFACT_PATH, "utf8");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(body, {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    try {
      resetScheduledTransitDatasetCache();
      const loaded = await loadScheduledTransitDataset(DATASET_KEY);
      expect(loaded.metadata.datasetId).toBe("toei-oedo-gtfs-20260314");
      expect(loaded.graph.scheduledServices).toHaveLength(839);
    } finally {
      resetScheduledTransitDatasetCache();
      vi.unstubAllGlobals();
    }
  });
});
