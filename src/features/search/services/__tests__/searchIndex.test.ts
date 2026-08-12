import { describe, expect, it } from "vitest";
import { POPULAR_DESTINATION_IDS, searchDocuments } from "../searchIndex";
import type { SearchGroup } from "../../types";

// The curated empty-state list: Tokyo 23 Wards virtual group first, then the
// seven verified city hubs.
const EXPECTED_POPULAR_IDS = ["tokyo-23-wards", ...POPULAR_DESTINATION_IDS];

function destinationGroup(groups: SearchGroup[]): SearchGroup | undefined {
  return groups.find((group) => group.type === "destination");
}

function popularIds(locale: "en" | "ja"): string[] {
  const group = destinationGroup(searchDocuments("", locale));
  return (group?.items ?? []).map((item) => item.metadata?.dest?.id as string);
}

describe("empty search state — curated popular destinations (KAI-83)", () => {
  it("shows the curated hubs in the exact required order", () => {
    expect(popularIds("en")).toEqual(EXPECTED_POPULAR_IDS);
  });

  it("is deterministic across repeated calls", () => {
    expect(popularIds("en")).toEqual(popularIds("en"));
  });

  it("leads with the Tokyo 23 Wards virtual group", () => {
    const group = destinationGroup(searchDocuments("", "en"));
    const tokyo = group?.items[0];

    expect(tokyo?.metadata?.dest?.id).toBe("tokyo-23-wards");
    expect(tokyo?.title).toBe("Tokyo 23 Wards");
    expect(tokyo?.type).toBe("destination");
    // Opens the explorer ward filter (one city param per canonical ward hub).
    expect(tokyo?.url).toMatch(/^\/destinations\?city=/);
    expect((tokyo?.url ?? "").match(/city=/g)).toHaveLength(23);
  });

  it("is not simply the first alphabetical catalogue records", () => {
    const ids = popularIds("en");
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

  it("returns normal scored results for a text query and popular again after clearing", () => {
    const withQuery = destinationGroup(searchDocuments("kyoto", "en"));
    expect(withQuery?.label).toMatch(/^Destinations \(\d+\)$/);
    expect(withQuery?.items.map((item) => item.metadata?.dest?.id)).toContain(
      "kyoto-city",
    );

    // Clearing the query restores the curated popular list.
    expect(popularIds("en")).toEqual(EXPECTED_POPULAR_IDS);
  });

  it("ranks an exact title match first for text queries", () => {
    const group = destinationGroup(searchDocuments("kyoto city", "en"));
    expect(group?.items[0]?.metadata?.dest?.id).toBe("kyoto-city");
    expect(group?.items[0]?.score).toBe(100);
  });
});

describe("empty search state — locale behavior (KAI-83)", () => {
  it("keeps the curated order in the Japanese UI with the localized label", () => {
    const groups = searchDocuments("", "ja");
    const group = destinationGroup(groups);

    expect(groups.map((g) => g.label)).toContain("人気の目的地");
    expect(popularIds("ja")).toEqual(EXPECTED_POPULAR_IDS);
    expect(group?.items).toHaveLength(8);
  });

  it("localizes the Tokyo 23 Wards entry and keeps the index naming elsewhere", () => {
    const jaTitles =
      destinationGroup(searchDocuments("", "ja"))?.items.map(
        (item) => item.title,
      ) ?? [];
    const enTitles =
      destinationGroup(searchDocuments("", "en"))?.items.map(
        (item) => item.title,
      ) ?? [];

    expect(jaTitles[0]).toBe("東京23区");
    expect(enTitles[0]).toBe("Tokyo 23 Wards");
    // Remaining entries inherit the existing search-index naming.
    expect(jaTitles.slice(1)).toEqual(enTitles.slice(1));
  });
});
