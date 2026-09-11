/**
 * KAI-291B1 — static query contract tests.
 *
 * Proves the model answers topology lookups from ordered memberships only.
 * Anything resembling routing (shortest path, transfers, timetables) is
 * out of scope and untested here by design.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  importOdptRailTopology,
  type OdptImportMetadata,
  type OdptRailTopologyInput,
} from "../odptRailTopologyImporter";
import {
  getOrderedStopsForRoute,
  getRoute,
  getRoutesForStop,
  getStop,
  shareStaticRouteMembership,
} from "../transitGraphQueries";

const FIXTURE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/odptRailTopologyFixture.json",
);

const FIXTURE_METADATA: OdptImportMetadata = {
  datasetId: "odpt-rail-fixture-v1",
  identityNamespace: "odpt",
  sourceDescriptor: "test metadata (fixed, deterministic)",
  sourceType: "fixture",
  retrievedAt: "2026-09-11T00:00:00.000Z",
  checkedAt: "2026-09-11T00:00:00.000Z",
  completeness: "fixture_subset",
};

const { graph } = importOdptRailTopology(
  JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as OdptRailTopologyInput,
  FIXTURE_METADATA,
);

const MITA = "odpt:route:odpt:odpt.Railway%3AToei.Mita";
const SUGAMO = "odpt:stop:odpt:odpt.Station%3AToei.Mita.Sugamo";
const JIMBOCHO_MITA = "odpt:stop:odpt:odpt.Station%3AToei.Mita.Jimbocho";
const MITA_END = "odpt:stop:odpt:odpt.Station%3AToei.Mita.Mita";
const UENO = "odpt:stop:odpt:odpt.Station%3ATokyoMetro.Ginza.Ueno";

describe("static queries", () => {
  it("gets stops and routes by internal id, null when unknown", () => {
    expect(getStop(graph, SUGAMO)?.providerStopId).toBe(
      "odpt.Station:Toei.Mita.Sugamo",
    );
    expect(getStop(graph, "odpt:stop:odpt:nope")).toBeNull();
    expect(getRoute(graph, MITA)?.providerRouteId).toBe(
      "odpt.Railway:Toei.Mita",
    );
    expect(getRoute(graph, "odpt:route:odpt:nope")).toBeNull();
  });

  it("returns route stops in provider order", () => {
    expect(
      getOrderedStopsForRoute(graph, MITA).map((stop) => stop.providerStopId),
    ).toEqual([
      "odpt.Station:Toei.Mita.Sugamo",
      "odpt.Station:Toei.Mita.Jimbocho",
      "odpt.Station:Toei.Mita.Mita",
    ]);
    expect(getOrderedStopsForRoute(graph, "odpt:route:odpt:nope")).toEqual([]);
  });

  it("lists every route serving a stop (interchange twins differ)", () => {
    const mitaJimbocho = getRoutesForStop(graph, JIMBOCHO_MITA).map(
      (route) => route.providerRouteId,
    );
    expect(mitaJimbocho).toEqual(["odpt.Railway:Toei.Mita"]);
    const shinjukuLineJimbocho = getRoutesForStop(
      graph,
      "odpt:stop:odpt:odpt.Station%3AToei.Shinjuku.Jimbocho",
    ).map((route) => route.providerRouteId);
    expect(shinjukuLineJimbocho).toEqual(["odpt.Railway:Toei.Shinjuku"]);
    expect(getRoutesForStop(graph, "odpt:stop:odpt:nope")).toEqual([]);
  });

  it("answers same-route reachability from topology alone", () => {
    expect(shareStaticRouteMembership(graph, SUGAMO, MITA_END)).toBe(true);
    // Different railways, no shared route: not directly connected here.
    // (A physical interchange exists in the real world; B1 records no
    // transfers, so the graph honestly reports no connection.)
    expect(shareStaticRouteMembership(graph, SUGAMO, UENO)).toBe(false);
    expect(shareStaticRouteMembership(graph, SUGAMO, SUGAMO)).toBe(false);
    expect(
      shareStaticRouteMembership(graph, SUGAMO, "odpt:stop:odpt:nope"),
    ).toBe(false);
  });
});
