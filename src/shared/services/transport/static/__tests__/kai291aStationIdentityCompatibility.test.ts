/**
 * KAI-291B1 ↔ KAI-291A contract test (narrow).
 *
 * A KAI-291A ODPT station identity must be USABLE AS-IS as the normalized
 * graph's provider stop id. No fuzzy conversion layer may stand between the
 * anchor registry and the transit graph.
 *
 * This creates no destination mappings and consumes no anchor policy.
 */
import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  importOdptRailTopology,
  type OdptImportMetadata,
  type OdptRailTopologyInput,
} from "../odptRailTopologyImporter";

describe("KAI-291A station identity compatibility", () => {
  const metadata: OdptImportMetadata = {
    datasetId: "compat-check",
    identityNamespace: "odpt",
    sourceDescriptor: "compat test (fixed, deterministic)",
    retrievedAt: "2026-09-11T00:00:00.000Z",
    checkedAt: "2026-09-11T00:00:00.000Z",
    completeness: "fixture_subset",
  };
  const { graph } = importOdptRailTopology(
    JSON.parse(
      readFileSync(
        join(
          dirname(fileURLToPath(import.meta.url)),
          "fixtures/odptRailTopologyFixture.json",
        ),
        "utf8",
      ),
    ) as OdptRailTopologyInput,
    metadata,
  );

  it("matches anchor identity strings to normalized stops via providerStopId", () => {
    // Real anchor identities from the KAI-291A registry. The authoritative
    // link is the providerStopId FIELD — never substring surgery on the
    // internal id.
    for (const identity of [
      "odpt.Station:TokyoMetro.Ginza.Ueno",
      "odpt.Station:Toei.Mita.Sugamo",
    ]) {
      const stop = graph.stops.find((s) => s.providerStopId === identity);
      expect(stop).toBeDefined();
      expect(stop?.providerStopId).toBe(identity);
    }
  });

  it("locates the matching normalized stop deterministically", () => {
    const matches = graph.stops.filter(
      (s) => s.providerStopId === "odpt.Station:TokyoMetro.Ginza.Ueno",
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].stopType).toBe("station");
    expect(matches[0].coordinates).toEqual({ lat: 35.711835, lng: 139.775625 });
  });
});
