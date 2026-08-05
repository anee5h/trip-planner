import { Footprints } from "lucide-react";
import { useTranslation } from "react-i18next";
import { isValidWalkability } from "@/shared/utils/ratings";

/**
 * Renders the walking-intensity comfort metric row.
 * Returns null when no intensity value exists.
 */
export function WalkingIntensityRow({
  intensity,
}: {
  intensity: number | undefined;
}) {
  const { t } = useTranslation();
  if (intensity === undefined) return null;
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-slate-500">🚶 {t("ui.walkingIntensity")}</span>
      <span className="font-semibold text-slate-700 dark:text-slate-300">
        {`${intensity}/10`}
      </span>
    </div>
  );
}

/**
 * Walkability rating item for the experience-ratings grid.
 * Only renders when walkability is a valid finite 1–10 value.
 * Returns null for missing, 0, 11, NaN, and non-numeric values.
 */
export function WalkabilityRatingItem({
  walkability,
}: {
  walkability: number | undefined | null;
}) {
  const { t } = useTranslation();
  if (!isValidWalkability(walkability)) return null;
  return (
    <div className="flex flex-col items-center text-center p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50">
      <Footprints className="w-6 h-6 text-emerald-600 mb-2" />
      <span className="text-xs text-slate-500">{t("ui.walkability")}</span>
      <span className="text-lg font-bold text-slate-700 dark:text-slate-300">
        {walkability}
        <span className="text-sm font-normal text-slate-400">/10</span>
      </span>
    </div>
  );
}
