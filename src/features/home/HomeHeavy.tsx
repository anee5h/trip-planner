import { useEffect, useMemo, useState } from "react";
import type { Destination } from "@/shared/types/destination";
import { useTripStore } from "@/shared/hooks/useTripStore";
import { useCatalogue } from "@/shared/hooks/useCatalogue";
import { useAuth } from "@/shared/hooks/useAuth";
import { useRecentlyViewedDestinations } from "@/shared/hooks/useRecentlyViewedDestinations";
import { HOME_RAIL_SECTION_SPACING } from "./components/HomeRailLayout";
import { deriveTripDates } from "@/shared/services/recommendation/TravelConditions";
import RouletteModal from "@/features/home/components/RouletteModal";
import { DeferredSection } from "@/shared/components/ui/DeferredSection";
import { useTripPlannerState } from "@/features/home/hooks/useTripPlannerState";
import { useHomeDateState } from "@/features/home/state/HomeDateStateContext";
import { useTripRecommendations } from "@/features/home/hooks/useTripRecommendations";
import TopMatchesSection from "./components/TopMatchesSection";
import BucketListRail from "./components/BucketListRail";
import CollectionsRail from "./components/CollectionsRail";
import RecentlyViewedRail from "./components/RecentlyViewedRail";
import DeferredDiscoveryRails from "./components/DeferredDiscoveryRails";
import {
  getHomepageRailConfig,
  orderRecentlyViewedDestinations,
} from "./services/HomeRailService";
import { useTranslation } from "react-i18next";
import { getFixedSeason } from "@/shared/utils/season";
import type { HomePendingAction } from "./state/HomeAction";
// KAI-147-P2: prewarm the lite catalogue the moment HomeHeavy mounts.
// HomeHeavy is already rendered AFTER first paint (lazy boundary), so this
// starts the fetch during chunk evaluation — overlapping download with
// recommendation setup instead of waiting for the useCatalogue effect.
// The loader is a shared singleton; useCatalogue remains the single source
// of truth for status/error/retry, and a failed prewarm surfaces there.
import { loadCatalogue } from "@/shared/services/place/PlaceCatalog";

void loadCatalogue("summary").catch(() => {
  // failure surfaces through useCatalogue's error state + retry
});

