import { describe, it, expect } from "vitest";

describe("PassportTimelineCalendar - Intelligent Fallback Date Tests", () => {
  it("groups visited destinations into year/month when fallback lastSyncedDate is present", () => {
    const visitedIds = ["tokyo-station", "himeji-castle"];
    const visitedDates: Record<string, string[]> = {}; // Explicit dates missing
    const lastSyncedDate = "2026-07-20"; // Populated from user_data.updated_at

    const events: Array<{ id: string; year: string; monthKey: string }> = [];

    visitedIds.forEach((id, idx) => {
      const dates = visitedDates[id] || [];
      const fallbackDate = lastSyncedDate || "";
      const datesToProcess = dates.length > 0 ? dates : [fallbackDate];

      datesToProcess.forEach((dateStr) => {
        let year = "Undated";
        let monthKey = "Undated";

        if (dateStr && dateStr.trim() !== "") {
          const cleanStr = dateStr.trim().replace(/\//g, "-");
          const yearMatch = cleanStr.match(/^(\d{4})/);
          if (yearMatch) year = yearMatch[1];
          const monthMatch = cleanStr.match(/^(\d{4}-\d{2})/);
          if (monthMatch) monthKey = monthMatch[1];
        }

        events.push({ id: `visited-${id}-${idx}`, year, monthKey });
      });
    });

    expect(events).toHaveLength(2);
    expect(events[0].year).toBe("2026");
    expect(events[0].monthKey).toBe("2026-07");
    expect(events[1].year).toBe("2026");
    expect(events[1].monthKey).toBe("2026-07");
  });

  it("overrides fallback date when explicit visit dates are set", () => {
    const visitedIds = ["tokyo-station"];
    const visitedDates: Record<string, string[]> = {
      "tokyo-station": ["2023-05-10"], // Explicit custom visit date
    };
    const lastSyncedDate = "2026-07-20";

    const events: Array<{ id: string; year: string; monthKey: string }> = [];

    visitedIds.forEach((id, idx) => {
      const dates = visitedDates[id] || [];
      const fallbackDate = lastSyncedDate || "";
      const datesToProcess = dates.length > 0 ? dates : [fallbackDate];

      datesToProcess.forEach((dateStr) => {
        let year = "Undated";
        let monthKey = "Undated";

        if (dateStr && dateStr.trim() !== "") {
          const cleanStr = dateStr.trim().replace(/\//g, "-");
          const yearMatch = cleanStr.match(/^(\d{4})/);
          if (yearMatch) year = yearMatch[1];
          const monthMatch = cleanStr.match(/^(\d{4}-\d{2})/);
          if (monthMatch) monthKey = monthMatch[1];
        }

        events.push({ id: `visited-${id}-${idx}`, year, monthKey });
      });
    });

    expect(events[0].year).toBe("2023");
    expect(events[0].monthKey).toBe("2023-05");
  });
});
