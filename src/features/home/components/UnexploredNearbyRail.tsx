import { memo } from "react";
import React, { useMemo } from "react";
import { MapPin } from "lucide-react";
import type { Destination } from "@/shared/types/destination";
import { useTranslation } from "react-i18next";
import { SectionViewAllLink } from "./SectionViewAllLink";
import HomeMatchCard from "./HomeMatchCard";
import { ScrollContainer } from "@/shared/components/ui/ScrollContainer";
import {
  getUnexploredNearbyDestinations,
  MAX_HOME_RAIL_CARDS,
} from "../services/HomeRailService";
import {
  HOME_RAIL_CARD_CLASS,
  HOME_RAIL_SECTION_SPACING,
} from "./HomeRailLayout";
import type { TransportZoneId } from "@/shared/types/transportTopology";

interface UnexploredNearbyRailProps {
  destinations: Destination[];
  precomputedDestinations?: Destination[];
  homeStationCoords: { lat: number; lng: number } | null;
  homeStationTransportZoneId?: TransportZoneId;
  isVisited: (destinationId: string) => boolean;
  partySize: number;
  carMode: string;
  publicModes: string[];
  travelDate?: string;
}

export const UnexploredNearbyRail: React.FC<UnexploredNearbyRailProps> = ({
  destinations,
  precomputedDestinations,
  homeStationCoords,
  homeStationTransportZoneId,
  isVisited,
  partySize,
  carMode,
  publicModes,
  travelDate,
}) => {
  const { t } = useTranslation();

  const nearbyUnvisited = useMemo(() => {
    if (precomputedDestinations) {
      return precomputedDestinations
        .filter((destination) => !isVisited(destination.id))
        .slice(0, MAX_HOME_RAIL_CARDS);
    }
    return getUnexploredNearbyDestinations(
      destinations,
      {
        homeStationCoords,
        homeStationTransportZoneId,
        carMode,
        publicModes,
        tripMode: "day_trip",
        visitedIds: destinations
          .filter((destination) => isVisited(destination.id))
          .map((destination) => destination.id),
      },
      MAX_HOME_RAIL_CARDS,
    );
  }, [
    destinations,
    precomputedDestinations,
    homeStationCoords,
    homeStationTransportZoneId,
    isVisited,
    carMode,
    publicModes,
  ]);

  // Hide the rail when origin coordinates are unavailable or no eligible destinations remain
  if (!homeStationCoords || nearbyUnvisited.length === 0) {
    return null;
  }

  return (
    <section
      className={`border-t border-slate-100 bg-white ${HOME_RAIL_SECTION_SPACING} dark:border-slate-800/80 dark:bg-slate-950`}
    >
      <div className="container mx-auto px-4 max-w-6xl">
        {/* Section Header */}
        <div className="flex items-start justify-between mb-4 sm:mb-6 gap-3">
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-slate-900 dark:text-white leading-tight tracking-tight flex items-center gap-2">
              <MapPin className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-500 shrink-0" />
              <span>{t("home.unexploredNearby")}</span>
            </h2>
            <p className="text-[13px] sm:text-sm text-slate-500 dark:text-slate-300 mt-1 leading-relaxed">
              {t("home.unexploredNearbyDescription")}
            </p>
          </div>

          <SectionViewAllLink
            to="/destinations?sort=nearest"
            ariaLabel={t("home.viewAllUnexploredNearby")}
          />
        </div>

        <ScrollContainer
          ariaLabel={t("home.unexploredNearby")}
          previousLabel={t("home.previousRail")}
          nextLabel={t("home.nextRail")}
          className="-mx-4 flex gap-3 px-4 py-2 md:mx-0 md:px-10 sm:gap-4"
        >
          {nearbyUnvisited.map((dest) => (
            <div key={dest.id} className={HOME_RAIL_CARD_CLASS}>
              <HomeMatchCard
                destination={dest}
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

export default memo(UnexploredNearbyRail);