export default function HeavyHome({
  pendingAction,
  onActionConsumed,
}: {
  pendingAction: HomePendingAction;
  onActionConsumed: (id: number) => void;
}) {
  const { t } = useTranslation();
  // KAI-132: Home is SUMMARY-ONLY. The lite catalogue is runtime-loaded
  // (not inlined in the shared chunk); the planner renders immediately
  // and catalogue-dependent content (Top Matches + rails) mounts once
  // the lite index resolves. A failed load is NOT treated as ready:
  // the error state renders an explicit retry (KAI-132 error semantics).
  const {
    status: catalogueStatus,
    places: cataloguePlaces,
    error: liteError,
    retry: retryLite,
  } = useCatalogue({ need: "summary" });
  const liteReady = catalogueStatus === "ready";
  const allDestinations = cataloguePlaces as Destination[];

  const { user } = useAuth();
  const {
    homeStationCoords,
    homeStationTransportZoneId,
    isVisited,
    favorites,
  } = useTripStore();

  const { weatherContext, currentTab, customDate, forecastSelection } =
    useHomeDateState();

  /**
   * Planned travel date derived from the user's forecast selection. This is
   * the only temporal input ferry availability may use — never the clock.
   */
  const ferryTemporal = useMemo(() => {
    if (forecastSelection.type === "custom" && forecastSelection.date) {
      const [year, month, day] = forecastSelection.date.split("-").map(Number);
      if (year && month && day) {
        return { travelDate: new Date(year, month - 1, day, 12) };
      }
    }
    if (forecastSelection.type === "today") {
      return { travelDate: new Date() };
    }
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return { travelDate: tomorrow };
  }, [forecastSelection]);

  const travelDateIso = useMemo(() => {
    const date = ferryTemporal.travelDate;
    if (!date) return undefined;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }, [ferryTemporal]);

  const { resolvedDraft, resolvedApplied, hasUserApplied } =
    useTripPlannerState(user, forecastSelection);

  const selectedDate =
    customDate || currentTab?.dates?.[0] || weatherContext?.minDate;
  const travelDates = useMemo(() => {
    if (!selectedDate) return undefined;
    return deriveTripDates(selectedDate, resolvedApplied.tripMode);
  }, [selectedDate, resolvedApplied.tripMode]);

  const [rouletteOpen, setRouletteOpen] = useState(false);
  const { recommendedDestinations, rouletteCandidates, rouletteExpansion } =
    useTripRecommendations({
      allDestinations,
      vibe: resolvedApplied.vibe,
      budget: resolvedApplied.budget,
      carMode: resolvedApplied.carMode,
      publicModes: resolvedApplied.publicModes,
      partySize: resolvedApplied.partySize,
      budgetTier: resolvedApplied.budgetTier,
      tripDuration: resolvedApplied.tripDuration,
      homeStationCoords: homeStationCoords ?? null,
      homeStationTransportZoneId,
      ferryTemporal,
      isVisited,
      rouletteConstraints: resolvedDraft,
      tripMode: resolvedApplied.tripMode,
      accommodationAllowance: resolvedApplied.accommodationAllowance,
      travelDates,
      rouletteEnabled: rouletteOpen,
    });

  const railConfig = getHomepageRailConfig(
    resolvedApplied.tripMode,
    resolvedApplied.tripDuration,
  );
  const isWeekendMode = railConfig.includes("weekendGetaways");
  const seasonalReferenceDate = useMemo(() => new Date(), []);
  const currentSeason = useMemo(
    () => getFixedSeason(seasonalReferenceDate),
    [seasonalReferenceDate],
  );
  const visitedIds = useMemo(
    () =>
      allDestinations
        .filter((destination) => isVisited(destination.id))
        .map((destination) => destination.id),
    [allDestinations, isVisited],
  );
  const recentDestinations = useRecentlyViewedDestinations();
  const topMatchIds = useMemo(
    () =>
      recommendedDestinations.slice(0, 10).map((destination) => destination.id),
    [recommendedDestinations],
  );
  const recentlyViewedDestinations = useMemo(
    () => orderRecentlyViewedDestinations(recentDestinations, topMatchIds),
    [recentDestinations, topMatchIds],
  );
  const bucketListDisplayedIds = useMemo(
    () =>
      favorites
        .map((id) =>
          allDestinations.find((destination) => destination.id === id),
        )
        .filter(
          (destination): destination is Destination =>
            destination !== undefined,
        )
        .slice(0, 10)
        .map((destination) => destination.id),
    [allDestinations, favorites],
  );

  useEffect(() => {
    if (!pendingAction) return;
    if (pendingAction.type === "surprise") {
      setRouletteOpen(true);
      onActionConsumed(pendingAction.id);
      return;
    }
    if (!liteReady) return;
    const element = document.getElementById("recommendations");
    if (!element) return;
    element.scrollIntoView?.({ behavior: "smooth" });
    element.focus();
    onActionConsumed(pendingAction.id);
  }, [
    pendingAction,
    liteReady,
    onActionConsumed,
    recommendedDestinations.length,
  ]);

  const hasSavedItems = favorites.length > 0;

  return (
    <div className="contents" data-home-heavy-ready>
      {/* Destination Roulette Modal */}
      <RouletteModal
        isOpen={rouletteOpen}
        onClose={() => setRouletteOpen(false)}
        candidates={rouletteCandidates as Destination[]}
        partySize={resolvedDraft.partySize}
        carMode={resolvedDraft.carMode}
        publicModes={resolvedDraft.publicModes}
        tripDuration={resolvedDraft.tripDuration}
        tripMode={resolvedDraft.tripMode}
        expansion={rouletteExpansion}
      />

      {/* Section 1: Top Matches Section */}
      {liteReady ? (
        <TopMatchesSection
          recommendations={recommendedDestinations}
          hasUserApplied={hasUserApplied}
          appliedState={resolvedApplied}
          travelDate={travelDateIso}
          viewAllDate={
            forecastSelection.type === "today" ? undefined : travelDateIso
          }
        />
      ) : liteError ? (
        // KAI-132: the lite catalogue failed to load — this is NOT
        // treated as ready. Show an explicit error state with retry.
        <section
          role="alert"
          data-top-matches-error
          className={`bg-white ${HOME_RAIL_SECTION_SPACING} dark:bg-slate-950`}
        >
          <div className="container mx-auto px-4 max-w-6xl">
            <div className="flex flex-col items-center justify-center rounded-2xl border border-red-200 bg-red-50 py-10 px-4 text-center dark:border-red-900/50 dark:bg-red-950/30">
              <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
                {t("home.matchesErrorTitle", "Couldn't load recommendations")}
              </h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                {t(
                  "home.matchesErrorBody",
                  "The destination catalogue couldn't be loaded. Check your connection and try again.",
                )}
              </p>
              <button
                type="button"
                onClick={retryLite}
                className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700"
              >
                {t("ui.retry", "Retry")}
              </button>
            </div>
          </div>
        </section>
      ) : (
        // KAI-132: geometry-stable one-row skeleton matching the real
        // Top Matches rail (horizontal scroll flex of fixed-width cards,
        // same container/padding/gap) so the lite-catalogue resolution
        // does not shift layout (no CLS spike before KAI-131).
        <section
          aria-hidden="true"
          data-top-matches-placeholder
          className={`bg-white ${HOME_RAIL_SECTION_SPACING} dark:bg-slate-950`}
        >
          <div className="container mx-auto px-4 max-w-6xl">
            <div className="mb-4 flex items-start justify-between gap-3 sm:mb-6">
              <div className="min-w-0">
                <div className="h-7 w-48 animate-pulse rounded bg-slate-200/70 dark:bg-slate-800/70 sm:h-8" />
                <div className="mt-1 h-4 w-64 animate-pulse rounded bg-slate-200/60 dark:bg-slate-800/60" />
              </div>
            </div>
            <div className="-mx-4 flex gap-3 overflow-x-hidden px-4 py-2 md:mx-0 md:px-10 sm:gap-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-40 w-[46vw] min-w-[160px] max-w-[180px] shrink-0 animate-pulse rounded-2xl bg-slate-200/60 dark:bg-slate-800/60 sm:w-[250px] sm:min-w-[250px] sm:max-w-[250px]"
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Recently viewed remains conditional and sits directly below Top matches. */}
      <DeferredSection when={liteReady}>
        <RecentlyViewedRail
          destinations={recentlyViewedDestinations}
          partySize={resolvedApplied.partySize}
          carMode={resolvedApplied.carMode}
          publicModes={resolvedApplied.publicModes}
          travelDate={travelDateIso}
        />
      </DeferredSection>

      {/* Bucket List remains conditional and keeps its existing user-data semantics. */}
      {hasSavedItems && (
        <DeferredSection order={1} when={liteReady}>
          <BucketListRail
            partySize={resolvedApplied.partySize}
            carMode={resolvedApplied.carMode}
            publicModes={resolvedApplied.publicModes}
            travelDate={travelDateIso}
          />
        </DeferredSection>
      )}

      <DeferredSection order={2} when={liteReady}>
        <DeferredDiscoveryRails
          isWeekendMode={isWeekendMode}
          recommendedDestinations={recommendedDestinations}
          allDestinations={allDestinations}
          topMatchIds={topMatchIds}
          recentlyViewedDestinations={recentlyViewedDestinations}
          bucketListDisplayedIds={bucketListDisplayedIds}
          homeStationCoords={homeStationCoords ?? null}
          homeStationTransportZoneId={homeStationTransportZoneId}
          carMode={resolvedApplied.carMode}
          publicModes={resolvedApplied.publicModes}
          budgetTier={resolvedApplied.budgetTier}
          ferryTemporal={ferryTemporal}
          visitedIds={visitedIds}
          tripMode={resolvedApplied.tripMode}
          seasonalReferenceDate={seasonalReferenceDate}
          currentSeason={currentSeason}
          partySize={resolvedApplied.partySize}
          travelDate={travelDateIso}
          isVisited={isVisited}
        />
      </DeferredSection>

      {/* Curated Collections Rail */}
      <DeferredSection order={3} when={liteReady}>
        <CollectionsRail />
      </DeferredSection>

      {/* Compact Prompt Banner near bottom for empty/signed-out states */}
      {!hasSavedItems && (
        <DeferredSection order={4} when={liteReady}>
          <BucketListRail
            partySize={resolvedApplied.partySize}
            carMode={resolvedApplied.carMode}
            publicModes={resolvedApplied.publicModes}
            travelDate={travelDateIso}
            isCompactPromptOnly
          />
        </DeferredSection>
      )}
    </div>
  );
}
