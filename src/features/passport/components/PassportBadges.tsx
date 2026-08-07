import { useState } from "react";
import { useTripStore } from "@/shared/hooks/useTripStore";
import { BADGES_CATALOG } from "../data/badges";
import { BadgeEngine } from "../services/BadgeEngine";
import type { Badge, BadgeCategory } from "../types/badge";
import { BadgeCard } from "./BadgeCard";
import { BadgeDetailModal } from "./BadgeDetailModal";
import { Icons } from "@/shared/icons";
import { useLocalStorage } from "@/shared/hooks/useLocalStorage";
import { useTranslation } from "react-i18next";

export function PassportBadges() {
  const { t } = useTranslation();
  const { visited, visitedPrefectures, trips } = useTripStore();
  const [activeCategory, setActiveCategory] = useState<BadgeCategory | "all">(
    "all",
  );
  const [selectedBadge, setSelectedBadge] = useState<Badge | null>(null);
  const [showcaseBadges, setShowcaseBadges] = useLocalStorage<string[]>(
    "tabimap-showcase-badges",
    ["rail-traveler", "onsen-lover", "fuji-explorer", "first-step"],
  );

  const evaluationContext = {
    visited,
    visitedPrefectures,
    visitedDates: {},
    tripsCount: trips.length,
    completedCollectionIds: [],
  };

  const badgeStatuses = BadgeEngine.evaluateAll(evaluationContext);
  const totalUnlocked = Object.values(badgeStatuses).filter(
    (b) => b.isUnlocked,
  ).length;

  const handleToggleFavorite = (badgeId: string) => {
    setShowcaseBadges((prev) =>
      prev.includes(badgeId)
        ? prev.filter((id) => id !== badgeId)
        : [...prev, badgeId].slice(0, 4),
    );
  };

  const filteredBadges = BADGES_CATALOG.filter((b) => {
    if (activeCategory === "all") return true;
    return b.category === activeCategory;
  });

  const CategoryIcon = Icons.badges;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            <CategoryIcon className="w-4 h-4" />
            {t("ui.badges")}
          </div>
          <h2 className="text-xl md:text-2xl font-extrabold text-slate-900 dark:text-white">
            {t("ui.badges")}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Badges earned by visiting destinations across Japan.
          </p>
        </div>

        <div className="px-4 py-2 rounded-2xl bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 shrink-0 text-center md:text-right">
          <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            {t("ui.badges")}
          </div>
          <div className="text-xl font-extrabold text-emerald-700 dark:text-emerald-300">
            {totalUnlocked}{" "}
            <span className="text-xs font-normal text-slate-400">
              / {BADGES_CATALOG.length}
            </span>
          </div>
        </div>
      </div>

      {/* Category Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        {[
          { id: "all", label: t("ui.collections") },
          { id: "travel-style", label: "Travel Style" },
          { id: "interests", label: "Interests" },
          { id: "regional", label: "Regional" },
          { id: "experience", label: "Experience" },
        ].map((cat) => {
          const isActive = activeCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id as any)}
              className={`px-4 py-2 rounded-2xl text-xs font-bold shrink-0 transition-all ${
                isActive
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Grid of Circular Enamel Pin Badges (NO progress bars) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {filteredBadges.map((badge) => {
          const status = badgeStatuses[badge.id] || { isUnlocked: false };
          const isFav = showcaseBadges.includes(badge.id);

          return (
            <BadgeCard
              key={badge.id}
              badge={badge}
              isUnlocked={status.isUnlocked}
              earnedAt={status.earnedAt}
              isFavorite={isFav}
              onToggleFavorite={handleToggleFavorite}
              onClick={(b) => setSelectedBadge(b)}
            />
          );
        })}
      </div>

      {/* Interactive Badge Detail Modal */}
      <BadgeDetailModal
        badge={selectedBadge}
        isUnlocked={
          selectedBadge
            ? badgeStatuses[selectedBadge.id]?.isUnlocked || false
            : false
        }
        earnedAt={
          selectedBadge ? badgeStatuses[selectedBadge.id]?.earnedAt : undefined
        }
        isFavorite={
          selectedBadge ? showcaseBadges.includes(selectedBadge.id) : false
        }
        onToggleFavorite={handleToggleFavorite}
        onClose={() => setSelectedBadge(null)}
      />
    </div>
  );
}
