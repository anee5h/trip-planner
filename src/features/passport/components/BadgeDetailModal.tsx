import type { Badge } from "../types/badge";
import { BadgeIllustration } from "./BadgeIllustration";
import { X, CheckCircle2, Lock, Star } from "lucide-react";
import { Button } from "@/shared/components/ui/button";

interface BadgeDetailModalProps {
  badge: Badge | null;
  isUnlocked: boolean;
  earnedAt?: string;
  isFavorite?: boolean;
  onToggleFavorite?: (badgeId: string) => void;
  onClose: () => void;
}

export function BadgeDetailModal({
  badge,
  isUnlocked,
  earnedAt,
  isFavorite = false,
  onToggleFavorite,
  onClose,
}: BadgeDetailModalProps) {
  if (!badge) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-6 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Large Circular Pin Emblem */}
        <div className="pt-2 flex justify-center">
          <BadgeIllustration
            illustrationId={badge.illustrationId}
            rarity={badge.rarity}
            isUnlocked={isUnlocked}
            size="xl"
          />
        </div>

        {/* Title & Category Badge */}
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2">
            <span className="text-[11px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              {badge.categoryLabel}
            </span>
            <span className="text-[11px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              {badge.rarity}
            </span>
          </div>

          <h3 className="text-xl font-extrabold text-slate-900 dark:text-white">
            {badge.name}
          </h3>
        </div>

        {/* Unlocked Status Banner */}
        {isUnlocked ? (
          <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-bold flex items-center justify-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span>
              Unlocked {earnedAt ? `on ${earnedAt}` : "in Travel History"}
            </span>
          </div>
        ) : (
          <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-xs font-semibold flex items-center justify-center gap-2">
            <Lock className="w-4 h-4" />
            <span>Locked — Complete criteria to earn</span>
          </div>
        )}

        {/* Description & How to Earn */}
        <div className="space-y-3 text-left p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
          <div>
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
              Description
            </span>
            <p className="text-xs text-slate-700 dark:text-slate-300 font-medium leading-relaxed">
              {badge.description}
            </p>
          </div>

          <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
              How to Earn
            </span>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 font-bold">
              {badge.howToEarn}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex gap-3">
          {isUnlocked && onToggleFavorite && (
            <Button
              variant="outline"
              onClick={() => onToggleFavorite(badge.id)}
              className="flex-1 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 border-slate-200 dark:border-slate-700"
            >
              <Star
                className={`w-3.5 h-3.5 ${isFavorite ? "fill-amber-500 text-amber-500" : ""}`}
              />
              {isFavorite ? "Remove from Showcase" : "Add to Showcase"}
            </Button>
          )}
          <Button
            onClick={onClose}
            className="flex-1 bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 rounded-2xl text-xs font-bold"
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
