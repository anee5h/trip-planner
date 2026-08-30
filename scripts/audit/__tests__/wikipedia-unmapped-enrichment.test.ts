import { describe, expect, it } from "vitest";
import {
  applyUnmappedIdentity,
  classifyUnmappedDestination,
  type UnmappedCandidate,
  type UnmappedDestination,
} from "../../lib/wikipediaUnmappedEnrichment";

function destination(
  overrides: Partial<UnmappedDestination> = {},
): UnmappedDestination {
  return {
    id: "aso-city",
    name: "Aso City",
    nameJa: "阿蘇市",
    kind: "city",
    role: "hub",
    prefecture: "Kumamoto",
    region: "Kyushu",
    coordinates: { lat: 32.9372, lng: 131.1189 },
    ...overrides,
  };
}

function candidate(
  overrides: Partial<UnmappedCandidate> = {},
): UnmappedCandidate {
  return {
    language: "en",
    title: "Aso City",
    url: "https://en.wikipedia.org/wiki/Aso_City",
    pageId: 12345,
    wikidataId: "Q12345",
    extract:
      "Aso City is a city in Kumamoto Prefecture, Japan, with a population and municipal government.",
    description: "City in Kumamoto Prefecture, Japan",
    coordinates: { lat: 32.9372, lng: 131.1189 },
    source: "search",
    ...overrides,
  };
}

