import { describe, expect, it } from "vitest";
import { ACHIEVEMENTS_CATALOG } from "../../data/achievements";
import { AchievementEngine } from "../AchievementEngine";

describe("AchievementEngine UNESCO collection integration", () => {
  const context = {
    visited: [],
    visitedPrefectures: [],
    visitedDates: {},
    tripsCount: 0,
  };

  it("unlocks Heritage Guardian for the canonical UNESCO collection", () => {
    const results = AchievementEngine.evaluateAll({
      ...context,
      completedCollectionIds: ["unesco-japan"],
    });

    expect(results["heritage-guardian"]?.isUnlocked).toBe(true);
  });

  it("keeps the achievement catalog aligned with the canonical collection id", () => {
    const achievement = ACHIEVEMENTS_CATALOG.find(
      ({ id }) => id === "heritage-guardian",
    );

    expect(achievement?.trigger).toEqual({
      type: "collection_complete",
      collectionId: "unesco-japan",
    });
  });
});
