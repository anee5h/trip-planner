import { describe, expect, it } from "vitest";
import {
  POPULAR_DESTINATION_IDS,
  buildSearchIndex,
  searchDocuments,
} from "../searchIndex";
import type { SearchGroup } from "../../types";

// The curated empty-state list: Tokyo 23 Wards virtual group first, then the
// seven verified city hubs.
const EXPECTED_POPULAR_IDS = ["tokyo-23-wards", ...POPULAR_DESTINATION_IDS];

function destinationGroup(groups: SearchGroup[]): SearchGroup | undefined {
  return groups.find((group) => group.type === "destination");
}

async function popularIds(locale: "en" | "ja"): Promise<string[]> {
  const group = destinationGroup(await searchDocuments("", locale));
  return (group?.items ?? []).map((item) => item.metadata?.dest?.id as string);
}

describe("empty search state — curated popular destinations (KAI-83)", () => {
  it("shows the curated hubs in the exact required order", async () => {
    expect(await popularIds("en")).toEqual(EXPECTED_POPULAR_IDS);
  });

  it("is deterministic across repeated calls", async () => {
    expect(await popularIds("en")).toEqual(await popularIds("en"));
  });

  it("leads with the Tokyo 23 Wards virtual group", async () => {
    const group = destinationGroup(await await searchDocuments("", "en"));
    const tokyo = group?.items[0];

    expect(tokyo?.metadata?.dest?.id).toBe("tokyo-23-wards");
    expect(tokyo?.title).toBe("Tokyo 23 Wards");
    expect(tokyo?.type).toBe("destination");
    // Opens the explorer ward filter (one city param per canonical ward hub).
    expect(tokyo?.url).toMatch(/^\/destinations\?city=/);
    expect((tokyo?.url ?? "").match(/city=/g)).toHaveLength(23);
  });

  it("is not simply the first alphabetical catalogue records", async () => {
    const ids = await popularIds("en");
    expect(ids).not.toEqual([
      "abashiri-city",
      "abeno-harukas-300-osaka",
      "abukuma-cave-fukushima",
      "adachi-city",
      "aizuwakamatsu-city",
      "akashi-kaikyo-bridge-hyogo",
      "akihabara-tokyo",
      "akita-city",
    ]);
    // Individual POIs must not leak into the empty state.
    expect(ids).not.toContain("abeno-harukas-300-osaka");
    expect(ids).not.toContain("abukuma-cave-fukushima");
  });

  it("returns normal scored results for a text query and popular again after clearing", async () => {
    const withQuery = destinationGroup(await searchDocuments("kyoto", "en"));
    expect(withQuery?.label).toMatch(/^Destinations \(\d+\)$/);
    expect(withQuery?.items.map((item) => item.metadata?.dest?.id)).toContain(
      "kyoto-city",
    );

    // Clearing the query restores the curated popular list.
    expect(await popularIds("en")).toEqual(EXPECTED_POPULAR_IDS);
  });

  it("ranks an exact title match first for text queries", async () => {
    const group = destinationGroup(await searchDocuments("kyoto city", "en"));
    expect(group?.items[0]?.metadata?.dest?.id).toBe("kyoto-city");
    expect(group?.items[0]?.score).toBe(100);
  });
});

describe("empty search state — locale behavior (KAI-83)", () => {
  it("keeps the curated order in the Japanese UI with the localized label", async () => {
    const groups = await await searchDocuments("", "ja");
    const group = destinationGroup(groups);

    expect(groups.map((g) => g.label)).toContain("人気の目的地");
    expect(await popularIds("ja")).toEqual(EXPECTED_POPULAR_IDS);
    expect(group?.items).toHaveLength(8);
  });

  it("localizes the popular destination entries in Japanese while maintaining curated order", async () => {
    const jaGroup = destinationGroup(await await searchDocuments("", "ja"));
    const enGroup = destinationGroup(await await searchDocuments("", "en"));

    expect(await popularIds("ja")).toEqual(EXPECTED_POPULAR_IDS);
    expect(await popularIds("en")).toEqual(EXPECTED_POPULAR_IDS);

    const jaTitles = jaGroup?.items.map((item) => item.title) ?? [];
    const enTitles = enGroup?.items.map((item) => item.title) ?? [];

    expect(jaTitles[0]).toBe("東京23区");
    expect(enTitles[0]).toBe("Tokyo 23 Wards");

    // Localized Japanese titles for popular pilot hubs
    expect(jaTitles).toEqual([
      "東京23区",
      "京都",
      "大阪",
      "札幌",
      "福岡",
      "広島",
      "奈良",
      "名古屋",
    ]);
  });
});

describe("search index destination availability parity (KAI-93)", () => {
  it("indexes all 1006 recommendation-eligible canonical destination IDs identically across English and Japanese", async () => {
    const enDocs = (await buildSearchIndex("en")).filter(
      (d) => d.type === "destination",
    );
    const jaDocs = (await buildSearchIndex("ja")).filter(
      (d) => d.type === "destination",
    );

    expect(enDocs).toHaveLength(1006);
    expect(jaDocs).toHaveLength(1006);

    const enIds = enDocs.map((d) => d.metadata?.dest?.id as string).sort();
    const jaIds = jaDocs.map((d) => d.metadata?.dest?.id as string).sort();

    expect(enIds).toHaveLength(1006);
    expect(jaIds).toEqual(enIds);
  });

  it("finds abashiri-city in Japanese search index using English fallback", async () => {
    const jaDestDocs = await searchDocuments("abashiri", "ja");
    const abashiri = jaDestDocs
      .find((g) => g.type === "destination")
      ?.items.find((item) => item.metadata?.dest?.id === "abashiri-city");

    expect(abashiri).toBeDefined();
    expect(abashiri?.title).toBe("Abashiri City");
    expect(abashiri?.url).toBe("/destinations/abashiri-city");
  });

  it("searches and localizes destinations with Japanese names and aliases (e.g. あぶくま洞)", async () => {
    // 1. Japanese name search in JA locale
    const jaQueryResults = await searchDocuments("あぶくま洞", "ja");
    const jaMatch = jaQueryResults
      .find((g) => g.type === "destination")
      ?.items.find(
        (item) => item.metadata?.dest?.id === "abukuma-cave-fukushima",
      );

    expect(jaMatch).toBeDefined();
    expect(jaMatch?.title).toBe("あぶくま洞");

    // 2. English alias search in JA locale
    const enAliasInJaResults = await searchDocuments("abukuma", "ja");
    const aliasMatch = enAliasInJaResults
      .find((g) => g.type === "destination")
      ?.items.find(
        (item) => item.metadata?.dest?.id === "abukuma-cave-fukushima",
      );

    expect(aliasMatch).toBeDefined();
    expect(aliasMatch?.title).toBe("あぶくま洞");

    // 3. English search in EN locale displays English name
    const enQueryResults = await searchDocuments("abukuma", "en");
    const enMatch = enQueryResults
      .find((g) => g.type === "destination")
      ?.items.find(
        (item) => item.metadata?.dest?.id === "abukuma-cave-fukushima",
      );

    expect(enMatch).toBeDefined();
    expect(enMatch?.title).toBe("Abukuma Cave");
  });
});
