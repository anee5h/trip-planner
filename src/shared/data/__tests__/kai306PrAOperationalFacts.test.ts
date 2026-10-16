import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import destinationIndex from "../destinations-index.json";
import type { Destination } from "../../types/destination";
import {
  getOpeningHoursAssessment,
  getOpeningHoursWindow,
  requiresOpeningHours,
} from "../../services/recommendation/OpeningHoursPolicy";
import { resolveAdmissionApplicability } from "../../services/budget/admissionApplicability";
import { getLocalizedOpeningHours } from "../../../features/destinations/destinationOpeningHours";
import { localizePlaceLabel } from "../../utils/placeLabels";
import { getLocalizedPlace } from "../../services/place/PlaceCatalog";
import { getPlanEligibility } from "../../services/recommendation/DayPlanGeneratorService";

const PR_A_IDS = [
  "fushimi-inari-taisha",
  "dotonbori",
  "meiji-jingu",
  "shibuya-crossing-hachiko",
  "hakone-town",
  "tokyo-tower-minato",
  "tokyo-skytree-sumida",
] as const;

const byId = new Map(
  (destinationIndex as unknown as Destination[]).map((d) => [d.id, d]),
);

function canonical(id: string): Destination {
  const record = byId.get(id);
  if (!record) throw new Error(`Missing ${id}`);
  return record;
}

function generated(id: string): Destination {
  const file = resolve(
    __dirname,
    `../../../../public/data/destinations/${id}.json`,
  );
  return JSON.parse(readFileSync(file, "utf8")) as Destination;
}

function renderedText(record: Destination): string[] {
  const texts: string[] = [];
  const visit = (value: unknown) => {
    if (typeof value === "string") texts.push(value);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object")
      Object.values(value).forEach(visit);
  };
  visit([
    record.name,
    record.nameJa,
    record.kind,
    record.description,
    record.highlights,
    record.businessHours,
    record.openingHours,
    record.openingHoursJa,
    record.reservation,
    record.reservationJa,
    record.notes,
    record.notesJa,
    record.content,
    record.admission?.state,
    record.admission?.cost?.kind,
    record.admission?.basis,
  ]);
  return texts;
}

