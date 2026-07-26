import React from "react";
import { Bookmark } from "lucide-react";
import { useTripStore } from "@/shared/hooks/useTripStore";
import { toast } from "sonner";

interface BucketListButtonProps {
  destinationId: string;
  destinationName?: string;
  variant?: "circle" | "button" | "hero";
  className?: string;
}

export function BucketListButton({
  destinationId,
  destinationName,
  variant = "circle",
  className = "",
}: BucketListButtonProps) {
  const { isFavorite, toggleFavorite } = useTripStore();
  const active = isFavorite(destinationId);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    toggleFavorite(destinationId);

    if (!active) {
      toast.success(
        `Added ${destinationName ? `"${destinationName}"` : "destination"} to your Bucket List!`,
        {
          icon: "🔖",
          description: "View anytime from your Passport & Profile.",
        },
      );
    } else {
      toast.info(
        `Removed ${destinationName ? `"${destinationName}"` : "destination"} from Bucket List`,
      );
    }
  };

  if (variant === "button") {
    return (
      <button
        onClick={handleClick}
        aria-label={active ? "Remove from bucket list" : "Add to bucket list"}
        title={active ? "On Bucket List" : "Want to Visit"}
        className={`px-4 py-2 rounded-xl flex items-center gap-2 font-semibold text-sm transition-all active:scale-95 shadow-sm border ${
          active
            ? "bg-rose-500 hover:bg-rose-600 text-white border-rose-400"
            : "bg-slate-900/60 hover:bg-slate-900 text-white border-white/20 backdrop-blur-md"
        } ${className}`}
      >
        <Bookmark className={`w-4 h-4 ${active ? "fill-current" : ""}`} />
        <span>{active ? "On Bucket List" : "Bucket List"}</span>
      </button>
    );
  }

  if (variant === "hero") {
    return (
      <button
        onClick={handleClick}
        aria-label={active ? "Remove from bucket list" : "Add to bucket list"}
        title={active ? "On Bucket List" : "Want to Visit"}
        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-95 backdrop-blur-md border ${
          active
            ? "bg-rose-500 text-white border-rose-400 shadow-md"
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
      aria-label={active ? "Remove from bucket list" : "Add to bucket list"}
      title={active ? "On Bucket List" : "Want to Visit"}
      className={`p-2 bg-white/70 hover:bg-white dark:bg-slate-900/70 dark:hover:bg-slate-900 backdrop-blur-sm rounded-full transition-all active:scale-95 duration-150 shadow-sm text-slate-700 dark:text-slate-200 ${
        active ? "!bg-rose-500 !text-white !border-rose-400" : ""
      } ${className}`}
    >
      <Bookmark
        className={`w-5 h-5 ${active ? "fill-current text-white" : ""}`}
      />
    </button>
  );
}
