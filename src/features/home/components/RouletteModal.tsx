import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import {
  Dices,
  X,
  Sparkles,
  Trophy,
  MapPin,
  Clock,
  ArrowRight,
} from "lucide-react";
import type { Destination } from "@/shared/types/destination";
import { Button } from "@/shared/components/ui/button";
import { LazyImage } from "@/shared/components/ui/LazyImage";
import { useLocale } from "@/shared/context/LocaleContext";
import { getLocalizedPlace } from "@/shared/services/place/PlaceCatalog";
import { getFastestPreferredTransport } from "@/shared/services/transport/PreferredTransport";
import {
  formatApproximateTransportTime,
  formatTransportTime,
} from "@/shared/services/transport/formatters";
import {
  formatPrefecture,
  localizePlaceLabel,
} from "@/shared/utils/placeLabels";
import { useTripStore } from "@/shared/hooks/useTripStore";
import { useTranslation } from "react-i18next";
import type { TripDuration } from "@/shared/types/tripDuration";
import { isOvernightDuration } from "@/shared/types/tripDuration";
import type { ScoredDestination } from "@/shared/services/recommendation/RecommendationTypes";
import { getValidModes } from "@/shared/services/recommendation/RecommendationScorer";
import { getDayTripTravelDurationEvidence } from "@/shared/services/recommendation/TripDurationService";
import { buildTokyoWardsLink } from "@/shared/services/recommendation/TokyoWardsConsolidation";

interface RouletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidates: Destination[];
  partySize?: number;
  carMode?: string;
  publicModes?: string[];
  tripDuration?: TripDuration;
  expansion?: "exact" | "duration" | "budget";
}

const DAY_TRIP_DURATION_LABELS = {
  shortOuting: "home.durations.shortOuting",
  halfDay: "home.durations.halfDay",
  fullDay: "home.durations.fullDay",
  "2d1n": "home.durations.2d1n",
  "3d2n": "home.durations.3d2n",
} as const;

const MODE_LABELS = {
  train: "home.transportModes.train",
  shinkansen: "home.transportModes.shinkansen",
  bus: "home.transportModes.bus",
  flight: "home.transportModes.flight",
  ferry: "home.transportModes.ferry",
  car: "home.transportModes.car",
  my_car: "home.transportModes.my_car",
} as const;

