import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  allCandidatesShareWikidataIdentity,
  applyPhase3Identity,
  classifyPhase3Destination,
  phase3IdentityMatches,
  phase3InputFingerprint,
  type Phase3Candidate,
  type Phase3Destination,
  type Phase3Discovery,
  type Phase3WikidataEntity,
} from "../../lib/wikipediaPhase3Enrichment";
import {
  validatePhase3Manifest,
  type Phase3Manifest,
} from "../../enrich-wikipedia-phase3";

function destination(
  overrides: Partial<Phase3Destination> = {},
): Phase3Destination {
  return {
    id: "aso-city",
    name: "Aso City",
    nameJa: "阿蘇市",
    kind: "city",
    role: "hub",
    prefecture: "Kumamoto",
    region: "Kyushu",
    coordinates: { lat: 32.9372, lng: 131.1189 },
    municipalityId: "Kumamoto:aso",
    placeType: "hub",
    relationships: {},
    ...overrides,
  };
}

function entity(
  overrides: Partial<Phase3WikidataEntity> = {},
): Phase3WikidataEntity {
  return {
    qid: "Q12345",
    labels: { en: "Aso City", ja: "阿蘇市" },
    aliases: {},
    descriptions: { en: "city in Kumamoto Prefecture, Japan" },
    p31: [{ id: "Q515", label: "city" }],
    p279: [],
    p131: [{ id: "Q103", label: "Kumamoto Prefecture" }],
    p17: [{ id: "Q17", label: "Japan" }],
    coordinates: { lat: 32.9372, lng: 131.1189 },
    sitelinks: { en: { title: "Aso City" } },
    ...overrides,
  };
}

type CandidateOverrides = Omit<Partial<Phase3Candidate>, "page" | "entity"> & {
  page?: Partial<Phase3Candidate["page"]>;
  entity?: Partial<Phase3WikidataEntity>;
};

function candidate(overrides: CandidateOverrides = {}): Phase3Candidate {
  const page = {
    language: "en" as const,
    title: "Aso City",
    url: "https://en.wikipedia.org/wiki/Aso_City",
    pageId: 12345,
    wikidataId: "Q12345",
    extract: "Aso City is a city in Kumamoto Prefecture, Japan.",
  };
  const qid = Object.prototype.hasOwnProperty.call(overrides, "qid")
    ? overrides.qid
    : "Q12345";
  const entityOverride = Object.prototype.hasOwnProperty.call(
    overrides,
    "entity",
  )
    ? overrides.entity
    : {};
  return {
    ...overrides,
    page: { ...page, ...(overrides.page ?? {}) },
    qid,
    sources: overrides.sources ?? ["wikidata-sitelink", "wikidata-search"],
    queries: overrides.queries ?? ["Aso City"],
    entity: entityOverride === undefined ? undefined : entity(entityOverride),
  };
}

function discovery(
  candidates: Phase3Candidate[],
  overrides: Partial<Phase3Discovery> = {},
): Phase3Discovery {
  return { candidates, redirects: [], wikidataSearches: [], ...overrides };
}

