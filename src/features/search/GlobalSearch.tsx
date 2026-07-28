import { useRef, useState, useEffect } from "react";
import { Search, X } from "lucide-react";
import { useSearch } from "./hooks/useSearch";
import { SearchResults } from "./SearchResults";
import { SearchDialog } from "./SearchDialog";
import { useTranslation } from "react-i18next";

export function GlobalSearch() {
  const { t } = useTranslation();
  const {
    query,
    setQuery,
    isOpen,
    setIsOpen,
    groups,
    flatItems,
    selectedIndex,
    setSelectedIndex,
    selectItem,
    handleKeyDown,
  } = useSearch();

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close popover when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsPopoverOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const [shortcutLabel, setShortcutLabel] = useState("⌘K");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const isMac = /Mac|iPod|iPhone|iPad/.test(
        navigator.platform || navigator.userAgent,
      );
      setShortcutLabel(isMac ? "⌘K" : "Ctrl K");
    }
  }, []);

  return (
    <>
      {/* Desktop Search Input (Navbar Center) */}
      <div
        ref={containerRef}
        className="relative hidden lg:flex items-center flex-1 max-w-xs xl:max-w-sm ml-4 mr-6"
      >
        <div className="relative w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500 pointer-events-none stroke-[2.2]" />
          <input
            type="text"
            value={query}
            onFocus={() => setIsPopoverOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsPopoverOpen(true);
            }}
            onKeyDown={(e) => {
              handleKeyDown(e);
              if (e.key === "Enter" && flatItems[selectedIndex]) {
                setIsPopoverOpen(false);
              }
            }}
            placeholder={t("search.placeholder")}
            className="w-full h-10 pl-[42px] pr-14 rounded-2xl bg-slate-100/90 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 text-xs font-semibold text-slate-900 dark:text-white placeholder-slate-500/90 dark:placeholder-slate-400/90 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all"
          />

          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {query ? (
              <button
                onClick={() => setQuery("")}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                onClick={() => setIsOpen(true)}
                className="px-1.5 py-0.5 rounded-lg bg-slate-200/80 dark:bg-slate-700/80 text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400 border border-slate-300/60 dark:border-slate-600/60"
              >
                {shortcutLabel}
              </button>
            )}
          </div>
        </div>

        {/* Desktop Inline Results Popover */}
        {isPopoverOpen && query && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-150">
            <SearchResults
              groups={groups}
              flatItems={flatItems}
              selectedIndex={selectedIndex}
              onSelect={(item) => {
                setIsPopoverOpen(false);
                selectItem(item);
              }}
              onHoverIndex={setSelectedIndex}
            />
          </div>
        )}
      </div>

      {/* Mobile Search Icon Trigger Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="lg:hidden p-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
        aria-label={t("search.label")}
      >
        <Search className="w-5 h-5" />
      </button>

      {/* Command Palette Modal Dialog */}
      <SearchDialog
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        query={query}
        onQueryChange={setQuery}
        groups={groups}
        flatItems={flatItems}
        selectedIndex={selectedIndex}
        onSelect={selectItem}
        onHoverIndex={setSelectedIndex}
        onKeyDown={handleKeyDown}
      />
    </>
  );
}
