import { BADGES_CATALOG } from "../data/badges";
import type { Badge, BadgeContext } from "../types/badge";
import destinationsIndex from "@/shared/data/destinations-index.lite.json";

export class BadgeEngine {
  static isUnlocked(badge: Badge, ctx: BadgeContext): boolean {
    const { visited, visitedPrefectures } = ctx;
    const rule = badge.unlockRule;

    switch (rule.type) {
      case "visit_count":
        return visited.length >= rule.target;

      case "prefecture_count":
        if (rule.targetValue === "Kansai") {
          const kansai = [
            "Mie",
            "Shiga",
            "Kyoto",
            "Osaka",
            "Hyogo",
            "Nara",
            "Wakayama",
          ];
          const count = kansai.filter((p) =>
            visitedPrefectures.includes(p),
          ).length;
          return count >= rule.target;
        }
        if (rule.targetValue === "Kanto") {
          const kanto = [
            "Ibaraki",
            "Tochigi",
            "Gunma",
            "Saitama",
            "Chiba",
            "Tokyo",
            "Kanagawa",
          ];
          const count = kanto.filter((p) =>
            visitedPrefectures.includes(p),
          ).length;
          return count >= rule.target;
        }
        if (rule.targetValue) {
          return visitedPrefectures.includes(rule.targetValue);
        }
        return visitedPrefectures.length >= rule.target;

      case "category_count": {
        const visitedDests = destinationsIndex.filter((d) =>
          visited.includes(d.id),
        );
        const count = visitedDests.filter((d) =>
          d.categories?.includes(rule.targetValue || ""),
        ).length;
        return count >= rule.target;
      }

      case "tag_count": {
        const visitedDests = destinationsIndex.filter((d) =>
          visited.includes(d.id),
        );
        const count = visitedDests.filter((d) =>
          d.tags?.some((t) =>
            t.toLowerCase().includes((rule.targetValue || "").toLowerCase()),
          ),
        ).length;
        return count >= rule.target;
      }

      case "transit_mode":
        // Simulated heuristic: 1 visited destination unlocks transit traveler badges
        return visited.length >= rule.target;

      case "seasonal":
        // Checks if user visited at least 1 destination
        return visited.length >= 1;

      default:
        return false;
    }
  }

  static evaluateAll(
    ctx: BadgeContext,
  ): Record<string, { isUnlocked: boolean; earnedAt?: string }> {
    const results: Record<string, { isUnlocked: boolean; earnedAt?: string }> =
      {};

    for (const badge of BADGES_CATALOG) {
      const unlocked = this.isUnlocked(badge, ctx);
      results[badge.id] = {
        isUnlocked: unlocked,
        earnedAt: unlocked ? "July 2026" : undefined,
      };
    }

    return results;
  }
}
