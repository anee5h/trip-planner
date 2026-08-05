import { describe, expect, it } from "vitest";
import {
  applyExpansionStages,
  ALL_NEW_IDS,
  ALL_HUB_IDS,
  ALL_POI_IDS,
} from "../add-kyushu-to-100";
import destinationsIndex from "@/shared/data/destinations-index.json";

interface DestinationRecord {
  id: string;
  [key: string]: any;
}

type StageSpec = {
  label: string;
  hubs: DestinationRecord[];
  pois: DestinationRecord[];
};

// Reconstruct stages arrays from the expanded catalogue
function buildStagesFromCatalogue(): StageSpec[] {
  const idToRecord = new Map(
    (destinationsIndex as DestinationRecord[]).map((r) => [r.id, r]),
  );

  const hubOrder = [
    "karatsu-city",
    "sasebo-city",
    "ibusuki-city",
    "nichinan-city",
    "hita-city",
  ];

  const childMap: Record<string, string[]> = {
    "karatsu-city": [
      "karatsu-castle",
      "yobuko-morning-market",
      "nijinomatsubara-pine-grove",
      "nanatsugama-sea-caves",
      "nagoya-castle-ruins-museum",
    ],
    "sasebo-city": [
      "huis-ten-bosch",
      "kujukushima-pearl-sea-resort",
      "umi-kirara-aquarium",
      "ishidake-observatory",
      "sasebo-naval-port-cruise",
    ],
    "ibusuki-city": [
      "sunamushi-onsen-saraku",
      "lake-ikeda",
      "chiringashima-island",
      "cape-nagasakibana",
      "mount-kaimon",
    ],
    "nichinan-city": [
      "obi-castle-town",
      "udo-jingu",
      "sun-messe-nichinan",
      "inohae-valley",
    ],
    "hita-city": [
      "mameda-historic-district",
      "kangien-academy",
      "attack-on-titan-hita-museum",
      "oyama-dam-attack-on-titan-statues",
      "hita-gion-yamahoko-museum",
    ],
  };

  return hubOrder.map((hubId) => ({
    label:
      hubId === "karatsu-city"
        ? "Karatsu"
        : hubId === "sasebo-city"
          ? "Sasebo"
          : hubId === "ibusuki-city"
            ? "Ibusuki"
            : hubId === "nichinan-city"
              ? "Nichinan"
              : "Hita",
    hubs: [idToRecord.get(hubId)!],
    pois: childMap[hubId].map((cid) => idToRecord.get(cid)!),
  }));
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (
    typeof a !== "object" ||
    a === null ||
    typeof b !== "object" ||
    b === null
  )
    return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!keysB.includes(key)) return false;
    if (!deepEqual(a[key], b[key])) return false;
  }
  return true;
}

