import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  loadScheduledTransitDataset,
  resetScheduledTransitDatasetCache,
  ScheduledTransitDatasetError,
  validateScheduledTransitDataset,
} from "../scheduledTransitDataset";
import { SAKATA_RUNRUNBUS_DATASET } from "../scheduledTransitDatasetRegistry";

type JsonRecord = Record<string, unknown>;

const ARTIFACT_JSON = readFileSync(
  "public/data/transit/sakata-runrunbus.json",
  "utf8",
);
const SETUP_FETCH = globalThis.fetch;

function artifactCopy(): JsonRecord {
  return JSON.parse(ARTIFACT_JSON) as JsonRecord;
}

function responseForArtifact(): Response {
  return new Response(ARTIFACT_JSON, {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  resetScheduledTransitDatasetCache();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  resetScheduledTransitDatasetCache();
  vi.stubGlobal("fetch", SETUP_FETCH);
});

describe("scheduled transit dataset boundary", () => {
  it("validates the committed graph, coverage, metadata, and semantic hash as one unit", () => {
    const artifact = JSON.parse(ARTIFACT_JSON) as unknown;
    const result = validateScheduledTransitDataset(
      artifact,
      SAKATA_RUNRUNBUS_DATASET,
    );

    expect(result.metadata.datasetId).toBe("gtfs-jp-sakata-runrunbus-20260401");
    expect(result.metadata.identityNamespace).toBe("gtfs:sakata-runrunbus");
    expect(result.metadata.datasetHash).toBe(
      "d0e79b7f9bef0d25f265a4fae98cb8917d4ea285657de76acf0e551aec44c0dd",
    );
    expect(result.graph.stops).toHaveLength(252);
    expect(result.graph.scheduledServices).toHaveLength(49);
    expect(result.graph.scheduledStopTimes).toHaveLength(1961);
    expect(result.coverage.entries).toHaveLength(1);
  });

  it("fails closed when graph and coverage dataset identities disagree", () => {
    const artifact = artifactCopy();
    const coverage = artifact.coverage as JsonRecord;
    coverage.datasetId = "different-dataset";

    expect(() =>
      validateScheduledTransitDataset(artifact, SAKATA_RUNRUNBUS_DATASET),
    ).toThrowError(
      expect.objectContaining<Partial<ScheduledTransitDatasetError>>({
        code: "coverage_mismatch",
      }),
    );
  });

  it("fails closed when the graph dataset identity disagrees with metadata", () => {
    const artifact = artifactCopy();
    const graph = artifact.graph as JsonRecord;
    const datasetVersion = graph.datasetVersion as JsonRecord;
    datasetVersion.datasetId = "different-dataset";

    expect(() =>
      validateScheduledTransitDataset(artifact, SAKATA_RUNRUNBUS_DATASET),
    ).toThrowError(
      expect.objectContaining<Partial<ScheduledTransitDatasetError>>({
        code: "dataset_mismatch",
      }),
    );
  });

  it("fails closed when the graph content hash disagrees with metadata", () => {
    const artifact = artifactCopy();
    const graph = artifact.graph as JsonRecord;
    const datasetVersion = graph.datasetVersion as JsonRecord;
    datasetVersion.contentHash = "0".repeat(64);

    expect(() =>
      validateScheduledTransitDataset(artifact, SAKATA_RUNRUNBUS_DATASET),
    ).toThrowError(
      expect.objectContaining<Partial<ScheduledTransitDatasetError>>({
        code: "hash_mismatch",
      }),
    );
  });

  it("fails closed when the artifact claims a different normalized schema", () => {
    const artifact = artifactCopy();
    const metadata = artifact.metadata as JsonRecord;
    metadata.schemaVersion = "untrusted-schema";

    expect(() =>
      validateScheduledTransitDataset(artifact, SAKATA_RUNRUNBUS_DATASET),
    ).toThrowError(
      expect.objectContaining<Partial<ScheduledTransitDatasetError>>({
        code: "schema_mismatch",
      }),
    );
  });

  it("fails closed when semantic graph content is changed", () => {
    const artifact = artifactCopy();
    const graph = artifact.graph as JsonRecord;
    const stops = graph.stops as JsonRecord[];
    const firstStop = stops[0];
    if (firstStop === undefined) throw new Error("fixture has no stops");
    firstStop.providerStopId = "silently-rewritten-stop";

    expect(() =>
      validateScheduledTransitDataset(artifact, SAKATA_RUNRUNBUS_DATASET),
    ).toThrowError(
      expect.objectContaining<Partial<ScheduledTransitDatasetError>>({
        code: "namespace_mismatch",
      }),
    );
  });

  it("fails closed when coverage content changes without its hash", () => {
    const artifact = artifactCopy();
    const coverage = artifact.coverage as JsonRecord;
    const entries = coverage.entries as JsonRecord[];
    const firstEntry = entries[0];
    if (firstEntry === undefined) throw new Error("fixture has no coverage");
    firstEntry.notes = [...(firstEntry.notes as string[]), "tampered"];

    expect(() =>
      validateScheduledTransitDataset(artifact, SAKATA_RUNRUNBUS_DATASET),
    ).toThrowError(
      expect.objectContaining<Partial<ScheduledTransitDatasetError>>({
        code: "coverage_mismatch",
      }),
    );
  });

  it("does not allow an artifact to redefine its own expected content hash", () => {
    const descriptor = {
      ...SAKATA_RUNRUNBUS_DATASET,
      expectedContentHash: "0".repeat(64),
    };

    expect(() =>
      validateScheduledTransitDataset(
        JSON.parse(ARTIFACT_JSON) as unknown,
        descriptor,
      ),
    ).toThrowError(
      expect.objectContaining<Partial<ScheduledTransitDatasetError>>({
        code: "hash_mismatch",
      }),
    );
  });

  it("shares one lazy fetch and one validated object across repeated calls", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(responseForArtifact());

    const firstPromise = loadScheduledTransitDataset();
    const secondPromise = loadScheduledTransitDataset();
    expect(firstPromise).toBe(secondPromise);

    const [first, second] = await Promise.all([firstPromise, secondPromise]);
    expect(first).toBe(second);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("clears a rejected load so a later request can retry", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockRejectedValueOnce(new Error("temporary asset failure"))
      .mockResolvedValueOnce(responseForArtifact());

    await expect(loadScheduledTransitDataset()).rejects.toMatchObject({
      code: "network_failure",
    });
    const recovered = await loadScheduledTransitDataset();

    expect(recovered.metadata.datasetId).toBe(
      "gtfs-jp-sakata-runrunbus-20260401",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
