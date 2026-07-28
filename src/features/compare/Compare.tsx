import { Link } from "react-router-dom";
import { getDestinationList } from "@/shared/services/destination/DestinationService";
import type { Destination } from "@/shared/types/destination";
import { useTripStore } from "@/shared/hooks/useTripStore";
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
import { getAdjustedBudget } from "@/shared/utils/utils";
import { useTranslation } from "react-i18next";

import {
  getWalkingIntensity,
  getWalkingIntensityMetadata,
} from "@/shared/utils/walking";

export default function Compare() {
  const { t } = useTranslation();
  const { compareList, toggleCompare, clearCompare } = useTripStore();
  const allDestinations = getDestinationList() as Destination[];

  const compareDestinations = compareList
    .map((id) => allDestinations.find((d) => d.id === id))
    .filter((d): d is Destination => !!d);

  if (compareDestinations.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold tracking-tight mb-8">
          {t("ui.compare")} {t("ui.destinations")}
        </h1>
        <div className="flex flex-col items-center justify-center py-20 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4">
            <Map className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
            {t("ui.nothingToCompare")}
          </h3>
          <p className="text-slate-500 mb-6 text-center max-w-md">
            {t("ui.compareHint")}
          </p>
          <Link to="/destinations">
            <Button className="bg-emerald-600 hover:bg-emerald-700">
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
  const getMax = (arr: number[]) => Math.max(...arr);

  const budgets = compareDestinations.map((d) => getAdjustedBudget(d, "all"));
  const minBudget = getMin(budgets);

  const travelTimes = compareDestinations.map((d) => {
    const times = Object.values(d.transportOptions || {}).filter(
      (t): t is number => t !== undefined,
    );
    return times.length > 0 ? Math.min(...times) : 999;
  });
  const minTravelTime = getMin(travelTimes);

  const coupleScores = compareDestinations.map((d) => d.ratings.couple);
  const maxCoupleScore = getMax(coupleScores);

  const summerScores = compareDestinations.map((d) => d.ratings.summer);
  const maxSummerScore = getMax(summerScores);

  const overallScores = compareDestinations.map((d) => d.ratings.overall);
  const maxOverall = getMax(overallScores);

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
                className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-400 dark:hover:bg-emerald-900/30"
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
                Features
              </TableHead>
              {compareDestinations.map((dest) => (
                <TableHead
                  key={dest.id}
                  className="min-w-[200px] align-top py-6 relative group"
                >
                  <button
                    onClick={() => toggleCompare(dest.id)}
                    aria-label="Remove destination from comparison list"
                    className="absolute top-2 right-2 p-1 text-slate-400 hover:text-red-500 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Remove from comparison"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <div className="relative">
                    <img
                      src={dest.heroImage}
                      alt={dest.name}
                      className="w-full h-32 object-cover rounded-md mb-3"
                    />
                  </div>
                  <div className="font-bold text-lg text-slate-900 dark:text-white">
                    {dest.name}
                  </div>
                  <div className="text-sm font-normal text-slate-500 mb-2">
                    {dest.prefecture}
                  </div>
                  <Link to={`/destinations/${dest.id}`}>
                    <Button size="sm" variant="secondary" className="w-full">
                      View Details
                    </Button>
                  </Link>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-semibold text-slate-700 dark:text-slate-300">
                Overall Score
              </TableCell>
              {compareDestinations.map((dest) => (
                <TableCell key={dest.id} className="text-base">
                  <span
                    className={`font-bold ${dest.ratings.overall === maxOverall ? "text-emerald-600 dark:text-emerald-400" : ""}`}
                  >
                    {dest.ratings.overall}
                  </span>
                  {dest.ratings.overall === maxOverall && (
                    <Badge className="ml-2 bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800">
                      Best
                    </Badge>
                  )}
                </TableCell>
              ))}
            </TableRow>
            <TableRow>
              <TableCell className="font-semibold text-slate-700 dark:text-slate-300">
                Budget (Recommended)
              </TableCell>
              {compareDestinations.map((dest) => (
                <TableCell key={dest.id}>
                  <span
                    className={
                      getAdjustedBudget(dest, "all") === minBudget
                        ? "font-bold text-emerald-600 dark:text-emerald-400"
                        : ""
                    }
                  >
                    ¥{(getAdjustedBudget(dest, "all") / 1000).toFixed(0)}k
                  </span>
                  {getAdjustedBudget(dest, "all") === minBudget && (
                    <Badge className="ml-2 bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800">
                      Lowest
                    </Badge>
                  )}
                </TableCell>
              ))}
            </TableRow>
            <TableRow>
              <TableCell className="font-semibold text-slate-700 dark:text-slate-300">
                Travel Time
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
                return (
                  <TableCell key={dest.id}>
                    <span
                      className={
                        time === minTravelTime
                          ? "font-bold text-emerald-600 dark:text-emerald-400"
                          : ""
                      }
                    >
                      {time !== 999 ? `${time} min (${mode})` : "N/A"}
                    </span>
                    {time === minTravelTime && time !== 999 && (
                      <Badge className="ml-2 bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800">
                        Fastest
                      </Badge>
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
            <TableRow>
              <TableCell className="font-semibold text-slate-700 dark:text-slate-300">
                Walk Intensity
              </TableCell>
              {compareDestinations.map((dest) => {
                const walkMeta = getWalkingIntensityMetadata(
                  getWalkingIntensity(dest),
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
                Couple Score
              </TableCell>
              {compareDestinations.map((dest) => (
                <TableCell key={dest.id}>
                  <span
                    className={
                      dest.ratings.couple === maxCoupleScore
                        ? "font-bold text-emerald-600 dark:text-emerald-400"
                        : ""
                    }
                  >
                    {dest.ratings.couple}/10
                  </span>
                  {dest.ratings.couple === maxCoupleScore && (
                    <Badge className="ml-2 bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800">
                      Highest
                    </Badge>
                  )}
                </TableCell>
              ))}
            </TableRow>
            <TableRow>
              <TableCell className="font-semibold text-slate-700 dark:text-slate-300">
                Summer Comfort
              </TableCell>
              {compareDestinations.map((dest) => (
                <TableCell key={dest.id}>
                  <span
                    className={
                      dest.ratings.summer === maxSummerScore
                        ? "font-bold text-emerald-600 dark:text-emerald-400"
                        : ""
                    }
                  >
                    {dest.ratings.summer}/10
                  </span>
                  {dest.ratings.summer === maxSummerScore && (
                    <Badge className="ml-2 bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800">
                      Best
                    </Badge>
                  )}
                </TableCell>
              ))}
            </TableRow>
            <TableRow>
              <TableCell className="font-semibold text-slate-700 dark:text-slate-300">
                Vibe Tags
              </TableCell>
              {compareDestinations.map((dest) => (
                <TableCell key={dest.id}>
                  <div className="flex flex-wrap gap-1">
                    {(dest.tags ?? []).map((tag) => (
                      <span
                        key={tag}
                        className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-1 rounded-md"
                      >
                        {tag}
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
        {compareDestinations.map((dest) => {
          const budgetVal = getAdjustedBudget(dest, "all");
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
                aria-label="Remove destination from comparison list"
                className="absolute top-4 right-4 p-1.5 bg-red-50 dark:bg-red-950/50 text-red-500 rounded-full hover:scale-105 transition-transform"
                title="Remove"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              <div className="flex gap-4">
                <img
                  src={dest.heroImage}
                  alt={dest.name}
                  className="w-24 h-24 object-cover rounded-2xl"
                />
                <div>
                  <h3 className="font-bold text-lg text-slate-950 dark:text-white">
                    {dest.name}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {dest.prefecture}
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
                      View Details
                    </Button>
                  </Link>
                </div>
              </div>

              <div className="border-t border-slate-100 dark:border-slate-800 pt-4 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-slate-400 font-semibold mb-0.5">
                    Overall Score
                  </p>
                  <p className="font-bold text-slate-900 dark:text-white flex items-center">
                    {dest.ratings.overall}
                    {dest.ratings.overall === maxOverall && (
                      <span className="ml-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide bg-emerald-50 dark:bg-emerald-950 px-1.5 py-0.5 rounded">
                        Best
                      </span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 font-semibold mb-0.5">
                    Budget (Recommended)
                  </p>
                  <p className="font-bold text-slate-900 dark:text-white">
                    ¥{(budgetVal / 1000).toFixed(0)}k
                    {budgetVal === minBudget && (
                      <span className="ml-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide bg-emerald-50 dark:bg-emerald-950 px-1.5 py-0.5 rounded">
                        Lowest
                      </span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 font-semibold mb-0.5">
                    Travel Time
                  </p>
                  <p className="font-bold text-slate-900 dark:text-white">
                    {travelTime === 999 ? "N/A" : `${travelTime} min`}
                    {travelTime === minTravelTime && travelTime !== 999 && (
                      <span className="ml-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide bg-emerald-50 dark:bg-emerald-950 px-1.5 py-0.5 rounded">
                        Fastest
                      </span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 font-semibold mb-0.5">
                    Walk Intensity
                  </p>
                  <p className="font-bold text-slate-900 dark:text-white">
                    {(() => {
                      const walkMeta = getWalkingIntensityMetadata(
                        getWalkingIntensity(dest),
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
