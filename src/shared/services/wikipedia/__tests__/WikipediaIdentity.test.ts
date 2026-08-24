import { describe, expect, it } from "vitest";
import {
  canonicalWikipediaIdentity,
  extractWikipediaMapping,
} from "../WikipediaIdentity";

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
});
