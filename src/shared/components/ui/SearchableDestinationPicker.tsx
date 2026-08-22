import { useState, useMemo, useRef, useEffect, useId } from "react";
import type { Destination } from "@/shared/types/destination";
import { useCatalogue } from "@/shared/hooks/useCatalogue";
import { useTranslation } from "react-i18next";
import { formatPlaceName } from "@/shared/utils/placeLabels";
import {
  Search,
  MapPin,
  Check,
  X,
  Clock,
  Bookmark,
  Sparkles,
} from "lucide-react";

interface SearchableDestinationPickerProps {
  value?: string;
  onSelect: (destination: Destination) => void;
  placeholder?: string;
  locale?: "en" | "ja";
  className?: string;
  destinations?: Destination[];
  activeItineraryDestinations?: Destination[];
  savedDestinations?: Destination[];
  recentDestinations?: Destination[];
}

export function SearchableDestinationPicker({
  value,
  onSelect,
  placeholder = "Search destination or city...",
  locale = "en",
  className = "",
  destinations: customDestinations,
  activeItineraryDestinations = [],
  savedDestinations = [],
  recentDestinations = [],
}: SearchableDestinationPickerProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);
  const uniqueId = useId();
  const dialogId = `picker-dialog-${uniqueId}`;
  const listboxId = `picker-listbox-${uniqueId}`;

  const activeOptionRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const closePicker = () => setIsOpen(false);

  useEffect(() => {
    if (isOpen && activeOptionRef.current) {
      activeOptionRef.current.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex, isOpen]);

  // KAI-132: the picker is SUMMARY-ONLY — its "popular" filter reads
  // ratings (present in the lite index). The lite catalogue is
  // runtime-loaded; options render once it resolves (spinner while
  // loading). A failed load is NOT ready — surface an error/retry state.
  // When `customDestinations` is supplied, the internal loader is DISABLED
  // (enabled = customDestinations == null): the parent owns loading /
  // error / retry for that data, so parent and child retries can never
  // diverge.
  const {
    status: catalogueStatus,
    places: cataloguePlaces,
    error: liteError,
    retry: retryLite,
  } = useCatalogue({
    need: "summary",
    enabled: customDestinations == null,
  });
  const liteReady = catalogueStatus === "ready";
  const allDestinations = useMemo(
    () => customDestinations ?? cataloguePlaces,
    [cataloguePlaces, customDestinations],
  );

  const selectedDestination = useMemo(() => {
    return allDestinations.find((d: Destination) => d.id === value) || null;
  }, [allDestinations, value]);

  const popularDestinations = useMemo(() => {
    return allDestinations
      .filter((d) => d.recommendationEligible !== false)
      .filter((d) => (d.ratings?.overall ?? 4.5) >= 4.5)
      .slice(0, 5);
  }, [allDestinations]);

  const suggestionGroups = useMemo(() => {
    if (query.trim()) return null;

    const seen = new Set<string>();
    const filterDups = (list: Destination[]) =>
      list.filter((d) => {
        if (!d || !d.id || seen.has(d.id)) return false;
        seen.add(d.id);
        return true;
      });

    const recent = filterDups(recentDestinations).slice(0, 3);
    const itinerary = filterDups(activeItineraryDestinations).slice(0, 3);
    const saved = filterDups(savedDestinations).slice(0, 3);
    const popular = filterDups(popularDestinations).slice(0, 5);

    return { recent, itinerary, saved, popular };
  }, [
    query,
    recentDestinations,
    activeItineraryDestinations,
    savedDestinations,
    popularDestinations,
  ]);

  const searchResults = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase().trim();
    return allDestinations
      .filter((d: Destination) => {
        if (d.recommendationEligible === false) return false;
        const nameEn = (d.name || "").toLowerCase();
        const nameJa = (d.nameJa || "").toLowerCase();
        const prefecture = (d.prefecture || "").toLowerCase();
        const category = (d.categories?.[0] || "").toLowerCase();
        const aliases = (d.aliases || []).join(" ").toLowerCase();
        return (
          nameEn.includes(q) ||
          nameJa.includes(q) ||
          prefecture.includes(q) ||
          category.includes(q) ||
          aliases.includes(q)
        );
      })
      .slice(0, 10);
  }, [allDestinations, query]);

  const flatOptions = useMemo(() => {
    if (query.trim()) return searchResults;
    if (!suggestionGroups) return [];
    return [
      ...suggestionGroups.recent,
      ...suggestionGroups.itinerary,
      ...suggestionGroups.saved,
      ...suggestionGroups.popular,
    ];
  }, [query, searchResults, suggestionGroups]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, isOpen]);

  useEffect(() => {
    if (isOpen) {
      wasOpenRef.current = true;
      if (isMobile) {
        document.body.style.overflow = "hidden";
      }
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      document.body.style.overflow = "";
      if (wasOpenRef.current) triggerRef.current?.focus();
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen, isMobile]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        closePicker();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    if (e.key === "Escape") {
      closePicker();
      e.preventDefault();
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (prev < flatOptions.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : flatOptions.length - 1));
    } else if (e.key === "Enter" && flatOptions[activeIndex]) {
      e.preventDefault();
      onSelect(flatOptions[activeIndex]);
      closePicker();
      setQuery("");
    }
  };

  const handleMobileDialogKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      closePicker();
      e.preventDefault();
      return;
    }
    if (!isMobile || e.key !== "Tab") return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      "button:not([disabled]), input:not([disabled])",
    );
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup={isMobile ? "dialog" : "listbox"}
        aria-expanded={isOpen}
        aria-controls={isMobile ? dialogId : listboxId}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-left text-sm font-medium text-slate-900 dark:text-white hover:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all shadow-sm min-h-[44px]"
      >
        <span className="flex items-center gap-2 truncate">
          <MapPin className="w-4 h-4 text-emerald-700 dark:text-emerald-300 shrink-0" />
          {selectedDestination ? (
            <span className="font-bold">
              {formatPlaceName(selectedDestination, locale)}
            </span>
          ) : (
            <span className="text-slate-500 font-normal">{placeholder}</span>
          )}
        </span>
        <span className="text-slate-500 text-xs shrink-0">▼</span>
      </button>

      {/* Dropdown / Mobile Sheet */}
      {isOpen && (
        <>
          {/* Backdrop for mobile bottom sheet */}
          <div
            className="sm:hidden fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40"
            onClick={() => {
              closePicker();
            }}
          />

          <div
            ref={isMobile ? dialogRef : undefined}
            id={isMobile ? dialogId : undefined}
            role={isMobile ? "dialog" : undefined}
            aria-modal={isMobile ? true : undefined}
            aria-label={
              isMobile ? "Destination search" : "Destination search options"
            }
            onKeyDown={isMobile ? handleMobileDialogKeyDown : undefined}
            className="z-50 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden animate-in fade-in-50 duration-150 flex flex-col max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:rounded-b-none max-sm:rounded-t-3xl max-sm:pb-[env(safe-area-inset-bottom)] max-sm:max-h-[85dvh] sm:absolute sm:left-0 sm:right-0 sm:mt-1.5 sm:rounded-2xl sm:max-h-80"
          >
            {/* Header / Search Input */}
            <div className="p-3 sm:p-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2 bg-slate-50/50 dark:bg-slate-850 shrink-0">
              <Search className="w-4 h-4 text-slate-500 shrink-0" />
              {isMobile && (
                <button
                  type="button"
                  onClick={closePicker}
                  aria-label="Close destination search"
                  className="p-1 text-slate-500 min-h-[44px] min-w-[44px] flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <input
                ref={inputRef}
                type="text"
                role="combobox"
                aria-expanded="true"
                aria-controls={listboxId}
                aria-activedescendant={
                  flatOptions[activeIndex]
                    ? `option-${uniqueId}-${flatOptions[activeIndex].id}`
                    : undefined
                }
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  locale === "ja"
                    ? "都市・スポット名で検索..."
                    : "Type to search..."
                }
                className="w-full bg-transparent text-base sm:text-sm font-medium text-slate-900 dark:text-white focus:outline-none placeholder:text-slate-500"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md text-slate-500"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div
              id={listboxId}
              role="listbox"
              className="overflow-y-auto p-2 space-y-3 flex-1"
            >
              {/* KAI-132: lite catalogue still loading (and no custom
                  destinations provided) — show a spinner, not an empty list.
                  A failed load is NOT ready — show an error + retry. */}
              {liteError ? (
                <div
                  role="alert"
                  data-lite-error
                  className="flex flex-col items-center justify-center py-10 px-4 text-center"
                >
                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                    {t("home.matchesErrorTitle", "Couldn't load destinations")}
                  </p>
                  <button
                    type="button"
                    onClick={retryLite}
                    className="mt-3 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700"
                  >
                    {t("ui.retry", "Retry")}
                  </button>
                </div>
              ) : !liteReady && !customDestinations ? (
                <div
                  role="status"
                  aria-label={
                    locale === "ja" ? "読み込み中" : "Loading destinations"
                  }
                  className="flex flex-col items-center justify-center py-10"
                >
                  <div
                    aria-hidden="true"
                    className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500/30 border-t-emerald-500"
                  />
                  <p className="mt-3 text-xs text-slate-500 font-medium">
                    {locale === "ja"
                      ? "スポットを読み込み中…"
                      : "Loading destinations…"}
                  </p>
                </div>
              ) : (
                // Search Query Active
                <>
                  {query.trim() ? (
                    searchResults.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-500 font-medium">
                        {locale === "ja"
                          ? "該当するスポットが見つかりません"
                          : "No matching destinations found"}
                      </div>
                    ) : (
                      <div className="space-y-0.5">
                        {searchResults.map((dest, idx) => {
                          const isSelected = dest.id === value;
                          const isActive = idx === activeIndex;
                          return (
                            <button
                              key={dest.id}
                              ref={isActive ? activeOptionRef : null}
                              id={`option-${uniqueId}-${dest.id}`}
                              role="option"
                              aria-selected={isSelected}
                              type="button"
                              onClick={() => {
                                onSelect(dest);
                                closePicker();
                                setQuery("");
                              }}
                              className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left text-xs transition-colors ${
                                isActive
                                  ? "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white"
                                  : ""
                              } ${
                                isSelected
                                  ? "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 font-bold"
                                  : "text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-850"
                              }`}
                            >
                              <div className="min-w-0 flex-1 pr-2">
                                <div className="font-bold truncate">
                                  {formatPlaceName(dest, locale)}
                                </div>
                                <div className="text-[10px] text-slate-500 truncate">
                                  {dest.prefecture} •{" "}
                                  {dest.categories?.[0] || dest.kind}
                                </div>
                              </div>
                              {isSelected && (
                                <Check className="w-4 h-4 text-emerald-700 dark:text-emerald-300 shrink-0" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )
                  ) : (
                    /* Non-search Initial Suggestion Groups */
                    <div className="space-y-3">
                      {suggestionGroups?.recent.length ? (
                        <div>
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-2 block mb-1 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-500" />
                            {locale === "ja"
                              ? "最近見たスポット"
                              : "Recently Viewed"}
                          </span>
                          {suggestionGroups.recent.map((dest) => (
                            <button
                              key={dest.id}
                              id={`option-${uniqueId}-${dest.id}`}
                              role="option"
                              aria-selected={dest.id === value}
                              type="button"
                              onClick={() => {
                                onSelect(dest);
                                closePicker();
                              }}
                              className="w-full flex items-center justify-between p-2 rounded-lg text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <span className="font-medium truncate">
                                {formatPlaceName(dest, locale)}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : null}

                      {suggestionGroups?.itinerary.length ? (
                        <div>
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-2 block mb-1 flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-emerald-500" />
                            {locale === "ja"
                              ? "この旅行のスポット"
                              : "In This Trip"}
                          </span>
                          {suggestionGroups.itinerary.map((dest) => (
                            <button
                              key={dest.id}
                              id={`option-${uniqueId}-${dest.id}`}
                              role="option"
                              aria-selected={dest.id === value}
                              type="button"
                              onClick={() => {
                                onSelect(dest);
                                closePicker();
                              }}
                              className="w-full flex items-center justify-between p-2 rounded-lg text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <span className="font-medium truncate">
                                {formatPlaceName(dest, locale)}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : null}

                      {suggestionGroups?.saved.length ? (
                        <div>
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-2 block mb-1 flex items-center gap-1">
                            <Bookmark className="w-3 h-3 text-purple-500" />
                            {locale === "ja"
                              ? "保存したスポット"
                              : "Saved Places"}
                          </span>
                          {suggestionGroups.saved.map((dest) => (
                            <button
                              key={dest.id}
                              id={`option-${uniqueId}-${dest.id}`}
                              role="option"
                              aria-selected={dest.id === value}
                              type="button"
                              onClick={() => {
                                onSelect(dest);
                                closePicker();
                              }}
                              className="w-full flex items-center justify-between p-2 rounded-lg text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <span className="font-medium truncate">
                                {formatPlaceName(dest, locale)}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : null}

                      {suggestionGroups?.popular.length ? (
                        <div>
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-2 block mb-1 flex items-center gap-1">
                            <Sparkles className="w-3 h-3 text-amber-500" />
                            {locale === "ja"
                              ? "人気のスポット"
                              : "Popular Destinations"}
                          </span>
                          {suggestionGroups.popular.map((dest) => (
                            <button
                              key={dest.id}
                              id={`option-${uniqueId}-${dest.id}`}
                              role="option"
                              aria-selected={dest.id === value}
                              type="button"
                              onClick={() => {
                                onSelect(dest);
                                closePicker();
                              }}
                              className="w-full flex items-center justify-between p-2 rounded-lg text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <span className="font-medium truncate">
                                {formatPlaceName(dest, locale)}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
