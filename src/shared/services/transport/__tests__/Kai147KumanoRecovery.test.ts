import destinations from "@/shared/data/destinations-index.json";
import { describe, expect, it } from "vitest";

const KAI147_IDS = [
  "kumano-hongu-taisha-oyunohara",
  "kumano-hayatama-taisha-shingu",
  "yunomine-onsen",
  "kumano-kodo-takijiri-takahara",
] as const;

const expectedMunicipalities: Record<(typeof KAI147_IDS)[number], string> = {
  "kumano-hongu-taisha-oyunohara": "Wakayama:tanabe",
  "kumano-hayatama-taisha-shingu": "Wakayama:shingu",
  "yunomine-onsen": "Wakayama:tanabe",
  "kumano-kodo-takijiri-takahara": "Wakayama:tanabe",
};

describe("KAI-147 Wakayama Kumano core recovery", () => {
  it("adds four complementary 2D1N Kumano propositions", () => {
    const records = KAI147_IDS.map((id) =>
      destinations.find((destination) => destination.id === id),
    );

    expect(records.every(Boolean)).toBe(true);
    expect(records.map((record) => record?.municipalityId)).toEqual(
      KAI147_IDS.map((id) => expectedMunicipalities[id]),
    );
    expect(records.map((record) => record?.region)).toEqual(
      KAI147_IDS.map(() => "Kansai"),
    );
  });

  it("keeps origin routes unestimated even when local transit is documented", () => {
    for (const id of KAI147_IDS) {
      const record = destinations.find((destination) => destination.id === id);
      expect(record?.transportOptions).toEqual({});
      expect(record?.localAccessUnestimated).toBe(true);
      expect(record?.transportMetadata?.method).toBe("unestimated");
    }
  });

  it("records the operator-published Takijiri to Takahara hiking range", () => {
    const segment = destinations.find(
      (destination) => destination.id === "kumano-kodo-takijiri-takahara",
    );
    expect(segment?.recommendedVisitHours).toEqual({ min: 2, max: 3 });
    expect(segment?.content.en.notes).toContain("~4 km");
    expect(segment?.content.en.notes).toContain("~430 m");
    expect(segment?.content.en.notes).toContain("no buses to/from Takahara");
  });

  it("represents the three Kumano pillars without turning adjacent components into cards", () => {
    const records = KAI147_IDS.map((id) =>
      destinations.find((destination) => destination.id === id),
    );
    expect(records.map((record) => record?.name).join(" ")).toContain("Hongu");
    expect(records.map((record) => record?.name).join(" ")).toContain(
      "Hayatama",
    );
    expect(records.map((record) => record?.name).join(" ")).toContain(
      "Yunomine",
    );
    expect(
      destinations.some((destination) =>
        ["oyunohara-torii", "kamikura-jinja", "tsuboyu-yunomine"].includes(
          destination.id,
        ),
      ),
    ).toBe(false);
  });
});
