import {
  Train,
  Car,
  Footprints,
  Mountain,
  Flame,
  Utensils,
  Camera,
  Palette,
  Landmark,
  Compass,
  Sun,
  Sparkles,
  MapPin,
  Trophy,
  Trees,
  Snowflake,
  Flower2,
  Crown,
} from "lucide-react";
import type { BadgeRarity } from "../types/badge";

interface BadgeIllustrationProps {
  illustrationId: string;
  rarity: BadgeRarity;
  isUnlocked: boolean;
  size?: "sm" | "md" | "lg" | "xl";
}

const ICON_MAP: Record<string, React.ElementType> = {
  "rail-traveler": Train,
  "road-tripper": Car,
  "city-walker": Footprints,
  "hiking-explorer": Mountain,
  "onsen-lover": Flame,
  "food-explorer": Utensils,
  photographer: Camera,
  "museum-enthusiast": Palette,
  "castle-enthusiast": Landmark,
  "shrine-explorer": Compass,
  "fuji-explorer": Mountain,
  "kansai-nomad": MapPin,
  "kanto-local": Sun,
  "island-hopper": Trees,
  "snow-traveler": Snowflake,
  "sakura-hunter": Flower2,
  "autumn-explorer": Trees,
  "first-step": Footprints,
  traveler: Compass,
  explorer: Sparkles,
  voyager: Trophy,
  "scenic-chaser": Trees,
  "japan-complete": Crown,
};

const RARITY_RING_CLASSES: Record<BadgeRarity, string> = {
  common:
    "border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800",
  rare: "border-blue-400 dark:border-blue-600 bg-blue-50/50 dark:bg-blue-950/40 ring-2 ring-blue-400/30",
  epic: "border-purple-400 dark:border-purple-600 bg-purple-50/50 dark:bg-purple-950/40 ring-2 ring-purple-400/40 shadow-purple-500/20",
  legendary:
    "border-amber-400 dark:border-amber-500 bg-amber-100/60 dark:bg-amber-950/60 ring-4 ring-amber-400/50 shadow-lg shadow-amber-500/30",
};

const SIZE_CLASSES = {
  sm: "w-12 h-12 text-sm",
  md: "w-16 h-16 text-base",
  lg: "w-24 h-24 text-xl",
  xl: "w-32 h-32 text-3xl",
};

const ICON_SIZES = {
  sm: "w-5 h-5",
  md: "w-7 h-7",
  lg: "w-10 h-10",
  xl: "w-14 h-14",
};

export function BadgeIllustration({
  illustrationId,
  rarity,
  isUnlocked,
  size = "md",
}: BadgeIllustrationProps) {
  const IconComponent = ICON_MAP[illustrationId] || Sparkles;
  const ringStyle = RARITY_RING_CLASSES[rarity];
  const dimensionClass = SIZE_CLASSES[size];
  const iconSizeClass = ICON_SIZES[size];

  return (
    <div className="relative inline-flex items-center justify-center shrink-0">
      {/* Outer Metallic Enamel Ring */}
      <div
        className={`rounded-full border-4 flex items-center justify-center transition-all duration-300 ${dimensionClass} ${
          isUnlocked
            ? ringStyle
            : "border-slate-200 dark:border-slate-800 bg-slate-100/40 dark:bg-slate-900/40 grayscale opacity-40"
        }`}
      >
        {/* Inner Emblem Decorative Circle */}
        <div
          className={`w-4/5 h-4/5 rounded-full flex items-center justify-center transition-transform duration-300 ${
            isUnlocked
              ? rarity === "legendary"
                ? "bg-gradient-to-tr from-amber-500 to-yellow-300 text-slate-950 shadow-inner"
                : rarity === "epic"
                  ? "bg-gradient-to-tr from-purple-600 to-indigo-400 text-white"
                  : rarity === "rare"
                    ? "bg-gradient-to-tr from-blue-600 to-sky-400 text-white"
                    : "bg-gradient-to-tr from-emerald-600 to-teal-400 text-white"
              : "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
          }`}
        >
          <IconComponent className={iconSizeClass} />
        </div>
      </div>
    </div>
  );
}
