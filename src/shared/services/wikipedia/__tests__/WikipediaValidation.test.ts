import { describe, expect, it } from "vitest";
import {
  validateWikipediaCandidate,
  type WikipediaCandidate,
  type WikipediaDestination,
} from "../WikipediaValidation";

const destination = (
  overrides: Partial<WikipediaDestination> = {},
): WikipediaDestination => ({
  id: "test-place",
  name: "Kyoto City",
  nameJa: "京都市",
  aliases: [],
  prefecture: "Kyoto",
  region: "Kansai",
  kind: "city",
  categories: ["City"],
  tags: ["City"],
  coordinates: { lat: 35.0116, lng: 135.7681 },
  ...overrides,
});

const candidate = (
  overrides: Partial<WikipediaCandidate> = {},
): WikipediaCandidate => ({
  language: "en",
  title: "Kyoto",
  extract: "Kyoto is a city in the Kansai region of Japan.",
  description: "City in the Kansai region of Japan",
  type: "standard",
  pageId: 37652,
  wikidataId: "Q34600",
  url: "https://en.wikipedia.org/wiki/Kyoto",
  coordinates: { lat: 35.0116, lng: 135.7681 },
  ...overrides,
});

describe("validateWikipediaCandidate", () => {
  it("rejects the known Yagiri conjugation mismatch", () => {
    const result = validateWikipediaCandidate(
      destination({
        id: "yagiri-no-watashi-matsudo",
        name: "Yagiri-no-Watashi Ferry",
        nameJa: "矢切の渡し",
        aliases: ["Yagiri Ferry", "Yagiri-no-Watashi", "矢切の渡し船"],
        prefecture: "Chiba",
        region: "Kanto",
        kind: "mixed",
        categories: ["River", "Culture", "Scenery", "Outdoors"],
        tags: ["River Crossing", "Ferry", "Shibamata"],
        coordinates: { lat: 35.75901, lng: 139.885132 },
      }),
      candidate({
        title: "Japanese conjugation (ren'yōkei base)",
        description: "Element of Japanese language",
        extract:
          "Japanese conjugation allows verbs to be morphologically modified to change their meaning or grammatical function.",
        pageId: 81357167,
        wikidataId: "Q136697315",
        url: "https://en.wikipedia.org/wiki/Japanese_conjugation_(ren'y%C5%8Dkei_base)",
      }),
      { locale: "en" },
    );

    expect(result.accepted).toBe(false);
  });

  it("accepts a close, semantically matching known-good city", () => {
    const result = validateWikipediaCandidate(destination(), candidate(), {
      locale: "en",
    });

    expect(result.accepted).toBe(true);
  });

  it.each(["film", "song", "novel", "album", "TV series", "video game"])(
    "rejects a same-name English %s page",
    (qualifier) => {
      const result = validateWikipediaCandidate(
        destination({
          name: "Tokyo Tower",
          nameJa: "東京タワー",
          kind: "tower",
          categories: ["Landmark"],
          tags: ["Observation"],
          coordinates: { lat: 35.6586, lng: 139.7454 },
        }),
        candidate({
          title: `Tokyo Tower (${qualifier})`,
          description: `A ${qualifier.toLowerCase()} using Tokyo Tower in its title`,
          extract: `Tokyo Tower is a ${qualifier.toLowerCase()} with a separate non-place entity identity.`,
          coordinates: undefined,
        }),
        { locale: "en" },
      );

      expect(result.accepted).toBe(false);
      expect(result.reasons).toContain("non-place-title");
    },
  );

  it("accepts a parenthetical geographic disambiguator with place signals", () => {
    const result = validateWikipediaCandidate(
      destination({
        name: "Tokyo Tower",
        kind: "tower",
        categories: ["Landmark"],
        coordinates: { lat: 35.6586, lng: 139.7454 },
      }),
      candidate({
        title: "Tokyo Tower (Tokyo)",
        description: "Communications and observation tower in Minato, Tokyo",
        extract:
          "Tokyo Tower is a communications and observation tower in Minato, Tokyo.",
        coordinates: { lat: 35.6586, lng: 139.7454 },
      }),
      { locale: "en" },
    );

    expect(result.accepted).toBe(true);
  });

  it("does not reject a canonical tower because a broad category says Port", () => {
    const result = validateWikipediaCandidate(
      destination({
        id: "yokohama-landmark-tower-sky-garden",
        name: "Yokohama Landmark Tower (Sky Garden)",
        nameJa: "横浜ランドマークタワー",
        kind: undefined,
        prefecture: "Kanagawa",
        categories: ["Observation Deck", "Landmark", "Port", "Modern"],
        tags: ["Yokohama Port"],
        coordinates: { lat: 35.455, lng: 139.6314 },
      }),
      candidate({
        title: "Yokohama Landmark Tower",
        description: "Third tallest building in Japan",
        extract:
          "Yokohama Landmark Tower is a skyscraper and landmark in Yokohama, Japan.",
        pageId: 1404793,
        wikidataId: "Q587108",
        url: "https://en.wikipedia.org/wiki/Yokohama_Landmark_Tower",
        coordinates: { lat: 35.455, lng: 139.6314 },
      }),
      {
        locale: "en",
        mapping: {
          language: "en",
          title: "Yokohama Landmark Tower",
          pageId: 1404793,
          wikidataId: "Q587108",
          url: "https://en.wikipedia.org/wiki/Yokohama_Landmark_Tower",
        },
      },
    );

    expect(result.accepted).toBe(true);
  });

  it("retains the transport entity check for an actual port destination", () => {
    const result = validateWikipediaCandidate(
      destination({
        name: "Yokohama Port",
        aliases: ["Yokohama"],
        kind: undefined,
        categories: ["Port"],
        tags: [],
      }),
      candidate({
        title: "Yokohama",
        description: "A commercial district in Yokohama",
        extract: "Yokohama is a commercial district in Yokohama, Japan.",
      }),
      {
        locale: "en",
        mapping: { language: "en", title: "Yokohama Port" },
      },
    );

    expect(result.accepted).toBe(false);
    expect(result.reasons).toContain("entity-type-mismatch");
  });

  it("allows a non-place parenthetical title only with a matching deterministic identity", () => {
    const result = validateWikipediaCandidate(
      destination({
        name: "Tokyo Tower",
        kind: "tower",
        categories: ["Landmark"],
      }),
      candidate({
        title: "Tokyo Tower (film)",
        description: "A film intentionally curated for this destination",
        extract:
          "Tokyo Tower is a film intentionally curated as the destination's relevant cultural entity.",
        pageId: 987654,
        wikidataId: "Q987654",
      }),
      {
        locale: "en",
        mapping: {
          language: "en",
          title: "Tokyo Tower",
          pageId: 987654,
          wikidataId: "Q987654",
        },
      },
    );

    expect(result.accepted).toBe(true);
  });

  it("ignores incidental company and politician mentions after a valid place lead", () => {
    const result = validateWikipediaCandidate(
      destination({
        name: "Tokyo Tower",
        kind: "tower",
        categories: ["Landmark"],
        coordinates: { lat: 35.6586, lng: 139.7454 },
      }),
      candidate({
        title: "Tokyo Tower",
        description: "Communications and observation tower in Tokyo",
        extract:
          "Tokyo Tower is a communications and observation tower in Tokyo. The company that operates nearby facilities has hosted events attended by a politician and actor.",
        coordinates: { lat: 35.6586, lng: 139.7454 },
      }),
      { locale: "en" },
    );

    expect(result.accepted).toBe(true);
  });

  it("does not apply shrine or city gates from broad thematic labels", () => {
    const cityResult = validateWikipediaCandidate(
      destination({
        name: "Kyoto City",
        kind: "city",
        categories: ["Cultural Capital", "Historic Hub", "Temples"],
        tags: ["Imperial Capital", "Kyoto City"],
      }),
      candidate({
        title: "Kyoto",
        description: "City in the Kansai region of Japan",
        extract: "Kyoto is a city and cultural center in Japan.",
      }),
      { locale: "en" },
    );
    const transportResult = validateWikipediaCandidate(
      destination({
        name: "Tokyo Station",
        kind: undefined,
        categories: ["City", "History", "Food", "Shopping"],
        tags: ["Historic Architecture", "Shinkansen Hub"],
      }),
      candidate({
        title: "Tokyo Station",
        description: "Major railway and metro station in Japan",
        extract: "Tokyo Station is a major railway station in Japan.",
      }),
      { locale: "en" },
    );

    expect(cityResult.accepted).toBe(true);
    expect(transportResult.accepted).toBe(true);
  });

  it("lets a matching page ID and QID override a stale stored title", () => {
    const result = validateWikipediaCandidate(
      destination({ name: "Kyoto City" }),
      candidate({
        title: "Kyoto",
        pageId: 37652,
        wikidataId: "Q34600",
      }),
      {
        locale: "en",
        mapping: {
          language: "en",
          title: "Former Kyoto City Title",
          pageId: 37652,
          wikidataId: "Q34600",
        },
      },
    );

    expect(result.accepted).toBe(true);
  });

  it("accepts a known-good Japanese city with Japanese entity signals", () => {
    const result = validateWikipediaCandidate(
      destination(),
      candidate({
        language: "ja",
        title: "京都市",
        description: "京都府にある市",
        extract:
          "京都市は日本の京都府にある市で、歴史的な寺社と文化財を有する都市です。",
        url: "https://ja.wikipedia.org/wiki/京都市",
      }),
      { locale: "ja" },
    );

    expect(result.accepted).toBe(true);
  });

  it.each([
    {
      label: "shrine",
      destination: destination({
        name: "Fushimi Inari Taisha",
        nameJa: "伏見稲荷大社",
        kind: "shrine",
        categories: ["Shrine"],
        tags: ["Shinto"],
        coordinates: { lat: 34.9671, lng: 135.7727 },
      }),
      candidate: candidate({
        title: "Fushimi Inari-taisha",
        description: "Shinto shrine in Kyoto, Japan",
        extract:
          "Fushimi Inari-taisha is a major Shinto shrine in southern Kyoto known for its thousands of torii gates.",
        coordinates: { lat: 34.9671, lng: 135.7727 },
      }),
    },
    {
      label: "natural destination",
      destination: destination({
        name: "Mount Takao",
        nameJa: "高尾山",
        kind: "mountain",
        categories: ["Mountain", "Nature"],
        tags: ["Hiking"],
        coordinates: { lat: 35.6254, lng: 139.2431 },
      }),
      candidate: candidate({
        title: "Mount Takao",
        description: "Mountain in Hachioji, Tokyo",
        extract:
          "Mount Takao is a mountain in Hachioji, Tokyo, popular for hiking and views of the surrounding region.",
        coordinates: { lat: 35.6254, lng: 139.2431 },
      }),
    },
    {
      label: "landmark",
      destination: destination({
        name: "Himeji Castle",
        nameJa: "姫路城",
        kind: "castle",
        categories: ["Castle", "Historic"],
        tags: ["Landmark"],
        coordinates: { lat: 34.8394, lng: 134.6939 },
      }),
      candidate: candidate({
        title: "Himeji Castle",
        description: "Japanese castle in Himeji, Hyogo",
        extract:
          "Himeji Castle is a historic Japanese castle in Himeji, Hyogo, noted for its preserved white architecture.",
        coordinates: { lat: 34.8394, lng: 134.6939 },
      }),
    },
    {
      label: "ferry",
      destination: destination({
        name: "Yagiri-no-Watashi Ferry",
        nameJa: "矢切の渡し",
        aliases: ["Yagiri-no-Watashi", "矢切の渡し"],
        kind: "mixed",
        categories: ["River", "Culture"],
        tags: ["Ferry", "River Crossing"],
        coordinates: { lat: 35.759, lng: 139.885 },
      }),
      candidate: candidate({
        title: "Yagiri-no-Watashi",
        description: "Traditional ferry crossing on the Edo River",
        extract:
          "Yagiri-no-Watashi is a traditional ferry crossing linking the Matsudo and Shibamata sides of the Edo River.",
        coordinates: { lat: 35.759, lng: 139.885 },
      }),
    },
  ])("accepts a known-good $label entity", ({ destination, candidate }) => {
    const result = validateWikipediaCandidate(destination, candidate, {
      locale: "en",
    });

    expect(result.accepted).toBe(true);
  });

  it("fails closed when a name search is ambiguous", () => {
    const result = validateWikipediaCandidate(
      destination({ name: "Springfield", coordinates: undefined }),
      candidate({
        title: "Springfield",
        description: "A city and surname used in many places.",
        extract: "Springfield may refer to several places and entities.",
        coordinates: undefined,
      }),
      { locale: "en", searchCandidateCount: 2 },
    );

    expect(result.accepted).toBe(false);
  });

  it("rejects disambiguation pages", () => {
    const result = validateWikipediaCandidate(
      destination(),
      candidate({ type: "disambiguation", extract: "Kyoto may refer to:" }),
      { locale: "en" },
    );

    expect(result.accepted).toBe(false);
  });

  it("rejects generic grammar/topic pages", () => {
    const result = validateWikipediaCandidate(
      destination({ name: "Yagiri-no-Watashi Ferry", kind: "mixed" }),
      candidate({
        title: "Japanese grammar",
        description: "The grammar of the Japanese language",
        extract: "Japanese grammar describes the structure of the language.",
      }),
      { locale: "en" },
    );

    expect(result.accepted).toBe(false);
  });

  it("rejects a same-name Japanese song page", () => {
    const result = validateWikipediaCandidate(
      destination({
        name: "Yagiri-no-Watashi Ferry",
        nameJa: "矢切の渡し",
        aliases: ["矢切の渡し"],
        kind: "mixed",
      }),
      candidate({
        language: "ja",
        title: "矢切の渡し (曲)",
        description: "演歌の楽曲",
        extract: "「矢切の渡し」は石本美由起作詞の演歌である。",
        url: "https://ja.wikipedia.org/wiki/矢切の渡し_(曲)",
      }),
      { locale: "ja" },
    );

    expect(result.accepted).toBe(false);
  });

  it("rejects a clearly distant geographic mismatch", () => {
    const result = validateWikipediaCandidate(
      destination(),
      candidate({ coordinates: { lat: 43.0642, lng: 141.3469 } }),
      { locale: "en" },
    );

    expect(result.accepted).toBe(false);
    expect(result.reasons).toContain("geographic-mismatch");
  });

  it("does not require coordinates when identity and semantics are strong", () => {
    const result = validateWikipediaCandidate(
      destination(),
      candidate({ coordinates: undefined }),
      { locale: "en" },
    );

    expect(result.accepted).toBe(true);
  });

  it("rejects a candidate from the wrong language instead of cross-linking it", () => {
    const result = validateWikipediaCandidate(
      destination(),
      candidate({ language: "ja", title: "京都市" }),
      { locale: "en" },
    );

    expect(result.accepted).toBe(false);
    expect(result.reasons).toContain("language-mismatch");
  });
});
