import type { SearchGroup, SearchDocument } from "./types";
import { Icons } from "@/shared/icons";

interface SearchResultsProps {
  groups: SearchGroup[];
  flatItems: SearchDocument[];
  selectedIndex: number;
  onSelect: (item: SearchDocument) => void;
  onHoverIndex: (index: number) => void;
  /** Allows parent dialogs to own the sole scroll region. */
  containerClassName?: string;
}

export function SearchResults({
  groups,
  flatItems,
  selectedIndex,
  onSelect,
  onHoverIndex,
  containerClassName = "py-2 space-y-5 max-h-[60vh] overflow-y-auto pr-1 scrollbar-thin",
}: SearchResultsProps) {
  const EnterIcon = Icons.enter;
  const ArrowRightIcon = Icons.arrowRight;

  if (flatItems.length === 0) {
    return (
      <div className="py-12 text-center space-y-2">
        <p className="text-sm font-bold text-slate-800 dark:text-white">
          No matching results found
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
          Try searching for a prefecture (e.g., "Kyoto"), sight ("Himeji"), or
          collection ("UNESCO").
        </p>
      </div>
    );
  }

  let cumulativeIndex = 0;

  return (
    <div className={containerClassName}>
      {groups.map((group, groupIndex) => {
        const groupStartIndex = cumulativeIndex;
        cumulativeIndex += group.items.length;

        return (
          <div key={group.type} className="space-y-2">
            {groupIndex > 0 && (
              <div className="border-t border-slate-100 dark:border-slate-800/80 my-2" />
            )}

            <div className="px-3.5 py-1 text-[11px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-2">
              <span>{group.label}</span>
            </div>

            <div className="space-y-1.5">
              {group.items.map((item, itemIdx) => {
                const globalIndex = groupStartIndex + itemIdx;
                const isSelected = globalIndex === selectedIndex;
                const ItemIcon = item.icon;

                return (
                  <button
                    key={item.id}
                    onClick={() => onSelect(item)}
                    onMouseEnter={() => onHoverIndex(globalIndex)}
                    className={`w-full flex items-center justify-between py-3.5 px-4 rounded-2xl transition-all text-left group ${
                      isSelected
                        ? "bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 shadow-sm"
                        : "hover:bg-slate-100/80 dark:hover:bg-slate-800/60 border border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      {ItemIcon && (
                        <div
                          className={`p-2.5 rounded-xl shrink-0 transition-transform ${
                            isSelected
                              ? "bg-emerald-600 text-white scale-105"
                              : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 group-hover:scale-105"
                          }`}
                        >
                          <ItemIcon className="w-4 h-4" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div
                          className={`text-xs md:text-sm font-bold truncate ${
                            isSelected
                              ? "text-emerald-950 dark:text-emerald-300"
                              : "text-slate-900 dark:text-white"
                          }`}
                        >
                          {item.title}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {item.subtitle}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      {item.badge && (
                        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-transparent text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700/60">
                          {item.badge}
                        </span>
                      )}
                      {isSelected ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                          <EnterIcon className="w-3.5 h-3.5" />
                        </span>
                      ) : (
                        <ArrowRightIcon className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
