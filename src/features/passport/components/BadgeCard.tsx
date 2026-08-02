import type { Badge } from "../types/badge";
import { BadgeIllustration } from "./BadgeIllustration";
import { Star, CheckCircle2, Lock } from "lucide-react";

interface BadgeCardProps {
  badge: Badge;
  isUnlocked: boolean;
  earnedAt?: string;
  isFavorite?: boolean;
  onToggleFavorite?: (badgeId: string) => void;
  onClick: (badge: Badge) => void;
}

const RARITY_LABELS: Record<Badge["rarity"], { label: string; style: string }> =
  {
    common: {
      label: "Common",
      style:
        "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700",
    },
    rare: {
      label: "Rare",
      style:
        "bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
    },
    epic: {
      label: "Epic",
      style:
        "bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800",
    },
    legendary: {
      label: "Legendary",
      style:
        "bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700 font-extrabold",
    },
  };

export function BadgeCard({
  badge,
  isUnlocked,
  earnedAt,
  isFavorite = false,
  onToggleFavorite,
  onClick,
}: BadgeCardProps) {
  const rarityConfig = RARITY_LABELS[badge.rarity];

  return (
    <div
      onClick={() => onClick(badge)}
      title={isUnlocked && earnedAt ? `Unlocked on ${earnedAt}` : undefined}
      className={`group relative flex flex-col items-center text-center p-4 rounded-2xl transition-all duration-300 cursor-pointer border ${
        isUnlocked
          ? "bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-md hover:-translate-y-0.5"
          : "bg-slate-50/50 dark:bg-slate-900/40 border-slate-200/40 dark:border-slate-800/40 opacity-75 hover:opacity-100"
      }`}
    >
      {/* Showcase Favorite Toggle Button */}
      {isUnlocked && onToggleFavorite && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(badge.id);
          }}
          className={`absolute top-2.5 right-2.5 p-1.5 rounded-full transition-all ${
            isFavorite
              ? "bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
              : "bg-slate-100 dark:bg-slate-800 text-slate-400 opacity-0 group-hover:opacity-100"
          }`}
          title={isFavorite ? "Remove from Showcase" : "Add to Showcase"}
        >
          <Star
            className={`w-3.5 h-3.5 ${isFavorite ? "fill-amber-500" : ""}`}
          />
        </button>
      )}

      {/* Circular Enamel Pin Artwork */}
      <div className="mb-2">
        <BadgeIllustration
          illustrationId={badge.illustrationId}
          rarity={badge.rarity}
          isUnlocked={isUnlocked}
          size="sm"
        />
      </div>

      {/* Badge Name */}
      <h4 className="text-xs md:text-sm font-bold text-slate-900 dark:text-white mb-1 line-clamp-1">
        {badge.name}
      </h4>

      {/* Description Snippet */}
      <p className="mb-3 line-clamp-2 text-xs leading-snug text-slate-500 dark:text-slate-400">
        {badge.description}
      </p>

      {/* Footer Pill (Unlocked Date or Rarity Badge) - NO Progress Bar */}
      <div className="mt-auto flex items-center gap-1.5">
        <span
          className={`rounded-full border px-2 py-0.5 text-xs font-bold ${rarityConfig.style}`}
        >
          {rarityConfig.label}
        </span>
        {isUnlocked ? (
          <span className="inline-flex items-center gap-1 text-xs font-extrabold text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-3 h-3" /> Unlocked
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400">
            <Lock className="w-3 h-3" /> Locked
          </span>
        )}
      </div>
    </div>
  );
}
