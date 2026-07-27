import { describe, it, expect } from "vitest";
import destinationsIndex from "@/shared/data/destinations-index.json";
import { formatPrefectureId } from "../useTripStore";
import type { Destination } from "@/shared/types/destination";

describe("useTripStore - Dynamic Prefecture Derivation Tests", () => {
  it("derives visitedPrefectures cleanly when visited array updates dynamically", () => {
    const visited = [
      "edo-castle-tokyo",
      "himeji-castle",
      "hakodate-night-view",
      "kyoto-city",
    ];

    const derivedPrefectures = new Set<string>();

    visited.forEach((id) => {
      const dest = (destinationsIndex as Destination[]).find(
        (d) => d.id === id,
      );
      if (dest && dest.prefecture) {
        derivedPrefectures.add(formatPrefectureId(dest.prefecture));
      }
    });

    const prefList = Array.from(derivedPrefectures);

    expect(prefList).toContain("Tokyo");
    expect(prefList).toContain("Hyogo");
    expect(prefList).toContain("Hokkaido\x8D");
    expect(prefList).toContain("Kyoto");
    expect(prefList.length).toBeGreaterThanOrEqual(4);
  });

  it("handles empty initial visited state and updates when hydrated", () => {
    let visited: string[] = [];
    let visitedPrefectures: string[] = [];

    // Migration function
    const runMigration = () => {
      if (!visited || visited.length === 0) {
        visitedPrefectures = [];
        return;
      }
      const prefs = new Set<string>();
      visited.forEach((id) => {
        const dest = (destinationsIndex as Destination[]).find(
          (d) => d.id === id,
        );
        if (dest && dest.prefecture) {
          prefs.add(formatPrefectureId(dest.prefecture));
        }
      });
      visitedPrefectures = Array.from(prefs);
    };

    // Initial run on mount when visited is empty
    runMigration();
    expect(visitedPrefectures).toHaveLength(0);

    // Hydrate from cloud
    visited = ["edo-castle-tokyo", "himeji-castle"];
    runMigration();

    // After re-running when visited updates, prefectures are derived
    expect(visitedPrefectures).toContain("Tokyo");
    expect(visitedPrefectures).toContain("Hyogo");
  });
});
