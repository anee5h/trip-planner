import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { ReactNode } from "react";
import { useLocalStorage } from "./useLocalStorage";
import { useAuth } from "@/shared/hooks/useAuth";
import { useTripSync } from "@/shared/hooks/useTripSync";
import type {
  ProfileSyncStatus,
  TripSyncStatus,
} from "@/shared/hooks/useTripSync";
import { clearLegacyAccountStorage } from "@/shared/utils/clearLegacyAccountStorage";
// KAI-147: destinations-meta.json (277 KB raw) was statically imported here
// and in useTripSync, inlining the whole catalogue into the shared
// LocaleContext chunk that the entry HTML modulepreloads — production
// mobile FCP/LCP measured ~3.8 s/~5.0 s with the H1 as sole LCP candidate.
// It is now a runtime-lazy chunk (see destinationsMetaLoader.ts, KAI-121
// pattern): loaded when visited state becomes non-empty; mutation handlers
// use the resolved snapshot before React state catches up.
import {
  getDestinationsMetaSnapshot,
  loadDestinationsMeta,
} from "@/shared/data/destinationsMetaLoader";
import type { Trip, TripStop } from "@/shared/types/trip";
import type { Destination } from "@/shared/types/destination";
import * as TripService from "@/shared/services/trips/TripService";
import { generateUUID } from "@/shared/utils/uuid";
import type { TransportZoneId } from "@/shared/types/transportTopology";
import { resolveOriginTransportZone } from "@/shared/services/transport/OriginTransportZone";

/**
 * Formats a prefecture name into the exact SVG key required by @react-map/japan@1.0.10.
 * Note: @react-map/japan v1.0.10 has an upstream encoding artifact ("Hokkaido\x8D") in its map key data.
 * This helper ensures application prefecture state aligns 100% with SVG map rendering.
 */
export function formatPrefectureId(prefectureName: string): string {
  if (prefectureName === "Hokkaido") return "Hokkaido\x8D";
  return prefectureName;
}

export type OriginLocation = {
  label: string;
  coordinates: { lat: number; lng: number };
  source: "station" | "postal_code" | "default";
  transportZoneId?: TransportZoneId;
};

export type UnresolvedOriginLocation = {
  label: string;
  coordinates?: { lat: number; lng: number };
  source: "station";
  transportZoneId?: TransportZoneId;
};

export type SavedOriginLocation = OriginLocation | UnresolvedOriginLocation;

export type OriginSource = "saved" | "current";

type ActiveOrigin =
  | { source: "saved"; location: SavedOriginLocation }
  | {
      source: "current";
      location: {
        label: string;
        coordinates: { lat: number; lng: number };
        transportZoneId?: TransportZoneId;
      };
    };

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
  savedHomeStation: string;
  homeStationCoords?: { lat: number; lng: number };
  homeStationTransportZoneId?: TransportZoneId;
  originSource: OriginSource;
  setOriginLocation: (origin: OriginLocation) => void;
  setCurrentLocationOrigin: (coordinates: { lat: number; lng: number }) => void;
  restoreSavedOrigin: () => void;

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

  destinationRatings: Record<string, "up" | "down">;
  setDestinationRating: (id: string, rating: "up" | "down" | null) => void;
  getDestinationRating: (id: string) => "up" | "down" | null;

  canMutateProfile: boolean;
  /** True when the user may open StationInput to correct an unresolved saved
   * station. Distinct from canMutateProfile: other mutations remain blocked
   * during the recoverable origin_error state. */
  canSelectOrigin: boolean;
  profileSyncStatus: ProfileSyncStatus;
  tripSyncStatus: TripSyncStatus;
  retryProfileHydration: () => void;
  retryTripHydration: () => void;
}

const TripStoreContext = createContext<TripStoreContextType | undefined>(
  undefined,
);

const GUEST_ORIGIN_KEY = "meguruto-guest-origin";
const LEGACY_GUEST_STATION_KEY = "meguruto-guest-home-station";
const LEGACY_GUEST_COORDS_KEY = "meguruto-guest-home-station-coords";
const DEFAULT_TOKYO_STATION = "Tokyo Station";
const DEFAULT_TOKYO_COORDS = { lat: 35.6812, lng: 139.7671 };
const CURRENT_LOCATION_LABEL = "Current location";

const DEFAULT_ORIGIN: OriginLocation = {
  label: DEFAULT_TOKYO_STATION,
  coordinates: DEFAULT_TOKYO_COORDS,
  source: "default",
};

