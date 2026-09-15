import { describe, expect, it } from "vitest";
import { localizeRecommendationReason } from "../recommendationLabels";
import type { MatchReason } from "@/shared/services/recommendation/RecommendationTypes";

const seasonalReason: MatchReason = {
  type: "Seasonal",
  code: "conditionSeasonalStrong",
  params: { season: "summer", rating: 9 },
  title: "",
  description: "",
};

const mayExceedReason: MatchReason = {
  type: "Budget",
  code: "budgetMayExceed",
  params: { cost: "18,000–24,000", cap: "20,000" },
  title: "",
  description: "",
};

describe("recommendation localization boundaries", () => {
  it("formats canonical season ids before interpolation in Japanese", () => {
    expect(localizeRecommendationReason(seasonalReason, "ja").title).toBe(
      "夏の適性が高い",
    );
    expect(localizeRecommendationReason(seasonalReason, "ja").description).toBe(
      "夏の季節評価 9/10",
    );
  });
  it("localizes the straddling budget warning in EN and JA with the cap", () => {
    expect(localizeRecommendationReason(mayExceedReason, "en")).toEqual({
      title: "May Exceed Budget",
      description: "Est. ¥18,000–24,000 may exceed your ¥20,000 total budget",
    });
    expect(localizeRecommendationReason(mayExceedReason, "ja")).toEqual({
      title: "予算超過の可能性",
      description:
        "目安 ¥18,000–24,000は合計 ¥20,000 の予算を超える可能性があります",
    });
  });
});
