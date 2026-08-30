import { describe, expect, it } from "vitest";
import {
  applyApprovedPhase4Identities,
  buildDuplicateIdentityAudit,
  derivePhase4Tail,
  frozenTailFingerprint,
  phase4AdjudicationFingerprint,
  identityFingerprint,
  identitySnapshot,
  validateFrozenTail,
  type Phase4Evaluation,
  type Phase4Manifest,
} from "../../adjudicate-wikipedia-phase4";
import {
  hashStable,
  type Phase3Destination,
  type Phase3Identity,
} from "../../lib/wikipediaPhase3Enrichment";

type TestDestination = Phase3Destination & { description?: string };

function destination(
  overrides: Partial<TestDestination> = {},
): TestDestination {
  return {
    id: "test-city",
    name: "Test City",
    status: "published",
    kind: "city",
    role: "hub",
    prefecture: "Tokyo",
    region: "Kanto",
    coordinates: { lat: 35.68, lng: 139.76 },
    relationships: {},
    ...overrides,
  };
}

const identity: Phase3Identity = {
  wikipediaTitle: "Test City",
  wikipediaLanguage: "en",
  wikipediaUrl: "https://en.wikipedia.org/wiki/Test_City",
  wikipediaPageId: 123,
  wikidataId: "Q123",
};

function evaluation(
  overrides: Partial<Phase4Evaluation> = {},
): Phase4Evaluation {
  return {
    id: "test-city",
    phase3State: "unresolved",
    phase3Reason: "no-candidate",
    finalDecision: "canonical",
    decisionReason: "test",
    approvalStatus: "ACCEPT",
    selectedIdentity: identity,
    selectedCandidateEvidence: null,
    candidateEvidence: [],
    parentChildResult: "not-evaluated",
    duplicateIdentityResult: null,
    targetedRetrievalUsed: false,
    targetedRetrievalEvidence: [],
    sourceModified: true,
    followUpRequired: false,
    inspectedAllCandidates: true,
    finalGate: null,
    ...overrides,
  };
}

function manifestFor(destinations: Phase3Destination[]): Phase4Manifest {
  const tail = derivePhase4Tail(destinations, { reviewLedger: [] });
  const ids = tail.map((item) => item.id);
  const phase4AdjudicationFingerprints = Object.fromEntries(
    tail.map((item) => [item.id, phase4AdjudicationFingerprint(item)]),
  );
  const sourceIdentityFingerprints = Object.fromEntries(
    tail.map((item) => [item.id, identityFingerprint(item)]),
  );
  const manifest: Phase4Manifest = {
    schemaVersion: 2,
    scope: "kai-256-wikipedia-phase4",
    baseline: {
      publishedDestinations: destinations.length,
      startingCanonicalWikipediaIdentity: 444,
      phase1ReviewRecords: 0,
      phase3HighConfidenceAwaitingApply: 0,
      phase3AmbiguousCandidate: 0,
      phase3Unresolved: ids.length,
      phase3NoStandaloneArticleExpected: 0,
      tailPopulation: ids.length,
    },
    ids,
    phase4AdjudicationFingerprints,
    sourceIdentityFingerprints,
    outsideTailPublishedIdentityFingerprint: hashStable({}),
    phase1ReviewLedgerFingerprint: hashStable([]),
    phase1ReviewInputFingerprints: {},
    phase1ReviewIdentityFingerprints: {},
    phase3CohortFingerprint: "phase3-cohort",
    phase3CohortWholeFingerprint: "phase3-whole",
    phase3ReportFingerprint: "phase3-report",
    phase3CacheFingerprint: "phase3-cache",
    priorPhase3: Object.fromEntries(
      ids.map((id) => [id, { state: "unresolved", reason: "no-candidate" }]),
    ),
    proposedIdentityFingerprints: Object.fromEntries(
      tail.map((item) => [item.id, identityFingerprint(item)]),
    ),
    wholeTailFingerprint: "",
  };
  manifest.wholeTailFingerprint = frozenTailFingerprint(manifest);
  return manifest;
}

