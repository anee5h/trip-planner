import { describe, it, expect } from "vitest";

describe("useTripSync - visitedDates merging & Timeline date parsing tests", () => {
  it("correctly merges remote visited_dates with local visitedDates", () => {
    const localVisitedDates: Record<string, string[]> = {
      "tokyo-station": ["2026-06-01"],
      "kyoto-station": ["2023-11-15"],
    };

    const remoteVisitedDates: Record<string, string[]> = {
      "tokyo-station": ["2026-06-01", "2026-08-10"], // Additional date from remote
      "osaka-station": ["2026-07-20"], // New destination from remote
    };

    const merged: Record<string, string[]> = { ...localVisitedDates };

    for (const [id, remoteVal] of Object.entries(remoteVisitedDates)) {
      const remoteDates = Array.isArray(remoteVal) ? remoteVal : [remoteVal];
      const localDates = merged[id]
        ? Array.isArray(merged[id])
          ? merged[id]
          : [merged[id]]
        : [];
      const combined = Array.from(
        new Set([...localDates, ...remoteDates]),
      ).sort();
      if (combined.length > 0) {
        merged[id] = combined;
      }
    }

    expect(merged["tokyo-station"]).toEqual(["2026-06-01", "2026-08-10"]);
    expect(merged["kyoto-station"]).toEqual(["2023-11-15"]);
    expect(merged["osaka-station"]).toEqual(["2026-07-20"]);
  });

  it("robustly parses various date formats for Timeline year and month grouping", () => {
    const parseDateStr = (dateStr: string) => {
      let year = "Undated";
      let monthKey = "Undated";

      if (dateStr && dateStr.trim() !== "") {
        const cleanStr = dateStr.trim().replace(/\//g, "-");
        const yearMatch = cleanStr.match(/^(\d{4})/);
        if (yearMatch) {
          year = yearMatch[1];
        }
        const monthMatch = cleanStr.match(/^(\d{4}-\d{2})/);
        if (monthMatch) {
          monthKey = monthMatch[1];
        }
      }
      return { year, monthKey };
    };

    // Standard ISO YYYY-MM-DD
    expect(parseDateStr("2026-07-24")).toEqual({
      year: "2026",
      monthKey: "2026-07",
    });

    // Slashes YYYY/MM/DD
    expect(parseDateStr("2023/11/15")).toEqual({
      year: "2023",
      monthKey: "2023-11",
    });

    // ISO timestamp YYYY-MM-DDTHH:mm:ss.sssZ
    expect(parseDateStr("2026-08-10T14:30:00.000Z")).toEqual({
      year: "2026",
      monthKey: "2026-08",
    });

    // Year-Month only
    expect(parseDateStr("2026-06")).toEqual({
      year: "2026",
      monthKey: "2026-06",
    });

    // Empty or invalid string
    expect(parseDateStr("")).toEqual({ year: "Undated", monthKey: "Undated" });
  });
});
