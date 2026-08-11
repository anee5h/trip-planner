import { describe, expect, it } from "vitest";
import destinationsIndex from "@/shared/data/destinations-index.json";
import type { Destination } from "@/shared/types/destination";

/**
 * KAI-57 containment regressions.
 *
 * The repository rule: parentDestinationId is valid only when the child is
 * physically inside the parent's municipality; cross-municipality access
 * must use gatewayHubId, never false containment.
 *
 * These tests pin the corrected Tohoku relationships (audit date 2026-08-11)
 * so a future catalogue edit cannot silently reintroduce the containment
 * errors found in the pre-KAI-57 catalogue (matsushima-bay under Sendai,
 * ryusendo under Morioka, lake-tazawa gatewayed to Akita City, etc.).
 */
const byId = new Map(
  (destinationsIndex as Destination[]).map((d) => [d.id, d]),
);

function expectContained(
  childId: string,
  hubId: string,
  municipalityId: string,
) {
  const child = byId.get(childId);
  expect(child, `${childId} exists`).toBeTruthy();
  expect(child!.relationships?.parentDestinationId).toBe(hubId);
  expect(child!.municipalityId).toBe(municipalityId);
  expect(child!.relationships?.gatewayHubId).toBeUndefined();
}

function expectGateway(
  childId: string,
  hubId: string,
  municipalityId?: string,
) {
  const child = byId.get(childId);
  expect(child, `${childId} exists`).toBeTruthy();
  expect(child!.relationships?.gatewayHubId).toBe(hubId);
  expect(child!.relationships?.parentDestinationId).toBeUndefined();
  if (municipalityId) {
    expect(child!.municipalityId).toBe(municipalityId);
  }
}

describe("KAI-57 Tohoku containment", () => {
  it("contains Matsushima Bay under the new Matsushima Town hub, not Sendai City", () => {
    expectContained("matsushima-bay", "matsushima-town", "Miyagi:matsushima");
    const matsushima = byId.get("matsushima-town");
    expect(matsushima?.kind).toBe("town");
    expect(matsushima?.role).toBe("hub");
    expect(matsushima?.municipalityId).toBe("Miyagi:matsushima");
    expect(matsushima?.relationships?.featuredDestinationIds).toContain(
      "matsushima-bay",
    );
    // Cross-municipality featured link must stay removed from Sendai.
    expect(
      byId.get("sendai-city")?.relationships?.featuredDestinationIds,
    ).not.toContain("matsushima-bay");
  });

  it("contains every new Matsushima POI under Matsushima Town", () => {
    for (const id of [
      "zuigan-ji",
      "godaido",
      "kanrantei",
      "fukuurajima",
      "oshima",
      "entsuin",
      "matsushima-bay-cruise",
      "saigyo-modoshi-no-matsu",
    ]) {
      expectContained(id, "matsushima-town", "Miyagi:matsushima");
    }
  });

  it("gateways Ryusendo Cave via Morioka instead of containing it in Morioka City", () => {
    // Ryusendo Cave is in Iwaizumi Town, not Morioka City.
    expectGateway("ryusendo-cave-iwate", "morioka-city", "Iwate:iwaizumi");
  });

  it("gateways Jodogahama via Morioka with its true Miyako City municipality", () => {
    expectGateway("jodogahama-beach-iwate", "morioka-city", "Iwate:miyako");
  });

  it("gateways Geibikei and Hiraizumi via Morioka with their true municipalities", () => {
    expectGateway("geibikei-gorge-iwate", "morioka-city", "Iwate:ichinoseki");
    expectGateway(
      "hiraizumi-chusonji-iwate",
      "morioka-city",
      "Iwate:hiraizumi",
    );
  });

  it("contains Lake Tazawa and Dakigaeri under Senboku City, not Akita City", () => {
    expectContained("lake-tazawa-akita", "semboku-city", "Akita:semboku");
    expectContained("dakigaeri-valley-akita", "semboku-city", "Akita:semboku");
  });

  it("gateways Goshikinuma and Mount Bandai via Aizuwakamatsu with true municipalities", () => {
    expectGateway(
      "goshikinuma-ponds-fukushima",
      "aizuwakamatsu-city",
      "Fukushima:kitashiobara",
    );
    expectGateway(
      "mount-bandai-fukushima",
      "aizuwakamatsu-city",
      "Fukushima:inawashiro",
    );
  });

  it("gateways Abukuma Cave via Koriyama, not Aizuwakamatsu", () => {
    // Abukuma-do is in Tamura City (central Fukushima), not the Aizu region.
    expectGateway(
      "abukuma-cave-fukushima",
      "koriyama-city",
      "Fukushima:tamura",
    );
  });

  it("gateways Oirase Gorge via Hachinohe with Towada City municipality", () => {
    expectGateway("oirase-gorge-aomori", "hachinohe-city", "Aomori:towada");
  });

  it("keeps multi-municipality standalones parent-free with honest gateways", () => {
    expectGateway("shirakami-sanchi-aomori", "hirosaki-city");
    expectGateway("lake-towada-aomori", "hachinohe-city");
    expectGateway("dewa-sanzan-yamagata", "yamagata-city");
    // Okama crater sits on the Yamagata–Miyagi border (officially listed as
    // Kawasaki Town, Miyagi; boundary undetermined) — parent-free with gateway,
    // consistent with the other undetermined-municipality standalones.
    expectGateway("okama-crater-yamagata", "yamagata-city");
    for (const id of [
      "shirakami-sanchi-aomori",
      "lake-towada-aomori",
      "dewa-sanzan-yamagata",
      "okama-crater-yamagata",
    ]) {
      expect(byId.get(id)!.municipalityId).toBeUndefined();
    }
  });

  it("gateways Ginzan Onsen via Yamagata City with Obanazawa municipality", () => {
    expectGateway(
      "ginzan-onsen-yamagata",
      "yamagata-city",
      "Yamagata:obanazawa",
    );
  });

  it("gateways cross-municipality additions instead of containing them", () => {
    expectGateway("towada-art-center", "hachinohe-city", "Aomori:towada");
    expectGateway("koiwai-farm", "morioka-city", "Iwate:shizukuishi");
    expectGateway("motsu-ji", "morioka-city", "Iwate:hiraizumi");
    expectGateway("takkoku-no-iwa", "morioka-city", "Iwate:hiraizumi");
    expectGateway("oga-namahage-kan", "akita-city", "Akita:oga");
    expectGateway(
      "kaminoyama-castle-town",
      "yamagata-city",
      "Yamagata:kaminoyama",
    );
    expectGateway(
      "kitakata-kura-district",
      "aizuwakamatsu-city",
      "Fukushima:kitakata",
    );
  });

  it("keeps every Tohoku record with a municipal parent inside that municipality", () => {
    for (const d of destinationsIndex as Destination[]) {
      if (d.region !== "Tohoku") continue;
      const parentId = d.relationships?.parentDestinationId;
      if (!parentId) continue;
      const parent = byId.get(parentId);
      expect(parent, `${d.id} parent ${parentId} exists`).toBeTruthy();
      if (
        parent?.kind === "city" ||
        parent?.kind === "town" ||
        parent?.kind === "village"
      ) {
        expect(
          d.municipalityId,
          `${d.id} municipality matches ${parentId}`,
        ).toBe(parent.municipalityId);
      }
    }
  });
});
