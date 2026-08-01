import React from "react";
import { Link } from "react-router-dom";
import { MapPin, Clock, Train, Car } from "lucide-react";
import type { Destination } from "@/shared/types/destination";
import { BucketListButton } from "@/shared/components/ui/BucketListButton";
import { LazyImage } from "@/shared/components/ui/LazyImage";
import { getLocalizedPlace } from "@/shared/services/place/PlaceCatalog";
import { formatPrefecture } from "@/shared/utils/placeLabels";
import { getFastestPreferredTransport } from "@/shared/services/transport/PreferredTransport";
import { formatTransportTime } from "@/shared/services/transport/formatters";
import { useLocale } from "@/shared/context/LocaleContext";

interface HomeMatchCardProps {
  destination: Destination;
  rank: number;
  showRank?: boolean;
  partySize?: number;
  carMode?: string;
  publicModes?: string[];
}

/**
 * Cleanly separates parenthetical titles e.g. "Edo Castle Ruins (Imperial Palace)"
 * into title: "Edo Castle Ruins" and subtitle: "Imperial Palace".
 */
function parseCleanTitle(fullName: string): {
  title: string;
  subtitle?: string;
} {
  const match = fullName.match(/^(.*?)\s*\((.*?)\)$/);
  if (match && match[1] && match[2]) {
    return { title: match[1].trim(), subtitle: match[2].trim() };
  }
  return { title: fullName };
}

/**
 * Derives trip duration band ("Short outing", "Half day", "Full day")
 */
function getTripDurationLabel(destination: Destination): string {
  const visitHours = destination.recommendedVisitHours
    ? (destination.recommendedVisitHours.min +
        destination.recommendedVisitHours.max) /
      2
    : destination.totalTripHours || 4;

  if (visitHours <= 3) return "Short outing";
  if (visitHours <= 6) return "Half day";
  return "Full day";
}

export const HomeMatchCard: React.FC<HomeMatchCardProps> = ({
  destination,
  rank,
  showRank = true,
  partySize = 2,
  carMode = "none",
  publicModes = ["shinkansen", "limited_express", "local_train", "bus"],
}) => {
  const { locale } = useLocale();
  const localized = getLocalizedPlace(destination, locale);
  const { title, subtitle } = parseCleanTitle(localized.name);
  const durationLabel = getTripDurationLabel(destination);

  // Preferred transport calculation
  const bestTransport = getFastestPreferredTransport(
    destination,
    carMode,
    publicModes,
    partySize,
  );

  const isCar =
    bestTransport?.mode === "my_car" || bestTransport?.mode === "rental";
  const travelTimeText = bestTransport
    ? formatTransportTime(bestTransport.timeRange)
    : "Near Tokyo";
  const TravelIcon = isCar ? Car : Train;

  return (
    <Link
      to={`/destinations/${destination.id}`}
      className="group relative bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl sm:rounded-3xl overflow-hidden shadow-md hover:shadow-xl transition-all duration-300 flex flex-col h-full cursor-pointer"
    >
      {/* Hero Image Container */}
      <div className="relative h-36 sm:h-48 w-full overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0">
        <LazyImage
          src={destination.heroImage}
          alt={title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />

        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-black/30" />

        {/* Rank Badge - Show only when requested */}
        {showRank && (
          <div className="absolute top-2.5 left-2.5 sm:top-3 sm:left-3 z-10 bg-slate-900/90 text-white font-black text-[11px] sm:text-xs px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full border border-white/20 shadow-md flex items-center gap-1">
            <span className="text-emerald-400 font-black">#{rank}</span>
          </div>
        )}

        {/* Bucket List Action - Stops Propagation */}
        <div
          className="absolute top-2.5 right-2.5 sm:top-3 sm:right-3 z-10 scale-90 sm:scale-100"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
        >
          <BucketListButton
            destinationId={destination.id}
            destinationName={localized.name}
          />
        </div>

        {/* Location Badge */}
        <div className="absolute bottom-2.5 left-2.5 sm:bottom-3 sm:left-3 z-10 flex items-center text-white text-[10px] sm:text-xs">
          <div className="flex items-center gap-1 sm:gap-1.5 font-extrabold bg-slate-950/80 text-white backdrop-blur-md px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg border border-white/10 shadow-md">
            <MapPin className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-400 shrink-0" />
            <span className="truncate max-w-[100px] sm:max-w-[140px]">
              {formatPrefecture(destination.prefecture, locale)}
            </span>
          </div>
        </div>
      </div>

      {/* Card Body - Equal Height Structure */}
      <div className="p-3 sm:p-4 flex flex-col flex-1 justify-between gap-2">
        <div>
          {/* Reserved 2-Line Height for Title */}
          <div className="min-h-[2.5rem] flex flex-col justify-start">
            <h3 className="text-xs sm:text-base font-extrabold text-slate-900 dark:text-white line-clamp-2 leading-tight group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
              {title}
            </h3>
            {subtitle && (
              <span className="text-[10px] sm:text-xs font-semibold text-slate-400 dark:text-slate-500 truncate mt-0.5">
                {subtitle}
              </span>
            )}
          </div>

          {/* Travel Time & Transport Mode & Trip Duration */}
          <div className="flex items-center gap-1.5 sm:gap-2 mt-2 text-[10px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400 flex-wrap">
            <span className="flex items-center gap-1 truncate">
              <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-400 shrink-0" />
              <span className="truncate">{travelTimeText}</span>
            </span>

            <span className="text-slate-300 dark:text-slate-700 font-bold">
              •
            </span>

            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold uppercase text-[9px] sm:text-[10px] tracking-wide shrink-0">
              <TravelIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span>{isCar ? "CAR" : "TRAIN"}</span>
            </span>

            <span className="text-slate-300 dark:text-slate-700 font-bold hidden sm:inline">
              •
            </span>

            <span className="font-extrabold text-slate-700 dark:text-slate-300 shrink-0">
              {durationLabel}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
};

export default HomeMatchCard;
