/**
 * KAI-291B1 — regenerate the golden normalized rail topology.
 *
 * Offline and deterministic: reads the committed ODPT-shaped fixture plus
 * explicit fixed metadata, runs the pure importer, and writes the golden
 * graph through Prettier so the committed bytes satisfy `format:check` AND
 * regeneration reproduces them byte-for-byte.
 *
 * Run with: npx tsx scripts/transit/import-odpt-rail-topology.ts
 *
 * No network, no clock, no environment reads.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  importOdptRailTopology,
  ODPT_IDENTITY_NAMESPACE,
  type OdptImportMetadata,
} from "../../src/shared/services/transport/static/odptRailTopologyImporter";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(
  here,
  "../../src/shared/services/transport/static/__tests__/fixtures/odptRailTopologyFixture.json",
);
const GOLDEN_PATH = join(
  here,
  "../../src/shared/services/transport/static/__tests__/fixtures/normalizedRailTopologyGolden.json",
);

/**
 * Explicit fixed ingestion metadata. Fixed (not `new Date()`) so identical
 * fixture bytes always yield identical golden bytes, locally and in CI.
 */
export const GOLDEN_IMPORT_METADATA: OdptImportMetadata = {
  datasetId: "odpt-rail-fixture-v1",
  identityNamespace: ODPT_IDENTITY_NAMESPACE,
  sourceDescriptor:
    "fixture: odptRailTopologyFixture.json " +
    "(contract validation — NOT a full production network import)",
  retrievedAt: "2026-09-11T00:00:00.000Z",
  checkedAt: "2026-09-11T00:00:00.000Z",
  completeness: "fixture_subset",
};

function isMain(): boolean {
  const entry = process.argv[1];
  if (typeof entry !== "string") return false;
  return import.meta.url === `file://${entry}`;
}

export function goldenPayload(): string {
  const input = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
  const { graph, coverage } = importOdptRailTopology(
    input,
    GOLDEN_IMPORT_METADATA,
  );
  return `${JSON.stringify(
    {
      generator: "scripts/transit/import-odpt-rail-topology.ts",
      fixture: "odptRailTopologyFixture.json",
      metadata: GOLDEN_IMPORT_METADATA,
      graph,
      coverage,
    },
    null,
    2,
  )}\n`;
}

if (isMain()) {
  const { format } = await import("prettier");
  writeFileSync(
    GOLDEN_PATH,
    await format(goldenPayload(), { parser: "json" }),
    "utf8",
  );
  const { graph } = importOdptRailTopology(
    JSON.parse(readFileSync(FIXTURE_PATH, "utf8")),
    GOLDEN_IMPORT_METADATA,
  );
  process.stdout.write(
    `wrote ${GOLDEN_PATH}\n` +
      `  operators=${graph.operators.length} stops=${graph.stops.length} ` +
      `routes=${graph.routes.length} routeStops=${graph.routeStops.length} ` +
      `calendars=${graph.calendars.length}\n` +
      `  contentHash=${graph.datasetVersion.contentHash}\n`,
  );
}
