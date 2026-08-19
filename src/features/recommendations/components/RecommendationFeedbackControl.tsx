import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { ThumbsUp, ThumbsDown, X, CheckCircle2 } from "lucide-react";
import { recommendationAnalytics } from "@/shared/services/analytics/RecommendationAnalyticsService";

interface RecommendationFeedbackControlProps {
  destinationId: string;
  reasonCodes?: string[];
  onDismiss?: (destinationId: string) => void;
  compact?: boolean;
}

export const RecommendationFeedbackControl: React.FC<
  RecommendationFeedbackControlProps
> = ({ destinationId, reasonCodes, onDismiss, compact = false }) => {
  const { t, i18n } = useTranslation();
  const [feedbackState, setFeedbackState] = useState<
    "none" | "helpful" | "unhelpful" | "dismissed"
  >("none");

  const currentLocale = (
    i18n.language?.substring(0, 2) === "ja" ? "ja" : "en"
  ) as "en" | "ja";

  const handleFeedback = (isHelpful: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    const newState = isHelpful ? "helpful" : "unhelpful";
    setFeedbackState(newState);
    recommendationAnalytics.trackFeedback(
      destinationId,
      isHelpful,
      reasonCodes,
      currentLocale,
    );
  };

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    setFeedbackState("dismissed");
    recommendationAnalytics.trackDismiss(
      destinationId,
      reasonCodes,
      currentLocale,
    );
    if (onDismiss) {
      onDismiss(destinationId);
    }
  };

  if (feedbackState === "dismissed") {
    return null;
  }

  if (feedbackState !== "none") {
    return (
      <div className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300 font-medium py-1 px-2 rounded bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/50 dark:border-emerald-800/40">
        <CheckCircle2 className="w-3.5 h-3.5" />
        <span>{t("recommendation.feedback.thankYou")}</span>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-between text-xs text-slate-500 dark:text-slate-300 ${
        compact
          ? "gap-1"
          : "gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/60 mt-2"
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      <span className="text-[11px] font-medium text-slate-500 dark:text-slate-300">
        {t("recommendation.feedback.title")}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={(e) => handleFeedback(true, e)}
          title={t("recommendation.feedback.helpful")}
          aria-label={t("recommendation.feedback.helpful")}
          className="p-1 rounded hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors"
        >
          <ThumbsUp className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={(e) => handleFeedback(false, e)}
          title={t("recommendation.feedback.unhelpful")}
          aria-label={t("recommendation.feedback.unhelpful")}
          className="p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
        >
          <ThumbsDown className="w-3.5 h-3.5" />
        </button>
        {onDismiss && (
          <button
            type="button"
            onClick={handleDismiss}
            title={t("recommendation.feedback.dismiss")}
            aria-label={t("recommendation.feedback.dismiss")}
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
