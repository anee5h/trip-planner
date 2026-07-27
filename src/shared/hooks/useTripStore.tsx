import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useLocalStorage } from "./useLocalStorage";
import { useAuth } from "@/shared/hooks/useAuth";
import { useTripSync } from "@/shared/hooks/useTripSync";
import destinationsIndex from "@/shared/data/destinations-meta.json";
import type { Trip, TripStop } from "@/shared/types/trip";
import * as TripService from "@/shared/services/trips/TripService";
import { generateUUID } from "@/shared/utils/uuid";

/**
 * Formats a prefecture name into the exact SVG key required by @react-map/japan@1.0.10.
 * Note: @react-map/japan v1.0.10 has an upstream encoding artifact ("Hokkaido\x8D") in its map key data.
 * This helper ensures application prefecture state aligns 100% with SVG map rendering.
 */
export function formatPrefectureId(prefectureName: string): string {
  if (prefectureName === "Hokkaido") return "Hokkaido\x8D";
  return prefectureName;
}

interface TripStoreContextType {
  favorites: string[];
  toggleFavorite: (id: string) => void;
  isFavorite: (id: string) => boolean;

  visited: string[];
  visitedDates: Record<string, string[] | string>;
  toggleVisited: (id: string, date?: string) => void;
  isVisited: (id: string) => boolean;
  getVisitedDates: (id: string) => string[];
  getVisitedDate: (id: string) => string | undefined;
  getLatestVisitedDate: (id: string) => string | undefined;
  getVisitCount: (id: string) => number;
  addVisitedDate: (id: string, date: string) => void;
  removeVisitedDate: (id: string, dateStr: string) => void;
  clearAllVisits: (id: string) => void;
  setVisitedDate: (id: string, date: string) => void;

  visitedPrefectures: string[];
  isPrefectureVisited: (id: string) => boolean;

  homeStation: string;
  setHomeStation: (station: string) => void;

  homeStationCoords: { lat: number; lng: number } | null;
  setHomeStationCoords: (coords: { lat: number; lng: number } | null) => void;

  compareList: string[];
  toggleCompare: (id: string) => void;
  isComparing: (id: string) => boolean;
  clearCompare: () => void;

  lastSyncedDate: string | null;
  setLastSyncedDate: (date: string | null) => void;

  trips: Trip[];
  setTrips: (val: Trip[] | ((prev: Trip[]) => Trip[])) => void;
  addTrip: (title: string, startDate?: string, endDate?: string) => Trip;
  updateTrip: (id: string, updates: Partial<Trip>) => void;
  deleteTrip: (id: string) => void;
  addStopToTrip: (tripId: string, stop: Omit<TripStop, "id">) => void;
  removeStopFromTrip: (tripId: string, stopId: string) => void;
  updateTripStop: (
    tripId: string,
    stopId: string,
    updates: Partial<TripStop>,
  ) => void;
  reorderTripStops: (
    tripId: string,
    startIndex: number,
    endIndex: number,
  ) => void;
}

const TripStoreContext = createContext<TripStoreContextType | undefined>(
  undefined,
);