describe("add-kyushu-to-100 generator", () => {
  const catalogue = destinationsIndex as DestinationRecord[];
  const stages = buildStagesFromCatalogue();

  // Build a base-like fixture by removing the 29 expansion IDs
  const expansionIdSet = new Set([
    ...ALL_HUB_IDS.filter((id) =>
      stages.some((s) => s.hubs.some((h) => h.id === id)),
    ),
    ...ALL_POI_IDS.filter((id) =>
      stages.some((s) => s.pois.some((p) => p.id === id)),
    ),
  ]);

  const baseFixture = catalogue.filter((r) => !expansionIdSet.has(r.id));

  it("has exactly 29 expansion IDs defined", () => {
    expect(ALL_HUB_IDS.length + ALL_POI_IDS.length).toBe(29);
    expect(
      ALL_HUB_IDS.filter((id) =>
        stages.some((s) => s.hubs.some((h) => h.id === id)),
      ).length,
    ).toBe(5);
    expect(
      ALL_POI_IDS.filter((id) =>
        stages.some((s) => s.pois.some((p) => p.id === id)),
      ).length,
    ).toBe(24);
  });

  it("base fixture has expected pre-expansion counts", () => {
    // 694 - 29 = 665
    expect(baseFixture.length).toBe(665);
    const kyushu = baseFixture.filter((r) => r.region === "Kyushu");
    expect(kyushu.length).toBe(71);
    expect(kyushu.filter((r) => r.role === "hub").length).toBe(12);
    expect(kyushu.filter((r) => r.role !== "hub").length).toBe(59);
  });

  it("application from base fixture produces correct counts", () => {
    const result = applyExpansionStages(baseFixture, stages);
    expect(result.length).toBe(694);

    const kyushu = result.filter((r) => r.region === "Kyushu");
    expect(kyushu.length).toBe(100);
    expect(kyushu.filter((r) => r.role === "hub").length).toBe(17);
    expect(kyushu.filter((r) => r.role !== "hub").length).toBe(83);

    // All 29 expected IDs present
    for (const id of ALL_NEW_IDS) {
      expect(result.find((r) => r.id === id)).toBeTruthy();
    }
  });

  it("pass1/pass2 idempotency from base fixture", () => {
    const pass1 = applyExpansionStages(baseFixture, stages);
    const pass2 = applyExpansionStages(pass1, stages);
    expect(deepEqual(pass1, pass2)).toBe(true);
  });

  it("application to completed catalogue is a no-op", () => {
    const result = applyExpansionStages(catalogue, stages);
    expect(result.length).toBe(694);
    expect(deepEqual(result, catalogue)).toBe(true);
  });

  it("preserves all non-expansion records in order", () => {
    const result = applyExpansionStages(baseFixture, stages);
    for (const orig of baseFixture) {
      const found = result.find((r) => r.id === orig.id);
      expect(deepEqual(found, orig)).toBe(true);
    }
    // Order preserved for non-expansion records
    let resultIdx = 0;
    for (const orig of baseFixture) {
      while (resultIdx < result.length && result[resultIdx].id !== orig.id) {
        resultIdx++;
      }
      expect(resultIdx).toBeLessThan(result.length);
      expect(result[resultIdx].id).toBe(orig.id);
    }
  });

  it("all expansion records are published and bilingual", () => {
    const result = applyExpansionStages(baseFixture, stages);
    for (const id of expansionIdSet) {
      const r = result.find((rec) => rec.id === id);
      expect(r).toBeTruthy();
      expect(r!.status).toBe("published");
      expect(r!.content?.en?.description).toBeTruthy();
      expect(r!.content?.ja?.description).toBeTruthy();
    }
  });

  it("all expansion records have positive transport and valid budgets", () => {
    const result = applyExpansionStages(baseFixture, stages);
    for (const id of expansionIdSet) {
      const r = result.find((rec) => rec.id === id)!;
      expect(r.transportOptions).toBeTruthy();
      for (const v of Object.values(r.transportOptions)) {
        expect(typeof v).toBe("number");
        expect(v).toBeGreaterThan(0);
      }
      expect(r.budgetMin).toBeGreaterThan(0);
      expect(r.budgetMin).toBeLessThanOrEqual(r.budgetRecommended);
      expect(r.budgetRecommended).toBeLessThanOrEqual(r.budgetMax);
    }
  });

  it("all expansion records have HTTPS hours sources", () => {
    const result = applyExpansionStages(baseFixture, stages);
    for (const id of expansionIdSet) {
      const r = result.find((rec) => rec.id === id)!;
      expect(r.openingHours).toBeTruthy();
      expect(r.openingHoursJa).toBeTruthy();
      const src = r.openingHoursMetadata?.sourceUrl;
      expect(src).toBeTruthy();
      expect(src.startsWith("https://")).toBe(true);
      // Not Commons/Wikipedia
      expect(src.includes("commons.wikimedia.org")).toBe(false);
      expect(src.includes("wikipedia.org")).toBe(false);
    }
  });
});
