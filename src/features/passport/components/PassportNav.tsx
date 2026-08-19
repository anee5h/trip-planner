import { PASSPORT_SECTIONS } from "../constants";
import type { PassportTab } from "../types";
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
      {/* Mobile: icon-only tabs except the active one; sm+: icon + label. No scrolling. */}
      <div className="flex items-center gap-1.5">
        {PASSPORT_SECTIONS.map((section) => {
          const isActive = activeTab === section.id;
          const Icon = section.icon;
          const label = labels[section.id];
          return (
            <button
              key={section.id}
              onClick={() => onSelectTab(section.id)}
              title={label}
              aria-label={label}
              className={`flex items-center justify-center gap-1.5 px-3.5 py-2.5 sm:py-2 min-h-[44px] sm:min-h-[36px] rounded-xl font-bold text-xs sm:text-sm shrink-0 transition-all ${
                isActive
                  ? "bg-emerald-700 dark:bg-emerald-500 text-white shadow-sm"
                  : "bg-slate-100/80 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 hover:bg-slate-200/80 dark:hover:bg-slate-700/80"
              }`}
            >
              <Icon
                className={`w-4 h-4 ${isActive ? "text-white" : "text-slate-600 dark:text-slate-300"}`}
                aria-hidden="true"
              />
              <span className="hidden sm:inline">{label}</span>
              {isActive && <span className="sm:hidden">{label}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
