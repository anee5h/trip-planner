import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";
import type { SearchGroup, SearchDocument } from "./types";
import { SearchResults } from "./SearchResults";

interface SearchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  query: string;
  onQueryChange: (q: string) => void;
  groups: SearchGroup[];
  flatItems: SearchDocument[];
  selectedIndex: number;
  onSelect: (item: SearchDocument) => void;
  onHoverIndex: (index: number) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

export function SearchDialog({
  isOpen,
  onClose,
  query,
  onQueryChange,
  groups,
  flatItems,
  selectedIndex,
  onSelect,
  onHoverIndex,
  onKeyDown,
}: SearchDialogProps) {
  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-4 sm:pt-16 p-3 sm:p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity animate-in fade-in duration-150"
        onClick={onClose}
      />

      {/* Command Palette Card */}
      <div className="relative w-full max-w-2xl max-h-[85vh] bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden animate-in fade-in zoom-in-95 duration-150 z-10 flex flex-col">
        {/* Header Search Bar */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <Search className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search destinations, collections, actions... (e.g., 'Kyoto', 'UNESCO')"
            className="w-full bg-transparent text-sm md:text-base font-semibold text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none"
          />
          {query && (
            <button
              onClick={() => onQueryChange("")}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="text-xs font-bold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors shrink-0"
          >
            ESC
          </button>
        </div>

        {/* Results Container */}
        <div className="p-3 overflow-y-auto flex-1 min-h-0">
          <SearchResults
            groups={groups}
            flatItems={flatItems}
            selectedIndex={selectedIndex}
            onSelect={onSelect}
            onHoverIndex={onHoverIndex}
          />
        </div>

        {/* Footer Shortcut Hints */}
        <div className="px-5 py-2.5 bg-slate-50 dark:bg-slate-950/60 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 font-mono text-[10px]">
                ↑↓
              </kbd>{" "}
              Navigate
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 font-mono text-[10px]">
                ↵
              </kbd>{" "}
              Select
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 font-mono text-[10px]">
                ESC
              </kbd>{" "}
              Close
            </span>
          </div>
          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
            TabiMap Command Palette
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
