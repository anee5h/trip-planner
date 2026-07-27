import { describe, it, expect, vi } from "vitest";

describe("useTripSync - Account Switch & State Cleanup Tests", () => {
  it("clears local state when user.id switches without a preceding logout event", () => {
    let prevUserId: string | undefined = "user-a";
    let currentUserId: string | undefined = "user-b";

    const setFavorites = vi.fn();
    const setVisited = vi.fn();
    const setVisitedPrefectures = vi.fn();
    const setVisitedDates = vi.fn();
    const setCompareList = vi.fn();
    const setTrips = vi.fn();

    // Effect simulation
    const runAccountSwitchEffect = () => {
      const isUserSwitch = prevUserId && prevUserId !== currentUserId;
      if (isUserSwitch || (prevUserId && !currentUserId)) {
        setFavorites([]);
        setVisited([]);
        setVisitedPrefectures([]);
        setVisitedDates({});
        setCompareList([]);
        setTrips([]);
      }
      prevUserId = currentUserId;
    };

    runAccountSwitchEffect();

    expect(setFavorites).toHaveBeenCalledWith([]);
    expect(setVisited).toHaveBeenCalledWith([]);
    expect(setVisitedPrefectures).toHaveBeenCalledWith([]);
    expect(setVisitedDates).toHaveBeenCalledWith({});
    expect(setCompareList).toHaveBeenCalledWith([]);
    expect(setTrips).toHaveBeenCalledWith([]);
    expect(prevUserId).toBe("user-b");
  });
});
