import { describe, expect, it } from "vitest";
import type { PipelineRecommendation } from "./RecommendationTypes";
import { diversifyRecommendations } from "./RecommendationPipeline";

const recommendation = (
  id: string,
  score: number,
  parentDestinationId?: string,
  areaId?: string,
) =>
  ({
    id,
    score,
    areaId,
    categories: ["History"],
    relationships: parentDestinationId ? { parentDestinationId } : undefined,
    pipeline: {},
  }) as unknown as PipelineRecommendation;

describe("recommendation diversification", () => {
  it("separates same-area results and suppresses redundant hub-child pairs", () => {
    const results = diversifyRecommendations([
      recommendation("kyoto-city", 100),
      recommendation("kiyomizu", 99, "kyoto-city", "higashiyama"),
      recommendation("gion", 98, "kyoto-city", "higashiyama"),
      recommendation("osaka-castle", 90, "osaka-city", "osaka-castle"),
    ]);

    expect(results.map(({ id }) => id)).toEqual(["kyoto-city", "osaka-castle"]);
  });
});
