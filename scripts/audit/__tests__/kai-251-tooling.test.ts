import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyManifest,
  buildResidualReport,
  factsEqual,
  validateManifest,
  type ManifestEntry,
} from "../../kai-251-local-transport-cohort";
import type { Destination } from "../../../src/shared/types/destination";

const root = process.cwd();
const rawDestinations = JSON.parse(
  readFileSync(
    path.join(root, "src/shared/data/destinations-index.json"),
    "utf8",
  ),
) as Destination[];
const kai252Manifest = JSON.parse(
  readFileSync(
    path.join(root, "scripts/audit/kai-252-local-transport-manifest.json"),
    "utf8",
  ),
) as { id: string }[];
const destinations = rawDestinations.map((destination) => {
  const fixture = JSON.parse(JSON.stringify(destination)) as Destination;
  if (kai252Manifest.some((entry) => entry.id === fixture.id)) {
    delete fixture.localTransport;
  }
  return fixture;
});
const manifest = JSON.parse(
  readFileSync(
    path.join(root, "scripts/audit/kai-251-local-transport-manifest.json"),
    "utf8",
  ),
) as ManifestEntry[];

const authoredIds = manifest
  .filter((entry) => entry.decision === "author")
  .map((entry) => entry.id)
  .sort();

function cloneDestinations(): Destination[] {
  return JSON.parse(JSON.stringify(destinations)) as Destination[];
}

function authoringInput(): Destination[] {
  const temporary = cloneDestinations();
  for (const id of authoredIds) {
    temporary.find((item) => item.id === id)!.localTransport = undefined;
  }
  return temporary;
}

describe("KAI-251 local-transport migration contract", () => {
  it("accepts exactly the researched queue and verifies every authored fact", () => {
    const facts = validateManifest(manifest, destinations);
    expect(manifest).toHaveLength(16);
    expect(facts.size).toBe(12);
    expect(authoredIds).toEqual([
      "atsuta-shrine-nagoya",
      "dazaifu-tenmangu",
      "fukuoka-art-museum",
      "fushimi-inari-taisha",
      "heian-jingu",
      "inuyama-castle-aichi",
      "kuromon-market",
      "nishiki-market",
      "osaka-station-city",
      "sumiyoshi-taisha",
      "tokyo-tower-minato",
      "toyota-commemorative-museum-of-industry-and-technology",
    ]);
    for (const entry of manifest) {
      if (!entry.fact) continue;
      expect(entry.fact.kind).toBe("verified_required_access");
      expect(entry.fact.fareBasis).toBe("one_way");
      expect(entry.fact.coverage).toBe("all_required_access");
      expect(entry.fact.sourceUrls.length).toBeGreaterThan(0);
      expect(entry.fact.checkedAt).toBe("2026-08-29");
      expect(entry.fact.reviewIntervalMonths).toBe(12);
      expect(entry.fact.fare[0]).toBeLessThanOrEqual(entry.fact.fare[1]);
    }
  });

  it("authors STATE A once and then becomes a zero-write STATE B rerun", () => {
    const temporary = authoringInput();
    const first = applyManifest(temporary, manifest);
    expect(first).toEqual({ state: "STATE A", changed: 12 });
    const second = applyManifest(temporary, manifest);
    expect(second).toEqual({ state: "STATE B", changed: 0 });
    for (const entry of manifest) {
      if (!entry.fact) continue;
      const destination = temporary.find((item) => item.id === entry.id)!;
      expect(factsEqual(destination.localTransport, entry.fact)).toBe(true);
    }
  });

  it("fails closed for mixed absent/present and conflicting facts", () => {
    const mixed = authoringInput();
    const first = applyManifest(mixed, manifest);
    expect(first.state).toBe("STATE A");
    const oneAuthored = authoredIds[0];
    mixed.find((item) => item.id === oneAuthored)!.localTransport = undefined;
    expect(() => applyManifest(mixed, manifest)).toThrow(/STATE C/);

    const conflicting = authoringInput();
    applyManifest(conflicting, manifest);
    conflicting.find((item) => item.id === oneAuthored)!.localTransport = {
      kind: "verified_required_access",
      access: "rail",
      fare: [1, 1],
      fareBasis: "one_way",
      coverage: "all_required_access",
      sourceUrls: ["https://example.invalid/conflict"],
      basis: "deliberately conflicting temporary fact",
      checkedAt: "2026-08-29",
      reviewIntervalMonths: 12,
    };
    expect(() => applyManifest(conflicting, manifest)).toThrow(/STATE C/);
  });

  it("classifies the exact residual queue without turning missing into zero", () => {
    const temporary = authoringInput();
    applyManifest(temporary, manifest);
    const residual = buildResidualReport(manifest, temporary);
    expect(residual.generatedFromDestinationCount).toBe(destinations.length);
    expect(residual.unresolvedCount).toBe(
      destinations.filter((item) => item.localTransport === undefined).length,
    );
    expect(residual.groups.fare_unavailable).toEqual(["sapporo-beer-museum"]);
    expect(residual.groups.ambiguous_canonical_arrival).toEqual([
      "tokyo-skytree-sumida",
    ]);
    expect(residual.groups.context_dependent_access.sort()).toEqual([
      "meiji-jingu",
      "tsukiji-outer-market",
    ]);
    expect(residual.unresolvedIds.includes("sapporo-beer-museum")).toBe(true);
    expect(
      temporary.find((item) => item.id === "sapporo-beer-museum")
        ?.localTransport,
    ).toBeUndefined();
  });
});
