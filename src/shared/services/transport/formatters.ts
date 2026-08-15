/**
 * Formats a time range (in minutes) into human-readable string.
 * Example: [45, 60] => "45–60 min", [290, 340] => "4h 50m – 5h 40m"
 */
export function formatTransportTime(
  range: [number, number],
  locale?: string,
): string {
  const isJa = locale === "ja";
  if (
    !Number.isFinite(range[0]) ||
    !Number.isFinite(range[1]) ||
    range[0] < 0 ||
    range[0] > range[1]
  ) {
    return isJa ? "所要時間不明" : "Travel time unavailable";
  }

  const formatSingle = (mins: number): string => {
    if (mins < 60) {
      return isJa ? `${mins}分` : `${mins} min`;
    }
    const hrs = Math.floor(mins / 60);
    const remainingMins = mins % 60;

    if (isJa) {
      return remainingMins > 0 ? `${hrs}時間${remainingMins}分` : `${hrs}時間`;
    } else {
      return remainingMins > 0 ? `${hrs}h ${remainingMins}m` : `${hrs}h`;
    }
  };

  const minStr = formatSingle(range[0]);
  const maxStr = formatSingle(range[1]);

  if (minStr === maxStr) {
    return minStr;
  }

  // If both are in minutes, combine nicely: e.g. "45–60 min" or "45–60分"
  if (range[0] < 60 && range[1] < 60) {
    return isJa ? `${range[0]}–${range[1]}分` : `${range[0]}–${range[1]} min`;
  }

  return `${minStr} – ${maxStr}`;
}

/**
 * Formats a coordinate-derived display estimate without presenting it as a
 * verified route. Short ranges stay ranges; longer ranges are rounded to a
 * half-hour midpoint when that is easier to scan, or kept as an approximate
 * range for journeys over three hours.
 */
export function formatApproximateTransportTime(
  range: [number, number],
  locale?: string,
): string {
  const isJa = locale === "ja";
  if (
    !Number.isFinite(range[0]) ||
    !Number.isFinite(range[1]) ||
    range[0] < 0 ||
    range[0] > range[1]
  ) {
    return isJa ? "所要時間不明" : "Travel time unavailable";
  }
  const prefix = isJa ? "約" : "~";
  const separator = isJa ? "〜" : "–";
  const min = Math.max(0, Math.round(range[0]));
  const max = Math.max(min, Math.round(range[1]));

  if (max < 60) {
    return `${prefix}${formatTransportTime([min, max], locale)}`;
  }

  const toHalfHour = (minutes: number) => Math.round((minutes / 60) * 2) / 2;
  const formatHours = (hours: number) =>
    Number.isInteger(hours) ? `${hours}` : hours.toFixed(1);
  const midpoint = toHalfHour((min + max) / 2);

  if (max <= 180) {
    return isJa
      ? `${prefix}${formatHours(midpoint)}時間`
      : `${prefix}${formatHours(midpoint)} hr`;
  }

  const minHours = toHalfHour(min);
  const maxHours = toHalfHour(max);
  if (minHours === maxHours) {
    return isJa
      ? `${prefix}${formatHours(minHours)}時間`
      : `${prefix}${formatHours(minHours)} hr`;
  }

  return isJa
    ? `${prefix}${formatHours(minHours)}${separator}${formatHours(maxHours)}時間`
    : `${prefix}${formatHours(minHours)}${separator}${formatHours(maxHours)} hr`;
}

/**
 * Formats a cost range (in JPY) into human-readable string.
 * Example: [9000, 18000] => "¥9,000 – ¥18,000", [1200, 1200] => "¥1,200"
 */
export function formatTransportCost(range: [number, number]): string {
  if (
    !Number.isFinite(range[0]) ||
    !Number.isFinite(range[1]) ||
    range[0] < 0 ||
    range[0] > range[1]
  ) {
    return "Cost unavailable";
  }
  const formatYen = (amount: number): string =>
    `¥${Math.round(amount).toLocaleString()}`;

  const minStr = formatYen(range[0]);
  const maxStr = formatYen(range[1]);

  if (range[0] === range[1]) {
    return minStr;
  }

  return `${minStr} – ${maxStr}`;
}
