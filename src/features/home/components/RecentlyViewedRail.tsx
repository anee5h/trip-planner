import type React from "react";
import { History } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useRecentlyViewedDestinations } from "@/shared/hooks/useRecentlyViewedDestinations";
import { ScrollContainer } from "@/shared/components/ui/ScrollContainer";
import HomeMatchCard from "./HomeMatchCard";
import { SectionViewAllLink } from "./SectionViewAllLink";
import {
  HOME_RAIL_CARD_CLASS,
  HOME_RAIL_SECTION_SPACING,
} from "./HomeRailLayout";

interface RecentlyViewedRailProps {
  partySize: number;
  carMode: string;
  publicModes: string[];
  travelDate?: string;
}

export const RecentlyViewedRail: React.FC<RecentlyViewedRailProps> = ({
  partySize,
  carMode,
  publicModes,
  travelDate,
}) => {
  const { t } = useTranslation();
  const destinations = useRecentlyViewedDestinations();
  if (destinations.length === 0) return null;

  return (
    <section
      className={`border-t border-slate-100 bg-white ${HOME_RAIL_SECTION_SPACING} dark:border-slate-800/80 dark:bg-slate-950`}
    >
      <div className="container mx-auto max-w-6xl px-4">
        <div className="mb-3 flex items-start justify-between gap-3 sm:mb-4">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-xl font-extrabold leading-tight tracking-tight text-slate-900 dark:text-white sm:text-2xl lg:text-3xl">
              <History className="size-5 shrink-0 text-emerald-500 sm:size-6" />
              <span>{t("home.continueExploring")}</span>
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400 sm:text-sm">
              {t("home.continueExploringDescription")}
            </p>
          </div>
          <SectionViewAllLink
            to="/destinations"
            ariaLabel={t("home.viewAllContinueExploring")}
          />
        </div>

        <ScrollContainer
          ariaLabel={t("home.continueExploring")}
          previousLabel={t("home.previousRail")}
          nextLabel={t("home.nextRail")}
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
              />
            </div>
          ))}
          <div className="w-1 shrink-0 sm:hidden" />
        </ScrollContainer>
      </div>
    </section>
  );
};

export default RecentlyViewedRail;
