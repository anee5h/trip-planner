import { describe, it, expect } from "vitest";
import { formatPrefectureId } from "../useTripStore";
import destinationsIndex from "@/shared/data/destinations-index.json";

describe("useTripStore - Parent Hub Cascade & Retrospective Migration Unit Tests", () => {
  it("correctly formats Hokkaido prefecture ID with SVG map key shim", () => {
    expect(formatPrefectureId("Hokkaido")).toBe("Hokkaido\x8D");
    expect(formatPrefectureId("Tokyo")).toBe("Tokyo");
    expect(formatPrefectureId("Kyoto")).toBe("Kyoto");
  });

  it("verifies parent hub hierarchy topology for cascading visits", () => {
    // 1. Shibuya Sky child -> Shibuya City parent
    const shibuyaSky = destinationsIndex.find(
      (d) => d.id === "shibuya-sky-shibuya",
    );
    expect(shibuyaSky?.relationships?.parentDestinationId).toBe("shibuya-city");

    // 2. Abeno Harukas child -> Osaka City parent
    const abenoHarukas = destinationsIndex.find(
      (d) => d.id === "abeno-harukas-300-osaka",
    );
    expect(abenoHarukas?.relationships?.parentDestinationId).toBe("osaka-city");

    // 3. Sunshine 60 child -> Toshima City parent
    const sunshine60 = destinationsIndex.find(
      (d) => d.id === "sunshine-60-observatory-ikebukuro",
    );
    expect(sunshine60?.relationships?.parentDestinationId).toBe("toshima-city");
  });

  it("simulates retrospective migration logic for pre-existing visited records", () => {
    const visited = ["hakodate-night-view"];
    const visitedDates: Record<string, string[]> = {
      "hakodate-night-view": ["2026-05-10"],
    };
    const visitedPrefectures: string[] = [];

    // Simulate retrospective migration algorithm
    const updatedVisited = [...visited];
    const updatedDates = { ...visitedDates };
    const updatedPrefectures = [...visitedPrefectures];

    for (const id of visited) {
      const targetDest = destinationsIndex.find((d) => d.id === id);
      if (targetDest) {
        const prefId = formatPrefectureId(targetDest.prefecture);
        if (!updatedPrefectures.includes(prefId)) {
          updatedPrefectures.push(prefId);
        }
      }

      let currentId: string | undefined = id;
      while (currentId) {
        const dest = destinationsIndex.find((d) => d.id === currentId);
        const parentHubId = dest?.relationships?.parentDestinationId;
        if (!parentHubId) break;

        if (!updatedVisited.includes(parentHubId)) {
          updatedVisited.push(parentHubId);
        }

        const parentDest = destinationsIndex.find((d) => d.id === parentHubId);
        if (parentDest) {
          const prefId = formatPrefectureId(parentDest.prefecture);
          if (!updatedPrefectures.includes(prefId)) {
            updatedPrefectures.push(prefId);
          }
        }

        const childDates = visitedDates[id] || [];
        const parentDates = updatedDates[parentHubId] || [];
        const mergedDates = Array.from(
          new Set([...parentDates, ...childDates]),
        ).sort();
        updatedDates[parentHubId] = mergedDates;

        currentId = parentHubId;
      }
    }

    // Verify self-healing outputs:
    expect(updatedVisited).toContain("hakodate-city");
    expect(updatedDates["hakodate-city"]).toEqual(["2026-05-10"]);
    expect(updatedPrefectures).toContain("Hokkaido\x8D");
  });
});
