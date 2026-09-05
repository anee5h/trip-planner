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
import { makeEntry as transformResearchResult } from "../build-kai-252-research-ledger";

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
  it("covers every absent record with a validated research-result ledger entry", () => {
    expect(manifest).toHaveLength(1052);
    expect(manifest.map((entry) => entry.id).sort()).toEqual(
      predecessorResidual.unresolvedIds,
    );
    expect(
      destinations.filter(
        (destination) => destination.localTransport === undefined,
      ),
    ).toHaveLength(0);
    const facts = validateManifest(manifest, destinations);
    expect(facts.size).toBe(1052);
    for (const entry of manifest) {
      expect(entry.decision).toBe("author");
      expect([
        "verified_walking",
        "not_applicable",
        "verified_required_access",
        "bounded_defensible_access",
        "unavailable",
      ]).toContain(entry.fact.kind);
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
      manifest.filter((entry) => entry.fact.kind !== "unavailable").length,
    ).toBeGreaterThan(0);
  });

  it("authors STATE A once, then performs a zero-write STATE B rerun", () => {
    const temporary = authoringInput();
    expect(applyManifest(temporary, manifest)).toEqual({
      state: "STATE A",
      changed: 1052,
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
    for (const entry of manifest) {
      for (const attempt of entry.sourceAttempts) {
        if (!attempt.excerpt?.includes("RateLimitTriggeredError")) continue;
        expect(attempt.outcome).toBe("fetch_failed");
        expect(attempt.status).toBe(429);
      }
    }
  });

  it("executes research-ledger transformation fixtures without deriving facts from fetch status", () => {
    const destination = {
      id: "fixture-walking",
      name: "Fixture Walking Place",
      kind: "museum",
      role: "poi",
      officialWebsite: "https://example.invalid/place",
    } as Destination;
    const semantic = {
      canonicalArrivalAccessPoint: "Fixture Station north exit",
      canonicalArrivalResolved: true,
      accessPatternResearched:
        "Official operator access page states the destination is reached on foot from Fixture Station.",
      closureOrSuspension: { applies: false, detail: "No closure applies." },
      residualReason: "resolved" as const,
      reason: "Authoritative walking evidence resolves the final approach.",
      whyVerifiedWalkingIsInappropriate:
        "Not applicable after the walking evidence was reviewed.",
      whyNotApplicableIsInappropriate:
        "The destination has a distinct final approach, so N/A would hide it.",
      whyVerifiedRequiredAccessIsInappropriate:
        "No paid segment is required by the reviewed access page.",
      whyBoundedDefensibleAccessIsInappropriate: "No fare exists to bound.",
      whySegmentOnlyIsInsufficient: "No paid segment exists.",
      blocker: "localTransport_evidence" as const,
      semanticReview: {
        originTravelCoverage: "Origin travel ends at Fixture Station.",
        canonicalArrival:
          "Fixture Station north exit is the physical canonical arrival.",
        requiredLocalLegs: "Walk from the north exit to the entrance.",
        walkingAssessment:
          "Official access evidence establishes practical walking access.",
        paidAccessAssessment: "No paid final-access leg is required.",
        fareProduct: "None; walking is ¥0 without a fabricated fare.",
        multipleRequiredSegments: "None.",
        coverageDecision: "verified_walking.",
        noDoubleCounting:
          "The origin fare ends at the station and no local fare is added.",
      },
      fact: {
        kind: "verified_walking" as const,
        walkingEvidence:
          "Official operator access page: 5 minutes on foot from Fixture Station.",
        sourceUrls: ["https://example.invalid/place/access"],
        checkedAt: "2026-08-29",
      },
    };
    const transformed = transformResearchResult(
      destination,
      new Map(),
      semantic,
    );
    expect(transformed.fact.kind).toBe("verified_walking");
    expect(transformed.fact.kind).not.toBe("unavailable");

    const segment = {
      ...semantic,
      fact: {
        kind: "verified_required_access" as const,
        access: "bus" as const,
        fare: [230, 230] as [number, number],
        fareBasis: "one_way" as const,
        coverage: "segment_only" as const,
        sourceUrls: ["https://example.invalid/place/fare"],
        basis:
          "Official operator fare table: Fixture Station to trailhead, adult one-way ¥230.",
        checkedAt: "2026-08-29",
      },
    };
    const segmentResult = transformResearchResult(
      destination,
      new Map(),
      segment,
    );
    expect(segmentResult.fact).toMatchObject({
      kind: "verified_required_access",
      coverage: "segment_only",
      fare: [230, 230],
    });
  });
});
