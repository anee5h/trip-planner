import { describe, it, expect, beforeEach } from "vitest";
import {
  getCombinationKey,
  saveItineraryGroup,
  getItineraryGroups,
  removeItineraryGroup,
  isGroupSaved,
  type ItineraryGroup,
} from "../ItineraryGroupService";

describe("ItineraryGroupService", () => {
  beforeEach(() => {
    if (typeof localStorage !== "undefined") {
      localStorage.clear();
    }
  });

  it("generates deterministic combination keys for A+B and B+A", () => {
    const key1 = getCombinationKey("tokyo-skytree", "sensoji");
    const key2 = getCombinationKey("sensoji", "tokyo-skytree");

    expect(key1).toBe(key2);
    expect(key1).toBe("combination:sensoji:tokyo-skytree");
  });

  it("saves, retrieves, deduplicates, and removes itinerary groups", () => {
    const pairKey = getCombinationKey("d1", "d2");
    const mockGroup: ItineraryGroup = {
      id: "group-1",
      type: "destination_pair",
      pairKey,
      title: { en: "Test Group", ja: "テストグループ" },
      destinations: [],
      createdAt: new Date().toISOString(),
    };

    saveItineraryGroup("trip-123", mockGroup);

    const retrieved = getItineraryGroups("trip-123");
    if (typeof localStorage !== "undefined") {
      expect(isGroupSaved("trip-123", pairKey)).toBe(true);
      expect(retrieved.length).toBe(1);
      expect(retrieved[0].id).toBe("group-1");

      saveItineraryGroup("trip-123", mockGroup);
      expect(getItineraryGroups("trip-123").length).toBe(1);

      removeItineraryGroup("trip-123", "group-1");
      expect(getItineraryGroups("trip-123").length).toBe(0);
      expect(isGroupSaved("trip-123", pairKey)).toBe(false);
    }
  });
});
