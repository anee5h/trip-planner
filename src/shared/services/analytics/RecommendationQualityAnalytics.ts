import { recommendationAnalytics } from "./RecommendationAnalyticsService";
import type {
  AnyRecommendationAnalyticsEvent,
  RecommendationImpressionEvent,
  RecommendationClickEvent,
  RecommendationSaveEvent,
  RecommendationCompareEvent,
  RecommendationFeedbackEvent,
} from "./RecommendationAnalyticsTypes";

export interface ReasonCodeMetric {
  reasonCode: string;
  impressions: number;
  clicks: number;
  ctr: number;
  helpfulCount: number;
  unhelpfulCount: number;
}

export interface ConfidenceBandMetric {
  band: "HIGH" | "MEDIUM" | "LOW";
  impressions: number;
  clicks: number;
  ctr: number;
}

export interface QualityMetricsReport {
  totalImpressions: number;
  totalClicks: number;
  totalSaves: number;
  totalCompares: number;
  totalDismissals: number;
  noResultCount: number;
  fallbackCount: number;
  clickThroughRate: number; // Percentage 0-100
  saveRate: number; // Percentage 0-100
  comparisonRate: number; // Percentage 0-100
  dismissalRate: number; // Percentage 0-100
  reasonCodePerformance: Record<string, ReasonCodeMetric>;
  confidenceBandPerformance: Record<
    "HIGH" | "MEDIUM" | "LOW",
    ConfidenceBandMetric
  >;
  localeBreakdown: {
    en: { impressions: number; clicks: number; ctr: number };
    ja: { impressions: number; clicks: number; ctr: number };
  };
}

export function computeQualityMetrics(
  events: AnyRecommendationAnalyticsEvent[] = recommendationAnalytics.getQueue(),
): QualityMetricsReport {
  let totalImpressions = 0;
  let totalClicks = 0;
  let totalSaves = 0;
  let totalCompares = 0;
  let totalDismissals = 0;
  let noResultCount = 0;
  let fallbackCount = 0;

  const reasonMap: Record<string, ReasonCodeMetric> = {};
  const confidenceMap: Record<"HIGH" | "MEDIUM" | "LOW", ConfidenceBandMetric> =
    {
      HIGH: { band: "HIGH", impressions: 0, clicks: 0, ctr: 0 },
      MEDIUM: { band: "MEDIUM", impressions: 0, clicks: 0, ctr: 0 },
      LOW: { band: "LOW", impressions: 0, clicks: 0, ctr: 0 },
    };

  const localeMap = {
    en: { impressions: 0, clicks: 0, ctr: 0 },
    ja: { impressions: 0, clicks: 0, ctr: 0 },
  };

  // Map destination IDs to confidence band & reason codes from recent impressions
  const destConfidenceMap = new Map<string, "HIGH" | "MEDIUM" | "LOW">();
  const destReasonMap = new Map<string, string[]>();

  for (const event of events) {
    const loc = event.locale === "ja" ? "ja" : "en";

    switch (event.eventType) {
      case "recommendation_impression": {
        const imp = event as RecommendationImpressionEvent;
        const count = imp.destinationIds?.length || 1;
        totalImpressions += count;
        localeMap[loc].impressions += count;

        const band = imp.confidenceBand || "MEDIUM";
        confidenceMap[band].impressions += count;

        if (imp.destinationIds) {
          for (const id of imp.destinationIds) {
            destConfidenceMap.set(id, band);
            if (imp.reasonCodes) {
              destReasonMap.set(id, imp.reasonCodes);
            }
          }
        }

        if (imp.reasonCodes) {
          for (const code of imp.reasonCodes) {
            if (!reasonMap[code]) {
              reasonMap[code] = {
                reasonCode: code,
                impressions: 0,
                clicks: 0,
                ctr: 0,
                helpfulCount: 0,
                unhelpfulCount: 0,
              };
            }
            reasonMap[code].impressions += count;
          }
        }
        break;
      }

      case "recommendation_click": {
        const clk = event as RecommendationClickEvent;
        totalClicks++;
        localeMap[loc].clicks++;

        const band = destConfidenceMap.get(clk.destinationId);
        if (band) {
          confidenceMap[band].clicks++;
        }

        const codes = destReasonMap.get(clk.destinationId);
        if (codes) {
          for (const code of codes) {
            if (reasonMap[code]) {
              reasonMap[code].clicks++;
            }
          }
        }
        break;
      }

      case "recommendation_save": {
        const sv = event as RecommendationSaveEvent;
        if (sv.isSaved) {
          totalSaves++;
        }
        break;
      }

      case "recommendation_compare": {
        const cmp = event as RecommendationCompareEvent;
        if (cmp.isCompared) {
          totalCompares++;
        }
        break;
      }

      case "recommendation_dismiss": {
        totalDismissals++;
        break;
      }

      case "no_result_impression": {
        noResultCount++;
        break;
      }

      case "fallback_impression": {
        fallbackCount++;
        break;
      }

      case "recommendation_feedback": {
        const fb = event as RecommendationFeedbackEvent;
        if (fb.reasonCodes) {
          for (const code of fb.reasonCodes) {
            if (!reasonMap[code]) {
              reasonMap[code] = {
                reasonCode: code,
                impressions: 0,
                clicks: 0,
                ctr: 0,
                helpfulCount: 0,
                unhelpfulCount: 0,
              };
            }
            if (fb.isHelpful) {
              reasonMap[code].helpfulCount++;
            } else {
              reasonMap[code].unhelpfulCount++;
            }
          }
        }
        break;
      }
    }
  }

  // Calculate percentage rates
  const safeDiv = (num: number, den: number): number =>
    den > 0 ? Number(((num / den) * 100).toFixed(1)) : 0;

  const clickThroughRate = safeDiv(totalClicks, totalImpressions);
  const saveRate = safeDiv(totalSaves, totalImpressions);
  const comparisonRate = safeDiv(totalCompares, totalImpressions);
  const dismissalRate = safeDiv(totalDismissals, totalImpressions);

  for (const band of ["HIGH", "MEDIUM", "LOW"] as const) {
    confidenceMap[band].ctr = safeDiv(
      confidenceMap[band].clicks,
      confidenceMap[band].impressions,
    );
  }

  for (const code of Object.keys(reasonMap)) {
    reasonMap[code].ctr = safeDiv(
      reasonMap[code].clicks,
      reasonMap[code].impressions,
    );
  }

  localeMap.en.ctr = safeDiv(localeMap.en.clicks, localeMap.en.impressions);
  localeMap.ja.ctr = safeDiv(localeMap.ja.clicks, localeMap.ja.impressions);

  return {
    totalImpressions,
    totalClicks,
    totalSaves,
    totalCompares,
    totalDismissals,
    noResultCount,
    fallbackCount,
    clickThroughRate,
    saveRate,
    comparisonRate,
    dismissalRate,
    reasonCodePerformance: reasonMap,
    confidenceBandPerformance: confidenceMap,
    localeBreakdown: localeMap,
  };
}