function isValidCoordinates(
  value: unknown,
): value is { lat: number; lng: number } {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as Record<string, unknown>).lat === "number" &&
    typeof (value as Record<string, unknown>).lng === "number" &&
    Number.isFinite((value as Record<string, number>).lat) &&
    Number.isFinite((value as Record<string, number>).lng) &&
    (value as Record<string, number>).lat >= -90 &&
    (value as Record<string, number>).lat <= 90 &&
    (value as Record<string, number>).lng >= -180 &&
    (value as Record<string, number>).lng <= 180
  );
}

function isValidOriginLocation(value: unknown): value is OriginLocation {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.label === "string" &&
    o.label.trim().length > 0 &&
    isValidCoordinates(o.coordinates) &&
    typeof o.source === "string" &&
    ["station", "postal_code", "default"].includes(o.source)
  );
}

function loadGuestOrigin(): OriginLocation {
  if (typeof window === "undefined") return DEFAULT_ORIGIN;

  try {
    const saved = window.localStorage.getItem(GUEST_ORIGIN_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (isValidOriginLocation(parsed)) {
        if (!parsed.transportZoneId) {
          parsed.transportZoneId = resolveOriginTransportZone({
            coordinates: parsed.coordinates,
            label: parsed.label,
          });
          window.localStorage.setItem(GUEST_ORIGIN_KEY, JSON.stringify(parsed));
        }
        return parsed;
      }
    }
  } catch {
    // corrupt storage
  }

  const migrated = migrateLegacyOrigin();
  if (migrated) return migrated;

  return DEFAULT_ORIGIN;
}

function migrateLegacyOrigin(): OriginLocation | null {
  if (typeof window === "undefined") return null;

  try {
    const stationRaw = window.localStorage.getItem(LEGACY_GUEST_STATION_KEY);
    const coordsRaw = window.localStorage.getItem(LEGACY_GUEST_COORDS_KEY);

    if (!stationRaw || !coordsRaw) return null;

    const label = JSON.parse(stationRaw);
    const coordinates = JSON.parse(coordsRaw);

    if (typeof label !== "string" || label.length === 0) return null;
    if (!isValidCoordinates(coordinates)) return null;

    const origin: OriginLocation = {
      label,
      coordinates,
      source: label.includes(", ") ? "station" : "postal_code",
      transportZoneId: resolveOriginTransportZone({
        coordinates,
        label,
      }),
    };

    window.localStorage.setItem(GUEST_ORIGIN_KEY, JSON.stringify(origin));
    window.localStorage.removeItem(LEGACY_GUEST_STATION_KEY);
    window.localStorage.removeItem(LEGACY_GUEST_COORDS_KEY);

    return origin;
  } catch {
    return null;
  }
}

function persistGuestOrigin(origin: OriginLocation) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GUEST_ORIGIN_KEY, JSON.stringify(origin));
  } catch (e) {
    console.error(e);
  }
}

