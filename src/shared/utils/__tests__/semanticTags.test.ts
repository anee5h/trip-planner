import { describe, it, expect } from "vitest";
import type { Destination } from "@/shared/types/destination";
import { pickSemanticDestinationTag, normalizeTagText } from "../semanticTags";

type DestOverrides = Omit<Partial<Destination>, "ratings"> & {
  id: string;
  ratings?: Partial<Destination["ratings"]>;
};

function dest(overrides: DestOverrides): Destination {
  return {
    name: overrides.name ?? overrides.id,
    prefecture: "Tokyo",
    region: "Kanto",
    categories: [],
    heroImage: "",
    description: "",
    highlights: [],
    budgetRecommended: 5000,
    budgetMin: 3000,
    budgetMax: 10000,
    transportOptions: {},
    totalTripHours: 4,
    walkingMin: 10,
    walkingSunMin: 5,
    walkingShadeMin: 5,
    indoorPercent: 50,
    ratings: { overall: 5, food: 5, summer: 5, winter: 5 },
    tags: [],
    ...overrides,
    id: overrides.id,
  } as unknown as Destination;
}

function localized(name: string): Destination {
  return { name } as unknown as Destination;
}

describe("pickSemanticDestinationTag", () => {
  it("drops a tag that repeats the destination name (Osaka City)", () => {
    const d = dest({
      id: "osaka-city",
      name: "Osaka City",
      kind: "city",
      tags: ["Osaka City", "Imperial Capital"],
    });
    expect(pickSemanticDestinationTag(d, localized("Osaka City"), "en")).toBe(
      "Imperial Capital",
    );
  });

  it("drops a name+type tag on a ward hub (Shibuya Ward)", () => {
    const d = dest({
      id: "shibuya-city",
      name: "Shibuya City",
      kind: "ward",
      tags: ["Shibuya Ward", "Scramble Crossing"],
    });
    expect(pickSemanticDestinationTag(d, localized("Shibuya City"), "en")).toBe(
      "Scramble Crossing",
    );
  });

  it("keeps a meaningful first tag such as Imperial Capital", () => {
    const d = dest({
      id: "kyoto-city",
      name: "Kyoto City",
      kind: "city",
      tags: ["Imperial Capital"],
    });
    expect(pickSemanticDestinationTag(d, localized("Kyoto City"), "en")).toBe(
      "Imperial Capital",
    );
  });

  it("a duplicate first tag does not block a meaningful later tag", () => {
    const d = dest({
      id: "nagoya-city",
      name: "Nagoya City",
      kind: "city",
      tags: ["Nagoya City", "12 Original Keeps"],
    });
    expect(pickSemanticDestinationTag(d, localized("Nagoya City"), "en")).toBe(
      "12 Original Keeps",
    );
  });

  it("returns undefined when no meaningful tag remains", () => {
    const d = dest({
      id: "beppu-city",
      name: "Beppu City",
      kind: "city",
      tags: ["Beppu City"],
    });
    expect(pickSemanticDestinationTag(d, localized("Beppu City"), "en")).toBe(
      undefined,
    );
  });

  it("drops tags that repeat an alias", () => {
    const d = dest({
      id: "hita-city",
      name: "Hita",
      kind: "city",
      aliases: ["Hita City"],
      tags: ["Hita City", "Spa Town"],
    });
    expect(pickSemanticDestinationTag(d, localized("Hita"), "en")).toBe(
      "Spa Town",
    );
  });

  it("drops tags that repeat the parent municipality display name", () => {
    const d = dest({
      id: "osaka-castle",
      name: "Osaka Castle",
      kind: "castle",
      tags: ["Osaka City", "National Treasure"],
    });
    expect(
      pickSemanticDestinationTag(
        d,
        localized("Osaka Castle"),
        "en",
        "Osaka City",
      ),
    ).toBe("National Treasure");
  });

  it("drops a tag that is only the type label", () => {
    const d = dest({
      id: "yufu-city",
      name: "Yufu City",
      kind: "city",
      tags: ["City", "Onsen"],
    });
    expect(pickSemanticDestinationTag(d, localized("Yufu City"), "en")).toBe(
      "Onsen",
    );
  });

  it("handles case, whitespace and punctuation differences", () => {
    const d = dest({
      id: "okayama-city",
      name: "Okayama City",
      kind: "city",
      tags: ["OKAYAMA-CITY!", "Korakuen Garden"],
    });
    expect(pickSemanticDestinationTag(d, localized("Okayama City"), "en")).toBe(
      "Korakuen Garden",
    );
  });

  it("Japanese: drops the localized ward-name tag", () => {
    const d = dest({
      id: "shibuya-city",
      name: "Shibuya City",
      kind: "ward",
      tags: ["渋谷区", "スクランブル交差点"],
    });
    expect(pickSemanticDestinationTag(d, localized("渋谷区"), "ja")).toBe(
      "スクランブル交差点",
    );
  });

  it("Japanese: still drops the English name+type combination", () => {
    const d = dest({
      id: "shibuya-city",
      name: "Shibuya City",
      kind: "ward",
      tags: ["Shibuya Ward", "Scramble Crossing"],
    });
    expect(pickSemanticDestinationTag(d, localized("渋谷区"), "ja")).toBe(
      "Scramble Crossing",
    );
  });
});

describe("normalizeTagText", () => {
  it("lowercases and strips punctuation/whitespace", () => {
    expect(normalizeTagText("OKAYAMA-CITY!")).toBe("okayamacity");
    expect(normalizeTagText("12 Original Keeps")).toBe("12originalkeeps");
  });
});
