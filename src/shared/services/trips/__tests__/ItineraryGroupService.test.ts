import { describe, it, expect, beforeEach } from "vitest";
import {
  getCombinationKey,
  saveItineraryGroup,
  getItineraryGroups,
  removeItineraryGroup,
  isGroupSavedInTrip,
  isGroupSavedInAnyTrip,
  getTripsContainingGroup,
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

  it("saves pair to multiple trips independently", () => {
    const pairKey = getCombinationKey("d1", "d2");
    const mockGroup: ItineraryGroup = {
      id: "group-1",
      type: "destination_pair",
      pairKey,
      title: { en: "Test Group", ja: "テストグループ" },
      destinations: [],
      createdAt: new Date().toISOString(),
    };

    if (typeof localStorage !== "undefined") {
      saveItineraryGroup("trip-1", mockGroup);
      saveItineraryGroup("trip-2", mockGroup);

      expect(getItineraryGroups("trip-1").length).toBe(1);
      expect(isGroupSavedInTrip("trip-1", pairKey)).toBe(true);
      expect(isGroupSavedInTrip("trip-2", pairKey)).toBe(true);
      expect(isGroupSavedInAnyTrip(pairKey)).toBe(true);

      const containingTrips = getTripsContainingGroup(pairKey);
      expect(containingTrips).toContain("trip-1");
      expect(containingTrips).toContain("trip-2");

      removeItineraryGroup("trip-1", "group-1");
      expect(isGroupSavedInTrip("trip-1", pairKey)).toBe(false);
      expect(isGroupSavedInTrip("trip-2", pairKey)).toBe(true);
    }
  });
});