describe("classifyPhase3Destination", () => {
  it("accepts an exact page only after type, geography, and cross-link checks pass", () => {
    const result = classifyPhase3Destination(
      destination(),
      discovery([candidate()]),
    );

    expect(result.state).toBe("high-confidence-awaiting-apply");
    expect(result.reason).toBe("validated-high-confidence");
    expect(result.identity).toEqual({
      wikipediaTitle: "Aso City",
      wikipediaLanguage: "en",
      wikipediaUrl: "https://en.wikipedia.org/wiki/Aso_City",
      wikipediaPageId: 12345,
      wikidataId: "Q12345",
    });
    expect(result.candidate?.entityTypeResult).toBe("compatible");
    expect(result.candidate?.geographyResult).toBe("coordinates-compatible");
    expect(result.candidate?.wikipediaAgreement).toBe(true);
  });

  it("accepts a Wikidata label relationship only with independent Wikipedia agreement", () => {
    const result = classifyPhase3Destination(
      destination(),
      discovery([
        candidate({
          page: {
            title: "Aso (Kumamoto)",
            url: "https://en.wikipedia.org/wiki/Aso_(Kumamoto)",
          },
          entity: { sitelinks: { en: { title: "Aso (Kumamoto)" } } },
        }),
      ]),
    );

    expect(result.state).toBe("high-confidence-awaiting-apply");
    expect(result.candidate?.identitySignals).toContain(
      "wikidata-label-or-alias",
    );
    expect(result.candidate?.wikipediaAgreement).toBe(true);
  });

  it("does not treat a Wikidata sitelink alone as a destination relationship", () => {
    const result = classifyPhase3Destination(
      destination(),
      discovery([
        candidate({
          page: {
            title: "Unrelated Page",
            url: "https://en.wikipedia.org/wiki/Unrelated_Page",
          },
          sources: ["wikidata-sitelink"],
          entity: {
            labels: { en: "Unrelated Page" },
            sitelinks: { en: { title: "Unrelated Page" } },
          },
        }),
      ]),
    );

    expect(result).toMatchObject({
      state: "unresolved",
      reason: "no-candidate",
    });
  });

  it("does not accept redirect evidence by itself", () => {
    const result = classifyPhase3Destination(
      destination(),
      discovery([
        candidate({
          page: {
            title: "Aso",
            url: "https://en.wikipedia.org/wiki/Aso",
          },
          sources: ["wikipedia-redirect"],
          redirectFromTitles: ["Aso City"],
          entity: { sitelinks: { en: { title: "Aso" } } },
        }),
      ]),
    );

    expect(result).toMatchObject({
      state: "unresolved",
      reason: "redirect-evidence-only",
    });
  });

  it("rejects a P31 entity-type mismatch", () => {
    const result = classifyPhase3Destination(
      destination({ kind: "park", name: "Aso Park" }),
      discovery([
        candidate({
          page: {
            title: "Aso Park",
            url: "https://en.wikipedia.org/wiki/Aso_Park",
          },
          entity: {
            labels: { en: "Aso Park" },
            p31: [{ id: "Q station", label: "railway station" }],
            p131: [{ id: "Q103", label: "Kumamoto Prefecture" }],
            sitelinks: { en: { title: "Aso Park" } },
          },
        }),
      ]),
    );

    expect(result).toMatchObject({
      state: "unresolved",
      reason: "entity-type-mismatch",
    });
    expect(result.candidate?.entityTypeBasis).toContain(
      "P31=Q station (railway station)",
    );
  });

  it("accepts a P279-compatible entity type", () => {
    const result = classifyPhase3Destination(
      destination(),
      discovery([
        candidate({
          entity: {
            p31: [{ id: "Q486972", label: "human settlement" }],
            p279: [{ id: "Q515", label: "city" }],
          },
        }),
      ]),
    );

    expect(result.state).toBe("high-confidence-awaiting-apply");
    expect(result.candidate?.entityTypeResult).toBe("compatible");
    expect(result.candidate?.entityTypeBasis).toEqual([
      "P31=Q486972 (human settlement)",
      "P279=Q515 (city)",
    ]);
  });

  it("uses compatible P131 geography when coordinates are absent", () => {
    const result = classifyPhase3Destination(
      destination(),
      discovery([
        candidate({
          page: { coordinates: undefined },
          entity: {
            coordinates: undefined,
            p131: [{ id: "Qaso", label: "Aso" }],
          },
        }),
      ]),
    );

    expect(result.state).toBe("high-confidence-awaiting-apply");
    expect(result.candidate?.geographyResult).toBe(
      "administrative-location-compatible",
    );
  });

  it("rejects a geography mismatch", () => {
    const result = classifyPhase3Destination(
      destination(),
      discovery([
        candidate({
          entity: { coordinates: { lat: 43.0, lng: 141.0 } },
        }),
      ]),
    );

    expect(result).toMatchObject({
      state: "unresolved",
      reason: "geography-mismatch",
    });
  });

  it("rejects missing geography evidence", () => {
    const result = classifyPhase3Destination(
      destination(),
      discovery([
        candidate({
          page: { coordinates: undefined },
          entity: { coordinates: undefined, p131: [], p17: [] },
        }),
      ]),
    );

    expect(result).toMatchObject({
      state: "unresolved",
      reason: "geography-insufficient",
    });
  });

  it("keeps multiple QIDs ambiguous", () => {
    const result = classifyPhase3Destination(
      destination(),
      discovery([
        candidate(),
        candidate({
          page: {
            title: "Aso City (Other)",
            url: "https://en.wikipedia.org/wiki/Aso_City_(Other)",
            pageId: 54321,
            wikidataId: "Q54321",
          },
          qid: "Q54321",
          entity: entity({
            qid: "Q54321",
            labels: { en: "Aso City (Other)" },
            sitelinks: { en: { title: "Aso City (Other)" } },
          }),
        }),
      ]),
    );

    expect(result).toMatchObject({
      state: "ambiguous-candidate",
      reason: "multiple-qid-candidates",
    });
    expect(result.candidates).toHaveLength(2);
  });

  it("collapses EN and JA pages only when every candidate has the same non-empty QID", () => {
    const ja = candidate({
      page: {
        language: "ja",
        title: "阿蘇市",
        url: "https://ja.wikipedia.org/wiki/阿蘇市",
        pageId: 67890,
        wikidataId: "Q12345",
      },
      entity: { sitelinks: { ja: { title: "阿蘇市" } } },
    });
    expect(allCandidatesShareWikidataIdentity([candidate(), ja])).toBe(true);
    expect(
      classifyPhase3Destination(destination(), discovery([candidate(), ja]))
        .state,
    ).toBe("high-confidence-awaiting-apply");
  });

  it.each([
    ["different QIDs", "Q54321", "ambiguous-candidate"],
    ["missing JA QID", undefined, "ambiguous-candidate"],
  ])("keeps %s ambiguous", (_label, jaQid, expected) => {
    const ja = candidate({
      page: {
        language: "ja",
        title: "阿蘇市",
        url: "https://ja.wikipedia.org/wiki/阿蘇市",
        pageId: 67890,
        wikidataId: jaQid,
      },
      qid: jaQid,
      entity: jaQid ? { sitelinks: { ja: { title: "阿蘇市" } } } : undefined,
    });
    expect(allCandidatesShareWikidataIdentity([candidate(), ja])).toBe(false);
    expect(
      classifyPhase3Destination(destination(), discovery([candidate(), ja]))
        .state,
    ).toBe(expected);
  });

  it("requires affirmative evidence for no-standalone-article-expected", () => {
    expect(classifyPhase3Destination(destination(), discovery([])).state).toBe(
      "unresolved",
    );
    expect(
      classifyPhase3Destination(
        destination(),
        discovery([], {
          noStandaloneArticleEvidence: [
            "Official parent attraction identifies this as an internal observation deck, not a standalone entity.",
          ],
        }),
      ),
    ).toMatchObject({
      state: "no-standalone-article-expected",
      reason: "no-standalone-evidence",
    });
  });

  it("treats transient failure as unresolved rather than article absence", () => {
    const result = classifyPhase3Destination(
      destination(),
      discovery([], { transientFailure: "Wikidata request timed out" }),
    );
    expect(result).toMatchObject({
      state: "unresolved",
      reason: "transient-network-failure",
    });
  });
});

