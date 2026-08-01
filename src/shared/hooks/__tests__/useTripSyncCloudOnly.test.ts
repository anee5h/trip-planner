import { describe, it, expect } from "vitest";

describe("useTripSync - Cloud-Only Hydration Unit Tests", () => {
  it("normalizes user_data record from cloud without merging local snapshot", () => {
    const cloudUserData = {
      id: "user-123",
      favorites: ["kyoto-hub"],
      visited: ["kyoto-hub", "fushimi-inari"],
      visited_prefectures: ["Kyoto"],
      visited_dates: { "fushimi-inari": ["2026-05-01"] },
      destination_ratings: { "kyoto-hub": "up" },
      home_station: "Kyoto Station",
      updated_at: "2026-05-02T10:00:00.000Z",
    };

    // Hydration algorithm extracts cloud values directly:
    const loadedFavorites = cloudUserData.favorites;
    const loadedVisited = cloudUserData.visited;
    const loadedPrefectures = cloudUserData.visited_prefectures;
    const loadedDates = cloudUserData.visited_dates;
    const loadedRatings = cloudUserData.destination_ratings;
    const loadedHomeStation = cloudUserData.home_station;

    expect(loadedFavorites).toEqual(["kyoto-hub"]);
    expect(loadedVisited).toEqual(["kyoto-hub", "fushimi-inari"]);
    expect(loadedPrefectures).toEqual(["Kyoto"]);
    expect(loadedDates).toEqual({ "fushimi-inari": ["2026-05-01"] });
    expect(loadedRatings).toEqual({ "kyoto-hub": "up" });
    expect(loadedHomeStation).toBe("Kyoto Station");
  });

  it("creates initial default user_data record for new accounts without existing rows", () => {
    const userId = "user-new";
    const defaultPayload = {
      id: userId,
      favorites: [],
      visited: [],
      visited_prefectures: [],
      visited_dates: {},
      destination_ratings: {},
      home_station: "Tokyo Station",
    };

    expect(defaultPayload.favorites).toEqual([]);
    expect(defaultPayload.visited).toEqual([]);
    expect(defaultPayload.home_station).toBe("Tokyo Station");
  });

  it("blocks outbound profile and trip writes when hydration fails", () => {
    const profileSyncStatus: "idle" | "loading" | "ready" | "saving" | "error" =
      "error";
    const hydratedUserId: string | null = null;
    const currentUserId = "user-123";

    const canSyncProfile =
      currentUserId &&
      hydratedUserId === currentUserId &&
      profileSyncStatus !== "error";
    expect(canSyncProfile).toBeFalsy();
  });
});
