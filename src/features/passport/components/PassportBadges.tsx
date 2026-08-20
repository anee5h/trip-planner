import { useEffect, useState } from "react";
import { useTripStore } from "@/shared/hooks/useTripStore";
import { loadLiteIndex } from "@/shared/services/place/PlaceCatalog";
import type { Destination } from "@/shared/types/destination";
import { BADGES_CATALOG } from "../data/badges";
import { BadgeEngine } from "../services/BadgeEngine";
import type { Badge, BadgeCategory } from "../types/badge";
import { BadgeCard } from "./BadgeCard";
import { BadgeDetailModal } from "./BadgeDetailModal";
import { Icons } from "@/shared/icons";
import { useLocalStorage } from "@/shared/hooks/useLocalStorage";
import { useTranslation } from "react-i18next";
import { Layers, Train, Heart, MapPin, Sparkles } from "lucide-react";

export function PassportBadges() {
  const { t } = useTranslation();
  const { visited, visitedPrefectures, trips } = useTripStore();
  // KAI-132: load the lite catalogue at the passport feature boundary;
  // BadgeEngine stays synchronous and receives the loaded catalogue.
  const [catalogue, setCatalogue] = useState<Destination[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadLiteIndex()
      .then((places) => {
        if (!cancelled) setCatalogue(places as unknown as Destination[]);
      })
      .catch((err) => {
        console.error("[PassportBadges] lite catalogue load failed:", err);
        if (!cancelled) setCatalogue([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);
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

  const badgeStatuses = BadgeEngine.evaluateAll(
    evaluationContext,
    catalogue ?? [],
  );
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
          <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
            <CategoryIcon className="w-4 h-4" />
            {t("ui.badges")}
          </div>
          <h2 className="text-xl md:text-2xl font-extrabold text-slate-900 dark:text-white">
            {t("ui.badges")}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-300">
            Badges earned by visiting destinations across Japan.
          </p>
        </div>

        <div className="px-4 py-2 rounded-2xl bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 shrink-0 text-center md:text-right">
          <div className="text-xs font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">
            {t("ui.badges")}
          </div>
          <div className="text-xl font-extrabold text-emerald-700 dark:text-emerald-300">
            {totalUnlocked}{" "}
            <span className="text-xs font-normal text-slate-500">
              / {BADGES_CATALOG.length}
            </span>
          </div>
        </div>
      </div>

      {/* Category Filter Tabs — mobile: icon-only except active; sm+: icon + label. No scrolling. */}
      <div className="flex items-center gap-1.5">
        {[
          { id: "all", label: t("ui.collections"), Icon: Layers },
          { id: "travel-style", label: "Travel Style", Icon: Train },
          { id: "interests", label: "Interests", Icon: Heart },
          { id: "regional", label: "Regional", Icon: MapPin },
          { id: "experience", label: "Experience", Icon: Sparkles },
        ].map((cat) => {
          const isActive = activeCategory === cat.id;
          const Icon = cat.Icon;
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id as any)}
              title={cat.label}
              aria-label={cat.label}
              className={`px-3 py-2.5 sm:py-2 min-h-[44px] sm:min-h-[36px] rounded-2xl text-xs font-bold shrink-0 transition-all flex items-center justify-center gap-1.5 ${
                isActive
                  ? "bg-emerald-700 text-white shadow-sm"
                  : "bg-slate-100 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              <Icon
                className={`w-4 h-4 ${isActive ? "text-white" : "text-slate-600 dark:text-slate-300"}`}
                aria-hidden="true"
              />
              <span className="hidden sm:inline">{cat.label}</span>
              {isActive && <span className="sm:hidden">{cat.label}</span>}
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