describe("Phase 4 mutation boundary", () => {
  it("writes only the five identity fields and is idempotent", () => {
    const item = destination();
    const before = { ...item };
    const changed = applyApprovedPhase4Identities([item], [evaluation()]);

    expect(changed).toEqual(["test-city"]);
    expect(identitySnapshot(item)).toEqual(identitySnapshot(identity));
    expect(
      Object.keys(item).filter(
        (key) =>
          JSON.stringify(before[key as keyof Phase3Destination]) !==
          JSON.stringify(item[key as keyof Phase3Destination]),
      ),
    ).toEqual([
      "wikipediaTitle",
      "wikipediaLanguage",
      "wikipediaUrl",
      "wikipediaPageId",
      "wikidataId",
    ]);
    expect(applyApprovedPhase4Identities([item], [evaluation()])).toEqual([]);
  });

  it("refuses a canonical decision without explicit acceptance", () => {
    const item = destination();
    expect(() =>
      applyApprovedPhase4Identities(
        [item],
        [evaluation({ approvalStatus: "NEEDS_REVIEW" })],
      ),
    ).toThrow("not explicitly approved");
  });
});

describe("Phase 4 duplicate audit", () => {
  it("classifies the known parent/child identity conflicts", () => {
    const items = [
      destination({
        id: "enoshima-island",
        name: "Enoshima",
        wikipediaPageId: 309686,
        wikidataId: "Q989803",
      }),
      destination({
        id: "enoshima-iwaya-caves",
        name: "Enoshima Iwaya Caves",
        wikipediaPageId: 309686,
        wikidataId: "Q989803",
      }),
    ];
    const audit = buildDuplicateIdentityAudit(items, []);

    expect(audit.duplicateGroups).toHaveLength(2);
    expect(audit.counts["parent-child-conflict"]).toBe(2);
    expect(audit.counts["suspicious-needs-review"]).toBe(0);
  });
});

describe("Phase 4 frozen tail", () => {
  it("includes description in the adjudication fingerprint", () => {
    const original = destination({ description: "Original catalogue copy" });
    const changed = destination({ description: "Changed catalogue copy" });

    expect(phase4AdjudicationFingerprint(original)).not.toBe(
      phase4AdjudicationFingerprint(changed),
    );
  });

  it("fails closed when only the catalogue description changes", () => {
    const original = destination({ description: "Original catalogue copy" });
    const manifest = manifestFor([original]);
    const current = [destination({ description: "Changed catalogue copy" })];

    expect(() =>
      validateFrozenTail(manifest, current, { reviewLedger: [] }),
    ).toThrow("adjudication fingerprint drift");
  });

  it("fails closed when a new eligible record appears", () => {
    const original = destination();
    const manifest = manifestFor([original]);
    const review = { reviewLedger: [] };
    const current = [
      original,
      destination({ id: "new-city", name: "New City" }),
    ];

    expect(() => validateFrozenTail(manifest, current, review)).toThrow();
  });

  it("fails closed when the immutable baseline is edited", () => {
    const original = destination();
    const manifest = manifestFor([original]);
    manifest.baseline.startingCanonicalWikipediaIdentity = 445;
    manifest.wholeTailFingerprint = frozenTailFingerprint(manifest);
    expect(() =>
      validateFrozenTail(manifest, [original], { reviewLedger: [] }),
    ).toThrow("frozen baseline drifted");
  });

  it("fails closed when the Phase 1 ledger contains a duplicate", () => {
    const original = destination();
    const manifest = manifestFor([original]);
    const review = { reviewLedger: [{ id: "outside" }, { id: "outside" }] };
    expect(() => validateFrozenTail(manifest, [original], review)).toThrow(
      "duplicate IDs",
    );
  });

  it("normalizes QID case before classifying duplicate identities", () => {
    const audit = buildDuplicateIdentityAudit(
      [
        destination({ id: "upper", wikidataId: "Q123" }),
        destination({ id: "lower", wikidataId: "q123" }),
      ],
      [],
    );
    expect(audit.wikidataIdToDestinationIds.Q123).toEqual(["lower", "upper"]);
    expect(audit.counts["suspicious-needs-review"]).toBe(1);
  });
});
