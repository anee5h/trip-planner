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
  sourceDescriptor: "test metadata",
  retrievedAt: "2026-09-11T00:00:00.000Z",
  checkedAt: "2026-09-11T00:00:00.000Z",
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
    expect(operatorInternalId("odpt.Operator:TokyoMetro")).toBe(
      "odpt:operator:odpt.Operator:TokyoMetro",
    );
    expect(stopInternalId("odpt.Station:TokyoMetro.Ginza.Ueno")).toBe(
      "odpt:station:odpt.Station:TokyoMetro.Ginza.Ueno",
    );
    expect(routeInternalId("odpt.Railway:TokyoMetro.Ginza")).toBe(
      "odpt:route:odpt.Railway:TokyoMetro.Ginza",
    );
    // Reversible: strip the namespace prefix to recover the provider id.
    expect(
      stopInternalId("odpt.Station:TokyoMetro.Ginza.Ueno").replace(
        "odpt:station:",
        "",
      ),
    ).toBe("odpt.Station:TokyoMetro.Ginza.Ueno");
  });

  it("keeps display names out of identity", () => {
    const { graph } = importOdptRailTopology(loadFixture(), METADATA);
    const ueno = graph.stops.find(
      (stop) => stop.providerStopId === "odpt.Station:TokyoMetro.Ginza.Ueno",
    );
    expect(ueno?.id).toBe("odpt:station:odpt.Station:TokyoMetro.Ginza.Ueno");
    // Pure namespaced derivation: the id is the namespace prefix plus the
    // provider identity verbatim — no name lookup contributed anything.
    // (The provider identity itself contains "Ueno"; that is provider data,
    // not a display-name input to identity.)
    expect(ueno?.id).toBe(`odpt:station:${ueno?.providerStopId}`);
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
      .filter((m) => m.routeId === "odpt:route:odpt.Railway:Toei.Mita")
      .sort((a, b) => a.order - b.order)
      .map((m) => m.stopId);
    expect(mita).toEqual([
      "odpt:station:odpt.Station:Toei.Mita.Sugamo",
      "odpt:station:odpt.Station:Toei.Mita.Jimbocho",
      "odpt:station:odpt.Station:Toei.Mita.Mita",
    ]);
  });

  it("retains calendar identity, kind and raw semantics for later resolution", () => {
    const { graph } = importOdptRailTopology(loadFixture(), METADATA);
    const byId = new Map(graph.calendars.map((c) => [c.providerCalendarId, c]));
    expect(byId.get("odpt.Calendar:Weekday")?.calendarKind).toBe("base");
    expect(byId.get("odpt.Calendar:SaturdayHoliday")?.calendarKind).toBe(
      "base",
    );
    const specific = byId.get("odpt.Calendar:Specific.FixtureNewYear");
    expect(specific?.calendarKind).toBe("specific");
    expect(specific?.rawDuration).toBe("2026-01-01/2026-01-03");
    expect(specific?.rawDay).toEqual(["Holiday"]);
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

  it("keeps unknown fare unknown: no fares imported, none defaulted to 0", () => {
    const { graph, coverage } = importOdptRailTopology(loadFixture(), METADATA);
    expect(graph.fares).toEqual([]);
    for (const entry of coverage.entries) {
      expect(entry.fare).toBe("not_imported_in_this_slice");
    }
    expect(JSON.stringify(graph)).not.toContain('"amount":0');
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
  it("marks imported rail topology and explicit not-imported slices", () => {
    const { coverage } = importOdptRailTopology(loadFixture(), METADATA);
    expect(coverage.entries).toHaveLength(2);
    for (const entry of coverage.entries) {
      expect(entry.provider).toBe("odpt");
      expect(entry.mode).toBe("rail");
      expect(entry.topology).toBe("imported");
      expect(entry.timetable).toBe("not_imported_in_this_slice");
      expect(entry.fare).toBe("not_imported_in_this_slice");
      expect(entry.realtime).toBe("not_evaluated");
      expect(entry.notes).toEqual([]);
    }
  });

  it("reports partial rather than failing when a route has no ordered stops", () => {
    const { graph } = importOdptRailTopology(loadFixture(), METADATA);
    const emptied = {
      ...graph,
      routes: graph.routes,
      routeStops: graph.routeStops.filter(
        (m) => m.routeId !== "odpt:route:odpt.Railway:TokyoMetro.Ginza",
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
