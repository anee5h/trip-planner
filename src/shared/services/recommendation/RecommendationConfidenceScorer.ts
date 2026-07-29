import type { Destination } from "@/shared/types/destination";

export type ConfidenceBand = "HIGH" | "MEDIUM" | "LOW";

export interface ConfidenceScoreResult {
  dataConfidence: number; // 0.0 to 1.0
  recommendationConfidence: number; // 0.0 to 1.0
  overallConfidence: number; // 0.0 to 1.0
  confidenceBand: ConfidenceBand;
  explanationKeys: string[];
}

export interface ConfidenceContext {
  hasWeatherData?: boolean;
  hasTransportData?: boolean;
  hasBudgetData?: boolean;
  hasOfficialWebsite?: boolean;
}

export class RecommendationConfidenceScorer {
  /**
   * Deterministically calculates data confidence (catalog quality & provenance)
   */
  public calculateDataConfidence(destination: Destination): number {
    if (!destination) return 0.3; // Default fallback for malformed input

    let score = 0.4; // Base score for valid record
    const destRecord = destination as Record<string, any>;

    // Provenance / verified source
    if (destRecord.source?.websiteUrl || destination.officialWebsite) {
      score += 0.2;
    }

    // Pricing / budget completeness
    if (
      destRecord.costEstimates ||
      destRecord.estimatedCost !== undefined ||
      destRecord.estimatedBudget !== undefined ||
      (destRecord.priceCategory && destRecord.priceCategory !== "FREE")
    ) {
      score += 0.2;
    }

    // Access / transport info
    if (destRecord.accessInfo || destination.prefecture) {
      score += 0.2;
    }

    return Math.min(1.0, Math.max(0.0, Number(score.toFixed(2))));
  }

  /**
   * Deterministically calculates recommendation confidence (precision of match given context)
   */
  public calculateRecommendationConfidence(
    destination: Destination,
    context: ConfidenceContext = {},
  ): number {
    if (!destination) return 0.3;

    let score = 0.5; // Base score

    if (context.hasWeatherData) {
      score += 0.2;
    } else {
      score -= 0.1; // Missing live weather lowers confidence
    }

    if (context.hasTransportData) {
      score += 0.15;
    } else {
      score -= 0.05;
    }

    if (context.hasBudgetData) {
      score += 0.15;
    }

    return Math.min(1.0, Math.max(0.0, Number(score.toFixed(2))));
  }

  /**
   * Combines data confidence and recommendation confidence into an overall calibrated score.
   */
  public calculateConfidence(
    destination: Destination,
    context: ConfidenceContext = {},
  ): ConfidenceScoreResult {
    const dataConfidence = this.calculateDataConfidence(destination);
    const recommendationConfidence = this.calculateRecommendationConfidence(
      destination,
      context,
    );

    // Weighted combination: 40% data confidence, 60% recommendation confidence
    const rawOverall = dataConfidence * 0.4 + recommendationConfidence * 0.6;
    const overallConfidence = Number(rawOverall.toFixed(2));

    let confidenceBand: ConfidenceBand = "MEDIUM";
    if (overallConfidence >= 0.8) {
      confidenceBand = "HIGH";
    } else if (overallConfidence < 0.5) {
      confidenceBand = "LOW";
    }

    const explanationKeys: string[] = [];
    if (dataConfidence >= 0.8) {
      explanationKeys.push("recommendation.confidence.verifiedCatalogData");
    }
    if (context.hasWeatherData) {
      explanationKeys.push("recommendation.confidence.liveWeatherAvailable");
    } else {
      explanationKeys.push("recommendation.confidence.weatherDataEstimated");
    }
    if (context.hasTransportData) {
      explanationKeys.push("recommendation.confidence.verifiedTransitRoute");
    }

    return {
      dataConfidence,
      recommendationConfidence,
      overallConfidence,
      confidenceBand,
      explanationKeys,
    };
  }
}

export const recommendationConfidenceScorer =
  new RecommendationConfidenceScorer();