describe("classifyUnmappedDestination", () => {
  it("accepts an exact high-confidence place only after independent checks pass", () => {
    const result = classifyUnmappedDestination(destination(), {
      candidates: [candidate({ source: "direct-title" })],
    });

    expect(result.state).toBe("high-confidence-candidate");
    expect(result.identity).toEqual({
      wikipediaTitle: "Aso City",
      wikipediaLanguage: "en",
      wikipediaUrl: "https://en.wikipedia.org/wiki/Aso_City",
      wikipediaPageId: 12345,
      wikidataId: "Q12345",
    });
    expect(result.matchSignals).toContain("canonical-name");
    expect(result.entityTypeResult).toBe("compatible");
    expect(result.geographyResult).toBe("coordinates-compatible");
    expect(result.ambiguityResult).toBe("no-competing-plausible-candidate");
  });

  it("accepts an approved alias but never fuzzy title resemblance", () => {
    const result = classifyUnmappedDestination(
      destination({
        name: "Aso Volcano Museum",
        kind: "museum",
        aliases: ["Aso Museum"],
      }),
      {
        candidates: [
          candidate({
            title: "Aso Museum",
            url: "https://en.wikipedia.org/wiki/Aso_Museum",
            description: "Museum in Kumamoto Prefecture, Japan",
            extract:
              "Aso Museum is a museum in Kumamoto Prefecture, Japan, with exhibits and visitors.",
          }),
        ],
      },
    );

    expect(result.state).toBe("high-confidence-candidate");
    expect(result.matchSignals).toContain("approved-alias");
  });

  it("treats EN and JA candidates as one identity only when their QID agrees", () => {
    const result = classifyUnmappedDestination(destination(), {
      candidates: [
        candidate(),
        candidate({
          language: "ja",
          title: "阿蘇市",
          url: "https://ja.wikipedia.org/wiki/阿蘇市",
          pageId: 67890,
          wikidataId: "Q12345",
          description: "熊本県の市",
          extract:
            "阿蘇市は熊本県にある市で、人口と市役所があり、観光と行政の中心です。",
        }),
      ],
    });

    expect(result.state).toBe("high-confidence-candidate");
    expect(result.identity).toBeDefined();
    if (!result.identity) throw new Error("Expected a canonical identity");
    expect(result.identity.wikipediaLanguage).toBe("en");
    expect(result.identity.wikidataId).toBe("Q12345");
    expect(result.candidates).toHaveLength(2);
  });

  it("keeps EN and JA candidates ambiguous when the JA page has no QID", () => {
    const result = classifyUnmappedDestination(destination(), {
      candidates: [
        candidate(),
        candidate({
          language: "ja",
          title: "阿蘇市",
          url: "https://ja.wikipedia.org/wiki/阿蘇市",
          pageId: 67890,
          wikidataId: undefined,
          description: "熊本県の市",
          extract:
            "阿蘇市は熊本県にある市で、人口と市役所があり、観光と行政の中心です。",
        }),
      ],
    });

    expect(result).toMatchObject({
      state: "ambiguous-candidate",
      ambiguityResult: "competing-candidates",
    });
  });

  it("keeps EN and JA candidates ambiguous when the EN page has no QID", () => {
    const result = classifyUnmappedDestination(destination(), {
      candidates: [
        candidate({ wikidataId: undefined }),
        candidate({
          language: "ja",
          title: "阿蘇市",
          url: "https://ja.wikipedia.org/wiki/阿蘇市",
          pageId: 67890,
          wikidataId: "Q12345",
          description: "熊本県の市",
          extract:
            "阿蘇市は熊本県にある市で、人口と市役所があり、観光と行政の中心です。",
        }),
      ],
    });

    expect(result).toMatchObject({
      state: "ambiguous-candidate",
      ambiguityResult: "competing-candidates",
    });
  });

  it("keeps three candidates ambiguous when one matching QID is missing", () => {
    const result = classifyUnmappedDestination(destination(), {
      candidates: [
        candidate(),
        candidate({
          pageId: 54321,
          wikidataId: "Q12345",
          title: "Aso City (Kumamoto)",
          url: "https://en.wikipedia.org/wiki/Aso_City_(Kumamoto)",
        }),
        candidate({
          language: "ja",
          title: "阿蘇市",
          url: "https://ja.wikipedia.org/wiki/阿蘇市",
          pageId: 67890,
          wikidataId: undefined,
          description: "熊本県の市",
          extract:
            "阿蘇市は熊本県にある市で、人口と市役所があり、観光と行政の中心です。",
        }),
      ],
    });

    expect(result).toMatchObject({
      state: "ambiguous-candidate",
      ambiguityResult: "competing-candidates",
    });
  });

  it("keeps same-name entities in different prefectures ambiguous", () => {
    const result = classifyUnmappedDestination(destination({ name: "Aso" }), {
      candidates: [
        candidate({
          title: "Aso",
          url: "https://en.wikipedia.org/wiki/Aso",
          pageId: 1,
          wikidataId: "Q1",
          coordinates: { lat: 32.9, lng: 131.1 },
        }),
        candidate({
          title: "Aso",
          url: "https://en.wikipedia.org/wiki/Aso_(Kumamoto)",
          pageId: 2,
          wikidataId: "Q2",
          coordinates: { lat: 43.0, lng: 141.0 },
        }),
      ],
    });

    expect(result).toMatchObject({
      state: "ambiguous-candidate",
      reason: "same-name-geographic-conflict",
    });
  });

  it("rejects station and port entity mismatches", () => {
    const stationResult = classifyUnmappedDestination(
      destination({ id: "park", name: "Aso Park", kind: "park" }),
      {
        candidates: [
          candidate({
            title: "Aso Park",
            description: "Railway station in Kumamoto, Japan",
            extract:
              "Aso Park is a railway station in Kumamoto, Japan, serving local trains.",
          }),
        ],
      },
    );
    const portResult = classifyUnmappedDestination(
      destination({
        id: "port",
        name: "Aso Port",
        kind: "nature",
        tags: ["port"],
      }),
      {
        candidates: [
          candidate({
            title: "Aso Port",
            description: "City in Kumamoto Prefecture, Japan",
            extract:
              "Aso Port is a city in Kumamoto Prefecture, Japan, with municipal services.",
          }),
        ],
      },
    );

    expect(stationResult).toMatchObject({
      state: "unresolved",
      reason: "entity-type-mismatch",
    });
    expect(portResult).toMatchObject({
      state: "unresolved",
      reason: "entity-type-mismatch",
    });
  });

  it("rejects a municipality article for an attraction and accepts geographic parentheses only as a title qualifier", () => {
    const mismatch = classifyUnmappedDestination(
      destination({ id: "museum", name: "Aso Museum", kind: "museum" }),
      {
        candidates: [
          candidate({
            title: "Aso Museum",
            description: "City in Kumamoto Prefecture, Japan",
            extract:
              "Aso Museum is a city in Kumamoto Prefecture, Japan, with municipal services.",
          }),
        ],
      },
    );
    const parenthetical = classifyUnmappedDestination(
      destination({ id: "aso", name: "Aso", kind: "city" }),
      {
        candidates: [
          candidate({
            title: "Aso (city)",
            url: "https://en.wikipedia.org/wiki/Aso_(city)",
            description: "City in Kumamoto Prefecture, Japan",
            extract:
              "Aso is a city in Kumamoto Prefecture, Japan, with a population and municipal government.",
          }),
        ],
      },
    );

    expect(mismatch.reason).toBe("entity-type-mismatch");
    expect(parenthetical.state).toBe("high-confidence-candidate");
  });

  it("does not substitute a parent landmark article for a child POI", () => {
    const result = classifyUnmappedDestination(
      destination({
        id: "observation-deck",
        name: "Landmark Observation Deck",
        kind: "viewpoint",
        role: "poi",
      }),
      {
        candidates: [
          candidate({
            title: "Landmark Tower",
            url: "https://en.wikipedia.org/wiki/Landmark_Tower",
          }),
        ],
        parentOnlyEvidence: [
          "The parent article mentions the observation deck.",
        ],
      },
    );

    expect(result).toMatchObject({
      state: "ambiguous-candidate",
      reason: "parent-landmark-only",
    });
  });

  it("keeps conflicting candidates, coordinate mismatches, and no-result searches fail closed", () => {
    const conflicting = classifyUnmappedDestination(destination(), {
      candidates: [
        candidate(),
        candidate({
          pageId: 54321,
          wikidataId: "Q54321",
          title: "Aso City (Kumamoto)",
          url: "https://en.wikipedia.org/wiki/Aso_City_(Kumamoto)",
        }),
      ],
    });
    const coordinateMismatch = classifyUnmappedDestination(destination(), {
      candidates: [candidate({ coordinates: { lat: 43, lng: 141 } })],
    });
    const noResult = classifyUnmappedDestination(destination(), {
      candidates: [],
    });

    expect(conflicting.reason).toBe("same-name-geographic-conflict");
    expect(coordinateMismatch).toMatchObject({
      state: "unresolved",
      reason: "coordinate-mismatch",
    });
    expect(noResult).toMatchObject({
      state: "unresolved",
      reason: "no-page-found",
    });
  });

  it("keeps transient failures separate and allows no-article only with explicit evidence", () => {
    const transient = classifyUnmappedDestination(destination(), {
      candidates: [],
      transientFailure: "HTTP 503 after bounded retries",
    });
    const noArticle = classifyUnmappedDestination(destination(), {
      candidates: [],
      noArticleEvidence: [
        "Constructed recommendation area; no standalone entity is modeled.",
      ],
    });

    expect(transient).toMatchObject({
      state: "unresolved",
      reason: "transient-network-failure",
    });
    expect(noArticle).toMatchObject({
      state: "no-article-expected",
      reason: "no-article-evidence",
    });
  });
});

describe("applyUnmappedIdentity", () => {
  it("applies once and is a no-op on an equivalent repeat", () => {
    const record = destination();
    const identity = {
      wikipediaTitle: "Aso City",
      wikipediaLanguage: "en" as const,
      wikipediaUrl: "https://en.wikipedia.org/wiki/Aso_City",
      wikipediaPageId: 12345,
      wikidataId: "Q12345",
    };

    expect(applyUnmappedIdentity(record, identity)).toBe(true);
    expect(applyUnmappedIdentity(record, identity)).toBe(false);
    expect(record).toMatchObject(identity);
  });
});
