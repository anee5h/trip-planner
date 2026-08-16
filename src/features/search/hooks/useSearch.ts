import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { searchDocuments } from "../services/searchIndex";
import type { SearchDocument, SearchGroup } from "../types";
import { useLocale } from "@/shared/context/LocaleContext";
import { OPEN_SEARCH_EVENT } from "../openSearch";

export function useSearch() {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();
  const { locale } = useLocale();

  const groups: SearchGroup[] = useMemo(() => {
    return searchDocuments(query, locale);
  }, [query, locale]);

  // Flatten all items across groups for index-based keyboard navigation
  const flatItems: SearchDocument[] = useMemo(() => {
    return groups.flatMap((g) => g.items);
  }, [groups]);

  // Reset selected index when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Global Cmd+K / Ctrl+K keyboard shortcut listener
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Explicit app event (BottomNav search button) — opens, never toggles
  useEffect(() => {
    function handleOpenSearch() {
      setIsOpen(true);
    }
    window.addEventListener(OPEN_SEARCH_EVENT, handleOpenSearch);
    return () =>
      window.removeEventListener(OPEN_SEARCH_EVENT, handleOpenSearch);
  }, []);

  const selectItem = useCallback(
    (item: SearchDocument) => {
      setIsOpen(false);
      setQuery("");
      navigate(item.url);
    },
    [navigate],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Ignore Escape during IME composition (JA input): cancelling a
      // kana-kanji conversion must not close the overlay.
      if (e.key === "Escape" && !e.nativeEvent.isComposing) {
        setIsOpen(false);
        return;
      }

      if (flatItems.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % flatItems.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev === 0 ? flatItems.length - 1 : prev - 1,
        );
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (flatItems[selectedIndex]) {
          selectItem(flatItems[selectedIndex]);
        }
      }
    },
    [flatItems, selectedIndex, selectItem],
  );

  return {
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
  };
}
