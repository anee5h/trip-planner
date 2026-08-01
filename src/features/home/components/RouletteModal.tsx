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
import { formatTransportTime } from "@/shared/services/transport/formatters";
import { formatPrefecture } from "@/shared/utils/placeLabels";
import { useTripStore } from "@/shared/hooks/useTripStore";
import { useTranslation } from "react-i18next";

interface RouletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidates: Destination[];
  partySize?: number;
  carMode?: string;
  publicModes?: string[];
}

export default function RouletteModal({
  isOpen,
  onClose,
  candidates,
  partySize = 2,
  carMode,
  publicModes,
}: RouletteModalProps) {
  const { locale } = useLocale();
  const { t } = useTranslation();
  const { homeStationCoords } = useTripStore();

  const [spinning, setSpinning] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [winner, setWinner] = useState<Destination | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startSpin = useCallback(() => {
    if (candidates.length === 0) return;
    if (timerRef.current) clearTimeout(timerRef.current);

    setSpinning(true);
    setWinner(null);

    const winningIndex = Math.floor(Math.random() * candidates.length);
    const targetWinner = candidates[winningIndex];

    let currentIdx = currentIndex;
    let ticksLeft =
      15 +
      ((winningIndex - (currentIdx % candidates.length) + candidates.length) %
        candidates.length);
    if (ticksLeft < 15) ticksLeft += candidates.length;

    const totalTicks = ticksLeft;
    let count = 0;

    const tick = () => {
      count++;
      currentIdx = (currentIdx + 1) % candidates.length;
      setCurrentIndex(currentIdx);

      if (count >= totalTicks) {
        setSpinning(false);
        setWinner(targetWinner);
      } else {
        const nextDelay = 50 + Math.floor((count / totalTicks) * 250);
        timerRef.current = setTimeout(tick, nextDelay);
      }
    };

    timerRef.current = setTimeout(tick, 50);
  }, [candidates, currentIndex]);

  useEffect(() => {
    if (isOpen && candidates.length > 0) {
      startSpin();
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isOpen, candidates, startSpin]);

  if (!isOpen) return null;

  const currentDisplay = spinning
    ? candidates[currentIndex]
    : winner || candidates[0];

  const localized = currentDisplay
    ? getLocalizedPlace(currentDisplay, locale)
    : null;

  const bestTransport = currentDisplay
    ? getFastestPreferredTransport(
        currentDisplay,
        carMode,
        publicModes,
        partySize,
        homeStationCoords || undefined,
      )
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
              <Dices className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>{t("home.roulette.title")}</span>
                <Sparkles className="w-4 h-4 text-emerald-500" />
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t("home.roulette.subtitle")}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={t("home.roulette.close")}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 text-center">
          {currentDisplay && localized ? (
            <div className="space-y-5">
              {/* Card preview */}
              <div
                className={`relative h-64 rounded-2xl overflow-hidden shadow-lg transition-all duration-150 border ${
                  spinning
                    ? "scale-[0.98] border-emerald-400/50 dark:border-emerald-500/50"
                    : "scale-100 border-emerald-500 ring-2 ring-emerald-500/20"
                }`}
              >
                <LazyImage
                  src={currentDisplay.heroImage}
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
                  <div className="absolute top-3 left-3 bg-emerald-500 text-white font-extrabold text-xs px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1.5 animate-bounce">
                    <Trophy className="w-3.5 h-3.5" />
                    <span>{t("home.roulette.match")}</span>
                  </div>
                )}

                {/* Destination info */}
                <div className="absolute bottom-4 left-4 right-4 text-left text-white">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-white/20 backdrop-blur-sm">
                      {formatPrefecture(currentDisplay.prefecture, locale)}
                    </span>
                    {bestTransport && (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/80 backdrop-blur-sm flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatTransportTime(bestTransport.timeRange)}
                      </span>
                    )}
                  </div>
                  <h3 className="text-2xl font-extrabold line-clamp-1">
                    {localized.name}
                  </h3>
                  <p className="text-xs text-slate-200 line-clamp-1 mt-0.5">
                    {currentDisplay.description}
                  </p>
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
                  <Link
                    to={`/destinations/${winner.id}`}
                    onClick={onClose}
                    className="flex-1"
                  >
                    <Button className="w-full h-12 rounded-2xl font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/25">
                      <span>{t("home.roulette.viewDestination")}</span>
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <div className="py-12 text-slate-400">
              <MapPin className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p>{t("home.roulette.empty")}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
