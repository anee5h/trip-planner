import destinations from "@/shared/data/destinations-index.json";
import type {
  Destination,
  EditorialLifecycle,
} from "@/shared/types/destination";

export interface EditorialQualityReport {
  generatedAt: string;
  totalPlaces: number;
  lifecycleCounts: Record<string, number>;
  methodCounts: Record<string, number>;
  issues: {
    staleCount: number;
    lowConfidenceCount: number;
    missingSourcesCount: number;
    missingJapaneseCount: number;
    imageReviewCount: number;
    highRiskHubCount: number;
  };
  highRiskHubs: Array<{
    id: string;
    name: string;
    prefecture: string;
    riskReasons: string[];
  }>;
  reviewQueue: Array<{
    id: string;
    name: string;
    region: string;
    prefecture: string;
    lifecycle: EditorialLifecycle;
    method: string;
    riskReasons: string[];
  }>;
}

export function generateEditorialQualityReport(): EditorialQualityReport {
  const places = destinations as Destination[];
  const NOW = Date.now();
  const DAY_MS = 86400000;

  const lifecycleCounts: Record<string, number> = {
    published: 0,
    approved: 0,
    in_review: 0,
    draft: 0,
    legacy: 0,
  };

  const methodCounts: Record<string, number> = {
    manual: 0,
    assisted: 0,
    calculated: 0,
    unassigned: 0,
  };

  let staleCount = 0;
  let lowConfidenceCount = 0;
  let missingSourcesCount = 0;
  let missingJapaneseCount = 0;
  let imageReviewCount = 0;

  const reviewQueue: EditorialQualityReport["reviewQueue"] = [];
  const hubsMap = new Map<
    string,
    { id: string; name: string; prefecture: string; riskReasons: Set<string> }
  >();

  for (const place of places) {
    const lifecycle = (place.editorial?.lifecycle ||
      "legacy") as EditorialLifecycle;
    lifecycleCounts[lifecycle] = (lifecycleCounts[lifecycle] || 0) + 1;

    const method =
      place.ratingMetadata?.method ||
      place.editorial?.changes?.[0]?.method ||
      "unassigned";
    methodCounts[method] = (methodCounts[method] || 0) + 1;

    const riskReasons: string[] = [];

    const checkedAtMs = place.editorial?.checkedAt
      ? new Date(place.editorial.checkedAt).getTime()
      : 0;
    const isStale =
      place.editorial?.freshness === "stale" ||
      place.editorial?.freshness === "review_due" ||
      (checkedAtMs > 0 && NOW - checkedAtMs > 180 * DAY_MS);

    if (isStale) {
      staleCount++;
      riskReasons.push("stale_data");
    }

    if (place.ratingMetadata?.confidence === "low") {
      lowConfidenceCount++;
      riskReasons.push("low_confidence_rating");
    }

    const hasSources = Boolean(
      place.editorial?.sources && place.editorial.sources.length > 0,
    );
    if (!hasSources) {
      missingSourcesCount++;
      riskReasons.push("missing_sources");
    }

    const hasJa = Boolean(
      place.nameJa ||
      (place.content?.ja?.name && place.content?.ja?.description),
    );
    if (!hasJa) {
      missingJapaneseCount++;
      riskReasons.push("missing_japanese");
    }

    if (place.imageNeedsReview) {
      imageReviewCount++;
      riskReasons.push("image_needs_review");
    }

    if (
      lifecycle === "draft" ||
      lifecycle === "in_review" ||
      lifecycle === "legacy"
    ) {
      riskReasons.push(`lifecycle_${lifecycle}`);
    }

    if (riskReasons.length > 0) {
      reviewQueue.push({
        id: place.id,
        name: place.name,
        region: place.region,
        prefecture: place.prefecture,
        lifecycle,
        method,
        riskReasons,
      });

      if (place.role === "hub" || place.placeType === "hub") {
        if (!hubsMap.has(place.id)) {
          hubsMap.set(place.id, {
            id: place.id,
            name: place.name,
            prefecture: place.prefecture,
            riskReasons: new Set(),
          });
        }
        for (const reason of riskReasons) {
          hubsMap.get(place.id)!.riskReasons.add(reason);
        }
      }
    }
  }

  const highRiskHubs = Array.from(hubsMap.values()).map((hub) => ({
    id: hub.id,
    name: hub.name,
    prefecture: hub.prefecture,
    riskReasons: Array.from(hub.riskReasons),
  }));

  return {
    generatedAt: new Date().toISOString(),
    totalPlaces: places.length,
    lifecycleCounts,
    methodCounts,
    issues: {
      staleCount,
      lowConfidenceCount,
      missingSourcesCount,
      missingJapaneseCount,
      imageReviewCount,
      highRiskHubCount: highRiskHubs.length,
    },
    highRiskHubs,
    reviewQueue,
  };
}
