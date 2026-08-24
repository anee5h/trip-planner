import { beforeEach, describe, expect, it, vi } from "vitest";
import { WikipediaService } from "../WikipediaService";
import type { WikipediaDestination } from "../WikipediaValidation";

const yagiri: WikipediaDestination = {
  id: "yagiri-no-watashi-matsudo",
  name: "Yagiri-no-Watashi Ferry",
  nameJa: "矢切の渡し",
  aliases: ["Yagiri Ferry", "Yagiri-no-Watashi", "矢切の渡し船"],
  prefecture: "Chiba",
  region: "Kanto",
  kind: "mixed",
  categories: ["River", "Culture", "Scenery", "Outdoors"],
  tags: ["River Crossing", "River", "Shibamata"],
  coordinates: { lat: 35.75901, lng: 139.885132 },
};

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const wikipediaSummary = (overrides: Record<string, unknown> = {}) => ({
  type: "standard",
  title: "Kyoto",
  pageid: 37652,
  wikibase_item: "Q34600",
  extract: "Kyoto is a city in the Kansai region of Japan.",
  description: "City in the Kansai region of Japan",
  coordinates: [{ lat: 35.0116, lon: 135.7681 }],
  content_urls: {
    desktop: { page: "https://en.wikipedia.org/wiki/Kyoto" },
  },
  ...overrides,
});

