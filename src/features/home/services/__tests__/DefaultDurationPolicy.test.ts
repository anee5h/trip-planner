import { describe, it, expect } from "vitest";
import { getDefaultTripDuration } from "../DefaultDurationPolicy";

describe("DefaultDurationPolicy", () => {
  it("defaults every date selection to halfDay", () => {
    expect(
      getDefaultTripDuration({
        selection: { type: "tomorrow" },
      }),
    ).toBe("halfDay");

    expect(
      getDefaultTripDuration({
        selection: { type: "custom", date: "2026-08-10" },
      }),
    ).toBe("halfDay");
    expect(
      getDefaultTripDuration({
        selection: { type: "today" },
        currentTime: new Date("2026-08-01T14:30:00Z"),
      }),
    ).toBe("halfDay");
  });
});
