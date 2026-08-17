import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useTripStore } from "@/shared/hooks/useTripStore";
import destinationsIndex from "@/shared/data/destinations-index.lite.json";
import { formatVisitedDate } from "@/shared/utils/date";

import {
  Calendar as CalendarIcon,
  ChevronDown,
  ChevronRight,
  Clock,
  Compass,
  ArrowRight,
  Luggage,
} from "lucide-react";
import { Badge } from "@/shared/components/ui/badge";

interface ActivityEvent {
  id: string;
  type: "visited" | "trip";
  title: string;
  dateStr: string; // YYYY-MM-DD, YYYY-MM, or YYYY
  year: string; // YYYY or "Undated"
  monthKey: string; // YYYY-MM or "Undated"
  prefecture?: string;
  heroImage?: string;
  destinationId?: string;
  tripId?: string;
  subtitle?: string;
}

export function PassportTimelineCalendar() {
  const { visited, getVisitedDates, trips, lastSyncedDate } = useTripStore();

  const [filterType, setFilterType] = useState<"all" | "visited" | "trips">(
    "all",
  );
  const [expandedYears, setExpandedYears] = useState<Record<string, boolean>>({
    [String(new Date().getFullYear())]: true,
  });
  const [selectedMonthKey, setSelectedMonthKey] = useState<
    Record<string, string | null>
  >({});

  // Parse and group activity events
  const allEvents = useMemo(() => {
    const events: ActivityEvent[] = [];

    // Visited destinations (supports multiple visit dates per sight)
    visited.forEach((vId) => {
      const dest = destinationsIndex.find((d) => d.id === vId);
      if (dest) {
        const dates = getVisitedDates(vId);
        const fallbackDate = lastSyncedDate || "";
        const datesToProcess = dates.length > 0 ? dates : [fallbackDate];

        datesToProcess.forEach((dateStr, idx) => {
          let year = "Undated";
          let monthKey = "Undated";

          if (dateStr && dateStr.trim() !== "") {
            const cleanStr = dateStr.trim().replace(/\//g, "-");
            const yearMatch = cleanStr.match(/^(\d{4})/);
            if (yearMatch) {
              year = yearMatch[1];
            }
            const monthMatch = cleanStr.match(/^(\d{4}-\d{2})/);
            if (monthMatch) {
              monthKey = monthMatch[1];
            }
          }

          events.push({
            id: `visited-${vId}-${idx}`,
            type: "visited",
            title: dest.name,
            dateStr: dateStr,
            year,
            monthKey,
            prefecture: dest.prefecture,
            heroImage: dest.heroImage,
            destinationId: dest.id,
            subtitle: `${dest.prefecture}, Japan`,
          });
        });
      }
    });

    // Trips
    trips.forEach((trip) => {
      if (trip.startDate) {
        let year = "Undated";
        let monthKey = "Undated";

        const cleanStr = trip.startDate.trim().replace(/\//g, "-");
        const yearMatch = cleanStr.match(/^(\d{4})/);
        if (yearMatch) {
          year = yearMatch[1];
        }
        const monthMatch = cleanStr.match(/^(\d{4}-\d{2})/);
        if (monthMatch) {
          monthKey = monthMatch[1];
        }

        events.push({
          id: `trip-${trip.id}`,
          type: "trip",
          title: trip.title,
          dateStr: trip.startDate,
          year,
          monthKey,
          subtitle: `${trip.stops.length} stop${trip.stops.length === 1 ? "" : "s"}`,
          tripId: trip.id,
        });
      }
    });

    return events;
  }, [visited, getVisitedDates, trips, lastSyncedDate]);

  // Filter events
  const filteredEvents = useMemo(() => {
    return allEvents.filter((ev) => {
      if (filterType === "visited") return ev.type === "visited";
      if (filterType === "trips") return ev.type === "trip";
      return true;
    });
  }, [allEvents, filterType]);

  // Group events by Year -> Month
  const yearGroups = useMemo(() => {
    const map: Record<string, Record<string, ActivityEvent[]>> = {};

    // Sort newest first
    const sorted = [...filteredEvents].sort((a, b) => {
      return (b.dateStr || "0000").localeCompare(a.dateStr || "0000");
    });

    sorted.forEach((ev) => {
      const y = ev.year;
      const m = ev.monthKey;

      if (!map[y]) map[y] = {};
      if (!map[y][m]) map[y][m] = [];
      map[y][m].push(ev);
    });

    // Sort years descending
    const sortedYears = Object.keys(map).sort((a, b) => {
      if (a === "Undated") return 1;
      if (b === "Undated") return -1;
      return b.localeCompare(a);
    });

    return { map, sortedYears };
  }, [filteredEvents]);

  const toggleYear = (y: string) => {
    setExpandedYears((prev) => ({ ...prev, [y]: !prev[y] }));
  };

  const getMonthName = (mKey: string) => {
    if (mKey === "Undated") return "General / Undated";
    const [y, m] = mKey.split("-");
    const d = new Date(Number(y), Number(m) - 1, 1);
    return d.toLocaleDateString("en-US", { month: "long" });
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 md:p-8 shadow-sm space-y-6">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
            <Clock className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            Travel Activity Log
          </h2>
          <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">
            Expand any year to view monthly visits & itinerary activities across
            Japan
          </p>
        </div>

        {/* Filter Type Selector */}
        <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 self-start sm:self-auto">
          <button
            onClick={() => setFilterType("all")}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
              filterType === "all"
                ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            All ({allEvents.length})
          </button>
          <button
            onClick={() => setFilterType("visited")}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
              filterType === "visited"
                ? "bg-emerald-500 text-white shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            Visited ({visited.length})
          </button>
          <button
            onClick={() => setFilterType("trips")}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
              filterType === "trips"
                ? "bg-blue-500 text-white shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            Trips ({trips.length})
          </button>
        </div>
      </div>

      {/* Empty State */}
      {yearGroups.sortedYears.length === 0 ? (
        <div className="text-center py-10 bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
          <Compass className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            No activities recorded yet
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            Mark destinations as visited or create a trip itinerary to start
            building your travel log!
          </p>
        </div>
      ) : (
        /* Expandable Year Accordions List */
        <div className="space-y-4">
          {yearGroups.sortedYears.map((yearStr) => {
            const monthsMap = yearGroups.map[yearStr];
            const isYearExpanded = expandedYears[yearStr] ?? false;

            // Total events in this year
            const yearEventsCount = Object.values(monthsMap).reduce(
              (acc, arr) => acc + arr.length,
              0,
            );

            const monthKeys = Object.keys(monthsMap).sort((a, b) =>
              b.localeCompare(a),
            );

            // Active month inside year (null/undefined means "All")
            const activeMonthKey = selectedMonthKey[yearStr] ?? null;

            const activeEvents = activeMonthKey
              ? monthsMap[activeMonthKey] || []
              : Object.values(monthsMap).flat();

            return (
              <div
                key={yearStr}
                className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-slate-50/50 dark:bg-slate-800/30 transition-all shadow-sm"
              >
                {/* Year Header Button */}
                <button
                  onClick={() => toggleYear(yearStr)}
                  className="w-full flex items-center justify-between p-4 bg-white dark:bg-slate-800/90 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 font-extrabold text-base shadow-sm">
                      <CalendarIcon className="w-5 h-5 inline mr-1" />
                      {yearStr}
                    </div>
                    <div>
                      <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                        {yearStr === "Undated"
                          ? "Undated Memories"
                          : `${yearStr} Travel Activity`}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {yearEventsCount} entry
                        {yearEventsCount === 1 ? "" : "ies"} recorded
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                      {yearEventsCount}
                    </span>
                    {isYearExpanded ? (
                      <ChevronDown className="w-5 h-5 text-slate-400" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-slate-400" />
                    )}
                  </div>
                </button>

                {/* Expanded Months & Activity Panel */}
                {isYearExpanded && (
                  <div className="p-5 border-t border-slate-200/80 dark:border-slate-700/60 bg-white dark:bg-slate-900 space-y-4 animate-in fade-in duration-200">
                    {/* Month Selector Pills */}
                    {monthKeys.length > 1 && (
                      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                        <button
                          onClick={() =>
                            setSelectedMonthKey((prev) => ({
                              ...prev,
                              [yearStr]: null,
                            }))
                          }
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all ${
                            selectedMonthKey[yearStr] == null
                              ? "bg-emerald-600 text-white shadow-sm"
                              : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                          }`}
                        >
                          All ({yearEventsCount})
                        </button>

                        {monthKeys.map((mKey) => {
                          const mCount = monthsMap[mKey].length;
                          const isSelected = activeMonthKey === mKey;
                          return (
                            <button
                              key={mKey}
                              onClick={() =>
                                setSelectedMonthKey((prev) => ({
                                  ...prev,
                                  [yearStr]: mKey,
                                }))
                              }
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all flex items-center gap-1.5 ${
                                isSelected
                                  ? "bg-emerald-600 text-white shadow-sm"
                                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                              }`}
                            >
                              <span>{getMonthName(mKey)}</span>
                              <span
                                className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                                  isSelected
                                    ? "bg-emerald-700 text-white"
                                    : "bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400"
                                }`}
                              >
                                {mCount}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Activity Cards List */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {activeEvents.map((ev) => (
                        <div
                          key={ev.id}
                          className="flex items-center gap-3 p-3 rounded-2xl border bg-slate-50/60 dark:bg-slate-800/60 border-slate-200/80 dark:border-slate-700/60 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all shadow-sm group"
                        >
                          {ev.heroImage ? (
                            <img
                              src={ev.heroImage}
                              alt={ev.title}
                              className="w-12 h-12 rounded-xl object-cover shrink-0 shadow-sm group-hover:scale-105 transition-transform"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 shadow-sm">
                              <Luggage className="w-5 h-5" />
                            </div>
                          )}

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <Badge
                                className={`text-[9px] px-1.5 py-0 border-none ${
                                  ev.type === "visited"
                                    ? "bg-emerald-500 text-white"
                                    : "bg-blue-500 text-white"
                                }`}
                              >
                                {ev.type === "visited" ? "Visited" : "Trip"}
                              </Badge>
                              {ev.dateStr && (
                                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 truncate">
                                  {formatVisitedDate(ev.dateStr)}
                                </span>
                              )}
                            </div>

                            <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                              {ev.title}
                            </div>

                            {ev.subtitle && (
                              <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                {ev.subtitle}
                              </div>
                            )}
                          </div>

                          {ev.destinationId && (
                            <Link
                              to={`/destinations/${ev.destinationId}`}
                              className="p-1.5 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors shrink-0"
                              title="View Details"
                            >
                              <ArrowRight className="w-4 h-4" />
                            </Link>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
