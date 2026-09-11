/**
 * KAI-291B1 — ODPT rail topology importer tests.
 *
 * Offline and deterministic: the committed ODPT-shaped fixture plus fixed
 * explicit metadata. No network, no clock, no environment reads.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  buildOdptCoverageReport,
  contentHashOf,
  importOdptRailTopology,
  OdptImportError,
  operatorInternalId,
  passthroughTitles,
  routeInternalId,
  stopInternalId,
  TRANSIT_GRAPH_SCHEMA_VERSION,
  type OdptImportMetadata,
  type OdptRailTopologyInput,
} from "../odptRailTopologyImporter";

const FIXTURE_DIR = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(FIXTURE_DIR, "fixtures/odptRailTopologyFixture.json");
const GOLDEN_PATH = join(
  FIXTURE_DIR,
  "fixtures/normalizedRailTopologyGolden.json",
);

const METADATA: OdptImportMetadata = {
  datasetId: "odpt-rail-fixture-v1",
  identityNamespace: "odpt",
  sourceDescriptor: "test metadata",
  sourceType: "fixture",
  retrievedAt: "2026-09-11T00:00:00.000Z",
  checkedAt: "2026-09-11T00:00:00.000Z",
  completeness: "fixture_subset",
};

function loadFixture(): OdptRailTopologyInput {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
}

function expectImportError(input: OdptRailTopologyInput, code: string): void {
  try {
    importOdptRailTopology(input, METADATA);
  } catch (error) {
    expect(error).toBeInstanceOf(OdptImportError);
    expect((error as OdptImportError).code).toBe(code);
    return;
  }
  throw new Error(`expected OdptImportError[${code}] but import succeeded`);
}

/* ── Normalized IDs ─────────────────────────────────────────────── */

describe("normalized identity", () => {
  it("derives deterministic provider-scoped ids, reversible to provider ids", () => {
    expect(operatorInternalId("odpt.Operator:TokyoMetro", "odpt")).toBe(
      "odpt:operator:odpt:odpt.Operator%3ATokyoMetro",
    );
    expect(stopInternalId("odpt.Station:TokyoMetro.Ginza.Ueno", "odpt")).toBe(
      "odpt:stop:odpt:odpt.Station%3ATokyoMetro.Ginza.Ueno",
    );
    expect(routeInternalId("odpt.Railway:TokyoMetro.Ginza", "odpt")).toBe(
      "odpt:route:odpt:odpt.Railway%3ATokyoMetro.Ginza",
    );
    // The authoritative provider id is the providerStopId FIELD — never
    // recovered by stripping prefixes off the internal id.
    expect(
      stopInternalId("odpt.Station:TokyoMetro.Ginza.Ueno", "odpt"),
    ).toContain("odpt");
  });

  it("scopes feed-local ids by namespace: same id, different feeds differ", () => {
    // The namespace segment is what keeps feed-scoped identifiers apart
    // (GTFS stop_id=100 in feed A vs feed B later): same provider id under
    // two namespaces must never produce the same normalized identity.
    const feedA = stopInternalId("100", "feed-a");
    const feedB = stopInternalId("100", "feed-b");
    expect(feedA).not.toBe(feedB);
    expect(feedA).toContain("feed-a");
    expect(feedB).toContain("feed-b");
  });

  it("keeps display names out of identity", () => {
    const { graph } = importOdptRailTopology(loadFixture(), METADATA);
    const ueno = graph.stops.find(
      (stop) => stop.providerStopId === "odpt.Station:TokyoMetro.Ginza.Ueno",
    );
    expect(ueno?.id).toBe(
      "odpt:stop:odpt:odpt.Station%3ATokyoMetro.Ginza.Ueno",
    );
    // Pure namespaced derivation: the id is the namespace prefix plus the
    // provider identity verbatim — no name lookup contributed anything.
    // (The provider identity itself contains "Ueno"; that is provider data,
    // not a display-name input to identity.)
    expect(ueno?.id).toBe(stopInternalId(ueno?.providerStopId ?? "", "odpt"));
    expect(ueno?.names.en).toBe("Ueno");
  });

  it("passes multilingual titles through open-ended, never constrained", () => {
    expect(passthroughTitles({ en: "Shinjuku", ja: "新宿" })).toEqual({
      en: "Shinjuku",
      ja: "新宿",
    });
    // Six-language provider titles survive intact.
    const titles = passthroughTitles({
      en: "Ikebukuro",
      ja: "池袋",
      ko: "이케부쿠로",
      "ja-Hrkt": "いけぶくろ",
      "zh-Hans": "池袋",
      "zh-Hant": "池袋",
    });
    expect(Object.keys(titles)).toHaveLength(6);
    expect(passthroughTitles(null)).toEqual({});
  });
});

