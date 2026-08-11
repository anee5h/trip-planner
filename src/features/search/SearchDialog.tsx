import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
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

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isMobile;
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
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const isMobile = useIsMobile();
  const inputRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();

  useEffect(() => {
    if (!isOpen) return;

    const viewport = window.visualViewport;
    if (!viewport) return;

    const updateHeight = () => setViewportHeight(viewport.height);
    updateHeight();
    viewport.addEventListener("resize", updateHeight);
    viewport.addEventListener("scroll", updateHeight);

    return () => {
      viewport.removeEventListener("resize", updateHeight);
      viewport.removeEventListener("scroll", updateHeight);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const placeholderText = isMobile
    ? t("search.placeholderMobile")
    : t("search.placeholderDesktop");

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-2 sm:pt-16 p-2 sm:p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity animate-in fade-in duration-150"
        onClick={onClose}
      />

      {/* Command Palette Card */}
      <div
        className="relative w-full max-w-2xl max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden animate-in fade-in zoom-in-95 duration-150 z-10 flex flex-col"
        style={
          viewportHeight
            ? { maxHeight: `${Math.max(viewportHeight - 16, 160)}px` }
            : undefined
        }
      >
        {/* Header Search Bar with 3-column grid layout */}
        <div className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center border-b border-slate-100 dark:border-slate-800 h-14 sm:h-16 px-1">
          {/* Col 1: Centered Search Icon in 44px tap target */}
          <div className="flex items-center justify-center w-11 h-11">
            <Search className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          </div>

          {/* Col 2: Shrinkable Input */}
          <div className="min-w-0 px-1 flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              autoFocus
              aria-label={t("search.label")}
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={placeholderText}
              className="w-full bg-transparent text-base font-semibold text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none truncate"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  onQueryChange("");
                  inputRef.current?.focus();
                }}
                aria-label={t("search.clear")}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Col 3: Close control - "Cancel" text on mobile, ESC badge on desktop.
              Distinct from the in-field clear (X) so there is exactly one X icon. */}
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={onClose}
              aria-label={t("search.close")}
              className="sm:hidden flex items-center h-9 px-3 rounded-full bg-slate-100 dark:bg-slate-800 text-sm font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              {t("search.cancel")}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("search.close")}
              className="hidden sm:flex text-xs font-bold px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors shrink-0"
            >
              ESC
            </button>
          </div>
        </div>

        {/* Results Container */}
        <div className="p-3 overflow-y-auto flex-1 min-h-0">
          <SearchResults
            groups={groups}
            flatItems={flatItems}
            selectedIndex={selectedIndex}
            onSelect={onSelect}
            onHoverIndex={onHoverIndex}
            containerClassName="py-2 space-y-5 pr-1"
          />
        </div>

        {/* Footer Shortcut Hints - Hidden on Mobile */}
        <div className="hidden sm:flex px-5 py-2.5 bg-slate-50 dark:bg-slate-950/60 border-t border-slate-100 dark:border-slate-800 items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
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
            Meguruto Command Palette
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
