import React from "react";
import { CloudRain, Sun, ThermometerSun, Snowflake } from "lucide-react";
import type { Destination } from "@/shared/types/destination";
import HomeMatchCard from "./HomeMatchCard";
import { useTranslation } from "react-i18next";
import { SectionViewAllLink } from "./SectionViewAllLink";

interface WeatherContextRailProps {
  recommendations: Destination[];
  weatherDesc?: string;
  temperatureC?: number;
  partySize?: number;
  carMode?: string;
  publicModes?: string[];
}

export const WeatherContextRail: React.FC<WeatherContextRailProps> = ({
  recommendations,
  weatherDesc = "Cloudy",
  temperatureC = 25,
  partySize = 2,
  carMode,
  publicModes,
}) => {
  const { t } = useTranslation();
  const isRainy =
    weatherDesc.toLowerCase().includes("rain") ||
    weatherDesc.toLowerCase().includes("drizzle");
  const isHot = temperatureC >= 30;
  const isCold = temperatureC <= 10;

  if (!isRainy && !isHot && !isCold) return null;

  const weatherFilter = isRainy ? "rainy" : isHot ? "hot" : "cold";
  const reason = isRainy
    ? t("home.rainReason")
    : isHot
      ? t("home.hotReason")
      : t("home.coldReason");
  const topFiveIds = new Set(recommendations.slice(0, 5).map((d) => d.id));

  // Filter weather-tailored destinations
  const candidatePicks = recommendations.filter((dest) => {
    if (isRainy)
      return (
        dest.kind === "museum" ||
        dest.kind === "temple" ||
        dest.kind === "shrine" ||
        (dest.ratings?.rain && dest.ratings.rain >= 7)
      );
    if (isHot) return (dest.ratings?.summer ?? 0) >= 7;
    return (dest.ratings?.winter ?? 0) >= 7;
  });

  // Enforce Max 2 Overlap Rule with Top 5 matches
  let overlapCount = 0;
  const deduplicatedPicks: Destination[] = [];

  for (const dest of candidatePicks) {
    const isTopFive = topFiveIds.has(dest.id);
    if (isTopFive) {
      if (overlapCount < 2) {
        overlapCount++;
        deduplicatedPicks.push(dest);
      }
    } else {
      deduplicatedPicks.push(dest);
    }
    if (deduplicatedPicks.length >= 5) break;
  }

  // If fewer than 3 trustworthy distinct picks remain, hide the rail
  if (deduplicatedPicks.length < 3) {
    return null;
  }

  const weatherIcon = isRainy ? (
    <CloudRain className="w-5 h-5 sm:w-6 sm:h-6 text-blue-500 shrink-0" />
  ) : isHot ? (
    <ThermometerSun className="w-5 h-5 sm:w-6 sm:h-6 text-amber-500 shrink-0" />
  ) : isCold ? (
    <Snowflake className="w-5 h-5 sm:w-6 sm:h-6 text-sky-400 shrink-0" />
  ) : (
    <Sun className="w-5 h-5 sm:w-6 sm:h-6 text-amber-500 shrink-0" />
  );

  return (
    <section className="py-8 sm:py-12 lg:py-16 bg-white dark:bg-slate-950 border-t border-slate-100 dark:border-slate-900">
      <div className="container mx-auto px-4 max-w-6xl">
        {/* Header */}
        <div className="flex items-start justify-between mb-4 sm:mb-6 gap-3">
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-slate-900 dark:text-white leading-tight tracking-tight flex items-center gap-2">
              {weatherIcon}
              <span>{t("home.weather")}</span>
            </h2>
            <p className="text-[13px] sm:text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              {t("home.weatherDescription")}
            </p>
          </div>

          <SectionViewAllLink
            to={`/destinations?weather=${weatherFilter}`}
            ariaLabel={t("home.viewAllWeather")}
          />
        </div>

        {/* Dense Mobile Weather Rail (~2.2 cards visible on mobile) */}
        <div className="flex gap-3 sm:gap-4 overflow-x-auto snap-x snap-mandatory scrollbar-none py-2 -mx-4 px-4 sm:mx-0 sm:px-0">
          {deduplicatedPicks.map((dest, index) => (
            <div
              key={dest.id}
              className="w-[46vw] min-w-[160px] max-w-[180px] sm:w-auto sm:min-w-[270px] sm:max-w-[290px] shrink-0 snap-start flex flex-col h-full"
            >
              <HomeMatchCard
                destination={dest}
                rank={index + 1}
                showRank={false}
                partySize={partySize}
                carMode={carMode}
                publicModes={publicModes}
                reason={reason}
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

export default WeatherContextRail;