/* ── ODPT adapter ───────────────────────────────────────────────── */

describe("ODPT rail adapter", () => {
  it("imports operators, stations, railways, ordered sequences and calendars", () => {
    const { graph } = importOdptRailTopology(loadFixture(), METADATA);
    expect(graph.operators).toHaveLength(2);
    expect(graph.stops).toHaveLength(10);
    expect(graph.routes).toHaveLength(4);
    expect(graph.routeStops).toHaveLength(10);
    expect(graph.calendars).toHaveLength(3);
    expect(graph.datasetVersion.schemaVersion).toBe(
      TRANSIT_GRAPH_SCHEMA_VERSION,
    );
    expect(graph.datasetVersion.provider).toBe("odpt");
    expect(graph.datasetVersion.sourceType).toBe("fixture");
  });

  it("preserves exact provider ids on every entity", () => {
    const { graph } = importOdptRailTopology(loadFixture(), METADATA);
    const providerStopIds = new Set(graph.stops.map((s) => s.providerStopId));
    expect(providerStopIds.has("odpt.Station:Toei.Mita.Sugamo")).toBe(true);
    expect(providerStopIds.has("odpt.Station:TokyoMetro.Ginza.Ueno")).toBe(
      true,
    );
    for (const stop of graph.stops) {
      expect(stop.provenance.providerId).toBe(stop.providerStopId);
      expect(stop.provenance.datasetId).toBe(METADATA.datasetId);
    }
  });

  it("preserves provider route-stop order per railway", () => {
    const { graph } = importOdptRailTopology(loadFixture(), METADATA);
    const mita = graph.routeStops
      .filter((m) => m.routeId === "odpt:route:odpt:odpt.Railway%3AToei.Mita")
      .sort((a, b) => a.order - b.order)
      .map((m) => m.stopId);
    expect(mita).toEqual([
      "odpt:stop:odpt:odpt.Station%3AToei.Mita.Sugamo",
      "odpt:stop:odpt:odpt.Station%3AToei.Mita.Jimbocho",
      "odpt:stop:odpt:odpt.Station%3AToei.Mita.Mita",
    ]);
  });

  it("retains calendar identity, kind and raw semantics for later resolution", () => {
    const { graph } = importOdptRailTopology(loadFixture(), METADATA);
    const byId = new Map(graph.calendars.map((c) => [c.providerCalendarId, c]));
    expect(byId.get("odpt.Calendar:Weekday")?.sourceSemantics.kind).toBe(
      "base",
    );
    expect(
      byId.get("odpt.Calendar:SaturdayHoliday")?.sourceSemantics.kind,
    ).toBe("base");
    const specific = byId.get("odpt.Calendar:Specific.FixtureNewYear");
    expect(specific?.sourceSemantics.kind).toBe("specific");
    expect(specific?.sourceSemantics.provider).toBe("odpt");
    expect(specific?.sourceSemantics.duration).toBe("2026-01-01/2026-01-03");
    expect(specific?.sourceSemantics.day).toEqual(["Holiday"]);
  });

  it("keeps coordinates from provider evidence and codes as metadata", () => {
    const { graph } = importOdptRailTopology(loadFixture(), METADATA);
    const sugamo = graph.stops.find(
      (s) => s.providerStopId === "odpt.Station:Toei.Mita.Sugamo",
    );
    expect(sugamo?.coordinates).toEqual({ lat: 35.733793, lng: 139.738154 });
    expect(sugamo?.stationCode).toBe("I-15");
  });

  it("leaves legitimately missing coordinates null without inventing any", () => {
    const input = loadFixture();
    const stations = input.stations.map((s) =>
      (s as Record<string, unknown>)["owl:sameAs"] ===
      "odpt.Station:Toei.Mita.Mita"
        ? {
            ...(s as Record<string, unknown>),
            ["geo:lat"]: undefined,
            ["geo:long"]: undefined,
          }
        : s,
    );
    // JSON drops undefined: the record genuinely lacks coordinates.
    const parsed = JSON.parse(JSON.stringify({ ...input, stations }));
    const { graph } = importOdptRailTopology(parsed, METADATA);
    const mita = graph.stops.find(
      (s) => s.providerStopId === "odpt.Station:Toei.Mita.Mita",
    );
    expect(mita?.coordinates).toBeNull();
  });
});

