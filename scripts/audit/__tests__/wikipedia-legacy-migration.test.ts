import { describe, expect, it } from "vitest";
import {
  classifyLegacyDestination,
  type LegacyCandidate,
  type LegacyDestination,
} from "../../lib/wikipediaLegacyMigration";

function destination(
  overrides: Partial<LegacyDestination> = {},
): LegacyDestination {
  return {
    id: "aso-city",
    name: "Aso City",
    nameJa: "阿蘇市",
    kind: "city",
    role: "hub",
    prefecture: "Kumamoto",
    region: "Kyushu",
    coordinates: { lat: 32.9372, lng: 131.1189 },
    editorial: {
      sources: [
        {
          type: "wikipedia",
          url: "https://en.wikipedia.org/wiki/Aso_City",
          title: "Aso City",
        },
      ],
    },
    ...overrides,
  };
}

function candidate(overrides: Partial<LegacyCandidate> = {}): LegacyCandidate {
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
    ...overrides,
  };
}

describe("classifyLegacyDestination", () => {
  it("canonicalizes one exact, validated legacy identity", () => {
    const result = classifyLegacyDestination(destination(), {
      "en:aso city": candidate(),
    });

    expect(result).toEqual({
      state: "canonicalizable",
      reason: "validated-legacy-identity",
      identity: {
        wikipediaTitle: "Aso City",
        wikipediaLanguage: "en",
        wikipediaUrl: "https://en.wikipedia.org/wiki/Aso_City",
        wikipediaPageId: 12345,
        wikidataId: "Q12345",
      },
      sourceUrls: ["https://en.wikipedia.org/wiki/Aso_City"],
    });
  });

  it("keeps a parent or unrelated article in review when its title does not identify the destination", () => {
    const result = classifyLegacyDestination(
      destination({
        name: "Aso Volcano Museum",
        nameJa: "阿蘇火山博物館",
        kind: "museum",
        role: "poi",
        editorial: {
          sources: [
            {
              type: "wikipedia",
              url: "https://en.wikipedia.org/wiki/Mount_Aso",
              title: "Mount Aso",
            },
          ],
        },
      }),
      {
        "en:mount aso": candidate({
          title: "Mount Aso",
          url: "https://en.wikipedia.org/wiki/Mount_Aso",
          pageId: 54321,
          wikidataId: "Q54321",
          extract:
            "Mount Aso is the largest active volcano in Japan and includes a broad volcanic area.",
          description: "Volcano in Japan",
        }),
      },
    );

    expect(result.state).toBe("review");
    expect(result.reason).toBe("destination-title-mismatch");
    expect(result.identity).toBeUndefined();
  });

  it("keeps records with conflicting legacy URLs in review", () => {
    const result = classifyLegacyDestination(
      destination({
        editorial: {
          sources: [
            {
              type: "wikipedia",
              url: "https://en.wikipedia.org/wiki/Aso_City",
              title: "Aso City",
            },
            {
              type: "wikipedia",
              url: "https://en.wikipedia.org/wiki/Mount_Aso",
              title: "Mount Aso",
            },
          ],
        },
      }),
      {
        "en:aso city": candidate(),
        "en:mount aso": candidate({
          title: "Mount Aso",
          url: "https://en.wikipedia.org/wiki/Mount_Aso",
        }),
      },
    );

    expect(result.state).toBe("review");
    expect(result.reason).toBe("conflicting-provenance");
  });

  it("keeps a shared identity in review so parent-landmark reuse is never guessed", () => {
    const result = classifyLegacyDestination(
      destination(),
      { "en:aso city": candidate() },
      new Set(["en:aso city"]),
    );

    expect(result.state).toBe("review");
    expect(result.reason).toBe("shared-provenance-identity");
  });

  it("rejects missing page identity even when the legacy URL title matches", () => {
    const result = classifyLegacyDestination(destination(), {
      "en:aso city": candidate({ pageId: undefined, wikidataId: undefined }),
    });

    expect(result.state).toBe("review");
    expect(result.reason).toBe("no-usable-identity");
  });

  it("keeps transient API failures separate from review and no-match states", () => {
    const result = classifyLegacyDestination(destination(), {
      "en:aso city": { status: "transient", message: "HTTP 503" },
    });

    expect(result).toEqual({
      state: "transient",
      reason: "transient-network-failure",
      details: ["HTTP 503"],
      sourceUrls: ["https://en.wikipedia.org/wiki/Aso_City"],
    });
  });
});
