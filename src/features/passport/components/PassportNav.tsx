import { PASSPORT_SECTIONS } from "../constants";
import type { PassportTab } from "../types";
import { ScrollContainer } from "@/shared/components/ui/ScrollContainer";

interface PassportNavProps {
  activeTab: PassportTab;
  onSelectTab: (tab: PassportTab) => void;
}

export function PassportNav({ activeTab, onSelectTab }: PassportNavProps) {
  return (
    <div className="sticky top-16 z-30 bg-background/95 backdrop-blur-md py-3 border-b border-slate-200/80 dark:border-slate-800/80">
      <ScrollContainer className="flex items-center gap-2.5 py-0.5 pr-5">
        {PASSPORT_SECTIONS.map((section) => {
          const isActive = activeTab === section.id;
          const Icon = section.icon;
          return (
            <button
              key={section.id}
              onClick={() => onSelectTab(section.id)}
              className={`flex items-center gap-2.5 px-5 h-11 rounded-2xl font-bold text-sm shrink-0 transition-all duration-200 snap-start ${
                isActive
                  ? "bg-emerald-600 dark:bg-emerald-500 text-white shadow-md shadow-emerald-500/20 ring-2 ring-emerald-500/30"
                  : "bg-slate-100/80 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 hover:bg-slate-200/80 dark:hover:bg-slate-700/80 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <Icon
                className={`w-4 h-4 ${isActive ? "text-white" : "text-slate-500 dark:text-slate-400"}`}
              />
              <span>{section.label}</span>
            </button>
          );
        })}
      </ScrollContainer>
    </div>
  );
}