describe("Phase 3 fingerprints and apply", () => {
  it("binds cache identity to every identity-relevant field", () => {
    const base = destination();
    expect(phase3InputFingerprint(base)).toBe(
      phase3InputFingerprint({ ...base }),
    );
    expect(
      phase3InputFingerprint({
        ...base,
        relationships: { parentDestinationId: "x" },
      }),
    ).not.toBe(phase3InputFingerprint(base));
    expect(
      phase3InputFingerprint({ ...base, municipalityId: "Kumamoto:other" }),
    ).not.toBe(phase3InputFingerprint(base));
    expect(
      phase3InputFingerprint({ ...base, coordinates: { lat: 1, lng: 2 } }),
    ).not.toBe(phase3InputFingerprint(base));
  });

  it("applies only once and refuses an overwrite", () => {
    const target = destination();
    const identity = {
      wikipediaTitle: "Aso City",
      wikipediaLanguage: "en" as const,
      wikipediaUrl: "https://en.wikipedia.org/wiki/Aso_City",
      wikipediaPageId: 12345,
      wikidataId: "Q12345",
    };
    expect(applyPhase3Identity(target, identity)).toBe(true);
    expect(phase3IdentityMatches(target, identity)).toBe(true);
    expect(applyPhase3Identity(target, identity)).toBe(false);
    expect(() =>
      applyPhase3Identity(target, { ...identity, wikidataId: "Q999" }),
    ).toThrow(/refusing to overwrite/);
  });
});

