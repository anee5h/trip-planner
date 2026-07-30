import { useState, useMemo, useRef, useEffect, useId } from "react";
import type { Destination } from "@/shared/types/destination";
import { getCanonicalPlaces } from "@/shared/services/place/PlaceCatalog";
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
  activeItineraryDestinations = [],
  savedDestinations = [],
  recentDestinations = [],
}: SearchableDestinationPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const uniqueId = useId();
  const listboxId = `destination-picker-listbox-${uniqueId}`;

  const allDestinations = useMemo(() => getCanonicalPlaces(), []);

  const selectedDestination = useMemo(() => {
    return allDestinations.find((d: Destination) => d.id === value) || null;
  }, [allDestinations, value]);

  const popularDestinations = useMemo(() => {
    return allDestinations
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
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
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
      setIsOpen(false);
      triggerRef.current?.focus();
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
      setIsOpen(false);
      setQuery("");
      triggerRef.current?.focus();
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-activedescendant={
          isOpen && flatOptions[activeIndex]
            ? `option-${uniqueId}-${flatOptions[activeIndex].id}`
            : undefined
        }
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-left text-sm font-medium text-slate-900 dark:text-white hover:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all shadow-sm min-h-[44px]"
      >
        <span className="flex items-center gap-2 truncate">
          <MapPin className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          {selectedDestination ? (
            <span className="font-bold">
              {formatPlaceName(selectedDestination, locale)}
            </span>
          ) : (
            <span className="text-slate-400 font-normal">{placeholder}</span>
          )}
        </span>
        <span className="text-slate-400 text-xs shrink-0">▼</span>
      </button>

      {/* Dropdown / Mobile Sheet */}
      {isOpen && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute z-50 left-0 right-0 mt-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden animate-in fade-in-50 duration-150 max-h-[80vh] sm:max-h-80 flex flex-col"
        >
          <div className="p-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2 bg-slate-50/50 dark:bg-slate-850 shrink-0">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
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
              className="w-full bg-transparent text-sm font-medium text-slate-900 dark:text-white focus:outline-none placeholder:text-slate-400"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md text-slate-400"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="overflow-y-auto p-1.5 space-y-3 flex-1">
            {/* Search Query Active */}
            {query.trim() ? (
              searchResults.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400 font-medium">
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
                        id={`option-${uniqueId}-${dest.id}`}
                        role="option"
                        aria-selected={isSelected}
                        type="button"
                        onClick={() => {
                          onSelect(dest);
                          setIsOpen(false);
                          setQuery("");
                          triggerRef.current?.focus();
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
                          <div className="text-[10px] text-slate-400 truncate">
                            {dest.prefecture} •{" "}
                            {dest.categories?.[0] || dest.kind}
                          </div>
                        </div>
                        {isSelected && (
                          <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
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
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 block mb-1 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      {locale === "ja" ? "最近見たスポット" : "Recently Viewed"}
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
                          setIsOpen(false);
                          triggerRef.current?.focus();
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
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 block mb-1 flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-emerald-500" />
                      {locale === "ja" ? "この旅行のスポット" : "In This Trip"}
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
                          setIsOpen(false);
                          triggerRef.current?.focus();
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
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 block mb-1 flex items-center gap-1">
                      <Bookmark className="w-3 h-3 text-purple-500" />
                      {locale === "ja" ? "保存したスポット" : "Saved Places"}
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
                          setIsOpen(false);
                          triggerRef.current?.focus();
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
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 block mb-1 flex items-center gap-1">
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
                          setIsOpen(false);
                          triggerRef.current?.focus();
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
          </div>
        </div>
      )}
    </div>
  );
}
