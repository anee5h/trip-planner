import {
  Castle,
  Landmark,
  ShieldAlert,
  Trees,
  Crown,
  Flame,
  Building,
  Sparkles,
  Tag,
} from "lucide-react";
import type { Collection } from "@/shared/types/collection";

const ICON_MAP: Record<string, React.ElementType> = {
  Castle,
  Landmark,
  ShieldAlert,
  Trees,
  Crown,
  Flame,
  Building,
  Sparkles,
};

const SUBTLE_COLOR_CLASSES: Record<string, string> = {
  amber:
    "bg-amber-500/15 text-amber-900 dark:text-amber-200 border-amber-500/40 hover:bg-amber-500/25",
  sky: "bg-sky-500/15 text-sky-900 dark:text-sky-200 border-sky-500/40 hover:bg-sky-500/25",
  rose: "bg-rose-500/15 text-rose-900 dark:text-rose-200 border-rose-500/40 hover:bg-rose-500/25",
  emerald:
    "bg-emerald-500/15 text-emerald-900 dark:text-emerald-200 border-emerald-500/40 hover:bg-emerald-500/25",
  purple:
    "bg-purple-500/15 text-purple-900 dark:text-purple-200 border-purple-500/40 hover:bg-purple-500/25",
};

const SOLID_COLOR_CLASSES: Record<string, string> = {
  amber:
    "bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold border-amber-300 shadow-md",
  sky: "bg-sky-600 hover:bg-sky-700 text-white font-extrabold border-sky-300 shadow-md",
  rose: "bg-rose-600 hover:bg-rose-700 text-white font-extrabold border-rose-300 shadow-md",
  emerald:
    "bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold border-emerald-300 shadow-md",
  purple:
    "bg-purple-600 hover:bg-purple-700 text-white font-extrabold border-purple-300 shadow-md",
};

import { useLocale } from "@/shared/context/LocaleContext";
import { getCollectionContent } from "@/shared/utils/collections";

interface CollectionBadgeProps {
  collection: Collection;
  className?: string;
  size?: "sm" | "md";
  variant?: "subtle" | "solid";
  locale?: "en" | "ja";
}

/**
 * Pure presentation-only badge for displaying a curated collection badge.
 */
export default function CollectionBadge({
  collection,
  className = "",
  size = "sm",
  variant = "subtle",
  locale: propLocale,
}: CollectionBadgeProps) {
  const { locale: contextLocale } = useLocale();
  const currentLocale = propLocale || contextLocale || "en";
  const content = getCollectionContent(collection, currentLocale);

  const Icon = ICON_MAP[collection.icon] || Tag;
  const stylesMap =
    variant === "solid" ? SOLID_COLOR_CLASSES : SUBTLE_COLOR_CLASSES;
  const colorStyle = stylesMap[collection.badgeColor] || stylesMap.amber;

  const sizeStyle =
    size === "sm"
      ? "text-[11px] px-2 py-0.5 gap-1 font-semibold"
      : "text-xs px-2.5 py-1 gap-1.5 font-bold";

  const iconSize = size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5";

  return (
    <span
      aria-label={`Collection: ${content.name}`}
      className={`inline-flex items-center rounded-full border transition-all whitespace-nowrap shrink-0 max-w-full ${colorStyle} ${sizeStyle} ${className}`}
    >
      <Icon className={`${iconSize} shrink-0`} aria-hidden="true" />
      <span className="truncate">{content.name}</span>
    </span>
  );
}
