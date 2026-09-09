export function formatVisitedDate(dateStr?: string): string {
  if (!dateStr) return "";

  // YYYY-MM-DD (e.g. 2026-07-24)
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [year, month, day] = dateStr.split("-");
    const d = new Date(Number(year), Number(month) - 1, Number(day));
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  // YYYY-MM (e.g. 2026-07)
  if (/^\d{4}-\d{2}$/.test(dateStr)) {
    const [year, month] = dateStr.split("-");
    const d = new Date(Number(year), Number(month) - 1, 1);
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
    });
  }

  // YYYY (e.g. 2026)
  if (/^\d{4}$/.test(dateStr)) {
    return dateStr;
  }

  return dateStr;
}

/**
 * Formats the canonical trip date range shared by Trips and the itinerary
 * editor. Stop-level dates are intentionally not accepted here.
 */
export function formatTripDateRange(
  startDate: string | undefined,
  endDate: string | undefined,
  locale: "en" | "ja",
): string {
  if (!startDate) return "";

  const [startYear, startMonth, startDay] = startDate.split("-").map(Number);
  const start = new Date(startYear, startMonth - 1, startDay);
  if (!endDate || endDate === startDate) {
    return locale === "ja"
      ? `${startYear}年${startMonth}月${startDay}日`
      : start.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
  }

  const [endYear, endMonth, endDay] = endDate.split("-").map(Number);
  const end = new Date(endYear, endMonth - 1, endDay);
  if (locale === "ja") {
    return startYear === endYear && startMonth === endMonth
      ? `${startYear}年${startMonth}月${startDay}日〜${endDay}日`
      : `${startYear}年${startMonth}月${startDay}日〜${endYear}年${endMonth}月${endDay}日`;
  }

  if (startYear === endYear && startMonth === endMonth) {
    const month = start.toLocaleDateString("en-US", { month: "short" });
    return `${month} ${startDay}–${endDay}, ${startYear}`;
  }

  return `${start.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })} – ${end.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
}
