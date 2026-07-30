import { useState, useMemo, useRef, useEffect } from "react";
import type { Destination } from "@/shared/types/destination";
import { getCanonicalPlaces } from "@/shared/services/place/PlaceCatalog";
import { formatPlaceName } from "@/shared/utils/placeLabels";
import { Search, MapPin, Check, X } from "lucide-react";

interface SearchableDestinationPickerProps {
  value?: string;
  onSelect: (destination: Destination) => void;
  placeholder?: string;
  locale?: "en" | "ja";
  className?: string;
}

export function SearchableDestinationPicker({
  value,
  onSelect,
  placeholder = "Search destination or city...",
  locale = "en",
  className = "",
}: SearchableDestinationPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const allDestinations = useMemo(() => getCanonicalPlaces(), []);

  const selectedDestination = useMemo(() => {
    return allDestinations.find((d: Destination) => d.id === value) || null;
  }, [allDestinations, value]);

  // Filter results max 10
  const results = useMemo(() => {
    if (!query.trim()) {
      return allDestinations.slice(0, 10);
    }
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

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
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

      {/* Combobox Dropdown */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden animate-in fade-in-50 duration-150">
          <div className="p-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2 bg-slate-50/50 dark:bg-slate-850">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
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

          <div className="max-h-60 overflow-y-auto p-1 space-y-0.5">
            {results.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400 font-medium">
                {locale === "ja"
                  ? "該当するスポットが見つかりません"
                  : "No matching destinations found"}
              </div>
            ) : (
              results.map((dest: Destination) => {
                const isSelected = dest.id === value;
                return (
                  <button
                    key={dest.id}
                    type="button"
                    onClick={() => {
                      onSelect(dest);
                      setIsOpen(false);
                      setQuery("");
                    }}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left text-xs transition-colors ${
                      isSelected
                        ? "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 font-bold"
                        : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200"
                    }`}
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="font-bold truncate">
                        {formatPlaceName(dest, locale)}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">
                        {dest.prefecture} • {dest.categories?.[0] || dest.kind}
                      </div>
                    </div>
                    {isSelected && (
                      <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