describe("Phase 3 manifest drift guards", () => {
  function frozenInputs() {
    const root = process.cwd();
    return {
      destinations: JSON.parse(
        readFileSync(`${root}/src/shared/data/destinations-index.json`, "utf8"),
      ),
      phase1: JSON.parse(
        readFileSync(
          `${root}/scripts/audit/kai-256-wikipedia-legacy-report.json`,
          "utf8",
        ),
      ),
      phase2Cache: JSON.parse(
        readFileSync(
          `${root}/scripts/audit/kai-256-wikipedia-unmapped-api-cache.json`,
          "utf8",
        ),
      ),
      phase2Report: JSON.parse(
        readFileSync(
          `${root}/scripts/audit/kai-256-wikipedia-unmapped-report.json`,
          "utf8",
        ),
      ),
    };
  }

  function manifest(): Phase3Manifest {
    return JSON.parse(
      readFileSync(
        `${process.cwd()}/scripts/audit/kai-256-wikipedia-phase3-cohort.json`,
        "utf8",
      ),
    ) as Phase3Manifest;
  }

  it("rejects a newly eligible destination outside the frozen cohort", () => {
    const inputs = frozenInputs();
    const frozen = inputs.destinations.find(
      (record: Phase3Destination) => record.id === manifest().ids[0],
    );
    expect(frozen).toBeDefined();
    const drift = { ...frozen, id: "synthetic-phase3-drift" };
    delete drift.wikipediaTitle;
    delete drift.wikipediaLanguage;
    delete drift.wikipediaUrl;
    delete drift.wikipediaPageId;
    delete drift.wikidataId;
    inputs.destinations.push(drift);
    expect(() => validatePhase3Manifest(manifest(), inputs)).toThrow(
      /new eligible IDs outside frozen manifest/,
    );
  });

  it("rejects an identity-relevant input mutation", () => {
    const inputs = frozenInputs();
    const target = inputs.destinations.find(
      (record: Phase3Destination) => record.id === manifest().ids[0],
    );
    expect(target).toBeDefined();
    target.categories = [...(target.categories ?? []), "manifest-drift"];
    expect(() => validatePhase3Manifest(manifest(), inputs)).toThrow(
      /input fingerprint drift/,
    );
  });

  it("rejects any Phase 1 review-ledger intersection", () => {
    const inputs = frozenInputs();
    inputs.phase1.reviewLedger.push({ id: manifest().ids[0] });
    expect(() => validatePhase3Manifest(manifest(), inputs)).toThrow(
      /intersects the Phase 1 review ledger/,
    );
  });

  it("rejects Phase 1 source mutation even when the cohort is unchanged", () => {
    const inputs = frozenInputs();
    const reviewId = inputs.phase1.reviewLedger[0].id;
    const target = inputs.destinations.find(
      (record: Phase3Destination) => record.id === reviewId,
    );
    expect(target).toBeDefined();
    target.name = `${target.name} drift`;
    expect(() => validatePhase3Manifest(manifest(), inputs)).toThrow(
      /Phase 1 review source fingerprint drift/,
    );
  });
});