export default function RouletteModal({
  isOpen,
  onClose,
  candidates,
  partySize = 2,
  carMode,
  publicModes,
  tripDuration = "halfDay",
  expansion = "exact",
}: RouletteModalProps) {
  const { locale } = useLocale();
  const { t } = useTranslation();
  const { homeStationCoords, homeStationTransportZoneId } = useTripStore();

  const [spinning, setSpinning] = useState(false);
  const [currentDisplay, setCurrentDisplay] = useState<Destination | null>(
    candidates[0] ?? null,
  );
  const [winner, setWinner] = useState<Destination | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const candidateQueueRef = useRef<Destination[]>([]);
  const candidateKey = candidates.map((candidate) => candidate.id).join(",");

  const nextQueuedCandidate = useCallback(() => {
    if (candidateQueueRef.current.length === 0) {
      candidateQueueRef.current = [...candidates].sort(
        () => Math.random() - 0.5,
      );
    }
    return candidateQueueRef.current.shift() ?? null;
  }, [candidates]);

  useEffect(() => {
    candidateQueueRef.current = [];
    setCurrentDisplay(candidates[0] ?? null);
    setWinner(null);
  }, [candidateKey, candidates]);

  const startSpin = useCallback(() => {
    if (candidates.length === 0) return;
    if (timerRef.current) clearTimeout(timerRef.current);

    setSpinning(true);
    setWinner(null);

    const totalTicks = Math.min(15, candidates.length);
    let count = 0;

    const tick = () => {
      count++;
      const nextCandidate = nextQueuedCandidate();
      setCurrentDisplay(nextCandidate);

      if (count >= totalTicks) {
        setSpinning(false);
        setWinner(nextCandidate);
      } else {
        const nextDelay = 50 + Math.floor((count / totalTicks) * 250);
        timerRef.current = setTimeout(tick, nextDelay);
      }
    };

    timerRef.current = setTimeout(tick, 50);
  }, [candidates.length, nextQueuedCandidate]);

  useEffect(() => {
    if (isOpen && candidates.length > 0) {
      startSpin();
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isOpen, candidates, startSpin]);

  if (!isOpen) return null;

  const displayedCandidate = spinning
    ? currentDisplay
    : winner || currentDisplay;

  const localized = displayedCandidate
    ? getLocalizedPlace(displayedCandidate, locale)
    : null;

  // The candidate's evaluated origin-aware estimate (the same one used for
  // ranking and budget) — roulette never recomputes travel from raw
  // destination.transportOptions. Defensive fallback uses the same shared
  // day-trip evidence source for candidates that did not come from the
  // recommendation pipeline.
  const scoredCandidate = displayedCandidate as ScoredDestination;
  const pipelineEstimate = scoredCandidate?.transportEstimate;
  const isOvernight = isOvernightDuration(tripDuration);
  const validModes = displayedCandidate
    ? getValidModes(
        displayedCandidate,
        carMode ?? "none",
        publicModes ?? [],
        homeStationCoords || undefined,
        undefined,
        homeStationTransportZoneId,
      )
    : [];
  const dayEstimate =
    !isOvernight && displayedCandidate
      ? getDayTripTravelDurationEvidence(
          displayedCandidate,
          {
            homeStationCoords,
            originZoneId: homeStationTransportZoneId,
          },
          validModes,
        ).estimate
      : undefined;
  const bestTransport = pipelineEstimate
    ? pipelineEstimate
    : dayEstimate
      ? dayEstimate
      : displayedCandidate
        ? getFastestPreferredTransport(
            displayedCandidate,
            carMode,
            publicModes,
            partySize,
            homeStationCoords || undefined,
            homeStationTransportZoneId,
          )
        : null;
  const isApproximateTransport = Boolean(
    bestTransport &&
    "evidence" in bestTransport &&
    bestTransport.evidence === "estimated",
  );
  const transportLabel = bestTransport
    ? (t(
        MODE_LABELS[bestTransport.mode as keyof typeof MODE_LABELS] ??
          "home.transportModes.travel",
      ) as string)
    : t("home.transportModes.travel");
  const durationLabelKey =
    tripDuration === "any"
      ? DAY_TRIP_DURATION_LABELS.fullDay
      : tripDuration in DAY_TRIP_DURATION_LABELS
        ? DAY_TRIP_DURATION_LABELS[
            tripDuration as keyof typeof DAY_TRIP_DURATION_LABELS
          ]
        : DAY_TRIP_DURATION_LABELS["3d2n"];
  const durationLabel = t(durationLabelKey);
  const weekendPlaceCount = isOvernight
    ? (scoredCandidate?.overnight?.placeCount ?? 0)
    : 0;
  const wardGroup = scoredCandidate?.wardGroup;
  const displayName =
    wardGroup !== undefined
      ? t("destination.tokyoWardsGroup")
      : localized?.name || displayedCandidate?.name || "";
  const detailHref = wardGroup
    ? buildTokyoWardsLink(wardGroup.wardHubIds, tripDuration)
    : winner
      ? `/destinations/${winner.id}`
      : "/destinations";
  const locationLabel = displayedCandidate
    ? [
        formatPrefecture(displayedCandidate.prefecture, locale),
        displayedCandidate.categories[0] &&
          localizePlaceLabel(displayedCandidate.categories[0], locale),
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("home.roulette.title")}
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-200 dark:border-[hsl(var(--border-subtle))] dark:bg-[hsl(var(--surface-overlay))]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 p-5 dark:border-[hsl(var(--border-subtle))]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
              <Dices className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>{t("home.roulette.title")}</span>
                <Sparkles className="w-4 h-4 text-emerald-500" />
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-300">
                {t("home.roulette.subtitle")}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={t("home.roulette.close")}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 text-center">
          {displayedCandidate && localized ? (
            <div className="space-y-5">
              {expansion !== "exact" && (
                <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  {t("home.roulette.expanded")}
                </p>
              )}
              {/* Card preview */}
              <div
                className={`relative h-64 rounded-2xl overflow-hidden shadow-lg transition-all duration-150 border ${
                  spinning
                    ? "scale-[0.98] border-emerald-400/50 dark:border-emerald-500/50"
                    : "scale-100 border-emerald-700 ring-2 ring-emerald-500/20"
                }`}
              >
                <LazyImage
                  src={displayedCandidate.heroImage}
                  alt={localized.name}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/30 to-transparent" />

                {/* Status overlay */}
                {spinning ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/40 backdrop-blur-[2px] text-white">
                    <Dices className="w-10 h-10 animate-spin text-emerald-400 mb-2" />
                    <span className="text-xs font-bold uppercase tracking-widest text-emerald-300">
                      {t("home.roulette.selecting")}
                    </span>
                  </div>
                ) : (
                  <div className="absolute top-3 left-3 bg-emerald-700 text-white font-extrabold text-xs px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1.5 animate-bounce">
                    <Trophy className="w-3.5 h-3.5" />
                    <span>{t("home.roulette.match")}</span>
                  </div>
                )}
              </div>

              <div className="space-y-2 text-left">
                <div>
                  <h3 className="line-clamp-2 text-xl font-extrabold text-slate-900 dark:text-white">
                    {displayName}
                  </h3>
                  <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-300">
                    {locationLabel}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 text-emerald-500" />
                    {bestTransport
                      ? isApproximateTransport
                        ? formatApproximateTransportTime(
                            bestTransport.timeRange,
                            locale,
                          )
                        : formatTransportTime(bestTransport.timeRange, locale)
                      : t("home.transportModes.travel")}
                  </span>
                  <span className="text-slate-300 dark:text-slate-600">·</span>
                  <span>{transportLabel}</span>
                  <span className="text-slate-300 dark:text-slate-600">·</span>
                  <span>{durationLabel}</span>
                  {weekendPlaceCount > 0 && (
                    <>
                      <span className="text-slate-300 dark:text-slate-600">
                        ·
                      </span>
                      <span>
                        {t("home.places", { count: weekendPlaceCount })}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={startSpin}
                  disabled={spinning}
                  className="flex-1 h-12 rounded-2xl font-bold border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <Dices className="w-4 h-4 mr-2 text-emerald-500" />
                  {t("home.roulette.spinAgain")}
                </Button>

                {winner && (
                  <Link to={detailHref} onClick={onClose} className="flex-1">
                    <Button className="w-full h-12 rounded-2xl font-bold bg-emerald-700 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/25">
                      <span>{t("home.roulette.viewDetails")}</span>
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <div className="py-12 text-slate-500">
              <MapPin className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p>{t("home.roulette.empty")}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
