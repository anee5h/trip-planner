import { describe, it, expect } from "vitest";
import { getDefaultTripDuration } from "../DefaultDurationPolicy";

describe("DefaultDurationPolicy", () => {
  it("returns fullDay for non-today date selections", () => {
    expect(
      getDefaultTripDuration({
        selection: { type: "tomorrow" },
      }),
    ).toBe("fullDay");

    expect(
      getDefaultTripDuration({
        selection: { type: "custom", date: "2026-08-10" },
      }),
    ).toBe("fullDay");
  });

  it("returns fullDay for today before noon in Asia/Tokyo", () => {
    // 11:59 AM JST (02:59 UTC)
    const time1159JST = new Date("2026-08-01T02:59:00Z");
    expect(
      getDefaultTripDuration({
        selection: { type: "today" },
        currentTime: time1159JST,
        timeZone: "Asia/Tokyo",
      }),
    ).toBe("fullDay");
  });

  it("returns halfDay for today between 12:00 and 15:59 in Asia/Tokyo", () => {
    // 12:00 PM JST (03:00 UTC)
    const time1200JST = new Date("2026-08-01T03:00:00Z");
    expect(
      getDefaultTripDuration({
        selection: { type: "today" },
        currentTime: time1200JST,
        timeZone: "Asia/Tokyo",
      }),
    ).toBe("halfDay");

    // 15:59 PM JST (06:59 UTC)
    const time1559JST = new Date("2026-08-01T06:59:00Z");
    expect(
      getDefaultTripDuration({
        selection: { type: "today" },
        currentTime: time1559JST,
        timeZone: "Asia/Tokyo",
      }),
    ).toBe("halfDay");
  });

  it("returns shortOuting for today from 16:00 onwards in Asia/Tokyo", () => {
    // 16:00 PM JST (07:00 UTC)
    const time1600JST = new Date("2026-08-01T07:00:00Z");
    expect(
      getDefaultTripDuration({
        selection: { type: "today" },
        currentTime: time1600JST,
        timeZone: "Asia/Tokyo",
      }),
    ).toBe("shortOuting");

    // 23:30 PM JST (14:30 UTC)
    const time2330JST = new Date("2026-08-01T14:30:00Z");
    expect(
      getDefaultTripDuration({
        selection: { type: "today" },
        currentTime: time2330JST,
        timeZone: "Asia/Tokyo",
      }),
    ).toBe("shortOuting");
  });
});
