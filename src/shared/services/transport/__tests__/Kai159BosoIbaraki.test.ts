import destinations from "@/shared/data/destinations-index.json";
import { describe, expect, it } from "vitest";

const KAI159_IDS = [
  "shiroyama-park-tateyama",
  "awa-shrine-tateyama",
  "kamogawa-sea-world",
  "onjuku-beach",
  "kasama-inari-shrine",
  "ibaraki-ceramic-art-museum",
  "hitachi-kamine-park",
  "hitachinokuni-soshagu-shrine",
] as const;

const expectedMunicipalities: Record<(typeof KAI159_IDS)[number], string> = {
  "shiroyama-park-tateyama": "Chiba:tateyama",
  "awa-shrine-tateyama": "Chiba:tateyama",
  "kamogawa-sea-world": "Chiba:kamogawa",
  "onjuku-beach": "Chiba:onjuku",
  "kasama-inari-shrine": "Ibaraki:kasama",
  "ibaraki-ceramic-art-museum": "Ibaraki:kasama",
  "hitachi-kamine-park": "Ibaraki:hitachi",
  "hitachinokuni-soshagu-shrine": "Ibaraki:ishioka",
};

const expectedConservativeVisitHours: Partial<
  Record<(typeof KAI159_IDS)[number], { min: number; max: number }>
> = {
  "awa-shrine-tateyama": { min: 0.75, max: 1 },
  "onjuku-beach": { min: 1, max: 1.5 },
  "kasama-inari-shrine": { min: 0.5, max: 1 },
  "ibaraki-ceramic-art-museum": { min: 1, max: 1.5 },
  "hitachi-kamine-park": { min: 2, max: 4 },
};

describe("KAI-159 south/east Boso and Ibaraki depth", () => {
  it("adds eight independently recommendable, geographically bounded propositions", () => {
    const records = KAI159_IDS.map((id) =>
      destinations.find((destination) => destination.id === id),
    );

    expect(records.every(Boolean)).toBe(true);
    expect(records.map((record) => record?.municipalityId)).toEqual(
      KAI159_IDS.map((id) => expectedMunicipalities[id]),
    );
    expect(records.map((record) => record?.region)).toEqual(
      KAI159_IDS.map(() => "Kanto"),
    );
  });

  it("keeps origin-route claims unestimated while recording only local access", () => {
    for (const id of KAI159_IDS) {
      const record = destinations.find((destination) => destination.id === id);
      expect(record?.transportOptions).toEqual({});
      expect(record?.localAccessUnestimated).toBe(true);
      expect(record?.transportMetadata?.method).toBe("unestimated");
    }
  });

  it("keeps non-published on-site visit bands conservative", () => {
    for (const [id, expectedHours] of Object.entries(
      expectedConservativeVisitHours,
    )) {
      expect(
        destinations.find((destination) => destination.id === id)
          ?.recommendedVisitHours,
      ).toEqual(expectedHours);
    }
  });

  it("rederives model-owned walking from the current conservative visit maximum", () => {
    for (const [id, expectedHours] of Object.entries(
      expectedConservativeVisitHours,
    )) {
      const record = destinations.find((destination) => destination.id === id);
      expect(record?.walkingMin).toBeLessThanOrEqual(expectedHours.max * 60);
      expect(record?.walkingMetadata?.basis).toContain(
        `${expectedHours.max}h visit`,
      );
    }
  });

  it("uses Awa Shrine's current official reception and prayer end times", () => {
    const awa = destinations.find(
      (destination) => destination.id === "awa-shrine-tateyama",
    );
    expect(awa?.content.en.openingHours).toContain("08:30–16:30");
    expect(awa?.content.en.openingHours).toContain("09:00–16:00");
  });

  it("uses only supported local transport modes", () => {
    const supportedModes = new Set([
      "train",
      "shinkansen",
      "car",
      "my_car",
      "bus",
      "flight",
      "ferry",
    ]);

    for (const id of KAI159_IDS) {
      const record = destinations.find((destination) => destination.id === id);
      expect(
        record?.localAccessModes.every((mode: string) =>
          supportedModes.has(mode),
        ),
      ).toBe(true);
    }
  });

  it("uses a Tateyama-specific, licenseable Shiroyama hero image", () => {
    const shiroyama = destinations.find(
      (destination) => destination.id === "shiroyama-park-tateyama",
    );
    expect(shiroyama?.heroImage).toBe(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Tateyama_Castle%2C_tenshu.JPG/1280px-Tateyama_Castle%2C_tenshu.JPG",
    );
    expect(shiroyama?.imageMetadata).toMatchObject({
      source: "Wikimedia Commons",
      license: "CC0",
      attribution: "Saigen Jiro, CC0, via Wikimedia Commons",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:Tateyama_Castle,_tenshu.JPG",
    });
  });

  it("uses the reachable Ibaraki government guide as Kasama Inari's published visitor link", () => {
    expect(
      destinations.find(
        (destination) => destination.id === "kasama-inari-shrine",
      )?.officialWebsite,
    ).toBe("https://visit.ibarakiguide.jp/en/sightseeing/22308/");
  });

  it("does not turn the Tateyama and Kasama zones into component-card clusters", () => {
    expect(
      destinations.some((destination) =>
        [
          "tateyama-castle-chiba",
          "nago-dera-tateyama",
          "crafthills-kasama",
          "kasama-inari-art-museum",
        ].includes(destination.id),
      ),
    ).toBe(false);
  });
});
