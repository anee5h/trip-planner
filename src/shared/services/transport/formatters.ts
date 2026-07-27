/**
 * Formats a time range (in minutes) into human-readable string.
 * Example: [45, 60] => "45–60 min", [290, 340] => "4h 50m – 5h 40m"
 */
export function formatTransportTime(range: [number, number]): string {
  const formatSingle = (mins: number): string => {
    if (mins < 60) {
      return `${mins} min`;
    }
    const hrs = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return remainingMins > 0 ? `${hrs}h ${remainingMins}m` : `${hrs}h`;
  };

  const minStr = formatSingle(range[0]);
  const maxStr = formatSingle(range[1]);

  if (minStr === maxStr) {
    return minStr;
  }

  // If both are in minutes, combine nicely: e.g. "45–60 min"
  if (range[0] < 60 && range[1] < 60) {
    return `${range[0]}–${range[1]} min`;
  }

  return `${minStr} – ${maxStr}`;
}

/**
 * Formats a cost range (in JPY) into human-readable string.
 * Example: [9000, 18000] => "¥9,000 – ¥18,000", [1200, 1200] => "¥1,200"
 */
export function formatTransportCost(range: [number, number]): string {
  const formatYen = (amount: number): string =>
    `¥${Math.round(amount).toLocaleString()}`;

  const minStr = formatYen(range[0]);
  const maxStr = formatYen(range[1]);

  if (range[0] === range[1]) {
    return minStr;
  }

  return `${minStr} – ${maxStr}`;
}
