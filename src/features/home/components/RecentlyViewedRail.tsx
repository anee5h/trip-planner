import { memo } from "react";
import type React from "react";
import { History } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Destination } from "@/shared/types/destination";
import { ScrollContainer } from "@/shared/components/ui/ScrollContainer";
import HomeMatchCard from "./HomeMatchCard";
import { SectionViewAllLink } from "./SectionViewAllLink";
import {
  HOME_RAIL_CARD_CLASS,
  HOME_RAIL_SECTION_SPACING,
} from "./HomeRailLayout";
import type { TripDuration } from "@/shared/types/tripDuration";

interface RecentlyViewedRailProps {
  destinations: readonly Destination[];
  partySize: number;
  carMode: string;
  publicModes: string[];
  travelDate?: string;
  duration?: TripDuration;
}

function translateRequired(
  translate: (key: string, options?: Record<string, unknown>) => string,
  key: string,
): string {
  const value = translate(key, { defaultValue: "" }).trim();
  return value === key ? "" : value;
}

export const RecentlyViewedRail: React.FC<RecentlyViewedRailProps> = ({
  destinations,
  partySize,
  carMode,
  publicModes,
  travelDate,
  duration,
}) => {
  const { t } = useTranslation();
  const translate = t as (
    key: string,
    options?: Record<string, unknown>,
  ) => string;
  if (destinations.length === 0) return null;

  const title = translateRequired(translate, "home.continueExploring");
  const description = translateRequired(
    translate,
    "home.continueExploringDescription",
  );
  const viewAllLabel = translateRequired(
    translate,
    "home.viewAllContinueExploring",
  );
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
              <History className="size-5 shrink-0 text-emerald-500 sm:size-6" />
              <span>{title}</span>
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-slate-500 dark:text-slate-300 sm:text-sm">
              {description}
            </p>
          </div>
          <SectionViewAllLink to="/destinations" ariaLabel={viewAllLabel} />
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

export default memo(RecentlyViewedRail);
