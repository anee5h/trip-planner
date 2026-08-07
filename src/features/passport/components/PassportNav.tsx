import { PASSPORT_SECTIONS } from "../constants";
import type { PassportTab } from "../types";
import { ScrollContainer } from "@/shared/components/ui/ScrollContainer";
import { useTranslation } from "react-i18next";

interface PassportNavProps {
  activeTab: PassportTab;
  onSelectTab: (tab: PassportTab) => void;
}

export function PassportNav({ activeTab, onSelectTab }: PassportNavProps) {
  const { t } = useTranslation();
  const labels = {
    overview: t("ui.overview"),
    "japan-map": t("ui.japanMap"),
    timeline: t("ui.timeline"),
    achievements: t("ui.achievements"),
    badges: t("ui.badges"),
    statistics: t("ui.statistics"),
  } as const;
  return (
    <div className="sticky top-16 z-30 bg-background/95 backdrop-blur-md py-2 border-b border-slate-200/80 dark:border-slate-800/80">
      <ScrollContainer className="flex items-center gap-1.5 py-0.5 pr-5">
        {PASSPORT_SECTIONS.map((section) => {
          const isActive = activeTab === section.id;
          const Icon = section.icon;
          return (
            <button
              key={section.id}
              onClick={() => onSelectTab(section.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg font-bold text-sm shrink-0 transition-all ${
                isActive
                  ? "bg-emerald-600 dark:bg-emerald-500 text-white shadow-sm"
                  : "bg-slate-100/80 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 hover:bg-slate-200/80 dark:hover:bg-slate-700/80"
              }`}
            >
              <Icon
                className={`w-4 h-4 ${isActive ? "text-white" : "text-slate-500 dark:text-slate-400"}`}
              />
              <span>{labels[section.id]}</span>
            </button>
          );
        })}
      </ScrollContainer>
    </div>
  );
}
