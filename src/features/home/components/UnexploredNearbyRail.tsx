import React, { useMemo } from "react";
import { MapPin } from "lucide-react";
import type { Destination } from "@/shared/types/destination";
import { getDistance } from "@/shared/utils/distance";
import { useTranslation } from "react-i18next";
import { SectionViewAllLink } from "./SectionViewAllLink";
import HomeMatchCard from "./HomeMatchCard";

interface UnexploredNearbyRailProps {
  destinations: Destination[];
  homeStationCoords: { lat: number; lng: number } | null;
  isVisited: (destinationId: string) => boolean;
  partySize: number;
  carMode: string;
  publicModes: string[];
}

export const UnexploredNearbyRail: React.FC<UnexploredNearbyRailProps> = ({
  destinations,
  homeStationCoords,
  isVisited,
  partySize,
  carMode,
  publicModes,
}) => {
  const { t } = useTranslation();

  const nearbyUnvisited = useMemo(() => {
    if (!homeStationCoords) return [];

    return destinations
      .filter(
        (destination) => destination.coordinates && !isVisited(destination.id),
      )
      .map((destination) => ({
        destination,
        distanceKm: getDistance(
          homeStationCoords.lat,
          homeStationCoords.lng,
          destination.coordinates!.lat,
          destination.coordinates!.lng,
        ),
      }))
      .sort(
        (a, b) =>
          a.distanceKm - b.distanceKm ||
          a.destination.id.localeCompare(b.destination.id),
      )
      .slice(0, 5)
      .map(({ destination }) => destination);
  }, [destinations, homeStationCoords, isVisited]);

  // Hide the rail when origin coordinates are unavailable or no eligible destinations remain
  if (!homeStationCoords || nearbyUnvisited.length === 0) {
    return null;
  }

  return (
    <section className="border-t border-slate-100 bg-white py-10 sm:py-12 lg:py-12 dark:border-slate-800/80 dark:bg-slate-950">
      <div className="container mx-auto px-4 max-w-6xl">
        {/* Section Header */}
        <div className="flex items-start justify-between mb-4 sm:mb-6 gap-3">
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-slate-900 dark:text-white leading-tight tracking-tight flex items-center gap-2">
              <MapPin className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-500 shrink-0" />
              <span>{t("home.unexploredNearby")}</span>
            </h2>
            <p className="text-[13px] sm:text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              {t("home.unexploredNearbyDescription")}
            </p>
          </div>

          <SectionViewAllLink
            to="/destinations?sort=nearest"
            ariaLabel={t("home.viewAllUnexploredNearby")}
          />
        </div>

        {/* Horizontal Scroll Rail */}
        <div className="flex gap-3 sm:gap-4 overflow-x-auto snap-x snap-mandatory scrollbar-none py-2 -mx-4 px-4 sm:mx-0 sm:px-0">
          {nearbyUnvisited.map((dest) => (
            <div
              key={dest.id}
              className="flex h-full w-[46vw] min-w-[160px] max-w-[180px] shrink-0 snap-start flex-col sm:w-[250px] sm:min-w-[250px] sm:max-w-[250px]"
            >
              <HomeMatchCard
                destination={dest}
                rank={0}
                showRank={false}
                partySize={partySize}
                carMode={carMode}
                publicModes={publicModes}
                allowApproximateLocalDisplay
              />
            </div>
          ))}
          {/* Rail Trailing Padding Element for Mobile */}
          <div className="w-1 shrink-0 sm:hidden" />
        </div>
      </div>
    </section>
  );
};

export default UnexploredNearbyRail;