/* ── Identity safety: never merge ───────────────────────────────── */

describe("identity safety", () => {
  it("keeps interchange twins distinct: two Shinjukus, two Jimbochos", () => {
    const { graph } = importOdptRailTopology(loadFixture(), METADATA);
    const shinjukus = graph.stops.filter((s) =>
      s.providerStopId.endsWith(".Shinjuku"),
    );
    expect(shinjukus.map((s) => s.providerStopId).sort()).toEqual([
      "odpt.Station:Toei.Shinjuku.Shinjuku",
      "odpt.Station:TokyoMetro.Marunouchi.Shinjuku",
    ]);
    expect(new Set(shinjukus.map((s) => s.id)).size).toBe(2);
    const jimbochos = graph.stops.filter((s) =>
      s.providerStopId.endsWith(".Jimbocho"),
    );
    expect(jimbochos).toHaveLength(2);
  });

  it("does not dedupe by name or proximity: same name + near coords stay two stops", () => {
    const { graph } = importOdptRailTopology(loadFixture(), METADATA);
    const metro = graph.stops.find(
      (s) => s.providerStopId === "odpt.Station:TokyoMetro.Marunouchi.Shinjuku",
    );
    const toei = graph.stops.find(
      (s) => s.providerStopId === "odpt.Station:Toei.Shinjuku.Shinjuku",
    );
    // Same display name, ~450 m apart — still two records, no merge.
    expect(metro?.names.en).toBe(toei?.names.en);
    expect(metro?.id).not.toBe(toei?.id);
    expect(graph.stops).toHaveLength(10);
  });
});

/* ── Validation: fail closed ────────────────────────────────────── */

describe("importer validation", () => {
  it("fails when a route orders a station outside the imported scope", () => {
    const input = loadFixture();
    const railways = (input.railways as Record<string, unknown>[]).map(
      (railway) =>
        railway["owl:sameAs"] === "odpt.Railway:Toei.Mita"
          ? {
              ...railway,
              ["odpt:stationOrder"]: [
                ...((railway["odpt:stationOrder"] as unknown[]) ?? []),
                {
                  "odpt:station": "odpt.Station:Toei.Mita.Notsuchiko",
                  "odpt:index": 9,
                },
              ],
            }
          : railway,
    );
    expectImportError({ ...input, railways }, "unknown_station_reference");
  });

  it("fails on a duplicate provider identity with contradictory data", () => {
    const input = loadFixture();
    const dupe = {
      ...(input.stations as Record<string, unknown>[])[0],
      ["odpt:stationCode"]: "M-XX",
    };
    expectImportError(
      { ...input, stations: [...input.stations, dupe] },
      "duplicate_provider_identity",
    );
  });

  it("fails on a byte-identical duplicate identity too", () => {
    const input = loadFixture();
    expectImportError(
      { ...input, stations: [...input.stations, input.stations[0]] },
      "duplicate_provider_identity",
    );
  });

  it("fails on malformed station order (non-numeric index)", () => {
    const input = loadFixture();
    const railways = (input.railways as Record<string, unknown>[]).map(
      (railway) =>
        railway["owl:sameAs"] === "odpt.Railway:TokyoMetro.Ginza"
          ? {
              ...railway,
              ["odpt:stationOrder"]: [
                {
                  "odpt:station": "odpt.Station:TokyoMetro.Ginza.Ueno",
                  "odpt:index": "first",
                },
              ],
            }
          : railway,
    );
    expectImportError({ ...input, railways }, "invalid_station_order");
  });

  it("fails on a duplicate order index within one railway", () => {
    const input = loadFixture();
    const railways = (input.railways as Record<string, unknown>[]).map(
      (railway) =>
        railway["owl:sameAs"] === "odpt.Railway:TokyoMetro.Ginza"
          ? {
              ...railway,
              ["odpt:stationOrder"]: [
                {
                  "odpt:station": "odpt.Station:TokyoMetro.Ginza.Ueno",
                  "odpt:index": 1,
                },
                {
                  "odpt:station": "odpt.Station:TokyoMetro.Ginza.Asakusa",
                  "odpt:index": 1,
                },
              ],
            }
          : railway,
    );
    expectImportError({ ...input, railways }, "duplicate_station_order_index");
  });

  it("fails when a station references an operator outside the scope", () => {
    const input = loadFixture();
    const stations = (input.stations as Record<string, unknown>[]).map(
      (station) =>
        station["owl:sameAs"] === "odpt.Station:Toei.Mita.Sugamo"
          ? { ...station, ["odpt:operator"]: "odpt.Operator:JR-East" }
          : station,
    );
    expectImportError({ ...input, stations }, "unknown_operator_reference");
  });

  it("fails on present-but-malformed coordinates rather than nulling them", () => {
    const input = loadFixture();
    const stations = (input.stations as Record<string, unknown>[]).map(
      (station) =>
        station["owl:sameAs"] === "odpt.Station:Toei.Mita.Sugamo"
          ? { ...station, ["geo:lat"]: "thirty-five" }
          : station,
    );
    expectImportError({ ...input, stations }, "malformed_coordinates");
  });
});

