import React from "react";
import { Bookmark } from "lucide-react";
import { useTripStore } from "@/shared/hooks/useTripStore";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

interface BucketListButtonProps {
  destinationId: string;
  destinationName?: string;
  variant?: "circle" | "button" | "chip" | "hero";
  className?: string;
  addLabel?: string;
  removeLabel?: string;
}

export function BucketListButton({
  destinationId,
  destinationName,
  variant = "circle",
  className = "",
  addLabel,
  removeLabel,
}: BucketListButtonProps) {
  const { t } = useTranslation();
  const { isFavorite, toggleFavorite, canMutateProfile } = useTripStore();
  const active = isFavorite(destinationId);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    toggleFavorite(destinationId);

    if (!active) {
      toast.success(
        `${destinationName || t("ui.destinations")} — ${t("ui.onBucketList")}`,
        {
          icon: "🔖",
          description: "View anytime from your Passport & Profile.",
        },
      );
    } else {
      toast.info(
        `${destinationName || t("ui.destinations")} — ${t("ui.bucketList")}`,
      );
    }
  };

  const currentTitle = active
    ? removeLabel || t("ui.onBucketList")
    : addLabel || t("ui.bucketList");
  const currentAriaLabel = active
    ? removeLabel || "Remove from bucket list"
    : addLabel || "Add to bucket list";

  if (variant === "button") {
    return (
      <button
        onClick={handleClick}
        disabled={!canMutateProfile}
        aria-pressed={active}
        aria-label={currentAriaLabel}
        title={currentTitle}
        className={`px-4 py-2 rounded-xl flex items-center gap-2 font-semibold text-sm transition-all active:scale-95 shadow-sm border ${
          active
            ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
            : "bg-slate-900/60 hover:bg-slate-900 text-white border-white/20 backdrop-blur-md"
        } ${className}`}
      >
        <Bookmark className={`w-4 h-4 ${active ? "fill-current" : ""}`} />
        <span>{currentTitle}</span>
      </button>
    );
  }

  if (variant === "chip") {
    return (
      <button
        onClick={handleClick}
        disabled={!canMutateProfile}
        aria-pressed={active}
        aria-label={currentAriaLabel}
        title={currentTitle}
        className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all active:scale-95 border backdrop-blur-md ${
          active
            ? "bg-emerald-700 text-white border-emerald-400 shadow-md"
            : "bg-white/15 hover:bg-white/25 text-slate-100 border-white/20"
        } ${className}`}
      >
        <Bookmark
          className={`size-4 shrink-0 ${active ? "fill-current" : ""}`}
        />
        <span>{currentTitle}</span>
      </button>
    );
  }

  if (variant === "hero") {
    return (
      <button
        onClick={handleClick}
        disabled={!canMutateProfile}
        aria-pressed={active}
        aria-label={currentAriaLabel}
        title={currentTitle}
        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-95 backdrop-blur-md border ${
          active
            ? "border-emerald-200 bg-white/90 text-emerald-500 shadow-md"
            : "bg-white/15 hover:bg-white/25 text-slate-100 border-white/20"
        } ${className}`}
      >
        <Bookmark className={`w-4 h-4 ${active ? "fill-current" : ""}`} />
      </button>
    );
  }

  // Default circle variant
  return (
    <button
      onClick={handleClick}
      disabled={!canMutateProfile}
      aria-pressed={active}
      aria-label={currentAriaLabel}
      title={currentTitle}
      className={`flex items-center justify-center p-2 bg-white/70 hover:bg-white dark:bg-slate-900/70 dark:hover:bg-slate-900 backdrop-blur-sm rounded-full transition-all active:scale-95 duration-150 shadow-sm text-slate-700 dark:text-slate-200 ${
        active ? "!bg-white/90 !text-emerald-500 !border-emerald-200" : ""
      } ${className}`}
    >
      <Bookmark
        className={`h-5 w-5 ${active ? "fill-current text-emerald-500" : ""}`}
      />
    </button>
  );
}
