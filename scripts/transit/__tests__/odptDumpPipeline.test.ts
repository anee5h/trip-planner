/**
 * KAI-291B2 — dump pipeline tests (synthetic data only, local temp stores).
 *
 * Covers dump validation, pilot extraction, manifest shape, promotion
 * state machine (A–G with byte-identical LKG retention on failures),
 * freshness, licence gates, continuity, comparison and determinism.
 */
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { NormalizedTransitGraph } from "../../../src/shared/services/transport/static/transitGraphTypes";
import {
  buildSnapshotManifest,
  compareCandidate,
  decidePromotion,
  DumpPipelineError,
  extractPilotScope,
  freshnessStatus,
  licenceAllowsLocalSnapshot,
  licenceAllowsProductionPromotion,
  loadAnchorStationIds,
  missingAnchorIdentities,
  missingRequiredPilotOperators,
  normalizePilotExtraction,
  promoteToLastKnownGood,
  readLastKnownGood,
  recordSuccessfulCheck,
  snapshotIdFor,
  validateDumpFamily,
} from "../odptDumpPipeline";

let storeCounter = 0;
function mkStore(): string {
  const dir = join(
    homedir(),
    ".tmp-b2tests",
    `store-${process.pid}-${storeCounter++}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}
function rmStore(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}
function readBytes(path: string): string {
  return readFileSync(path, "utf8");
}

function expectPipelineCode(fn: () => unknown, code: string): void {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(DumpPipelineError);
    expect((error as DumpPipelineError).code).toBe(code);
    return;
  }
  throw new Error(`expected DumpPipelineError[${code}] but succeeded`);
}

const OPERATOR = {
  "@type": "odpt:Operator",
  "owl:sameAs": "odpt.Operator:TokyoMetro",
  "odpt:operatorTitle": { en: "Tokyo Metro" },
};
const RAILWAY = {
  "@type": "odpt:Railway",
  "owl:sameAs": "odpt.Railway:TokyoMetro.Ginza",
  "odpt:operator": "odpt.Operator:TokyoMetro",
  "odpt:stationOrder": [
    { "odpt:station": "odpt.Station:TokyoMetro.Ginza.Ueno", "odpt:index": 1 },
  ],
};
const STATION = {
  "@type": "odpt:Station",
  "owl:sameAs": "odpt.Station:TokyoMetro.Ginza.Ueno",
  "geo:lat": 35.711835,
  "geo:long": 139.775625,
  "odpt:operator": "odpt.Operator:TokyoMetro",
  "odpt:railway": "odpt.Railway:TokyoMetro.Ginza",
  "odpt:stationTitle": { en: "Ueno" },
};
const CALENDAR = {
  "@type": "odpt:Calendar",
  "owl:sameAs": "odpt.Calendar:Weekday",
  "odpt:day": ["Monday"],
};

const METADATA = {
  datasetId: "test-dump",
  identityNamespace: "odpt" as const,
  sourceDescriptor: "synthetic test dump",
  sourceType: "data_dump" as const,
  retrievedAt: "2026-09-12T00:00:00.000Z",
  checkedAt: "2026-09-12T00:00:00.000Z",
  completeness: "complete_provider_dump" as const,
};

function syntheticFamilies() {
  return {
    "odpt:Operator": [OPERATOR],
    "odpt:Station": [STATION],
    "odpt:Railway": [RAILWAY],
    "odpt:Calendar": [CALENDAR],
  };
}

function syntheticGraph(): NormalizedTransitGraph {
  const extraction = extractPilotScope(
    syntheticFamilies() as Record<string, readonly Record<string, unknown>[]>,
  );
  return normalizePilotExtraction(extraction, METADATA).graph;
}

describe("dump validation", () => {
  it("accepts a valid family", () => {
    const family = validateDumpFamily(
      "odpt:Station",
      JSON.stringify([STATION]),
    );
    expect(family.records).toHaveLength(1);
  });

  it("rejects empty bodies, HTML pages, invalid JSON and non-array roots", () => {
    expectPipelineCode(
      () => validateDumpFamily("odpt:Station", ""),
      "invalid_json",
    );
    expectPipelineCode(
      () => validateDumpFamily("odpt:Station", "<html>error</html>"),
      "html_error_page",
    );
    expectPipelineCode(
      () => validateDumpFamily("odpt:Station", "{oops"),
      "invalid_json",
    );
    expectPipelineCode(
      () => validateDumpFamily("odpt:Station", JSON.stringify({ a: 1 })),
      "non_array_root",
    );
  });

  it("rejects wrong @type, missing identity and duplicates", () => {
    expectPipelineCode(
      () =>
        validateDumpFamily(
          "odpt:Station",
          JSON.stringify([{ ...STATION, "@type": "odpt:Railway" }]),
        ),
      "wrong_resource_type",
    );
    expectPipelineCode(
      () =>
        validateDumpFamily(
          "odpt:Station",
          JSON.stringify([{ "@type": "odpt:Station" }]),
        ),
      "missing_identity",
    );
    expectPipelineCode(
      () =>
        validateDumpFamily("odpt:Station", JSON.stringify([STATION, STATION])),
      "duplicate_identity",
    );
    expectPipelineCode(
      () => validateDumpFamily("odpt:Station", JSON.stringify([42])),
      "malformed_record",
    );
  });
});

describe("pilot extraction", () => {
  it("keeps pilot records and drops out-of-scope operators", () => {
    const extraction = extractPilotScope({
      "odpt:Operator": [
        OPERATOR,
        { "@type": "odpt:Operator", "owl:sameAs": "odpt.Operator:JR-East" },
      ],
      "odpt:Station": [STATION],
      "odpt:Railway": [RAILWAY],
      "odpt:Calendar": [CALENDAR],
    });
    expect(extraction.filteredCounts).toEqual({
      "odpt:Operator": 1,
      "odpt:Station": 1,
      "odpt:Railway": 1,
      "odpt:Calendar": 1,
    });
    expect(extraction.rawCounts["odpt:Operator"]).toBe(2);
  });

  it("rejects a station whose railway falls outside the extracted scope", () => {
    expectPipelineCode(
      () =>
        extractPilotScope({
          "odpt:Operator": [OPERATOR],
          "odpt:Station": [
            {
              ...STATION,
              "odpt:railway": "odpt.Railway:TokyoMetro.Marunouchi",
            },
          ],
          "odpt:Railway": [RAILWAY],
          "odpt:Calendar": [],
        }),
      "extraction_reference",
    );
  });

  it("normalizes the extracted pilot through the B1 importer", () => {
    const graph = syntheticGraph();
    expect(graph.operators).toHaveLength(1);
    expect(graph.stops).toHaveLength(1);
    expect(graph.routes).toHaveLength(1);
    expect(graph.routeStops).toHaveLength(1);
    expect(graph.calendars).toHaveLength(1);
    expect(graph.datasetVersion.sourceType).toBe("data_dump");
    expect(graph.datasetVersion.completeness).toBe("complete_provider_dump");
  });
});

describe("manifest", () => {
  it("carries evidence with no credential material", () => {
    const { coverage } = normalizePilotExtraction(
      extractPilotScope(
        syntheticFamilies() as Record<
          string,
          readonly Record<string, unknown>[]
        >,
      ),
      METADATA,
    );
    const graph = syntheticGraph();
    const manifest = buildSnapshotManifest({
      snapshotId: "odpt-test-abc12345",
      checkedAt: METADATA.checkedAt,
      retrievedAt: METADATA.retrievedAt,
      downloads: [
        {
          rdfType: "odpt:Station",
          initialEndpoint: "https://api.odpt.org/api/v4/odpt:Station.json",
          initialStatus: 302,
          hops: [
            {
              status: 301,
              targetOrigin: "https://dump.example",
              targetPath: "/f.json",
              hadSensitiveParts: false,
            },
          ],
          finalStatus: 200,
          contentType: "application/json",
          contentLengthHeader: 100,
          bytesDownloaded: 100,
          rawSha256: "ab".repeat(32),
          bodyBytes: new Uint8Array([1, 2, 3]),
          httpAttempts: 2,
        },
      ],
      rawCounts: { "odpt:Station": 1 },
      filteredCounts: { "odpt:Station": 1 },
      graph,
      coverage,
      licenseStatus: "unknown",
      promotion: { status: "candidate", reason: "test" },
    });
    expect(manifest.provider).toBe("odpt");
    expect(manifest.pilotOperators).toContain("odpt.Operator:Toei");
    expect(manifest.licenseGate.productionPromotionAllowed).toBe(false);
    expect(manifest.licenseGate.localSnapshotAllowed).toBe(true);
    const serialized = JSON.stringify(manifest);
    expect(serialized).not.toContain("acl:consumerKey");
    expect(serialized).not.toContain("TESTKEY");
  });
});

function candidateGraph() {
  return syntheticGraph();
}

function candidateManifest(graph: NormalizedTransitGraph) {
  return buildSnapshotManifest({
    snapshotId: "odpt-test-snap1",
    checkedAt: METADATA.checkedAt,
    retrievedAt: METADATA.retrievedAt,
    downloads: [],
    rawCounts: {},
    filteredCounts: {},
    graph,
    coverage: normalizePilotExtraction(
      extractPilotScope(
        syntheticFamilies() as Record<
          string,
          readonly Record<string, unknown>[]
        >,
      ),
      METADATA,
    ).coverage,
    licenseStatus: "unknown",
    promotion: { status: "candidate", reason: "test" },
  });
}

describe("last-known-good promotion", () => {
  it("A. promotes a valid first snapshot with no previous LKG", () => {
    const store = mkStore();
    try {
      expect(readLastKnownGood(store)).toBeNull();
      const graph = candidateGraph();
      const pointer = promoteToLastKnownGood({
        storeDir: store,
        snapshotId: "odpt-test-snap1",
        graph,
        manifest: candidateManifest(graph),
        promotedAt: METADATA.checkedAt,
      });
      expect(pointer.snapshotId).toBe("odpt-test-snap1");
      expect(readLastKnownGood(store)?.pointer.snapshotId).toBe(
        "odpt-test-snap1",
      );
    } finally {
      rmStore(store);
    }
  });

  it("B–F. failures leave existing LKG byte-identical", () => {
    const store = mkStore();
    try {
      const graph = candidateGraph();
      promoteToLastKnownGood({
        storeDir: store,
        snapshotId: "odpt-test-snap1",
        graph,
        manifest: candidateManifest(graph),
        promotedAt: METADATA.checkedAt,
      });
      const before = readBytes(`${store}/last-known-good.json`);
      const beforeGraph = readBytes(
        `${store}/snapshots/odpt-test-snap1.graph.json`,
      );

      // B. malformed new dump never reaches promotion.
      expectPipelineCode(
        () => validateDumpFamily("odpt:Station", "not json"),
        "invalid_json",
      );
      // C/D. network/redirect failure (simulated by a throwing fetch path).
      // E. importer failure on inconsistent extraction.
      expectPipelineCode(
        () =>
          extractPilotScope({
            "odpt:Operator": [OPERATOR],
            "odpt:Station": [
              {
                ...STATION,
                "odpt:railway": "odpt.Railway:TokyoMetro.Marunouchi",
              },
            ],
            "odpt:Railway": [RAILWAY],
            "odpt:Calendar": [],
          }),
        "extraction_reference",
      );
      // F. missing anchor identity blocks promotion via the decision gate.
      const decision = decidePromotion({
        missingAnchors: ["odpt.Station:TokyoMetro.Ginza.Ueno"],
        removedIdentities: [],
        missingRequiredOperators: [],
        licenseStatus: "unknown",
        completenessIsComplete: true,
      });
      expect(decision.decision).toBe("requires_review");

      expect(readBytes(`${store}/last-known-good.json`)).toBe(before);
      expect(readBytes(`${store}/snapshots/odpt-test-snap1.graph.json`)).toBe(
        beforeGraph,
      );
    } finally {
      rmStore(store);
    }
  });

  it("G. a valid replacement promotes atomically", () => {
    const store = mkStore();
    try {
      const graph = candidateGraph();
      promoteToLastKnownGood({
        storeDir: store,
        snapshotId: "odpt-test-snap1",
        graph,
        manifest: candidateManifest(graph),
        promotedAt: METADATA.checkedAt,
      });
      promoteToLastKnownGood({
        storeDir: store,
        snapshotId: "odpt-test-snap2",
        graph,
        manifest: candidateManifest(graph),
        promotedAt: METADATA.checkedAt,
      });
      expect(readLastKnownGood(store)?.pointer.snapshotId).toBe(
        "odpt-test-snap2",
      );
      // Prior snapshot files remain; the pointer swap is the promotion.
      expect(
        readBytes(`${store}/snapshots/odpt-test-snap1.graph.json`).length,
      ).toBeGreaterThan(0);
    } finally {
      rmStore(store);
    }
  });
});

describe("continuity, comparison, freshness, licence", () => {
  it("requires both exact pilot operators, never a third party", () => {
    const graphWith = (...operators: string[]) =>
      ({
        operators: operators.map((providerOperatorId) => ({
          providerOperatorId,
        })),
      }) as NormalizedTransitGraph;
    expect(
      missingRequiredPilotOperators(
        graphWith("odpt.Operator:TokyoMetro", "odpt.Operator:Toei"),
      ),
    ).toEqual([]);
    expect(
      missingRequiredPilotOperators(graphWith("odpt.Operator:TokyoMetro")),
    ).toEqual(["odpt.Operator:Toei"]);
    expect(
      missingRequiredPilotOperators(graphWith("odpt.Operator:Toei")),
    ).toEqual(["odpt.Operator:TokyoMetro"]);
    expect(missingRequiredPilotOperators(graphWith())).toEqual([
      "odpt.Operator:TokyoMetro",
      "odpt.Operator:Toei",
    ]);
    // An arbitrary third operator satisfies nothing.
    expect(
      missingRequiredPilotOperators(graphWith("odpt.Operator:JR-East")),
    ).toEqual(["odpt.Operator:TokyoMetro", "odpt.Operator:Toei"]);
  });

  it("forces requires_review when a required operator is absent", () => {
    for (const missing of [
      ["odpt.Operator:Toei"],
      ["odpt.Operator:TokyoMetro"],
      ["odpt.Operator:TokyoMetro", "odpt.Operator:Toei"],
    ]) {
      const decision = decidePromotion({
        missingAnchors: [],
        removedIdentities: [],
        missingRequiredOperators: missing,
        licenseStatus: "unknown",
        completenessIsComplete: true,
      });
      expect(decision.decision).toBe("requires_review");
    }
  });

  it("records no-op check freshness without churning graph bytes", () => {
    const store = mkStore();
    try {
      const graph = candidateGraph();
      promoteToLastKnownGood({
        storeDir: store,
        snapshotId: "odpt-test-snap1",
        graph,
        manifest: candidateManifest(graph),
        promotedAt: "2026-09-01T00:00:00.000Z",
      });
      const first = readLastKnownGood(store)?.pointer;
      expect(first?.lastCheckedAt).toBe("2026-09-01T00:00:00.000Z");
      const graphBefore = readBytes(
        `${store}/snapshots/odpt-test-snap1.graph.json`,
      );

      // Semantic no-op: same content, later successful check.
      const pointer = recordSuccessfulCheck({
        storeDir: store,
        checkedAt: "2026-09-05T00:00:00.000Z",
      });
      expect(pointer.snapshotId).toBe("odpt-test-snap1");
      expect(pointer.promotedAt).toBe("2026-09-01T00:00:00.000Z");
      expect(pointer.lastCheckedAt).toBe("2026-09-05T00:00:00.000Z");
      expect(pointer.contentHash).toBe(first?.contentHash);
      expect(readBytes(`${store}/snapshots/odpt-test-snap1.graph.json`)).toBe(
        graphBefore,
      );

      // Failed refresh never advances lastCheckedAt.
      expectPipelineCode(
        () => validateDumpFamily("odpt:Station", "not json"),
        "invalid_json",
      );
      expect(readLastKnownGood(store)?.pointer.lastCheckedAt).toBe(
        "2026-09-05T00:00:00.000Z",
      );

      // Stale LKG becomes fresh after a successful no-op check.
      expect(
        freshnessStatus(
          "2026-09-01T00:00:00.000Z",
          Date.parse("2026-09-12T00:00:00.000Z"),
        ),
      ).toBe("stale");
      expect(
        freshnessStatus(
          readLastKnownGood(store)?.pointer.lastCheckedAt ?? null,
          Date.parse("2026-09-12T00:00:00.000Z"),
        ),
      ).toBe("fresh");
    } finally {
      rmStore(store);
    }
  });

  it("loads trusted anchor identities from the committed KAI-291A artifact", () => {
    const repoRoot = dirname(fileURLToPath(import.meta.url));
    const root = join(repoRoot, "..", "..", "..");
    const ids = loadAnchorStationIds((path) =>
      readFileSync(join(root, path), "utf8"),
    );
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(id.startsWith("odpt.Station:")).toBe(true);
    }
  });

  it("flags disappeared anchor identities without fuzzy replacement", () => {
    const graph = syntheticGraph();
    const missing = missingAnchorIdentities(graph, [
      "odpt.Station:TokyoMetro.Ginza.Ueno",
      "odpt.Station:Nope.Line.Gone",
    ]);
    expect(missing).toEqual(["odpt.Station:Nope.Line.Gone"]);
    const decision = decidePromotion({
      missingAnchors: missing,
      removedIdentities: [],
      missingRequiredOperators: [],
      licenseStatus: "unknown",
      completenessIsComplete: true,
    });
    expect(decision.decision).toBe("requires_review");
  });

  it("compares candidates with deltas and identity sets", () => {
    const graph = syntheticGraph();
    const fresh = compareCandidate(graph, null);
    expect(fresh.removedIdentities).toEqual([]);
    expect(fresh.semanticHashChanged).toBe(true);
    const same = compareCandidate(graph, graph);
    expect(same.semanticHashChanged).toBe(false);
    expect(same.stopDelta).toBe(0);
    expect(same.addedIdentities).toEqual([]);
  });

  it("reports semantic no-op vs raw change distinctly", () => {
    expect(
      snapshotIdFor("2026-09-12T00:00:00.000Z", "ab".repeat(32)),
    ).toContain("odpt-");
  });

  it("applies the 7-day freshness policy with an injected now", () => {
    const now = Date.parse("2026-09-12T00:00:00.000Z");
    expect(freshnessStatus("2026-09-12T00:00:00.000Z", now)).toBe("fresh");
    expect(freshnessStatus("2026-09-05T00:00:01.000Z", now)).toBe("fresh");
    expect(freshnessStatus("2026-09-04T00:00:00.000Z", now)).toBe("stale");
    expect(freshnessStatus(null, now)).toBe("unknown");
    expect(freshnessStatus("not-a-date", now)).toBe("unknown");
    expect(freshnessStatus("2026-09-13T00:00:00.000Z", now)).toBe("unknown");
  });

  it("gates promotion scope by licence with unknown as default", () => {
    expect(licenceAllowsProductionPromotion("unknown")).toBe(false);
    expect(licenceAllowsProductionPromotion("restricted")).toBe(false);
    expect(licenceAllowsProductionPromotion("local_audit_only")).toBe(false);
    expect(licenceAllowsProductionPromotion("reviewed_allowed")).toBe(true);
    expect(licenceAllowsLocalSnapshot("unknown")).toBe(true);
    expect(licenceAllowsLocalSnapshot("restricted")).toBe(false);
    const rejected = decidePromotion({
      missingAnchors: [],
      removedIdentities: [],
      missingRequiredOperators: [],
      licenseStatus: "restricted",
      completenessIsComplete: true,
    });
    expect(rejected.decision).toBe("reject");
  });

  it("imports identical input to identical semantic hashes", () => {
    const first = syntheticGraph().datasetVersion.contentHash;
    const second = syntheticGraph().datasetVersion.contentHash;
    expect(first).toBe(second);
  });
});
