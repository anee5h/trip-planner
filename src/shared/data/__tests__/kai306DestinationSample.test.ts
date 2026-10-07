import { describe, expect, it } from "vitest";

import auditManifest from "../../../../qa/kai-306/destination-sample-audit.json";
import destinationIndex from "../destinations-index.json";
import type { Destination } from "../../types/destination";
import { toCanonicalPlace } from "../../services/place/PlaceCatalog";
import { getOpeningHoursAssessment } from "../../services/recommendation/OpeningHoursPolicy";
import { getLocalizedOpeningHours } from "../../../features/destinations/destinationOpeningHours";

const destinations = destinationIndex as unknown as Destination[];
const byId = new Map(destinations.map((record) => [record.id, record]));
const auditById = new Map(
  auditManifest.records.map((record) => [record.id, record]),
);

function destination(id: string): Destination {
  const record = byId.get(id);
  if (!record) throw new Error(`Missing KAI-306 sample record: ${id}`);
  return record;
}

describe("KAI-306 reviewed destination sample", () => {
  it("keeps exactly 20 unique destination records in the frozen sample", () => {
    const ids = auditManifest.sampleIds;
    expect(ids).toHaveLength(20);
    expect(new Set(ids).size).toBe(20);
    for (const id of ids) expect(byId.has(id), id).toBe(true);
  });

  it("projects the seven reviewed Japanese opening-hours overrides", () => {
    const expected = new Map<string, string>([
      ["shinjuku-city", "各施設の営業時間は施設ごとに異なります。"],
      ["kyoto-city", "市内の観光施設ごとに営業時間が異なります。"],
      ["osaka-city", "市内の観光施設ごとに営業時間が異なります。"],
      ["karuizawa-town", "施設や交通機関により営業時間が異なります。"],
      ["kinkaku-ji", "09:00〜17:00（最終入場16:30）"],
      ["ueno-park", "公園は常時開園（各施設の営業時間は異なります）。"],
      [
        "osaka-aquarium-kaiyukan",
        "営業時間は日付により異なります。公式カレンダーをご確認ください。",
      ],
    ]);

    for (const [id, hours] of expected) {
      expect(getLocalizedOpeningHours(destination(id), "ja"), id).toBe(hours);
    }
  });

  it("projects the reviewed English opening-hours values through the detail resolver", () => {
    const expected = new Map<string, string>([
      ["shinjuku-city", "Individual venue hours vary."],
      ["kyoto-city", "Individual venue hours vary."],
      ["osaka-city", "Individual venue hours vary."],
      ["karuizawa-town", "Individual venue and transport hours vary."],
      [
        "ueno-park",
        "Park grounds are always open; facilities have separate hours.",
      ],
      [
        "osaka-aquarium-kaiyukan",
        "Hours vary by date; check the official calendar.",
      ],
    ]);

    for (const [id, hours] of expected) {
      expect(getLocalizedOpeningHours(destination(id), "en"), id).toBe(hours);
    }
  });

  it("keeps Karuizawa's canonical hours without incomplete content overrides", () => {
    const karuizawa = destination("karuizawa-town");
    expect(karuizawa.content).toBeUndefined();
    expect(getLocalizedOpeningHours(karuizawa, "en")).toBe(
      "Individual venue and transport hours vary.",
    );
    expect(getLocalizedOpeningHours(karuizawa, "ja")).toBe(
      "施設や交通機関により営業時間が異なります。",
    );
    const place = toCanonicalPlace(karuizawa);
    expect(place.content.en.name).toBe(karuizawa.name);
    expect(place.content.en.description).toBe(karuizawa.description);
  });

  it("marks Ueno Park hours verified from its current official source", () => {
    const assessment = getOpeningHoursAssessment(
      destination("ueno-park"),
      new Date("2026-10-07T12:00:00.000Z"),
    );
    expect(assessment).toMatchObject({
      status: "verified",
      requiresWarning: false,
      sourceUrl: "https://www.tokyo-park.or.jp/park/ueno/index.html",
      verifiedAt: "2026-10-07",
    });
  });

  it("uses reviewed bilingual copy for Shinjuku, Kyoto, Osaka, and Ueno", () => {
    expect(destination("shinjuku-city").content?.en?.description).toContain(
      "Tokyo Metropolitan Government observatories",
    );
    expect(destination("kyoto-city").content?.en?.highlights).toContain(
      "Kinkaku-ji",
    );
    expect(destination("osaka-city").content?.en?.highlights).toContain(
      "Dotonbori",
    );
    expect(destination("ueno-park").content?.ja?.highlights).toContain(
      "桜と不忍池",
    );
  });

  it("retains source links for every audited row", () => {
    const sourceIds = new Set(auditManifest.sources.map((source) => source.id));
    for (const record of auditManifest.records) {
      expect(record.sourceRefs.length, record.id).toBeGreaterThan(0);
      for (const ref of record.sourceRefs) {
        expect(sourceIds.has(ref), `${record.id}: ${ref}`).toBe(true);
      }
    }
  });

  it("does not mark known identity, pricing, or coverage gaps as passing", () => {
    for (const id of [
      "hakone-town",
      "tokyo-tower-minato",
      "tokyo-skytree-sumida",
      "meiji-jingu",
      "shibuya-crossing-hachiko",
      "fushimi-inari-taisha",
      "kiyomizu-dera",
      "nijo-castle-kyoto",
      "osaka-castle",
      "dotonbori",
      "hakone-open-air-museum",
    ]) {
      expect(auditById.get(id)?.outcomeAfter, id).toBe("FAIL");
      expect(auditById.get(id)?.unresolvedChecks.length, id).toBeGreaterThan(0);
    }
  });

  it("reports partial scope honestly and does not imply full planning readiness", () => {
    expect(auditManifest.candidate.changedRecordCount).toBe(7);
    expect(auditManifest.scope.fullPlanningResult).toBe("FAIL");
    expect(
      auditManifest.runtimeProbe.routes.some(
        (route) => route.result === "FAIL",
      ),
    ).toBe(true);
  });
});
