const BEST_SEASON_JA_LABELS: Readonly<Record<string, string>> = {
  "All Year": "通年",
  "All Year (indoor)": "通年（屋内）",
  Spring: "春",
  Summer: "夏",
  Autumn: "秋",
  Winter: "冬",
  "Spring & Autumn": "春・秋",
  "Autumn & Winter": "秋・冬",
  "Spring & Winter": "春・冬",
  "Spring / Autumn": "春・秋",
  "Summer & Autumn": "夏・秋",
  "Autumn / Spring": "秋・春",
  "Winter Snow Season": "冬（雪の季節）",
  "Spring (azaleas) & Autumn (foliage)": "春（ツツジ）・秋（紅葉）",
  "Winter (fugu)": "冬（ふぐ）",
  "Spring & Summer": "春・夏",
  "Winter & Autumn": "冬・秋",
};

/**
 * Localize a canonical Best Season value without turning a present value into
 * an unavailable state. The catalogue audit owns detection of new values that
 * still need a Japanese label.
 */
export function localizeBestSeason(value: string, locale: "en" | "ja"): string {
  if (locale === "en") return value;
  return BEST_SEASON_JA_LABELS[value] ?? value;
}
