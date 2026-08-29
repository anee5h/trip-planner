import { memo } from "react";
import { Link } from "react-router-dom";
import { Clock, MapPin, Plus, Sparkles } from "lucide-react";
import type { DestinationCombo } from "@/shared/services/recommendation/DestinationCombinationService";
import { getLocalizedPlace } from "@/shared/services/place/PlaceCatalog";
import { formatPlaceName } from "@/shared/utils/placeLabels";
import {
  getCombinationKey,
  getTripsContainingGroup,
  isGroupSavedInAnyTrip,
} from "@/shared/services/trips/ItineraryGroupService";
import { LazyImage } from "@/shared/components/ui/LazyImage";
import { Button } from "@/shared/components/ui/button";
import { ScrollContainer } from "@/shared/components/ui/ScrollContainer";

interface DestinationCombinationRailProps {
  combinations: DestinationCombo[];
  locale: "en" | "ja";
  currentDestinationId: string;
  currentDestinationName: string;
  previousLabel: string;
  nextLabel: string;
  exploreLabel: string;
  addLabel: string;
  savedLabel: (count: number) => string;
  onSave: (combo: DestinationCombo) => void;
}

const CARD_CLASS =
  "flex h-full w-[84vw] min-w-[280px] max-w-[320px] shrink-0 snap-start flex-col sm:w-[320px] sm:min-w-[320px] sm:max-w-[320px]";

export function DestinationCombinationRail({
  combinations,
  locale,
  currentDestinationId,
  currentDestinationName,
  previousLabel,
  nextLabel,
  exploreLabel,
  addLabel,
  savedLabel,
  onSave,
}: DestinationCombinationRailProps) {
  const uniqueCombinations = combinations
    .filter(
      (combo) =>
        combo.secondary.id !== currentDestinationId &&
        combo.primary.id !== combo.secondary.id,
    )
    .filter(
      (combo, index, all) =>
        all.findIndex(
          (candidate) => candidate.secondary.id === combo.secondary.id,
        ) === index,
    );

  if (uniqueCombinations.length === 0) return null;

  return (
    <section data-testid="destination-combination-rail" className="space-y-3">
      <div>
        <h3 className="flex items-center gap-2 text-xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-2xl">
          <Sparkles
            aria-hidden="true"
            className="size-5 shrink-0 text-amber-500"
          />
          {locale === "ja"
            ? "この旅に加えたい場所"
            : "Great additions to this trip"}
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-slate-500 dark:text-slate-300">
          {locale === "ja"
            ? `「${currentDestinationName}」と組み合わせやすい周辺スポット`
            : `Pair ${currentDestinationName} with nearby highlights for a fuller outing.`}
        </p>
      </div>

      <ScrollContainer
        ariaLabel={
          locale === "ja"
            ? "この旅に加えたい場所"
            : "Great additions to this trip"
        }
        previousLabel={previousLabel}
        nextLabel={nextLabel}
        className="-mx-4 flex gap-3 px-4 py-2 sm:gap-4 md:mx-0 md:px-10"
      >
        {uniqueCombinations.map((combo) => {
          const localized = getLocalizedPlace(combo.secondary, locale);
          const pairKey = getCombinationKey(
            combo.primary.id,
            combo.secondary.id,
          );
          const savedTrips = isGroupSavedInAnyTrip(pairKey)
            ? getTripsContainingGroup(pairKey).length
            : 0;
          return (
            <article
              key={combo.secondary.id}
              className={`${CARD_CLASS} overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900`}
            >
              <LazyImage
                src={localized.heroImage}
                alt={localized.name}
                responsive
                deferUntilVisible
                sizes="(min-width: 640px) 320px, 84vw"
                className="h-36 w-full shrink-0 object-cover sm:h-40"
              />
              <div className="flex flex-1 flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="min-w-0 text-base font-bold leading-snug text-slate-900 dark:text-white">
                    {formatPlaceName(localized, locale)}
                  </h4>
                  {savedTrips > 0 && (
                    <span className="shrink-0 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                      {savedLabel(savedTrips)}
                    </span>
                  )}
                </div>
                <p className="line-clamp-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                  {combo.explanation[locale]}
                </p>
                <div className="mt-auto flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                  <span className="inline-flex items-center gap-1">
                    <MapPin
                      aria-hidden="true"
                      className="size-3.5 text-slate-500"
                    />
                    {combo.interDistanceKm} km
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock
                      aria-hidden="true"
                      className="size-3.5 text-slate-500"
                    />
                    {combo.combinedTotalHours[0]}–{combo.combinedTotalHours[1]}
                    {locale === "ja" ? "時間" : "h"}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Link
                    to={`/destinations/${combo.secondary.id}`}
                    className="min-w-0 flex-1"
                  >
                    <Button className="w-full rounded-xl bg-emerald-700 px-3 text-xs font-bold text-white hover:bg-emerald-800">
                      {exploreLabel}
                    </Button>
                  </Link>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onSave(combo)}
                    className="shrink-0 rounded-xl px-3 text-xs font-bold"
                    aria-label={`${addLabel}: ${localized.name}`}
                  >
                    <Plus aria-hidden="true" className="mr-1 size-3.5" />
                    {addLabel}
                  </Button>
                </div>
              </div>
            </article>
          );
        })}
        <div className="w-2 shrink-0 sm:hidden" aria-hidden="true" />
      </ScrollContainer>
    </section>
  );
}

export default memo(DestinationCombinationRail);