/* ── Determinism ────────────────────────────────────────────────── */

describe("determinism", () => {
  it("imports the same fixture twice to the same canonical bytes", () => {
    const first = importOdptRailTopology(loadFixture(), METADATA);
    const second = importOdptRailTopology(loadFixture(), METADATA);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.graph.datasetVersion.contentHash).toBe(
      second.graph.datasetVersion.contentHash,
    );
  });

  it("is stable under shuffled non-semantic input order", () => {
    const input = loadFixture();
    const reversed = {
      operators: [...input.operators].reverse(),
      stations: [...input.stations].reverse(),
      railways: [...input.railways].reverse(),
      calendars: [...(input.calendars ?? [])].reverse(),
    };
    const first = importOdptRailTopology(input, METADATA);
    const second = importOdptRailTopology(reversed, METADATA);
    expect(second.graph.datasetVersion.contentHash).toBe(
      first.graph.datasetVersion.contentHash,
    );
    // Provider order inside each route survives the shuffle.
    expect(second.graph.routeStops).toEqual(first.graph.routeStops);
  });

  it("matches the committed golden output byte-for-byte", () => {
    // Input metadata comes FROM the golden file, so this asserts the
    // committed bytes reproduce exactly — not that two local runs agree.
    // The regen CLI (`scripts/transit/import-odpt-rail-topology.ts`) writes
    // through Prettier, and `format:check` pins the file formatting.
    const golden = JSON.parse(readFileSync(GOLDEN_PATH, "utf8"));
    const { graph, coverage } = importOdptRailTopology(
      loadFixture(),
      golden.metadata,
    );
    expect(golden.graph).toEqual(graph);
    expect(golden.coverage).toEqual(coverage);
  });

  it("binds the content hash to the normalized entities", () => {
    const { graph } = importOdptRailTopology(loadFixture(), METADATA);
    expect(graph.datasetVersion.contentHash).toBe(
      contentHashOf({
        operators: graph.operators,
        stops: graph.stops,
        routes: graph.routes,
        routeStops: graph.routeStops,
        calendars: graph.calendars,
      }),
    );
    expect(graph.datasetVersion.contentHash).toHaveLength(64);
  });
});

/* ── Coverage registry ──────────────────────────────────────────── */