describe("WikipediaService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    WikipediaService.clearCache();
  });

  it("rejects the production Yagiri mismatch in English", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/rest_v1/page/summary/")) {
          if (url.includes("Japanese%20conjugation")) {
            return response(
              wikipediaSummary({
                title: "Japanese conjugation (ren'yōkei base)",
                pageid: 81357167,
                wikibase_item: "Q136697315",
                description: "Element of Japanese language",
                extract:
                  "Japanese conjugation allows verbs to be morphologically modified to change their meaning or grammatical function.",
                content_urls: {
                  desktop: {
                    page: "https://en.wikipedia.org/wiki/Japanese_conjugation_(ren'y%C5%8Dkei_base)",
                  },
                },
              }),
            );
          }
          return response({}, 404);
        }
        if (url.includes("list=search")) {
          return response({
            query: {
              search: [
                {
                  title: "Japanese conjugation (ren'yōkei base)",
                  pageid: 81357167,
                },
              ],
            },
          });
        }
        throw new Error(`unexpected request ${url}`);
      });

    await expect(
      WikipediaService.fetchSummary(yagiri, "en"),
    ).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("ja.wikipedia.org"),
    );
  });

  it("resolves Japanese independently and does not reuse an English entity", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("en.wikipedia.org")) {
          throw new Error(`English fallback must not run: ${url}`);
        }
        if (url.includes("/api/rest_v1/page/summary/")) {
          return response({
            type: "standard",
            title: "矢切",
            pageid: 66614,
            wikibase_item: "Q11583954",
            extract:
              "千葉県松戸市の地名で、上矢切、中矢切、下矢切の地域を指します。",
            description: "千葉県松戸市の地名",
            content_urls: {
              desktop: { page: "https://ja.wikipedia.org/wiki/矢切" },
            },
          });
        }
        throw new Error(`unexpected request ${url}`);
      });

    await expect(
      WikipediaService.fetchSummary(yagiri, "ja"),
    ).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalled();
  });

  it("rejects a Japanese same-name song search result", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("en.wikipedia.org")) {
        throw new Error(`English fallback must not run: ${url}`);
      }
      if (url.includes("list=search")) {
        return response({
          query: { search: [{ title: "矢切の渡し (曲)", pageid: 1548179 }] },
        });
      }
      if (url.includes("/api/rest_v1/page/summary/")) {
        return response({
          type: "standard",
          title: "矢切の渡し (曲)",
          pageid: 1548179,
          wikibase_item: "Q11399655",
          extract: "「矢切の渡し」は石本美由起作詞の演歌である。",
          description: "演歌の楽曲",
          content_urls: {
            desktop: { page: "https://ja.wikipedia.org/wiki/矢切の渡し_(曲)" },
          },
        });
      }
      throw new Error(`unexpected request ${url}`);
    });

    await expect(
      WikipediaService.fetchSummary(yagiri, "ja"),
    ).resolves.toBeNull();
  });

  it("uses a curated Wikipedia URL as deterministic identity", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/rest_v1/page/summary/")) {
          return response(
            wikipediaSummary({
              title: "京都市",
              pageid: 12345,
              wikibase_item: "Q34600",
              description: "京都府の市",
              extract:
                "京都市は日本の京都府にある市で、歴史的な都市として多くの文化財と寺社を有しています。",
              content_urls: {
                desktop: { page: "https://ja.wikipedia.org/wiki/京都市" },
              },
            }),
          );
        }
        throw new Error(`search fallback was attempted: ${url}`);
      });

    const result = await WikipediaService.fetchSummary(
      {
        name: "Curated Kyoto Destination",
        prefecture: "Kyoto",
        wikipediaLanguage: "ja",
        editorial: {
          sources: [
            {
              type: "wikipedia",
              url: "https://ja.wikipedia.org/wiki/京都市",
            },
          ],
        },
      },
      "ja",
    );

    expect(result).toMatchObject({
      title: "京都市",
      language: "ja",
      matchMethod: "deterministic",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("resolves a Wikidata QID to a Wikipedia sitelink before rendering", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("www.wikidata.org")) {
          return response({
            entities: { Q34600: { sitelinks: { enwiki: { title: "Kyoto" } } } },
          });
        }
        if (url.includes("/api/rest_v1/page/summary/")) {
          return response(wikipediaSummary());
        }
        if (url.includes("prop=langlinks")) {
          return response({ query: { pages: { "1": { langlinks: [] } } } });
        }
        throw new Error(`search fallback was attempted: ${url}`);
      });

    const result = await WikipediaService.fetchSummary(
      {
        name: "QID-backed destination",
        wikipediaLanguage: "en",
        wikidataId: "Q34600",
      },
      "en",
    );

    expect(result).toMatchObject({
      title: "Kyoto",
      wikidataId: "Q34600",
      matchMethod: "deterministic",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("uses a page ID before a stale stored title", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("pageids=37652")) {
          return response({
            query: { pages: { "37652": { title: "Kyoto" } } },
          });
        }
        if (url.includes("/api/rest_v1/page/summary/Kyoto")) {
          return response(wikipediaSummary());
        }
        if (url.includes("prop=langlinks")) {
          return response({ query: { pages: { "37652": { langlinks: [] } } } });
        }
        if (url.includes("Old%20Kyoto")) {
          throw new Error(`stale title was incorrectly used: ${url}`);
        }
        throw new Error(`unexpected request ${url}`);
      });

    const result = await WikipediaService.fetchSummary(
      {
        name: "Mapped Kyoto Destination",
        wikipediaLanguage: "en",
        wikipediaTitle: "Old Kyoto Title",
        wikipediaPageId: 37652,
        wikidataId: "Q34600",
      },
      "en",
    );

    expect(result).toMatchObject({
      title: "Kyoto",
      pageId: 37652,
      wikidataId: "Q34600",
      matchMethod: "deterministic",
    });
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("Old%20Kyoto"),
    );
  });

  it("accepts a known-good direct article and exposes its identity", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(wikipediaSummary()),
    );

    const result = await WikipediaService.fetchSummary(
      {
        id: "kyoto-city",
        name: "Kyoto City",
        nameJa: "京都市",
        prefecture: "Kyoto",
        region: "Kansai",
        kind: "city",
        categories: ["City"],
        coordinates: { lat: 35.0116, lng: 135.7681 },
      },
      "en",
    );

    expect(result).toMatchObject({
      title: "Kyoto",
      pageId: 37652,
      wikidataId: "Q34600",
      language: "en",
      confidence: "high",
    });
  });

  it("returns null without rendering a guessed result when nothing resolves", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/rest_v1/page/summary/")) return response({}, 404);
      if (url.includes("list=search"))
        return response({ query: { search: [] } });
      throw new Error(`unexpected request ${url}`);
    });

    await expect(
      WikipediaService.fetchSummary(
        { name: "Definitely Unmatched Destination", prefecture: "Chiba" },
        "en",
      ),
    ).resolves.toBeNull();
  });

  it("does not let search override an explicit deterministic mapping", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("Verified%20Place")) return response({}, 404);
        throw new Error(`search fallback was attempted: ${url}`);
      });

    await expect(
      WikipediaService.fetchSummary(
        {
          name: "Mapped Destination",
          wikipediaTitle: "Verified Place",
          wikipediaLanguage: "en",
        },
        "en",
      ),
    ).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
