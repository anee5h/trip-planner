import { describe, expect, it } from "vitest";
import {
  canonicalWikipediaIdentity,
  extractWikipediaMapping,
} from "../WikipediaIdentity";
import destinationIndex from "@/shared/data/destinations-index.json";

describe("Wikipedia identity extraction", () => {
  it("requires a typed Wikipedia provenance reference", () => {
    expect(
      extractWikipediaMapping({
        editorial: {
          sources: [{ url: "https://en.wikipedia.org/wiki/Tokyo_Tower" }],
        },
      }),
    ).toBeUndefined();
  });

  it("uses the same typed provenance rule as the runtime resolver", () => {
    expect(
      extractWikipediaMapping({
        editorial: {
          sources: [
            {
              type: "wikipedia",
              url: "https://en.wikipedia.org/wiki/Tokyo_Tower",
            },
          ],
        },
      }),
    ).toEqual({
      language: "en",
      title: "Tokyo Tower",
      url: "https://en.wikipedia.org/wiki/Tokyo_Tower",
    });
  });

  it("preserves parenthetical qualifiers in canonical identity", () => {
    expect(
      canonicalWikipediaIdentity(
        "https://en.wikipedia.org/wiki/Tokyo_Tower_(film)",
      ),
    ).toBe("en:tokyo tower (film)");
    expect(
      canonicalWikipediaIdentity("https://en.wikipedia.org/wiki/Tokyo_Tower"),
    ).not.toBe("en:tokyo tower (film)");
  });

  it("retains strong numeric identities alongside stale titles", () => {
    expect(
      extractWikipediaMapping({
        wikipediaTitle: "Former Kyoto City Title",
        wikipediaLanguage: "en",
        wikipediaPageId: 37652,
        wikidataId: "Q34600",
      }),
    ).toEqual({
      language: "en",
      title: "Former Kyoto City Title",
      pageId: 37652,
      wikidataId: "Q34600",
    });
  });

  it("keeps the reviewed KAI-255 canonical identities in the catalogue", () => {
    const records = destinationIndex as Array<{
      id: string;
      wikipediaTitle?: string;
      wikipediaLanguage?: "en" | "ja";
      wikipediaUrl?: string;
      wikipediaPageId?: number;
      wikidataId?: string;
    }>;

    expect(
      extractWikipediaMapping(
        records.find(
          (record) => record.id === "yokohama-landmark-tower-sky-garden",
        )!,
      ),
    ).toEqual({
      language: "en",
      title: "Yokohama Landmark Tower",
      url: "https://en.wikipedia.org/wiki/Yokohama_Landmark_Tower",
      pageId: 1404793,
      wikidataId: "Q587108",
    });
    expect(
      extractWikipediaMapping(
        records.find((record) => record.id === "otsu-city")!,
      ),
    ).toEqual({
      language: "en",
      title: "Ōtsu",
      url: "https://en.wikipedia.org/wiki/%C5%8Ctsu",
      pageId: 6792853,
      wikidataId: "Q202907",
    });
  });
});