describe("coverage registry", () => {
  it("marks the successful fixture import as PARTIAL, never full coverage", () => {
    // A clean subset parse is not full TokyoMetro/Toei topology.
    const { coverage } = importOdptRailTopology(loadFixture(), METADATA);
    expect(coverage.entries).toHaveLength(2);
    for (const entry of coverage.entries) {
      expect(entry.provider).toBe("odpt");
      expect(entry.mode).toBe("rail");
      expect(entry.topology).toBe("partial");
      expect(entry.notes.join(" ")).toContain(
        "not a complete provider topology",
      );
      expect(entry.timetable).toBe("not_imported_in_this_slice");
      expect(entry.fare).toBe("not_imported_in_this_slice");
      expect(entry.realtime).toBe("not_evaluated");
    }
  });

  it("marks imported topology only for a validated complete source (synthetic)", () => {
    const { graph } = importOdptRailTopology(loadFixture(), {
      ...METADATA,
      sourceType: "data_dump",
      completeness: "complete_provider_dump",
    });
    const coverage = buildOdptCoverageReport(graph);
    for (const entry of coverage.entries) {
      expect(entry.topology).toBe("imported");
      expect(entry.notes).toEqual([]);
    }
  });

  it("still reports partial for a complete source when a route has no ordered stops", () => {
    const { graph } = importOdptRailTopology(loadFixture(), {
      ...METADATA,
      sourceType: "data_dump",
      completeness: "complete_provider_dump",
    });
    const emptied = {
      ...graph,
      routes: graph.routes,
      routeStops: graph.routeStops.filter(
        (m) => m.routeId !== "odpt:route:odpt:odpt.Railway%3ATokyoMetro.Ginza",
      ),
    };
    const coverage = buildOdptCoverageReport(emptied);
    const metro = coverage.entries.find(
      (e) => e.operator === "odpt.Operator:TokyoMetro",
    );
    expect(metro?.topology).toBe("partial");
    expect(metro?.notes.join(" ")).toContain("odpt.Railway:TokyoMetro.Ginza");
    const toei = coverage.entries.find(
      (e) => e.operator === "odpt.Operator:Toei",
    );
    expect(toei?.topology).toBe("imported");
  });
});

/* ── Content hash: semantic, not observational ────────────────────── */

describe("content hash metadata invariance", () => {
  const hashOf = (metadata: OdptImportMetadata) =>
    importOdptRailTopology(loadFixture(), metadata).graph.datasetVersion
      .contentHash;

  it("A. same content + different retrievedAt -> same contentHash", () => {
    expect(
      hashOf({ ...METADATA, retrievedAt: "2026-09-12T00:00:00.000Z" }),
    ).toBe(hashOf(METADATA));
  });

  it("B. same content + different checkedAt/datasetId/descriptor -> same hash", () => {
    expect(
      hashOf({
        ...METADATA,
        checkedAt: "2026-09-12T00:00:00.000Z",
        datasetId: "odpt-rail-refresh-2",
        sourceDescriptor: "tomorrow's refresh of the same content",
      }),
    ).toBe(hashOf(METADATA));
  });

  it("C. a real station/route/calendar change -> different contentHash", () => {
    const input = loadFixture();
    const stations = (input.stations as Record<string, unknown>[]).map(
      (station) =>
        station["owl:sameAs"] === "odpt.Station:Toei.Mita.Sugamo"
          ? { ...station, ["odpt:stationCode"]: "I-99" }
          : station,
    );
    const changed = importOdptRailTopology({ ...input, stations }, METADATA)
      .graph.datasetVersion.contentHash;
    expect(changed).not.toBe(hashOf(METADATA));
    expect(changed).toHaveLength(64);
  });

  it("D. a different feed namespace -> different identities and hash", () => {
    const other = importOdptRailTopology(loadFixture(), {
      ...METADATA,
      identityNamespace: "feed-b",
    });
    const base = importOdptRailTopology(loadFixture(), METADATA);
    expect(other.graph.stops[0].id).not.toBe(base.graph.stops[0].id);
    expect(other.graph.datasetVersion.contentHash).not.toBe(
      base.graph.datasetVersion.contentHash,
    );
  });
});

/* ── Cross-reference consistency ──────────────────────────────────── */