export function TripStoreProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  // KAI-147: destination metadata is a runtime-lazy chunk. State (not a
  // ref) so the visited-prefectures derivation effect below re-runs — and
  // back-fills any prefectures it could not resolve pre-load.
  const [destinationsIndex, setDestinationsIndex] = useState<Destination[]>(
    () => [],
  );

  useEffect(() => {
    clearLegacyAccountStorage();
  }, []);

  const [favorites, setFavorites] = useState<string[]>([]);
  const [visited, setVisited] = useState<string[]>([]);
  const [visitedPrefectures, setVisitedPrefectures] = useState<string[]>([]);
  const [visitedDates, setVisitedDates] = useState<
    Record<string, string[] | string>
  >({});
  const [compareList, setCompareList] = useLocalStorage<string[]>(
    "trip-planner-compare",
    [],
  );

  const [guestOrigin, setGuestOrigin] =
    useState<OriginLocation>(loadGuestOrigin);
  const [savedOrigin, setSavedOrigin] =
    useState<SavedOriginLocation>(guestOrigin);
  const [activeOrigin, setActiveOrigin] = useState<ActiveOrigin>({
    source: "saved",
    location: guestOrigin,
  });

  const setSavedActiveOrigin = useCallback((origin: SavedOriginLocation) => {
    setSavedOrigin(origin);
    setActiveOrigin({ source: "saved", location: origin });
  }, []);

  const [lastSyncedDate, setLastSyncedDate] = useState<string | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [destinationRatings, setDestinationRatingsState] = useState<
    Record<string, "up" | "down">
  >({});

  useEffect(() => {
    if (visited.length === 0) return;

    loadDestinationsMeta()
      .then((meta) => setDestinationsIndex(meta))
      .catch((error: unknown) => {
        console.warn(
          "[Meguruto Store] destinations-meta chunk failed to load:",
          error,
        );
      });
  }, [visited.length]);

  const getDestinationRating = (id: string): "up" | "down" | null =>
    destinationRatings[id] ?? null;

  const getAvailableDestinations = useCallback(
    (): Destination[] =>
      destinationsIndex.length > 0
        ? destinationsIndex
        : (getDestinationsMetaSnapshot() ?? []),
    [destinationsIndex],
  );

  const {
    profileSyncStatus,
    tripSyncStatus,
    retryProfileHydration,
    retryTripHydration,
    persistSelectedOrigin,
  } = useTripSync({
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
    savedHomeStation: savedOrigin.label,
    guestOrigin,
    setActiveOrigin: setSavedActiveOrigin,
    trips,
    setTrips,
    destinationRatings,
    setDestinationRatings: setDestinationRatingsState,
  });

  const canMutateProfile =
    !user || profileSyncStatus === "ready" || profileSyncStatus === "saving";

  // Station selection is separately unblocked during the recoverable
  // origin_error state so the user can correct the unresolved station.
  const canSelectOrigin =
    canMutateProfile || profileSyncStatus === "origin_error";

  const setOriginLocation = (origin: OriginLocation) => {
    if (!isValidOriginLocation(origin)) return;
    setSavedOrigin(origin);
    setActiveOrigin({ source: "saved", location: origin });
    if (!user) {
      setGuestOrigin(origin);
      persistGuestOrigin(origin);
    } else {
      // A chosen account origin is an explicit account-setting mutation; it
      // must not wait for the generic profile debounce.
      void persistSelectedOrigin(origin);
    }
  };

  const setCurrentLocationOrigin = useCallback(
    (coordinates: { lat: number; lng: number }) => {
      if (!isValidCoordinates(coordinates)) return;
      setActiveOrigin({
        source: "current",
        location: {
          label: CURRENT_LOCATION_LABEL,
          coordinates,
          transportZoneId: resolveOriginTransportZone({ coordinates }),
        },
      });
    },
    [],
  );

  const restoreSavedOrigin = useCallback(() => {
    setActiveOrigin({ source: "saved", location: savedOrigin });
  }, [savedOrigin]);

  const setDestinationRating = (id: string, rating: "up" | "down" | null) => {
    if (!canMutateProfile) return;

    setDestinationRatingsState((prev) => {
      const next = { ...prev };
      if (rating === null) {
        delete next[id];
      } else {
        next[id] = rating;
      }
      return next;
    });
  };

  useEffect(() => {
    if (!visited || visited.length === 0) return;

    const availableDestinations = getAvailableDestinations();
    let updatedVisited = [...visited];
    let updatedDates = { ...visitedDates };
    let updatedPrefectures = [...visitedPrefectures];
    let hasChanges = false;

    for (const id of visited) {
      const targetDest = availableDestinations.find((d) => d.id === id);
      if (targetDest) {
        const prefId = formatPrefectureId(targetDest.prefecture);
        if (!updatedPrefectures.includes(prefId)) {
          updatedPrefectures.push(prefId);
          hasChanges = true;
        }
      }

      let currentId: string | undefined = id;
      while (currentId) {
        const dest = availableDestinations.find((d) => d.id === currentId);
        const parentHubId = dest?.relationships?.parentDestinationId;
        if (!parentHubId) break;

        if (!updatedVisited.includes(parentHubId)) {
          updatedVisited.push(parentHubId);
          hasChanges = true;
        }

        const parentDest = availableDestinations.find(
          (d) => d.id === parentHubId,
        );
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

    for (const hubId of updatedVisited) {
      const hubDest = availableDestinations.find((d) => d.id === hubId);
      if (hubDest?.role !== "hub") continue;

      const hubDates = normalizeVisitDates(updatedDates[hubId]);
      if (hubDates.length === 0) continue;

      const childIds = availableDestinations
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
    // KAI-147: destinationsIndex is a dependency so prefecture derivation
    // re-runs (and back-fills) once the lazy meta chunk resolves.
  }, [
    visited,
    visitedDates,
    visitedPrefectures,
    destinationsIndex,
    getAvailableDestinations,
  ]);

  const toggleFavorite = (id: string) => {
    if (!canMutateProfile) return;
    setFavorites((prev) =>
      prev.includes(id) ? prev.filter((fId) => fId !== id) : [...prev, id],
    );
  };

  const isFavorite = (id: string) => favorites.includes(id);

  const clearAllVisits = (id: string) => {
    if (!canMutateProfile) return;
    const availableDestinations = getAvailableDestinations();
    const remainingVisitedIds = visited.filter((vId) => vId !== id);
    setVisited(remainingVisitedIds);

    setVisitedDates((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

    const destination = availableDestinations.find((d) => d.id === id);
    if (destination) {
      const prefId = formatPrefectureId(destination.prefecture);
      const hasOtherVisitedInPref = remainingVisitedIds.some((vId) => {
        const otherDest = availableDestinations.find((d) => d.id === vId);
        if (!otherDest) return false;
        const otherPref = formatPrefectureId(otherDest.prefecture);
        return otherPref === prefId;
      });
      if (!hasOtherVisitedInPref) {
        setVisitedPrefectures((prevPrefs) =>
          prevPrefs.filter((p) => p !== prefId),
        );
      }
    } else {
      // KAI-147 review fix: metadata not resolved yet — record the removal
      // so the prefecture it justified is pruned when the chunk arrives
      // (deferred parity with the synchronous-era behavior above).
      setPreloadRemovedIds((prev) =>
        prev.includes(id) ? prev : [...prev, id],
      );
    }
  };

  // KAI-147 review fix (deferred clear parity): destinations removed via
  // clearAllVisits while metadata was unresolved are recorded here. When
  // the chunk resolves, prune exactly the prefectures whose last visited
  // justification was a removed destination — what the synchronous-era
  // clearAllVisits would have done immediately.
  const [preloadRemovedIds, setPreloadRemovedIds] = useState<string[]>([]);

  useEffect(() => {
    if (preloadRemovedIds.length === 0 || destinationsIndex.length === 0) {
      return;
    }

    // Prefectures that lost their justification from these removals…
    const orphanedPrefs = new Set<string>();
    for (const id of preloadRemovedIds) {
      const dest = destinationsIndex.find((d) => d.id === id);
      if (!dest) continue;
      orphanedPrefs.add(formatPrefectureId(dest.prefecture));
      // …including any parent hub the removal cascaded through.
      let currentId: string | undefined =
        dest.relationships?.parentDestinationId;
      while (currentId) {
        const parent = destinationsIndex.find((d) => d.id === currentId);
        if (!parent) break;
        orphanedPrefs.add(formatPrefectureId(parent.prefecture));
        currentId = parent.relationships?.parentDestinationId;
      }
    }

    setVisitedPrefectures((prevPrefs) => {
      // A prefecture survives only if some still-visited destination (or
      // its parent chain) justifies it. Manual entries the user/sync added
      // that metadata cannot explain are preserved.
      const stillJustified = new Set<string>();
      for (const vId of visited) {
        const other = destinationsIndex.find((d) => d.id === vId);
        if (other) {
          stillJustified.add(formatPrefectureId(other.prefecture));
          let pid: string | undefined =
            other.relationships?.parentDestinationId;
          while (pid) {
            const parent = destinationsIndex.find((d) => d.id === pid);
            if (!parent) break;
            stillJustified.add(formatPrefectureId(parent.prefecture));
            pid = parent.relationships?.parentDestinationId;
          }
        }
      }
      const next = prevPrefs.filter(
        (p) => !orphanedPrefs.has(p) || stillJustified.has(p),
      );
      return next.length === prevPrefs.length ? prevPrefs : next;
    });

    setPreloadRemovedIds([]);
  }, [destinationsIndex, preloadRemovedIds, visited]);

  const toggleVisited = (id: string, date?: string) => {
    if (!canMutateProfile) return;
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
    if (!canMutateProfile) return;
    const availableDestinations = getAvailableDestinations();
    const dateToAdd = date || new Date().toISOString().split("T")[0];

    if (!visited.includes(id)) {
      setVisited((prev) => (prev.includes(id) ? prev : [...prev, id]));

      const destination = availableDestinations.find((d) => d.id === id);
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

    let currentId: string | undefined = id;
    while (currentId) {
      const dest = availableDestinations.find((d) => d.id === currentId);
      const parentHubId = dest?.relationships?.parentDestinationId;
      if (!parentHubId) break;

      if (!visited.includes(parentHubId)) {
        setVisited((prev) =>
          prev.includes(parentHubId) ? prev : [...prev, parentHubId],
        );

        const parentDest = availableDestinations.find(
          (d) => d.id === parentHubId,
        );
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
    if (!canMutateProfile) return;
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
        homeStation: activeOrigin.location.label,
        savedHomeStation: savedOrigin.label,
        homeStationCoords: activeOrigin.location.coordinates,
        homeStationTransportZoneId: activeOrigin.location.transportZoneId,
        originSource: activeOrigin.source,
        setOriginLocation,
        setCurrentLocationOrigin,
        restoreSavedOrigin,
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
        destinationRatings,
        setDestinationRating,
        getDestinationRating,
        canMutateProfile,
        canSelectOrigin,
        profileSyncStatus,
        tripSyncStatus,
        retryProfileHydration,
        retryTripHydration,
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