export function TripStoreProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [favorites, setFavorites] = useLocalStorage<string[]>(
    "trip-planner-favorites",
    [],
  );
  const [visited, setVisited] = useLocalStorage<string[]>(
    "trip-planner-visited",
    [],
  );
  const [visitedPrefectures, setVisitedPrefectures] = useLocalStorage<string[]>(
    "trip-planner-visited-prefs",
    [],
  );
  const [visitedDates, setVisitedDates] = useLocalStorage<
    Record<string, string[] | string>
  >("trip-planner-visited-dates", {});
  // Note: compareList is intentionally kept local-only (stored in localStorage, not synced to cloud)
  const [compareList, setCompareList] = useLocalStorage<string[]>(
    "trip-planner-compare",
    [],
  );
  const [homeStation, setHomeStation] = useLocalStorage<string>(
    "trip-planner-home-station",
    "Tokyo Station",
  );
  const [homeStationCoords, setHomeStationCoords] = useLocalStorage<{
    lat: number;
    lng: number;
  } | null>(
    "trip-planner-home-station-coords",
    { lat: 35.6812, lng: 139.7671 }, // Tokyo Station default
  );

  const [lastSyncedDate, setLastSyncedDate] = useState<string | null>(null);

  const [trips, setTrips] = useLocalStorage<Trip[]>("trip-planner-trips", []);

  // Modular cloud persistence & initial load hook
  useTripSync({
    user,
    favorites,
    setFavorites,
    visited,
    setVisited,
    visitedPrefectures,
    setVisitedPrefectures,
    visitedDates,
    setVisitedDates,
    lastSyncedDate,
    setLastSyncedDate,
    compareList,
    setCompareList,
    homeStation,
    setHomeStation,
    setHomeStationCoords,
    trips,
    setTrips,
  });

  // Retrospective self-healing migration: Ensure existing visited child records cascade to parent hubs & visitedPrefectures
  useEffect(() => {
    if (!visited || visited.length === 0) return;

    let updatedVisited = [...visited];
    let updatedDates = { ...visitedDates };
    let updatedPrefectures = [...visitedPrefectures];
    let hasChanges = false;

    for (const id of visited) {
      // Ensure target destination's prefecture is in visitedPrefectures
      const targetDest = destinationsIndex.find((d) => d.id === id);
      if (targetDest) {
        const prefId = formatPrefectureId(targetDest.prefecture);
        if (!updatedPrefectures.includes(prefId)) {
          updatedPrefectures.push(prefId);
          hasChanges = true;
        }
      }

      let currentId: string | undefined = id;
      while (currentId) {
        const dest = destinationsIndex.find((d) => d.id === currentId);
        const parentHubId = dest?.relationships?.parentDestinationId;
        if (!parentHubId) break;

        if (!updatedVisited.includes(parentHubId)) {
          updatedVisited.push(parentHubId);
          hasChanges = true;
        }

        const parentDest = destinationsIndex.find((d) => d.id === parentHubId);
        if (parentDest) {
          const prefId = formatPrefectureId(parentDest.prefecture);
          if (!updatedPrefectures.includes(prefId)) {
            updatedPrefectures.push(prefId);
            hasChanges = true;
          }
        }

        const childDates = normalizeVisitDates(visitedDates[id]);
        if (childDates.length > 0) {
          const parentDates = normalizeVisitDates(updatedDates[parentHubId]);
          let datesChanged = false;
          const mergedDates = [...parentDates];
          for (const d of childDates) {
            if (!mergedDates.includes(d)) {
              mergedDates.push(d);
              datesChanged = true;
            }
          }

          if (datesChanged) {
            updatedDates[parentHubId] = mergedDates.sort((a, b) =>
              a.localeCompare(b),
            );
            hasChanges = true;
          }
        }

        currentId = parentHubId;
      }
    }

    // Self-healing cleanup: Remove erroneous dates from parent hubs if no visited child POI has that date
    for (const hubId of updatedVisited) {
      const hubDest = destinationsIndex.find((d) => d.id === hubId);
      if (hubDest?.role !== "hub") continue;

      const hubDates = normalizeVisitDates(updatedDates[hubId]);
      if (hubDates.length === 0) continue;

      const childIds = destinationsIndex
        .filter(
          (d) =>
            d.relationships?.parentDestinationId === hubId &&
            visited.includes(d.id),
        )
        .map((d) => d.id);

      if (childIds.length === 0) continue;

      const validChildDates = new Set<string>();
      childIds.forEach((cId) => {
        normalizeVisitDates(visitedDates[cId]).forEach((d) =>
          validChildDates.add(d),
        );
      });

      const cleanedHubDates = hubDates.filter((d) => validChildDates.has(d));
      if (cleanedHubDates.length !== hubDates.length) {
        if (cleanedHubDates.length === 0) {
          delete updatedDates[hubId];
        } else {
          updatedDates[hubId] = cleanedHubDates;
        }
        hasChanges = true;
      }
    }

    if (hasChanges) {
      setVisited(updatedVisited);
      setVisitedDates(updatedDates);
      setVisitedPrefectures(updatedPrefectures);
    }
  }, [visited, visitedDates]);

  const toggleFavorite = (id: string) => {
    setFavorites((prev) =>
      prev.includes(id) ? prev.filter((fId) => fId !== id) : [...prev, id],
    );
  };

  const isFavorite = (id: string) => favorites.includes(id);

  const clearAllVisits = (id: string) => {
    const remainingVisitedIds = visited.filter((vId) => vId !== id);
    setVisited(remainingVisitedIds);

    setVisitedDates((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

    const destination = destinationsIndex.find((d) => d.id === id);
    if (destination) {
      const prefId = formatPrefectureId(destination.prefecture);
      const hasOtherVisitedInPref = remainingVisitedIds.some((vId) => {
        const otherDest = destinationsIndex.find((d) => d.id === vId);
        if (!otherDest) return false;
        const otherPref = formatPrefectureId(otherDest.prefecture);
        return otherPref === prefId;
      });
      if (!hasOtherVisitedInPref) {
        setVisitedPrefectures((prevPrefs) =>
          prevPrefs.filter((p) => p !== prefId),
        );
      }
    }
  };

  const toggleVisited = (id: string, date?: string) => {
    if (visited.includes(id)) {
      clearAllVisits(id);
    } else {
      addVisitedDate(id, date || new Date().toISOString().split("T")[0]);
    }
  };

  const normalizeVisitDates = (
    val: string[] | string | undefined,
  ): string[] => {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    return [val];
  };

  const getVisitedDates = (id: string): string[] => {
    const dates = normalizeVisitDates(visitedDates[id]);
    return [...dates].sort((a, b) => a.localeCompare(b));
  };

  const getLatestVisitedDate = (id: string): string | undefined => {
    const dates = getVisitedDates(id);
    return dates.length > 0 ? dates[dates.length - 1] : undefined;
  };

  const getVisitedDate = (id: string) => getLatestVisitedDate(id);

  const getVisitCount = (id: string): number => {
    return getVisitedDates(id).length;
  };

  const addVisitedDate = (id: string, date: string) => {
    const dateToAdd = date || new Date().toISOString().split("T")[0];

    // Ensure destination is in visited list
    if (!visited.includes(id)) {
      setVisited((prev) => (prev.includes(id) ? prev : [...prev, id]));

      const destination = destinationsIndex.find((d) => d.id === id);
      if (destination) {
        const prefId = formatPrefectureId(destination.prefecture);
        setVisitedPrefectures((prevPrefs) =>
          prevPrefs.includes(prefId) ? prevPrefs : [...prevPrefs, prefId],
        );
      }
    }

    setVisitedDates((prev) => {
      const existing = normalizeVisitDates(prev[id]);
      if (existing.includes(dateToAdd)) return prev;
      return {
        ...prev,
        [id]: [...existing, dateToAdd].sort((a, b) => a.localeCompare(b)),
      };
    });

    // Cascade visit up parent hub chain
    let currentId: string | undefined = id;
    while (currentId) {
      const dest = destinationsIndex.find((d) => d.id === currentId);
      const parentHubId = dest?.relationships?.parentDestinationId;
      if (!parentHubId) break;

      if (!visited.includes(parentHubId)) {
        setVisited((prev) =>
          prev.includes(parentHubId) ? prev : [...prev, parentHubId],
        );

        const parentDest = destinationsIndex.find((d) => d.id === parentHubId);
        if (parentDest) {
          const prefId = formatPrefectureId(parentDest.prefecture);
          setVisitedPrefectures((prevPrefs) =>
            prevPrefs.includes(prefId) ? prevPrefs : [...prevPrefs, prefId],
          );
        }
      }

      setVisitedDates((prev) => {
        const existing = normalizeVisitDates(prev[parentHubId]);
        if (existing.includes(dateToAdd)) return prev;
        return {
          ...prev,
          [parentHubId]: [...existing, dateToAdd].sort((a, b) =>
            a.localeCompare(b),
          ),
        };
      });

      currentId = parentHubId;
    }
  };

  const removeVisitedDate = (id: string, dateStr: string) => {
    const existing = getVisitedDates(id);
    const nextDates = existing.filter((d) => d !== dateStr);

    if (nextDates.length === 0) {
      clearAllVisits(id);
    } else {
      setVisitedDates((prev) => ({
        ...prev,
        [id]: nextDates,
      }));
    }
  };

  const setVisitedDate = (id: string, date: string) => {
    addVisitedDate(id, date);
  };

  const isVisited = (id: string) => visited.includes(id);

  const isPrefectureVisited = (id: string) => visitedPrefectures.includes(id);

  const toggleCompare = (id: string) => {
    setCompareList((prev) => {
      if (prev.includes(id)) {
        return prev.filter((cId) => cId !== id);
      }
      if (prev.length >= 3) {
        return [...prev.slice(1), id];
      }
      return [...prev, id];
    });
  };

  const isComparing = (id: string) => compareList.includes(id);

  const clearCompare = () => setCompareList([]);

  // Trip Management Actions
  const addTrip = (
    title: string,
    startDate?: string,
    endDate?: string,
  ): Trip => {
    const errors = TripService.validateTrip(title, startDate, endDate);
    if (errors.length > 0) {
      throw new Error(errors.join(" "));
    }
    const newTrip: Trip = {
      id: generateUUID(),
      userId: user?.id || "guest",
      title,
      startDate,
      endDate,
      status: "draft",
      stops: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setTrips((prev) => [...prev, newTrip]);
    return newTrip;
  };

  const updateTrip = (id: string, updates: Partial<Trip>) => {
    setTrips((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, ...updates, updatedAt: new Date().toISOString() }
          : t,
      ),
    );
  };

  const deleteTrip = (id: string) => {
    setTrips((prev) => prev.filter((t) => t.id !== id));
  };

  const addStopToTrip = (tripId: string, stop: Omit<TripStop, "id">) => {
    setTrips((prev) =>
      prev.map((t) =>
        t.id === tripId ? TripService.addStopToTrip(t, stop) : t,
      ),
    );
  };

  const removeStopFromTrip = (tripId: string, stopId: string) => {
    setTrips((prev) =>
      prev.map((t) =>
        t.id === tripId ? TripService.removeStopFromTrip(t, stopId) : t,
      ),
    );
  };

  const updateTripStop = (
    tripId: string,
    stopId: string,
    updates: Partial<TripStop>,
  ) => {
    setTrips((prev) =>
      prev.map((t) =>
        t.id === tripId ? TripService.updateTripStop(t, stopId, updates) : t,
      ),
    );
  };

  const reorderTripStops = (
    tripId: string,
    startIndex: number,
    endIndex: number,
  ) => {
    setTrips((prev) =>
      prev.map((t) =>
        t.id === tripId ? TripService.reorderStops(t, startIndex, endIndex) : t,
      ),
    );
  };

  return (
    <TripStoreContext.Provider
      value={{
        favorites,
        toggleFavorite,
        isFavorite,
        visited,
        visitedDates,
        toggleVisited,
        isVisited,
        getVisitedDates,
        getVisitedDate,
        getLatestVisitedDate,
        getVisitCount,
        addVisitedDate,
        removeVisitedDate,
        clearAllVisits,
        setVisitedDate,
        visitedPrefectures,
        isPrefectureVisited,
        compareList,
        toggleCompare,
        isComparing,
        clearCompare,
        homeStation,
        setHomeStation,
        homeStationCoords,
        setHomeStationCoords,
        lastSyncedDate,
        setLastSyncedDate,
        trips,
        setTrips,
        addTrip,
        updateTrip,
        deleteTrip,
        addStopToTrip,
        removeStopFromTrip,
        updateTripStop,
        reorderTripStops,
      }}
    >
      {children}
    </TripStoreContext.Provider>
  );
}

export function useTripStore() {
  const context = useContext(TripStoreContext);
  if (context === undefined) {
    throw new Error("useTripStore must be used within a TripStoreProvider");
  }
  return context;
}