describe("cross-reference consistency", () => {
  it("fails when a Toei station claims a TokyoMetro railway", () => {
    const input = loadFixture();
    const stations = (input.stations as Record<string, unknown>[]).map(
      (station) =>
        station["owl:sameAs"] === "odpt.Station:Toei.Mita.Sugamo"
          ? {
              ...station,
              ["odpt:railway"]: "odpt.Railway:TokyoMetro.Marunouchi",
            }
          : station,
    );
    expectImportError({ ...input, stations }, "cross_reference_mismatch");
  });

  it("fails when a TokyoMetro station is inserted into a Toei stationOrder", () => {
    const input = loadFixture();
    const railways = (input.railways as Record<string, unknown>[]).map(
      (railway) =>
        railway["owl:sameAs"] === "odpt.Railway:Toei.Mita"
          ? {
              ...railway,
              ["odpt:stationOrder"]: [
                ...((railway["odpt:stationOrder"] as unknown[]) ?? []),
                {
                  "odpt:station": "odpt.Station:TokyoMetro.Ginza.Ueno",
                  "odpt:index": 9,
                },
              ],
            }
          : railway,
    );
    expectImportError({ ...input, railways }, "cross_reference_mismatch");
  });

  it("fails when a record carries the wrong @type family", () => {
    const input = loadFixture();
    const stations = (input.stations as Record<string, unknown>[]).map(
      (station, index) =>
        index === 0 ? { ...station, ["@type"]: "odpt:Railway" } : station,
    );
    expectImportError({ ...input, stations }, "unexpected_resource_type");
  });
});

/* ── Ingestion metadata validation ────────────────────────────────── */

describe("ingestion metadata validation", () => {
  const bad = (override: Partial<OdptImportMetadata>) =>
    importOdptRailTopology(loadFixture(), {
      ...METADATA,
      ...override,
    });

  it("rejects empty datasetId / namespace / descriptor", () => {
    expect(() => bad({ datasetId: "" })).toThrow(/invalid_metadata/);
    expect(() => bad({ identityNamespace: "" })).toThrow(/invalid_metadata/);
    expect(() => bad({ sourceDescriptor: "" })).toThrow(/invalid_metadata/);
  });

  it("rejects zoneless or impossible timestamps", () => {
    expect(() => bad({ retrievedAt: "2026-09-11 00:00:00" })).toThrow(
      /invalid_metadata/,
    );
    expect(() => bad({ checkedAt: "2026-02-29T00:00:00Z" })).toThrow(
      /invalid_metadata/,
    );
    expect(() =>
      bad({ validUntil: "not-a-date" as unknown as string }),
    ).toThrow(/invalid_metadata/);
  });

  it("accepts offset-aware datetimes with explicit zones", () => {
    expect(() =>
      bad({
        retrievedAt: "2026-09-11T09:00:00+09:00",
        issuedAt: "2026-09-01T00:00:00Z",
        validUntil: "2027-09-01T00:00:00+09:00",
      }),
    ).not.toThrow();
  });

  it("rejects an unknown completeness value", () => {
    expect(() =>
      bad({ completeness: "everything" as OdptImportMetadata["completeness"] }),
    ).toThrow(/invalid_metadata/);
  });

  it("accepts fixture + fixture_subset and records both on the version", () => {
    const { graph } = importOdptRailTopology(loadFixture(), METADATA);
    expect(graph.datasetVersion.sourceType).toBe("fixture");
    expect(graph.datasetVersion.completeness).toBe("fixture_subset");
  });

  it("accepts data_dump + complete_provider_dump", () => {
    const { graph } = importOdptRailTopology(loadFixture(), {
      ...METADATA,
      sourceType: "data_dump",
      completeness: "complete_provider_dump",
    });
    expect(graph.datasetVersion.sourceType).toBe("data_dump");
    expect(graph.datasetVersion.completeness).toBe("complete_provider_dump");
  });

  it("rejects fixture + complete_provider_dump as impossible", () => {
    expect(() =>
      bad({ sourceType: "fixture", completeness: "complete_provider_dump" }),
    ).toThrow(/invalid_metadata/);
  });

  it("rejects live_api + complete_provider_dump as impossible", () => {
    expect(() =>
      bad({ sourceType: "live_api", completeness: "complete_provider_dump" }),
    ).toThrow(/invalid_metadata/);
  });

  it("rejects an unknown sourceType", () => {
    expect(() =>
      bad({ sourceType: "carrier_pigeon" as OdptImportMetadata["sourceType"] }),
    ).toThrow(/invalid_metadata/);
  });
});
