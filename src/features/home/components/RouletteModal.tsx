import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import type { Destination } from "@/shared/types/destination";
import { Button } from "@/shared/components/ui/button";
import {
  Dices,
  Sparkles,
  MapPin,
  Star,
  ArrowRight,
  X,
  Compass,
} from "lucide-react";

import { getAdjustedBudget } from "@/shared/utils/utils";
import { getValidModes } from "@/shared/services/recommendation/RecommendationService";

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
  carMode = "none",
  publicModes = ["train"],
}: RouletteModalProps) {
  const [spinning, setSpinning] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [winner, setWinner] = useState<Destination | null>(null);

  const startSpin = () => {
    if (candidates.length === 0) return;
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
        setTimeout(tick, nextDelay);
      }
    };

    setTimeout(tick, 50);
  };

  useEffect(() => {
    if (isOpen && candidates.length > 0) {
      startSpin();
    }
  }, [isOpen, candidates]);

  if (!isOpen) return null;

  const currentDisplay = spinning
    ? candidates[currentIndex]
    : winner || candidates[0];

  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="relative bg-gradient-to-r from-emerald-600 to-teal-700 p-6 text-white text-center">
          <button
            onClick={onClose}
            className="absolute right-4 top-4 text-white/80 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-white/20 backdrop-blur-md mb-2 shadow-inner">
            <Dices
              className={`w-6 h-6 text-amber-300 ${spinning ? "animate-spin" : ""}`}
            />
          </div>
          <h2 className="text-2xl font-extrabold tracking-tight">
            Destination Roulette
          </h2>
          <p className="text-xs text-emerald-100 mt-1 font-medium">
            {spinning
              ? "Shuffling destinations based on your filters..."
              : "Your random adventure has been chosen!"}
          </p>
        </div>

        {/* Content Body */}
        <div className="p-6">
          {candidates.length === 0 ? (
            <div className="text-center py-8">
              <Compass className="w-12 h-12 text-slate-400 mx-auto mb-3 animate-bounce" />
              <p className="text-slate-600 dark:text-slate-400 font-semibold text-sm">
                No unvisited destinations match your current filters.
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                Try expanding your budget or transport options!
              </p>
            </div>
          ) : (
            <div>
              {/* Destination Card Container */}
              <div
                className={`relative rounded-2xl overflow-hidden border transition-all duration-300 ${
                  spinning
                    ? "border-emerald-300 dark:border-emerald-800 scale-[0.98]"
                    : "border-emerald-500/50 shadow-lg shadow-emerald-500/10 scale-100"
                }`}
              >
                {/* Hero Image */}
                <div className="relative h-48 w-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  {currentDisplay?.heroImage ? (
                    <img
                      src={currentDisplay.heroImage}
                      alt={currentDisplay.name}
                      className="w-full h-full object-cover transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400">
                      <MapPin className="w-8 h-8 opacity-50" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                  {/* Badge */}
                  <div className="absolute top-3 left-3 bg-emerald-600 text-white text-[11px] font-bold px-2.5 py-1 rounded-full shadow-md flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    <span>
                      {spinning
                        ? "Spinning..."
                        : (currentDisplay as any).match
                          ? `${(currentDisplay as any).match.confidence}% Match`
                          : "Surprise Match"}
                    </span>
                  </div>

                  {/* Rating */}
                  <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-md text-amber-300 text-xs font-extrabold px-2.5 py-1 rounded-full flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 fill-amber-300 text-amber-300" />
                    <span>
                      {currentDisplay?.ratings?.overall?.toFixed(1) || "4.5"}
                    </span>
                  </div>

                  {/* Title overlay */}
                  <div className="absolute bottom-3 left-4 right-4 text-white">
                    <p className="text-xs font-semibold text-emerald-300 uppercase tracking-wider">
                      {currentDisplay?.prefecture} Prefecture
                    </p>
                    <h3 className="text-xl font-extrabold leading-tight drop-shadow-md">
                      {currentDisplay?.name}
                    </h3>
                  </div>
                </div>

                {/* Details snippet */}
                <div className="p-4 bg-slate-50 dark:bg-slate-800/60 space-y-2">
                  <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
                    {currentDisplay?.description}
                  </p>

                  <div className="flex items-center justify-between text-xs pt-1 text-slate-500 dark:text-slate-400 border-t border-slate-200/60 dark:border-slate-700/60">
                    <span>
                      Est. Budget:{" "}
                      <strong className="text-emerald-600 dark:text-emerald-400">
                        ¥
                        {(currentDisplay
                          ? getAdjustedBudget(
                              currentDisplay,
                              getValidModes(
                                currentDisplay,
                                carMode,
                                publicModes,
                              )[0] || "train",
                              partySize,
                            )
                          : 15000
                        ).toLocaleString()}
                      </strong>
                    </span>
                    <span>
                      Vibe:{" "}
                      <strong className="text-slate-700 dark:text-slate-200 font-medium">
                        {currentDisplay?.categories?.[0] || "Scenic"}
                      </strong>
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 mt-5">
                <Button
                  variant="outline"
                  onClick={startSpin}
                  disabled={spinning}
                  className="flex-1 h-11 rounded-xl font-bold border-slate-200 dark:border-slate-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400"
                >
                  <Dices
                    className={`w-4 h-4 mr-2 ${spinning ? "animate-spin" : ""}`}
                  />
                  Spin Again
                </Button>

                {winner && !spinning && (
                  <Link
                    to={`/destinations/${winner.id}`}
                    state={{ carMode, publicModes, partySize }}
                    onClick={onClose}
                    className="flex-1"
                  >
                    <Button className="w-full h-11 rounded-xl font-bold bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-md">
                      View Details
                      <ArrowRight className="w-4 h-4 ml-1.5" />
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
