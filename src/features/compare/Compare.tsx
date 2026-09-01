import { Link } from "react-router-dom";
import type { Destination } from "@/shared/types/destination";
import { useTripStore } from "@/shared/hooks/useTripStore";
import { useCatalogue } from "@/shared/hooks/useCatalogue";
import { Button } from "@/shared/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import { Map, PlusSquare, Trash2 } from "lucide-react";
import { Badge } from "@/shared/components/ui/badge";
import { calculateTripEstimate } from "@/shared/services/budget/tripEstimateEngine";
import { formatLocalizedJPYRange } from "@/shared/services/budget/BudgetService";
import { isRatingVerified } from "@/shared/services/recommendation/RecommendationScorer";
import { useTranslation } from "react-i18next";
import { useLocale } from "@/shared/context/LocaleContext";
import { getLocalizedPlace } from "@/shared/services/place/PlaceCatalog";
import {
  formatPrefecture,
  localizePlaceLabel,
} from "@/shared/utils/placeLabels";

import {
  getWalkingIntensity,
  getWalkingIntensityMetadata,
} from "@/shared/utils/walking";

export default function Compare() {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const { compareList, toggleCompare, clearCompare } = useTripStore();
  // KAI-132: Compare reads ratings/walking/budget/transport — all lite
  // fields. The lite catalogue is runtime-loaded; loading is
  // distinguished from empty so the empty state is not flashed while
  // the loader resolves.
  const {
    status: catalogueStatus,
    places: cataloguePlaces,
    error: liteError,
    retry: retryLite,
  } = useCatalogue({ need: "summary" });
  const liteReady = catalogueStatus === "ready";
  const allDestinations = cataloguePlaces as Destination[];

  const compareDestinations = compareList
    .map((id) => allDestinations.find((d) => d.id === id))
    .filter((d): d is Destination => !!d);

  if (liteError) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold tracking-tight mb-8">
          {t("ui.compare")} {t("ui.destinations")}
        </h1>
        <div
          role="alert"
          data-lite-error
          className="flex flex-col items-center justify-center py-20 bg-red-50 dark:bg-red-950/30 rounded-2xl border border-red-200 dark:border-red-900/50 text-center px-4"
        >
          <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
            {t("home.matchesErrorTitle", "Couldn't load destinations")}
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            {t(
              "home.matchesErrorBody",
              "The destination catalogue couldn't be loaded. Check your connection and try again.",
            )}
          </p>
          <button
            type="button"
            onClick={retryLite}
            className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700"
          >
            {t("ui.retry", "Retry")}
          </button>
        </div>
      </div>
    );
  }

  if (!liteReady) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold tracking-tight mb-8">
          {t("ui.compare")} {t("ui.destinations")}
        </h1>
        <div className="flex flex-col items-center justify-center py-20 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
          <div
            aria-hidden="true"
            className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500/30 border-t-emerald-500"
          />
          <p className="mt-4 text-slate-500 dark:text-slate-300">
            {t("ui.loading", "Loading…")}
          </p>
        </div>
      </div>
    );
  }

  if (compareDestinations.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold tracking-tight mb-8">
          {t("ui.compare")} {t("ui.destinations")}
        </h1>
        <div className="flex flex-col items-center justify-center py-20 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mb-4">
            <Map className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
            {t("ui.nothingToCompare")}
          </h3>
          <p className="text-slate-500 mb-6 text-center max-w-md">
            {t("ui.compareHint")}
          </p>
          <Link to="/destinations">
            <Button className="bg-emerald-700 hover:bg-emerald-800">
              <PlusSquare className="w-4 h-4 mr-2" />{" "}
              {t("ui.exploreDestinations")}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Helpers to find best values
  const getMin = (arr: number[]) => Math.min(...arr);

  // KAI-217B round-2: Compare maintains TWO values per destination:
  //   - display range  = engine [min,max] (the UI shows the RANGE)
  //   - ranking value  = midpoint (INTERNAL ranking only, never displayed)
  // Only COMPLETE results qualify; partial/unavailable show unavailable.
  const engineBudgetRanges = compareDestinations.map((d) => {
    const r = calculateTripEstimate({
      dest: d,
      duration: "fullDay",
      includeOriginTravel: false,
    });
    return r.total ? ([r.total.min, r.total.max] as [number, number]) : null;
  });
  const engineBudgetMidpoints = engineBudgetRanges.map((range) =>
    range ? (range[0] + range[1]) / 2 : null,
  );
  const knownBudgets = engineBudgetMidpoints.filter(
    (budget): budget is number => budget !== null,
  );
  const minBudget = knownBudgets.length > 0 ? getMin(knownBudgets) : null;
  const budgets = engineBudgetMidpoints;

  const travelTimes = compareDestinations.map((d) => {
    const times = Object.values(d.transportOptions || {}).filter(
      (t): t is number => t !== undefined,
    );
    return times.length > 0 ? Math.min(...times) : 999;
  });
  const minTravelTime = getMin(travelTimes);

  // Beta product decision (KAI-89): the overall destination score is hidden
  // from Compare too. The legacy experience rows (couple/summer) remain the
  // separate ratings evidence family, gated by rating-vector confidence
  // (isRatingVerified).
  const ratingVerified = compareDestinations.map((d) => isRatingVerified(d));

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {t("ui.compare")} {t("ui.destinations")}
          </h1>
          <p className="text-slate-500 mt-1">{t("ui.compareHint")}</p>
        </div>
        <div className="flex gap-2">
          {compareDestinations.length < 4 && (
            <Link to="/destinations">
              <Button
                variant="outline"
                className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-300 dark:hover:bg-emerald-900/30"
              >
                <PlusSquare className="w-4 h-4 mr-2" /> {t("ui.addMore")}
              </Button>
            </Link>
          )}
          <Button
            variant="outline"
            className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
            onClick={clearCompare}
          >
            <Trash2 className="w-4 h-4 mr-2" /> {t("ui.clearAll")}
          </Button>
        </div>
      </div>

      <div className="hidden md:block bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[200px] align-top py-6">
                {t("compare.features")}
              </TableHead>
              {compareDestinations.map((dest) => {
                const localized = getLocalizedPlace(dest, locale);
                return (
                  <TableHead
                    key={dest.id}
                    className="min-w-[200px] align-top py-6 relative group"
                  >
                    <button
                      onClick={() => toggleCompare(dest.id)}
                      aria-label={t("compare.removeFromCompareList")}
                      className="absolute top-2 right-2 p-1 text-slate-500 hover:text-red-500 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                      title={t("compare.removeFromCompareList")}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <div className="relative">
                      <img
                        src={localized.heroImage}
                        alt={localized.name}
                        className="w-full h-32 object-cover rounded-md mb-3"
                      />
                    </div>
                    <div className="font-bold text-lg text-slate-900 dark:text-white">
                      {localized.name}
                    </div>
                    <div className="text-sm font-normal text-slate-500 mb-2">
                      {formatPrefecture(dest.prefecture, locale)}
                    </div>
                    <Link to={`/destinations/${dest.id}`}>
                      <Button size="sm" variant="secondary" className="w-full">
                        {t("compare.viewDetails")}
                      </Button>
                    </Link>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-semibold text-slate-700 dark:text-slate-300">
                {t("compare.budgetRecommended")}
              </TableCell>
              {compareDestinations.map((dest, destIdx) => {
                // KAI-217B: canonical engine total (complete-only).
                const budget = budgets[destIdx];
                const budgetRange = engineBudgetRanges[destIdx];
                return (
                  <TableCell key={dest.id}>
                    <span
                      className={
                        budget !== null && budget === minBudget
                          ? "font-bold text-emerald-700 dark:text-emerald-300"
                          : ""
                      }
                    >
                      {budgetRange === null
                        ? t("compare.unavailable")
                        : formatLocalizedJPYRange(budgetRange, locale)}
                    </span>
                    {budget !== null && budget === minBudget && (
                      <Badge className="ml-2 bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800">
                        {t("compare.lowest")}
                      </Badge>
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
            <TableRow>
              <TableCell className="font-semibold text-slate-700 dark:text-slate-300">
                {t("compare.travelTime")}
              </TableCell>
              {compareDestinations.map((dest) => {
                const times = Object.entries(
                  dest.transportOptions || {},
                ).filter(([_, v]) => v !== undefined) as [string, number][];
                const fastest =
                  times.length > 0
                    ? times.reduce((min, curr) =>
                        curr[1] < min[1] ? curr : min,
                      )
                    : ["none", 999];
                const time = fastest[1];
                const mode = fastest[0];
                const modeLabel = t(`home.transportModes.${String(mode)}`, {
                  defaultValue: String(mode),
                });
                const formattedTime =
                  locale === "ja"
                    ? `${time}分（${modeLabel}）`
                    : `${time} min (${mode})`;
                return (
                  <TableCell key={dest.id}>
                    <span
                      className={
                        time === minTravelTime
                          ? "font-bold text-emerald-700 dark:text-emerald-300"
                          : ""
                      }
                    >
                      {time !== 999 ? formattedTime : t("compare.unavailable")}
                    </span>
                    {time === minTravelTime && time !== 999 && (
                      <Badge className="ml-2 bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800">
                        {t("compare.fastest")}
                      </Badge>
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
            <TableRow>
              <TableCell className="font-semibold text-slate-700 dark:text-slate-300">
                {t("compare.walkIntensity")}
              </TableCell>
              {compareDestinations.map((dest) => {
                const walkMeta = getWalkingIntensityMetadata(
                  getWalkingIntensity(dest),
                  locale,
                );
                return (
                  <TableCell key={dest.id}>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${walkMeta.badgeClass}`}
                    >
                      {walkMeta.icon} {walkMeta.label}
                    </span>
                  </TableCell>
                );
              })}
            </TableRow>
            <TableRow>
              <TableCell className="font-semibold text-slate-700 dark:text-slate-300">
                {t("compare.coupleScore")}
              </TableCell>
              {compareDestinations.map((dest, idx) => (
                <TableCell key={dest.id}>
                  <span>
                    {ratingVerified[idx] ? `${dest.ratings.couple}/10` : "—"}
                  </span>
                </TableCell>
              ))}
            </TableRow>
            <TableRow>
              <TableCell className="font-semibold text-slate-700 dark:text-slate-300">
                {t("compare.summerComfort")}
              </TableCell>
              {compareDestinations.map((dest, idx) => (
                <TableCell key={dest.id}>
                  <span>
                    {ratingVerified[idx] ? `${dest.ratings.summer}/10` : "—"}
                  </span>
                </TableCell>
              ))}
            </TableRow>
            <TableRow>
              <TableCell className="font-semibold text-slate-700 dark:text-slate-300">
                {t("compare.vibeTags")}
              </TableCell>
              {compareDestinations.map((dest) => (
                <TableCell key={dest.id}>
                  <div className="flex flex-wrap gap-1">
                    {(dest.tags ?? []).map((tag) => (
                      <span
                        key={tag}
                        className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-1 rounded-md"
                      >
                        {localizePlaceLabel(tag, locale)}
                      </span>
                    ))}
                  </div>
                </TableCell>
              ))}
            </TableRow>
          </TableBody>
        </Table>
      </div>

      {/* Mobile Stacked View */}
      <div className="grid grid-cols-1 gap-6 md:hidden">
        {compareDestinations.map((dest, destIdx) => {
          const localized = getLocalizedPlace(dest, locale);
          // KAI-217B round-2: display RANGE; midpoint is internal ranking.
          const budgetVal = budgets[destIdx];
          const budgetRange = engineBudgetRanges[destIdx];
          const travelTimesForDest = Object.values(
            dest.transportOptions || {},
          ).filter((t): t is number => t !== undefined);
          const travelTime =
            travelTimesForDest.length > 0
              ? Math.min(...travelTimesForDest)
              : 999;

          return (
            <div
              key={dest.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm relative space-y-4"
            >
              <button
                onClick={() => toggleCompare(dest.id)}
                aria-label={t("compare.removeFromCompareList")}
                className="absolute top-4 right-4 p-1.5 bg-red-50 dark:bg-red-950/50 text-red-500 rounded-full hover:scale-105 transition-transform"
                title={t("compare.removeFromCompareList")}
              >
                <Trash2 className="w-4 h-4" />
              </button>

              <div className="flex gap-4">
                <img
                  src={localized.heroImage}
                  alt={localized.name}
                  className="w-24 h-24 object-cover rounded-2xl"
                />
                <div>
                  <h3 className="font-bold text-lg text-slate-950 dark:text-white">
                    {localized.name}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-300">
                    {formatPrefecture(dest.prefecture, locale)}
                  </p>
                  <Link
                    to={`/destinations/${dest.id}`}
                    className="inline-block mt-2"
                  >
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 text-xs px-3"
                    >
                      {t("compare.viewDetails")}
                    </Button>
                  </Link>
                </div>
              </div>

              <div className="border-t border-slate-100 dark:border-slate-800 pt-4 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-slate-500 font-semibold mb-0.5">
                    {t("compare.budgetRecommended")}
                  </p>
                  <p className="font-bold text-slate-900 dark:text-white">
                    {budgetRange === null
                      ? t("compare.unavailable")
                      : formatLocalizedJPYRange(budgetRange, locale)}
                    {budgetVal !== null && budgetVal === minBudget && (
                      <span className="ml-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wide bg-emerald-50 dark:bg-emerald-950 px-1.5 py-0.5 rounded">
                        {t("compare.lowest")}
                      </span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 font-semibold mb-0.5">
                    {t("compare.travelTime")}
                  </p>
                  <p className="font-bold text-slate-900 dark:text-white">
                    {travelTime === 999
                      ? t("compare.unavailable")
                      : locale === "ja"
                        ? `${travelTime}分`
                        : `${travelTime} min`}
                    {travelTime === minTravelTime && travelTime !== 999 && (
                      <span className="ml-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wide bg-emerald-50 dark:bg-emerald-950 px-1.5 py-0.5 rounded">
                        {t("compare.fastest")}
                      </span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 font-semibold mb-0.5">
                    {t("compare.walkIntensity")}
                  </p>
                  <p className="font-bold text-slate-900 dark:text-white">
                    {(() => {
                      const walkMeta = getWalkingIntensityMetadata(
                        getWalkingIntensity(dest),
                        locale,
                      );
                      return `${walkMeta.icon} ${walkMeta.label}`;
                    })()}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