describe("KAI-306 PR A operational facts", () => {
  it.each(PR_A_IDS)("%s: generated detail matches canonical", (id) => {
    const source = canonical(id);
    const detail = generated(id);
    for (const key of [
      "kind",
      "businessHours",
      "openingHours",
      "openingHoursJa",
      "highlights",
      "content",
      "reservation",
      "reservationJa",
      "admission",
      "openingHoursMetadata",
      "notes",
      "notesJa",
    ] as const) {
      expect(detail[key], `${id}.${key}`).toEqual(source[key]);
    }
  });

  it.each(PR_A_IDS)("%s: no 24-hour or fixed open-area claims", (id) => {
    const text = renderedText(canonical(id)).join("\n");
    expect(text).not.toMatch(/24 ?hours|24時間|world'?s busiest|世界最大級/i);
  });

  it("uses canonical kinds that match the places", () => {
    const fushimi = canonical("fushimi-inari-taisha");
    const dotonbori = canonical("dotonbori");
    expect(fushimi.kind).toBe("shrine");
    expect(dotonbori.kind).toBe("district");
    expect(dotonbori.admission?.state).toBe("not_applicable");
    expect(resolveAdmissionApplicability(dotonbori)).toBe("not_applicable");
  });

  it("keeps Dotonbori's district kind out of required plan-stop filtering", () => {
    const dotonbori = canonical("dotonbori");
    const eligibility = getPlanEligibility(dotonbori, {
      planType: "half_day",
      catalogue: [dotonbori],
    });
    expect(eligibility.candidateCount).toBe(0);
    expect(eligibility.eligible).toBe(false);
  });

  it("renders the corrected destination-kind labels in English and Japanese", () => {
    expect(
      localizePlaceLabel(canonical("fushimi-inari-taisha").kind!, "en"),
    ).toBe("shrine");
    expect(
      localizePlaceLabel(canonical("fushimi-inari-taisha").kind!, "ja"),
    ).toBe("神社");
    expect(localizePlaceLabel(canonical("dotonbori").kind!, "en")).toBe(
      "district",
    );
    expect(localizePlaceLabel(canonical("dotonbori").kind!, "ja")).toBe("街並");
  });

  it("keeps Fushimi admission unknown instead of asserting a free or absent fee", () => {
    const record = canonical("fushimi-inari-taisha");
    expect(record.admission).toMatchObject({
      state: "unavailable",
      provenance: "none",
      reasonCode: "source_missing",
      cost: {
        kind: "unavailable",
        reason: "source_missing",
      },
    });
    expect(resolveAdmissionApplicability(record)).toBe("applicable");
  });

  it("uses the shrine's named torii route without an unsupported count or length", () => {
    const fushimi = canonical("fushimi-inari-taisha");
    const text = renderedText(fushimi).join(" ");
    expect(text).not.toMatch(/thousands of torii|four-kilometer|約4キロ/i);
    expect(fushimi.content?.en?.highlights).toContain("Senbon Torii gates");
  });

  it("does not retain Shibuya's unsupported superlative, schedule or screen claim", () => {
    const text = renderedText(canonical("shibuya-crossing-hachiko")).join("\n");
    expect(text).not.toMatch(
      /world'?s busiest|世界最大級|giant digital screens|neon displays|巨大ビジョン|09:00\s*[-〜–]\s*17:00|tickets available on arrival|現地にてチケット/i,
    );
  });

  it("keeps open areas free of scheduled-facility hours", () => {
    for (const id of ["dotonbori", "shibuya-crossing-hachiko", "hakone-town"]) {
      const record = canonical(id);
      expect(requiresOpeningHours(record), id).toBe(false);
      expect(getOpeningHoursWindow(record), id).toBeNull();
      expect(record.businessHours, id).not.toMatch(/\d{1,2}:\d{2}/);
      expect(record.openingHoursJa, id).not.toMatch(/\d{1,2}:\d{2}/);
    }
  });

  it("does not turn Fushimi Inari into a time or a verified claim", () => {
    const record = canonical("fushimi-inari-taisha");
    expect(getOpeningHoursAssessment(record)).toMatchObject({
      status: "unverified",
      requiresWarning: true,
    });
    expect(getOpeningHoursWindow(record)).toBeNull();
    expect(record.businessHours).not.toMatch(/\d{1,2}:\d{2}/);
  });

  it("represents Meiji Jingu as seasonal sunrise-to-sunset without a clock range", () => {
    const record = canonical("meiji-jingu");
    expect(getLocalizedOpeningHours(record, "en")).toMatch(/sunrise.*sunset/i);
    expect(getLocalizedOpeningHours(record, "ja")).toMatch(/日の出.*日没/);
    expect(getLocalizedOpeningHours(record, "ja")).not.toMatch(/[A-Za-z]{4}/);
    expect(getOpeningHoursWindow(record)).toBeNull();
    expect(getOpeningHoursAssessment(record)).toMatchObject({
      status: "verified",
      sourceUrl: "https://www.meijijingu.or.jp/en/visit/",
    });
    expect(record.admission?.state).toBe("not_applicable");
    expect(record.admission?.sourceUrls).toEqual([
      "https://www.meijijingu.or.jp/en/visit/",
    ]);
  });

  it("uses the operator's rounded Tokyo Tower height in EN and JA", () => {
    const tower = canonical("tokyo-tower-minato");
    expect(getLocalizedPlace(tower, "en").description).toMatch(
      /333 meters tall/,
    );
    expect(getLocalizedPlace(tower, "ja").description).toMatch(
      /高さ333メートル/,
    );
    expect(renderedText(tower).join("\n")).not.toMatch(
      /332[.]9|post-war Tokyo/i,
    );
  });

  it("scopes Tokyo Tower hours to the Main Deck per the operator", () => {
    const record = canonical("tokyo-tower-minato");
    expect(record.openingHoursMetadata?.sourceUrl).toBe(
      "https://en.tokyotower.co.jp/fee/",
    );
    expect(record.businessHours).toContain("Main Deck (150m): 09:00 - 23:00");
    expect(record.businessHours).toContain("22:30");
    expect(record.businessHours).toMatch(/Top Deck Tour .* separate hours/);
    expect(record.openingHoursJa).toContain("メインデッキ");
    expect(getOpeningHoursWindow(record)).toMatchObject({
      opensAtMinutes: 9 * 60,
      closesAtMinutes: 23 * 60,
    });
    const all = renderedText(record).join("\n");
    expect(all).not.toMatch(/RED°|glass.?floor|ガラス床|Landmark Light/i);
  });

  it("keeps Skytree date-variable instead of a fixed schedule", () => {
    const record = canonical("tokyo-skytree-sumida");
    expect(getLocalizedOpeningHours(record, "en")).toBe(
      "Hours vary by date; check the official calendar.",
    );
    expect(getLocalizedOpeningHours(record, "ja")).toBe(
      "営業時間は日付により異なります。公式カレンダーをご確認ください。",
    );
    expect(getOpeningHoursWindow(record)).toBeNull();
    expect(record.openingHoursMetadata?.sourceUrl).toBe(
      "https://en.tokyo-skytree.jp/open-hours/",
    );
  });

  it("has natural, non-placeholder Japanese highlights for corrected rows", () => {
    for (const id of PR_A_IDS) {
      const ja = canonical(id).content?.ja?.highlights ?? [];
      expect(ja.length, id).toBeGreaterThan(0);
      for (const highlight of ja) {
        expect(highlight, id).not.toMatch(/の名所$|^-|^\(|^°|散策$|^歴史$/);
        expect(highlight.trim(), id).toBe(highlight);
      }
    }
    expect(canonical("hakone-town").content?.ja?.highlights).toEqual([
      "芦ノ湖の海賊船クルーズ",
      "大涌谷",
      "箱根彫刻の森美術館",
    ]);
  });

  it("renders Hakone's reviewed Japanese highlights through its editorial pilot", () => {
    expect(
      getLocalizedPlace(canonical("hakone-town"), "ja").highlights,
    ).toEqual(["芦ノ湖の海賊船クルーズ", "大涌谷", "箱根彫刻の森美術館"]);
  });

  it("removes the template Japanese descriptions from the two towers", () => {
    for (const id of ["tokyo-tower-minato", "tokyo-skytree-sumida"]) {
      const ja = canonical(id).content?.ja?.description ?? "";
      expect(ja, id).not.toMatch(
        /歴史的スポット|境内|ショッピングと散策のスポット/,
      );
    }
  });
});
