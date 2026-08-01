import React from "react";
import { Link } from "react-router-dom";
import { Clock, Train, Car, Bus, Plane, TramFront } from "lucide-react";
import type { Destination } from "@/shared/types/destination";
import { BucketListButton } from "@/shared/components/ui/BucketListButton";
import { LazyImage } from "@/shared/components/ui/LazyImage";
import { getLocalizedPlace } from "@/shared/services/place/PlaceCatalog";
import { getFastestPreferredTransport } from "@/shared/services/transport/PreferredTransport";
import { formatTransportTime } from "@/shared/services/transport/formatters";
import { useLocale } from "@/shared/context/LocaleContext";
import { useTranslation } from "react-i18next";
import {
  formatPrefecture,
  localizePlaceLabel,
} from "@/shared/utils/placeLabels";

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

export const HomeMatchCard: React.FC<HomeMatchCardProps> = ({
  destination,
  rank,
  showRank = true,
  partySize = 2,
  carMode = "none",
  publicModes = ["shinkansen", "limited_express", "local_train", "bus"],
}) => {
  const { locale } = useLocale();
  const { t } = useTranslation();
  const localized = getLocalizedPlace(destination, locale);
  const { title, subtitle } = parseCleanTitle(localized.name);
  const areaAndCategory = [
    formatPrefecture(destination.prefecture, locale),
    destination.categories[0] &&
      localizePlaceLabel(destination.categories[0], locale),
  ]
    .filter(Boolean)
    .join(" · ");

  // Preferred transport calculation
  const bestTransport = getFastestPreferredTransport(
    destination,
    carMode,
    publicModes,
    partySize,
  );

  const travelTimeText = bestTransport
    ? formatTransportTime(bestTransport.timeRange)
    : t("home.transportModes.travel");
  const transportDisplay = {
    train: { Icon: Train, label: t("home.transportModes.train") },
    shinkansen: { Icon: TramFront, label: t("home.transportModes.shinkansen") },
    bus: { Icon: Bus, label: t("home.transportModes.bus") },
    flight: { Icon: Plane, label: t("home.transportModes.flight") },
    car: { Icon: Car, label: t("home.transportModes.car") },
    my_car: { Icon: Car, label: t("home.transportModes.my_car") },
  }[bestTransport?.mode ?? ""] ?? {
    Icon: Train,
    label: t("home.transportModes.travel"),
  };
  const TravelIcon = transportDisplay.Icon;

  return (
    <Link
      to={`/destinations/${destination.id}`}
      className="group relative flex h-full flex-1 cursor-pointer flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-md transition-all duration-300 hover:shadow-xl dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="relative aspect-[4/3] sm:h-48 sm:aspect-auto w-full overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0">
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
      </div>

      <div className="flex flex-1 flex-col justify-between p-3 sm:p-4">
        <div className="flex flex-col min-h-[3.25rem] sm:min-h-[4rem]">
          <h3 className="text-xs sm:text-base font-extrabold text-slate-900 dark:text-white line-clamp-2 leading-tight group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
            {title}
          </h3>
          {subtitle && (
            <span className="text-[10px] sm:text-xs font-semibold text-slate-400 dark:text-slate-500 truncate mt-0.5">
              {subtitle}
            </span>
          )}
        </div>

        <div className="mt-auto pt-2">
          <p className="line-clamp-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400 sm:text-xs">
            {areaAndCategory}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400 sm:text-xs">
            <span className="flex items-center gap-1 truncate">
              <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-400 shrink-0" />
              <span className="truncate">{travelTimeText}</span>
            </span>

            <span className="text-slate-300 dark:text-slate-700 font-bold">
              •
            </span>

            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold uppercase text-[9px] sm:text-[10px] tracking-wide shrink-0">
              <TravelIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span>{transportDisplay.label}</span>
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
};

export default HomeMatchCard;
