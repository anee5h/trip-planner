import { Link } from "react-router-dom";
import { useTripStore } from "@/shared/hooks/useTripStore";
import { useCatalogue } from "@/shared/hooks/useCatalogue";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { calculateTripCost } from "@/shared/services/budget/tripCostEngine";
import { isRatingVerified } from "@/shared/services/recommendation/RecommendationScorer";
import {
  getWalkingIntensity,
  getWalkingIntensityMetadata,
} from "@/shared/utils/walking";
import { X, Trash2, Scale, ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocale } from "@/shared/context/LocaleContext";
import { getLocalizedPlace } from "@/shared/services/place/PlaceCatalog";
import {
  formatPrefecture,
  localizePlaceLabel,
} from "@/shared/utils/placeLabels";

interface CompareModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CompareModal({ isOpen, onClose }: CompareModalProps) {
  const { compareList, toggleCompare, clearCompare } = useTripStore();
  const { t } = useTranslation();
  const { locale } = useLocale();
  const { places: cataloguePlaces } = useCatalogue({
    need: "summary",
    enabled: isOpen,
  });
  const allDestinations = cataloguePlaces;

  if (!isOpen) return null;

  // Cap strictly at 3 destinations max
  const compareDestinations = compareList
    .slice(0, 3)
    .map((id) => allDestinations.find((d) => d.id === id))
    .filter((d): d is NonNullable<typeof d> => Boolean(d));

  // Best value helpers
  const getMin = (arr: number[]) => (arr.length > 0 ? Math.min(...arr) : 0);

  // KAI-217B: canonical engine total (complete-only) for the "Lowest" badge
  // and the Est. Budget chip. Partial/unavailable never win "Lowest".
  const budgets = compareDestinations.map((d) => {
    // KAI-217B: Compare has no origin context — compare the canonical
    // ON-SITE total (admission + local transport).
    const r = calculateTripCost({
      dest: d,
      tripMode: "day_trip",
      includeOriginTravel: false,
    });
    return r.completeness === "complete" && r.total ? r.total.min : null;
  });
  const knownBudgets = budgets.filter(
    (budget): budget is number => budget !== null,
  );
  const minBudget = knownBudgets.length > 0 ? getMin(knownBudgets) : null;

  const travelTimes = compareDestinations.map((d) => {
    const times = Object.values(d.transportOptions || {}).filter(
      (t): t is number => t !== undefined,
    );
    return times.length > 0 ? Math.min(...times) : 999;
  });
  const minTravelTime = getMin(travelTimes);

  // Beta product decision (KAI-89): the overall destination score is hidden
  // from CompareModal too. The couple row remains the legacy ratings
  // family, gated by rating-vector confidence.
  const ratingVerified = compareDestinations.map((d) => isRatingVerified(d));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
                {t("ui.compare")}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-300">
                {compareDestinations.length} {t("ui.of")} 3{" "}
                {t("ui.destinations").toLowerCase()}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {compareDestinations.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearCompare}
                className="text-xs text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl font-semibold"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                {t("ui.clearAll")}
              </Button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label={t("compare.closeModal")}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {compareDestinations.length === 0 ? (
            <div className="text-center py-16 bg-slate-50 dark:bg-slate-950/50 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
              <Scale className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
              <p className="text-slate-700 dark:text-slate-300 font-bold text-base">
                {t("ui.nothingToCompare")}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-300 mt-1 max-w-sm mx-auto">
                {t("ui.compareHint")}
              </p>
            </div>
          ) : (
            <div
              className={`flex md:grid md:grid-cols-3 gap-3 sm:gap-4 pb-2 ${compareDestinations.length > 1 ? "overflow-x-auto snap-x snap-mandatory" : ""}`}
            >
              {compareDestinations.map((dest, idx) => {
                const localized = getLocalizedPlace(dest, locale);
                const cost = budgets[idx];
                const isLowestBudget = cost === minBudget;
                const time = travelTimes[idx];
                const isFastest = time === minTravelTime && time !== 999;
                const walkMeta = getWalkingIntensityMetadata(
                  getWalkingIntensity(dest),
                  locale,
                );

                return (
                  <div
                    key={dest.id}
                    className="w-[260px] sm:w-[290px] md:w-auto shrink-0 snap-start bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col justify-between gap-4 shadow-sm"
                  >
                    {/* Header Card */}
                    <div className="relative flex flex-col min-w-0">
                      <button
                        onClick={() => toggleCompare(dest.id)}
                        className="absolute top-2 right-2 z-10 p-1.5 bg-black/50 hover:bg-red-600 text-white rounded-full backdrop-blur-md transition-colors"
                        title={t("compare.removeFromCompare")}
                        aria-label={`${t("compare.removeFromCompare")} ${localized.name}`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>

                      <div className="w-full h-32 sm:h-36 rounded-xl overflow-hidden bg-slate-200 dark:bg-slate-700 relative shrink-0 mb-3">
                        <img
                          src={localized.heroImage}
                          alt={localized.name}
                          className="w-full h-full object-cover"
                        />
                      </div>

                      <h3 className="font-extrabold text-base text-slate-900 dark:text-white truncate">
                        {localized.name}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-300 mb-3 truncate">
                        {formatPrefecture(dest.prefecture, locale)} •{" "}
                        {dest.categories?.[0]
                          ? localizePlaceLabel(dest.categories[0], locale)
                          : t("compare.attraction")}
                      </p>

                      <Link
                        to={`/destinations/${dest.id}`}
                        onClick={onClose}
                        className="w-full"
                      >
                        <Button
                          size="sm"
                          className="w-full bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-sm"
                        >
                          <ExternalLink className="w-3.5 h-3.5 mr-1" />{" "}
                          {t("ui.view")}
                        </Button>
                      </Link>
                    </div>

                    {/* Metrics Stack for this Destination */}
                    <div className="space-y-2.5 pt-2 border-t border-slate-200/80 dark:border-slate-800/80">
                      {/* Est. Budget */}
                      <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-500 dark:text-slate-300 uppercase">
                          {t("compare.budget")}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-900 dark:text-white text-xs">
                            {cost === null
                              ? t("compare.unavailable")
                              : `¥${(cost / 1000).toFixed(0)}k`}
                          </span>
                          {cost !== null && isLowestBudget && (
                            <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 text-[10px] font-extrabold px-1.5 py-0">
                              {t("compare.lowest")}
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Travel Time */}
                      <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-500 dark:text-slate-300 uppercase">
                          {t("compare.travel")}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-slate-800 dark:text-slate-200 text-xs">
                            {time !== 999
                              ? locale === "ja"
                                ? `${time}分`
                                : `${time}m`
                              : t("compare.unavailable")}
                          </span>
                          {isFastest && (
                            <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 text-[10px] font-extrabold px-1.5 py-0">
                              {t("compare.fastest")}
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Walking */}
                      <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-500 dark:text-slate-300 uppercase">
                          {t("compare.walk")}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${walkMeta.badgeClass}`}
                        >
                          {walkMeta.label}
                        </span>
                      </div>

                      {/* Couple Rating */}
                      <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-500 dark:text-slate-300 uppercase">
                          {t("compare.couple")}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-slate-800 dark:text-slate-200 text-xs">
                            {ratingVerified[idx]
                              ? `${dest.ratings.couple}/10`
                              : "—"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
