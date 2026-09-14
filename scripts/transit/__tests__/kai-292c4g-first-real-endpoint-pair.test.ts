import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

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
import { ODPT_TOKYOMETRO_GINZA_A501_DATASET } from "../../../src/shared/services/transport/static/scheduledTransitDatasetRegistry";

const ROOT = process.cwd();
const DATASET = validateScheduledTransitDataset(
  JSON.parse(
    readFileSync(
      join(ROOT, "public/data/transit/odpt-tokyometro-ginza-a501.json"),
      "utf8",
    ),
  ) as unknown,
  ODPT_TOKYOMETRO_GINZA_A501_DATASET,
);
const ORIGIN_PRODUCT_ID = "tokyo-metro-ginza-asakusa";
const DESTINATION_PRODUCT_ID = "ueno-park";

function mappingFor(
  kind: ScheduledTransitCrosswalkEntry["endpoint"]["kind"],
  productId: string,
): ScheduledTransitCrosswalkEntry {
  const mapping = SCHEDULED_TRANSIT_CROSSWALK.mappings.find(
    (candidate) =>
      candidate.endpoint.kind === kind &&
      candidate.endpoint.productId === productId,
  );
  if (mapping === undefined) {
    throw new Error(`missing ${kind} mapping for ${productId}`);
  }
  return mapping;
}

function withMapping(
  mapping: ScheduledTransitCrosswalkEntry,
  changes: Partial<
    Pick<
      ScheduledTransitCrosswalkEntry,
      "mappingId" | "provider" | "identityNamespace"
    >
  >,
): ScheduledTransitCrosswalkEntry {
  return { ...mapping, ...changes };
}

describe("KAI-292C4G first real ODPT endpoint pair", () => {
  it("resolves the exact Asakusa origin and Ueno Park destination stops", () => {
    const origin = resolveScheduledTransitEndpoint({
      dataset: DATASET,
      endpoint: { kind: "origin", productId: ORIGIN_PRODUCT_ID },
    });
    const destination = resolveScheduledTransitEndpoint({
      dataset: DATASET,
      endpoint: { kind: "destination", productId: DESTINATION_PRODUCT_ID },
    });

    expect(origin).toMatchObject({
      kind: "resolved",
      provider: "odpt",
      identityNamespace: "odpt",
      providerStopId: "odpt.Station:TokyoMetro.Ginza.Asakusa",
      normalizedStopId:
        "odpt:stop:odpt:odpt.Station%3ATokyoMetro.Ginza.Asakusa",
    });
    expect(destination).toMatchObject({
      kind: "resolved",
      provider: "odpt",
      identityNamespace: "odpt",
      providerStopId: "odpt.Station:TokyoMetro.Ginza.Ueno",
      normalizedStopId: "odpt:stop:odpt:odpt.Station%3ATokyoMetro.Ginza.Ueno",
    });
  });

  it.each([
    ["provider", { provider: "gtfs" as const }],
    ["namespace", { identityNamespace: "odpt:wrong-scope" }],
  ] as const)("rejects a mapping with the wrong %s", (_label, changes) => {
    const destination = mappingFor("destination", DESTINATION_PRODUCT_ID);
    const result = resolveScheduledTransitEndpoint({
      dataset: DATASET,
      endpoint: { kind: "destination", productId: DESTINATION_PRODUCT_ID },
      crosswalk: [
        mappingFor("origin", ORIGIN_PRODUCT_ID),
        withMapping(destination, changes),
      ],
    });
    expect(result).toMatchObject({
      kind: "unmapped",
      reason: "no_explicit_crosswalk",
    });
  });

  it("rejects ambiguity instead of choosing one destination mapping", () => {
    const destination = mappingFor("destination", DESTINATION_PRODUCT_ID);
    const result = resolveScheduledTransitEndpoint({
      dataset: DATASET,
      endpoint: { kind: "destination", productId: DESTINATION_PRODUCT_ID },
      crosswalk: [
        destination,
        withMapping(destination, {
          mappingId: "kai-292c4g-destination-ueno-park-duplicate",
        }),
      ],
    });
    expect(result).toMatchObject({
      kind: "ambiguous",
      mappingIds: [
        "kai-292c4g-destination-ueno-park",
        "kai-292c4g-destination-ueno-park-duplicate",
      ],
    });
  });

  it("does not fall back to names, coordinates, or nearest stations", () => {
    const result = resolveScheduledTransitEndpoint({
      dataset: DATASET,
      endpoint: { kind: "destination", productId: "Ueno Station" },
    });
    expect(result).toMatchObject({
      kind: "unmapped",
      reason: "no_explicit_crosswalk",
    });
  });

  it("discovers exactly one structural real corridor and no Sakata product corridor", () => {
    const result: RealCorridorAudit = auditRealMegurutoCorridor();
    expect(result.status).toBe("real_corridor_evidenced");
    expect(result.realCorridors).toHaveLength(1);
    expect(result.realCorridors[0]).toMatchObject({
      origin: {
        productId: ORIGIN_PRODUCT_ID,
        providerStopId: "odpt.Station:TokyoMetro.Ginza.Asakusa",
      },
      destination: {
        productId: DESTINATION_PRODUCT_ID,
        providerStopId: "odpt.Station:TokyoMetro.Ginza.Ueno",
      },
      dataset: {
        key: "odpt-tokyometro-ginza-a501",
        provider: "odpt",
        identityNamespace: "odpt",
      },
      scheduledRouting: {
        kind: "supported",
        topology: "direct",
        transferCount: 0,
      },
      runtimeVerification: { status: "not_evaluated" },
    });
    expect(
      result.realCorridors.some(
        (corridor) => corridor.dataset.key === "sakata-runrunbus",
      ),
    ).toBe(false);
    expect(result.candidateBlockers).toEqual([]);
  });
});
