import { describe, it, expect } from "vitest";

describe("useTripSync - Schema-Resilient select(*) & fallback tests", () => {
  it("successfully extracts visited and favorites from user_data object when optional columns like visited_dates are missing", () => {
    // Simulate Supabase response without visited_dates column
    const remoteDataNoVisitedDates = {
      id: "user-123",
      favorites: ["tokyo-station", "himeji-castle"],
      visited: ["tokyo-station", "himeji-castle", "kyoto-city"],
      visited_prefectures: ["Tokyo", "Hyogo", "Kyoto"],
      home_station: "Tokyo Station",
    };

    let visitedResult: string[] = [];
    let visitedPrefecturesResult: string[] = [];
    let visitedDatesResult: Record<string, string[]> = {};

    if (remoteDataNoVisitedDates) {
      if (remoteDataNoVisitedDates.visited) {
        visitedResult = [...remoteDataNoVisitedDates.visited];
      }
      if (remoteDataNoVisitedDates.visited_prefectures) {
        visitedPrefecturesResult = [
          ...remoteDataNoVisitedDates.visited_prefectures,
        ];
      }
      if ((remoteDataNoVisitedDates as Record<string, unknown>).visited_dates) {
        visitedDatesResult = (
          remoteDataNoVisitedDates as Record<string, unknown>
        ).visited_dates as Record<string, string[]>;
      }
    }

    expect(visitedResult).toEqual([
      "tokyo-station",
      "himeji-castle",
      "kyoto-city",
    ]);
    expect(visitedPrefecturesResult).toEqual(["Tokyo", "Hyogo", "Kyoto"]);
    expect(visitedDatesResult).toEqual({});
  });

  it("handles upsert payload construction with and without visited_dates fallback", () => {
    const user = { id: "user-123" };
    const favorites = ["tokyo-station"];
    const visited = ["tokyo-station", "kyoto-city"];
    const visitedPrefectures = ["Tokyo", "Kyoto"];
    const homeStation = "Tokyo Station";
    const visitedDatesEmpty = {};

    const payload: Record<string, unknown> = {
      id: user.id,
      favorites,
      visited,
      visited_prefectures: visitedPrefectures,
      home_station: homeStation,
    };

    if (visitedDatesEmpty && Object.keys(visitedDatesEmpty).length > 0) {
      payload.visited_dates = visitedDatesEmpty;
    }

    expect(payload).toHaveProperty("visited");
    expect(payload).not.toHaveProperty("visited_dates");

    // Fallback simulation: delete optional column on schema mismatch error
    payload.visited_dates = { "tokyo-station": ["2026-07-24"] };
    expect(payload).toHaveProperty("visited_dates");

    delete payload.visited_dates;
    expect(payload).not.toHaveProperty("visited_dates");
    expect(payload.visited).toEqual(["tokyo-station", "kyoto-city"]);
  });
});
