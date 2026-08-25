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

describe("recommendation localization boundaries", () => {
  it("formats canonical season ids before interpolation in Japanese", () => {
    expect(localizeRecommendationReason(seasonalReason, "ja").title).toBe(
      "夏の適性が高い",
    );
    expect(localizeRecommendationReason(seasonalReason, "ja").description).toBe(
      "夏の季節評価 9/10",
    );
  });
});
