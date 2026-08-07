import { useTripStore } from "@/shared/hooks/useTripStore";
import { Button } from "@/shared/components/ui/button";
import { Scale, Trash2, ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";

interface CompareFloatingBarProps {
  onOpenModal: () => void;
}

export default function CompareFloatingBar({
  onOpenModal,
}: CompareFloatingBarProps) {
  const { compareList, clearCompare } = useTripStore();
  const { t } = useTranslation();

  if (compareList.length === 0) return null;

  return (
    <div className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] md:bottom-6 left-1/2 -translate-x-1/2 z-40 animate-in slide-in-from-bottom-5 duration-300">
      <div className="bg-slate-900/90 dark:bg-slate-950/90 text-white border border-slate-700/60 rounded-full px-5 py-3 shadow-2xl backdrop-blur-md flex items-center gap-4">
        <div className="flex items-center gap-2 font-extrabold text-xs tracking-wide">
          <div className="p-1.5 rounded-full bg-emerald-500 text-slate-950">
            <Scale className="w-3.5 h-3.5" />
          </div>
          <span>
            {t("ui.compare")} ({compareList.length}/3)
          </span>
        </div>

        <div className="h-4 w-[1px] bg-slate-700" />

        <div className="flex items-center gap-2">
          <Button
            onClick={onOpenModal}
            size="sm"
            className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-full px-4 min-h-[44px] sm:min-h-[36px] shadow-sm flex items-center"
          >
            {t("ui.compareNow")}
            <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Button>

          <button
            onClick={clearCompare}
            className="p-2 min-h-[44px] min-w-[44px] text-slate-400 hover:text-red-400 rounded-full hover:bg-slate-800 transition-colors flex items-center justify-center"
            title={t("ui.clearCompare")}
            aria-label={t("ui.clearCompare")}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
