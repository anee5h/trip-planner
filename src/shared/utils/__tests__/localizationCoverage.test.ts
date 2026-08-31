import { beforeAll, describe, expect, it } from "vitest";
import {
  EDITORIAL_PILOT_IDS,
  PHASE_ONE_COHORT_IDS,
} from "@/shared/data/editorialPilot";
import {
  getFullPlaces,
  loadDestinationsIndex,
} from "@/shared/services/place/PlaceCatalog";
import type { Destination } from "@/shared/types/destination";
import {
  findMissingJapaneseFields,
  summarizeJapaneseCoverage,
} from "../localizationCoverage";

beforeAll(async () => {
  await loadDestinationsIndex();
});

describe("Japanese localization coverage guard (KAI-141)", () => {
  it("keeps the supported editorial cohorts fully bilingual", () => {
    const places = getFullPlaces();
    const supportedIds = [
      ...new Set([...EDITORIAL_PILOT_IDS, ...PHASE_ONE_COHORT_IDS]),
    ];
    expect(findMissingJapaneseFields(places, supportedIds)).toEqual([]);
  });

  it("records current catalogue coverage without treating Latin names as missing prose", () => {
    const coverage = summarizeJapaneseCoverage(getFullPlaces());
    expect(coverage).toEqual({ name: 1081, description: 947, highlights: 947 });
  });

  it("fails when a newly supported record omits a required Japanese field", () => {
    const fixture = {
      id: "future-supported-destination",
      name: "Future Destination",
      nameJa: "未来の目的地",
      content: {
        en: {
          name: "Future Destination",
          description: "English source",
          highlights: ["English highlight"],
        },
        ja: {
          name: "未来の目的地",
          description: "",
          highlights: [],
        },
      },
    } as unknown as Destination;

    expect(findMissingJapaneseFields([fixture], [fixture.id])).toEqual([
      {
        id: fixture.id,
        fields: ["description", "highlights"],
      },
    ]);
  });
});
