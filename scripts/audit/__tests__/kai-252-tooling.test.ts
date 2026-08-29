import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Destination } from "../../src/shared/types/destination";
import {
  applyManifest,
  factsEqual,
  validateManifest,
  type ManifestEntry,
} from "../../kai-252-local-transport-cohort";

const root = process.cwd();
const destinations = JSON.parse(
  readFileSync(
    path.join(root, "src/shared/data/destinations-index.json"),
    "utf8",
  ),
) as Destination[];
const manifest = JSON.parse(
  readFileSync(
    path.join(root, "scripts/audit/kai-252-local-transport-manifest.json"),
    "utf8",
  ),
) as ManifestEntry[];
const predecessorResidual = JSON.parse(
  readFileSync(
    path.join(root, "scripts/audit/kai-251-residual-local-transport.json"),
    "utf8",
  ),
) as { unresolvedIds: string[] };
const manifestIds = manifest.map((entry) => entry.id).sort();

function cloneDestinations(): Destination[] {
  return JSON.parse(JSON.stringify(destinations)) as Destination[];
}

function authoringInput(): Destination[] {
  const temporary = cloneDestinations();
  for (const id of manifestIds) {
    delete temporary.find((destination) => destination.id === id)!
      .localTransport;
  }
  return temporary;
}

describe("KAI-252 final local-transport migration contract", () => {
  it("covers every absent record with a validated evidence-backed unavailable ledger entry", () => {
    expect(manifest).toHaveLength(1029);
    expect(manifest.map((entry) => entry.id).sort()).toEqual(
      predecessorResidual.unresolvedIds,
    );
    expect(
      destinations.filter(
        (destination) => destination.localTransport === undefined,
      ),
    ).toHaveLength(0);
    const facts = validateManifest(manifest, destinations);
    expect(facts.size).toBe(1029);
    for (const entry of manifest) {
      expect(entry.decision).toBe("author");
      expect(entry.fact.kind).toBe("unavailable");
      expect(entry.sourceAttempts.length).toBeGreaterThan(0);
      expect(entry.reason.length).toBeGreaterThan(0);
      expect(entry.whyVerifiedWalkingIsInappropriate.length).toBeGreaterThan(0);
      expect(entry.whyNotApplicableIsInappropriate.length).toBeGreaterThan(0);
      expect(
        entry.whyVerifiedRequiredAccessIsInappropriate.length,
      ).toBeGreaterThan(0);
      expect(
        entry.whyBoundedDefensibleAccessIsInappropriate.length,
      ).toBeGreaterThan(0);
      expect(entry.whySegmentOnlyIsInsufficient.length).toBeGreaterThan(0);
    }
    expect(
      manifest
        .filter((entry) =>
          [
            "sapporo-beer-museum",
            "tokyo-skytree-sumida",
            "meiji-jingu",
            "tsukiji-outer-market",
          ].includes(entry.id),
        )
        .reduce<Record<string, string>>((result, entry) => {
          result[entry.id] = entry.residualReason;
          return result;
        }, {}),
    ).toEqual({
      "sapporo-beer-museum": "fare_unavailable",
      "tokyo-skytree-sumida": "ambiguous_canonical_arrival",
      "meiji-jingu": "context_dependent_access",
      "tsukiji-outer-market": "context_dependent_access",
    });
  });

  it("authors STATE A once, then performs a zero-write STATE B rerun", () => {
    const temporary = authoringInput();
    expect(applyManifest(temporary, manifest)).toEqual({
      state: "STATE A",
      changed: 1029,
    });
    expect(
      temporary.every(
        (destination) => destination.localTransport !== undefined,
      ),
    ).toBe(true);
    expect(applyManifest(temporary, manifest)).toEqual({
      state: "STATE B",
      changed: 0,
    });
    for (const entry of manifest) {
      const destination = temporary.find((item) => item.id === entry.id)!;
      expect(factsEqual(destination.localTransport, entry.fact)).toBe(true);
    }
  });

  it("fails closed for mixed and conflicting states without mutating", () => {
    const mixed = authoringInput();
    mixed.find(
      (destination) => destination.id === manifest[0].id,
    )!.localTransport = manifest[0].fact;
    const mixedBefore = JSON.stringify(mixed);
    expect(() => applyManifest(mixed, manifest)).toThrow(/STATE C/);
    expect(JSON.stringify(mixed)).toBe(mixedBefore);

    const conflicting = authoringInput();
    conflicting.find(
      (destination) => destination.id === manifest[0].id,
    )!.localTransport = {
      ...manifest[0].fact,
      detail: `${manifest[0].fact.detail} deliberate conflict`,
    };
    const conflictBefore = JSON.stringify(conflicting);
    expect(() => applyManifest(conflicting, manifest)).toThrow(/STATE C/);
    expect(JSON.stringify(conflicting)).toBe(conflictBefore);
  });

  it("preserves the exact KAI-250 and KAI-251 predecessor facts", () => {
    const ids = [
      "tokyo-national-museum",
      "ueno-park",
      "himeji-castle",
      "matsumoto-castle-nagano",
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
    ];
    const before = new Map(
      ids.map((id) => [
        id,
        JSON.stringify(
          destinations.find((destination) => destination.id === id)
            ?.localTransport,
        ),
      ]),
    );
    const temporary = authoringInput();
    applyManifest(temporary, manifest);
    for (const id of ids) {
      expect(
        JSON.stringify(
          temporary.find((destination) => destination.id === id)
            ?.localTransport,
        ),
      ).toBe(before.get(id));
    }
  });

  it("does not promote Jina rate-limit responses into source evidence", () => {
    expect(
      manifest.some(
        (entry) => entry.residualReason === "no_current_saleable_product",
      ),
    ).toBe(false);
    for (const entry of manifest) {
      for (const attempt of entry.sourceAttempts) {
        if (!attempt.excerpt?.includes("RateLimitTriggeredError")) continue;
        expect(attempt.outcome).toBe("fetch_failed");
        expect(attempt.status).toBe(429);
      }
    }
  });
});
