import { memo } from "react";
import type React from "react";
import { CalendarDays, Clock3, Leaf, Route } from "lucide-react";
import type { Destination } from "@/shared/types/destination";
import type { Season } from "@/shared/utils/season";
import { getFixedSeason } from "@/shared/utils/season";
import { useTranslation } from "react-i18next";
import { ScrollContainer } from "@/shared/components/ui/ScrollContainer";
import HomeMatchCard from "./HomeMatchCard";
import { SectionViewAllLink } from "./SectionViewAllLink";
import {
  HOME_RAIL_CARD_CLASS,
  HOME_RAIL_SECTION_SPACING,
} from "./HomeRailLayout";
import type { TripDuration } from "@/shared/types/tripDuration";

export type DiscoveryRailKind =
  "seasonal" | "under60" | "overnightGetaways" | "longerJourney";

interface DiscoveryRailProps {
  kind: DiscoveryRailKind;
  destinations: Destination[];
  partySize: number;
  carMode: string;
  publicModes: string[];
  travelDate?: string;
  duration?: TripDuration;
  season?: Season;
}

const meta: Record<
  DiscoveryRailKind,
  {
    titleKey: string;
    descriptionKey: string;
    viewAllKey: string;
    to: string;
    Icon: typeof Leaf;
  }
> = {
  seasonal: {
    titleKey: "home.seasonalTitles",
    descriptionKey: "home.seasonalDescription",
    viewAllKey: "home.viewAllSeasonal",
    to: "/destinations",
    Icon: Leaf,
  },
  under60: {
    titleKey: "home.greatEscapesUnder60",
    descriptionKey: "home.greatEscapesUnder60Description",
    viewAllKey: "home.viewAllGreatEscapesUnder60",
    to: "/destinations?sort=nearest",
    Icon: Clock3,
  },
  overnightGetaways: {
    titleKey: "home.overnightGetawaysRail",
    descriptionKey: "home.overnightGetawaysDescription",
    viewAllKey: "home.viewAllOvernightGetaways",
    to: "/destinations?duration=2d1n",
    Icon: CalendarDays,
  },
  longerJourney: {
    titleKey: "home.worthLongerJourney",
    descriptionKey: "home.worthLongerJourneyDescription",
    viewAllKey: "home.viewAllLongerJourney",
    to: "/destinations?duration=2d1n",
    Icon: Route,
  },
};

function titleKeyFor(kind: DiscoveryRailKind, season: Season) {
  if (kind === "seasonal") {
    return `home.seasonalTitles.${season}`;
  }
  return meta[kind].titleKey;
}

function translateRequired(
  translate: (key: string, options?: Record<string, unknown>) => string,
  key: string,
): string {
  const value = translate(key, { defaultValue: "" }).trim();
  return value === key ? "" : value;
}

export const DiscoveryRail: React.FC<DiscoveryRailProps> = ({
  kind,
  destinations,
  partySize,
  carMode,
  publicModes,
  travelDate,
  duration,
  season = getFixedSeason(),
}) => {
  const { t } = useTranslation();
  if (destinations.length === 0) return null;

  const rail = meta[kind];
  const Icon = rail.Icon;
  const titleKey = titleKeyFor(kind, season);
  const translate = t as (
    key: string,
    options?: Record<string, unknown>,
  ) => string;
  const title = translateRequired(translate, titleKey);
  const description = translateRequired(translate, rail.descriptionKey);
  const viewAllLabel = translateRequired(translate, rail.viewAllKey);
  const previousLabel = translateRequired(translate, "home.previousRail");
  const nextLabel = translateRequired(translate, "home.nextRail");
  if (!title || !description || !viewAllLabel || !previousLabel || !nextLabel)
    return null;
  return (
    <section
      className={`border-t border-slate-100 bg-white ${HOME_RAIL_SECTION_SPACING} dark:border-slate-800/80 dark:bg-slate-950`}
    >
      <div className="container mx-auto max-w-6xl px-4">
        <div className="mb-3 flex items-start justify-between gap-3 sm:mb-4">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-xl font-extrabold leading-tight tracking-tight text-slate-900 dark:text-white sm:text-2xl lg:text-3xl">
              <Icon className="size-5 shrink-0 text-emerald-500 sm:size-6" />
              <span>{title}</span>
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-slate-500 dark:text-slate-300 sm:text-sm">
              {description}
            </p>
          </div>
          <SectionViewAllLink to={rail.to} ariaLabel={viewAllLabel} />
        </div>

        <ScrollContainer
          ariaLabel={title}
          previousLabel={previousLabel}
          nextLabel={nextLabel}
          className="-mx-4 flex gap-3 px-4 py-2 md:mx-0 md:px-10 sm:gap-4"
        >
          {destinations.map((destination) => (
            <div key={destination.id} className={HOME_RAIL_CARD_CLASS}>
              <HomeMatchCard
                destination={destination}
                rank={0}
                showRank={false}
                partySize={partySize}
                carMode={carMode}
                publicModes={publicModes}
                travelDate={travelDate}
                duration={duration}
              />
            </div>
          ))}
          <div className="w-1 shrink-0 sm:hidden" />
        </ScrollContainer>
      </div>
    </section>
  );
};

export default memo(DiscoveryRail);
