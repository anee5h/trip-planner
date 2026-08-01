import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import type { Trip } from "@/shared/types/trip";
import { SupabaseTripRepository } from "@/shared/services/trips/TripRepository";
import { generateUUID, isValidUUID } from "@/shared/utils/uuid";
import destinationsIndex from "@/shared/data/destinations-index.json";
import type { Destination } from "@/shared/types/destination";
import { formatPrefectureId } from "@/shared/hooks/useTripStore";

type VisitDates = Record<string, string[] | string>;
type DestinationRatings = Record<string, "up" | "down">;

interface UseTripSyncProps {
  user: User | null;
  favorites: string[];
  setFavorites: (val: string[] | ((prev: string[]) => string[])) => void;
  visited: string[];
  setVisited: (val: string[] | ((prev: string[]) => string[])) => void;
  visitedPrefectures: string[];
  setVisitedPrefectures: (
    val: string[] | ((prev: string[]) => string[]),
  ) => void;
  visitedDates?: VisitDates;
  setVisitedDates?: (
    val: VisitDates | ((prev: VisitDates) => VisitDates),
  ) => void;
  lastSyncedDate?: string | null;
  setLastSyncedDate?: (date: string | null) => void;
  compareList: string[];
  setCompareList: (val: string[] | ((prev: string[]) => string[])) => void;
  homeStation: string;
  setHomeStation: (val: string | ((prev: string) => string)) => void;
  setHomeStationCoords: (
    val:
      | { lat: number; lng: number }
      | null
      | ((
          prev: { lat: number; lng: number } | null,
        ) => { lat: number; lng: number } | null),
  ) => void;
  trips?: Trip[];
  setTrips?: (val: Trip[] | ((prev: Trip[]) => Trip[])) => void;
  destinationRatings?: DestinationRatings;
  setDestinationRatings?: (
    val:
      DestinationRatings | ((prev: DestinationRatings) => DestinationRatings),
  ) => void;
}

export type ProfileSyncStatus =
  "idle" | "loading" | "ready" | "saving" | "error";

export type TripSyncStatus = "idle" | "loading" | "ready" | "saving" | "error";

export interface UseTripSyncReturn {
  profileSyncStatus: ProfileSyncStatus;
  tripSyncStatus: TripSyncStatus;
  retryProfileHydration: () => void;
  retryTripHydration: () => void;
}

const destinationById = new Map<string, Destination>(
  (destinationsIndex as Destination[]).map((destination) => [
    destination.id,
    destination,
  ]),
);

function uniqueStrings(values: Iterable<unknown>): string[] {
  const result = new Set<string>();

  for (const value of values) {
    if (typeof value === "string" && value.length > 0) {
      result.add(value);
    }
  }

  return Array.from(result);
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? uniqueStrings(value) : [];
}

function normalizeDateValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return uniqueStrings(value).sort();
  }

  if (typeof value === "string" && value.length > 0) {
    return [value];
  }

  return [];
}

function normalizeVisitDates(value: unknown): VisitDates {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const normalized: VisitDates = {};

  for (const [destinationId, dates] of Object.entries(value)) {
    const normalizedDates = normalizeDateValues(dates);

    if (normalizedDates.length > 0) {
      normalized[destinationId] = normalizedDates;
    }
  }

  return normalized;
}

function normalizeDestinationRatings(value: unknown): DestinationRatings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const ratings: DestinationRatings = {};

  for (const [destinationId, rating] of Object.entries(value)) {
    if (rating === "up" || rating === "down") {
      ratings[destinationId] = rating;
    }
  }

  return ratings;
}

function deriveVisitedPrefectures(
  visitedIds: string[],
  existingPrefectures: Iterable<unknown>,
): string[] {
  const prefectures = new Set(uniqueStrings(existingPrefectures));

  for (const destinationId of visitedIds) {
    const destination = destinationById.get(destinationId);

    if (destination?.prefecture) {
      prefectures.add(formatPrefectureId(destination.prefecture));
    }
  }

  return Array.from(prefectures);
}

function getDatePart(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const datePart = value.split("T")[0];
  return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : null;
}

async function resolveHomeStationCoordinates(
  station: string,
  setHomeStationCoords: UseTripSyncProps["setHomeStationCoords"],
): Promise<void> {
  if (station.includes(", ")) {
    const [stationName, prefecture] = station.split(", ", 2);

    try {
      const response = await fetch("/data/stations-by-prefecture.json");
      if (!response.ok) return;

      const stationsByPrefecture = (await response.json()) as Record<
        string,
        Array<{ name: string; lat: number; lng: number }>
      >;

      const match = stationsByPrefecture[prefecture]?.find(
        (candidate) => candidate.name === stationName,
      );

      if (match) {
        setHomeStationCoords({ lat: match.lat, lng: match.lng });
      }
    } catch (error) {
      console.warn(
        "[Meguruto Sync] Could not resolve home station coordinates:",
        error,
      );
    }

    return;
  }

  if (!/^\d{3}-?\d{4}$/.test(station) && !/^\d+$/.test(station)) {
    return;
  }

  try {
    const postalCode = station.replace("-", "");
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?postalcode=${postalCode}&country=japan&format=json`,
    );

    if (!response.ok) return;

    const results = (await response.json()) as Array<{
      lat?: string;
      lon?: string;
    }>;

    const first = results[0];
    if (!first?.lat || !first.lon) return;

    const lat = Number.parseFloat(first.lat);
    const lng = Number.parseFloat(first.lon);

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      setHomeStationCoords({ lat, lng });
    }
  } catch (error) {
    console.warn("[Meguruto Sync] Could not geocode home postal code:", error);
  }
}

export function useTripSync({
  user,
  favorites,
  setFavorites,
  visited,
  setVisited,
  visitedPrefectures,
  setVisitedPrefectures,
  visitedDates,
  setVisitedDates,
  setLastSyncedDate,
  setCompareList,
  homeStation,
  setHomeStation,
  setHomeStationCoords,
  trips = [],
  setTrips,
  destinationRatings,
  setDestinationRatings,
}: UseTripSyncProps): UseTripSyncReturn {
  const [profileSyncStatus, setProfileSyncStatus] =
    useState<ProfileSyncStatus>("idle");
  const [tripSyncStatus, setTripSyncStatus] = useState<TripSyncStatus>("idle");
  const [retryProfileTrigger, setRetryProfileTrigger] = useState<number>(0);
  const [retryTripTrigger, setRetryTripTrigger] = useState<number>(0);

  const hydratedUserIdRef = useRef<string | null>(null);
  const hydratedTripsUserIdRef = useRef<string | null>(null);
  const previousUserIdRef = useRef(user?.id);
  const hydrationVersionRef = useRef(0);
  const profileSyncTimeoutRef = useRef<
    number | ReturnType<typeof setTimeout> | null
  >(null);
  const tripSyncTimeoutRef = useRef<
    number | ReturnType<typeof setTimeout> | null
  >(null);
  const previousTripsRef = useRef<Trip[]>(trips);

  // Clear account-scoped memory state on logout or account switch.
  useEffect(() => {
    const previousUserId = previousUserIdRef.current;
    const currentUserId = user?.id;
    const accountChanged =
      Boolean(previousUserId) && previousUserId !== currentUserId;

    if (accountChanged || (previousUserId && !currentUserId)) {
      hydratedUserIdRef.current = null;
      hydrationVersionRef.current += 1;

      if (profileSyncTimeoutRef.current) {
        clearTimeout(profileSyncTimeoutRef.current);
        profileSyncTimeoutRef.current = null;
      }

      if (tripSyncTimeoutRef.current) {
        clearTimeout(tripSyncTimeoutRef.current);
        tripSyncTimeoutRef.current = null;
      }

      setFavorites([]);
      setVisited([]);
      setVisitedPrefectures([]);
      setVisitedDates?.({});
      setCompareList([]);
      setTrips?.([]);
      setDestinationRatings?.({});
      previousTripsRef.current = [];
    } else if (currentUserId && currentUserId !== previousUserId) {
      hydratedUserIdRef.current = null;
    }

    previousUserIdRef.current = currentUserId;
  }, [
    user?.id,
    setFavorites,
    setVisited,
    setVisitedPrefectures,
    setVisitedDates,
    setCompareList,
    setTrips,
    setDestinationRatings,
  ]);

  // Hydrate user account data exclusively from Supabase without local merging
  useEffect(() => {
    const userId = user?.id;
    const client = supabase;

    if (!userId || !client) {
      hydratedUserIdRef.current = null;
      return;
    }

    hydratedUserIdRef.current = null;
    const hydrationVersion = ++hydrationVersionRef.current;

    const isCurrentHydration = () =>
      hydrationVersionRef.current === hydrationVersion &&
      previousUserIdRef.current === userId;

    const hydrateUserData = async () => {
      const { data, error } = await client
        .from("user_data")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      if (!isCurrentHydration()) return;

      if (error) {
        console.error("[Meguruto Sync] Failed to load user_data:", error);
        toast.error("Cloud data could not be loaded. Sync has been paused.", {
          id: "user-data-load-error",
        });
        return;
      }

      if (!data) {
        // Create initial row for new account
        const defaultPayload = {
          id: userId,
          favorites: [],
          visited: [],
          visited_prefectures: [],
          visited_dates: {},
          destination_ratings: {},
          home_station: "Tokyo Station",
          updated_at: new Date().toISOString(),
        };

        const { error: createError } = await client
          .from("user_data")
          .insert(defaultPayload);

        if (!isCurrentHydration()) return;

        if (createError) {
          console.error(
            "[Meguruto Sync] Failed to initialize user_data row:",
            createError,
          );
          return;
        }

        setFavorites([]);
        setVisited([]);
        setVisitedPrefectures([]);
        setVisitedDates?.({});
        setDestinationRatings?.({});
        setHomeStation("Tokyo Station");
        hydratedUserIdRef.current = userId;
        return;
      }

      const loadedDates = normalizeVisitDates(data.visited_dates);
      const loadedVisited = uniqueStrings([
        ...normalizeStringArray(data.visited),
        ...Object.keys(loadedDates),
      ]);
      const loadedPrefectures = deriveVisitedPrefectures(
        loadedVisited,
        normalizeStringArray(data.visited_prefectures),
      );
      const loadedFavorites = normalizeStringArray(data.favorites);
      const loadedRatings = normalizeDestinationRatings(
        data.destination_ratings,
      );
      const loadedHomeStation =
        typeof data.home_station === "string" &&
        data.home_station.length > 0 &&
        data.home_station !== "Tokyo Station"
          ? data.home_station
          : "Tokyo Station";

      setFavorites(loadedFavorites);
      setVisited(loadedVisited);
      setVisitedPrefectures(loadedPrefectures);
      setVisitedDates?.(loadedDates);
      setDestinationRatings?.(loadedRatings);
      setHomeStation(loadedHomeStation);

      const syncedDate = getDatePart(data.updated_at);
      if (syncedDate) {
        setLastSyncedDate?.(syncedDate);
      }

      if (loadedHomeStation !== "Tokyo Station") {
        void resolveHomeStationCoordinates(
          loadedHomeStation,
          setHomeStationCoords,
        );
      }

      hydratedUserIdRef.current = userId;
    };

    void hydrateUserData();

    return () => {
      if (hydrationVersionRef.current === hydrationVersion) {
        hydrationVersionRef.current += 1;
      }
    };
  }, [
    user?.id,
    retryProfileTrigger,
    setFavorites,
    setVisited,
    setVisitedPrefectures,
    setVisitedDates,
    setLastSyncedDate,
    setHomeStation,
    setHomeStationCoords,
    setDestinationRatings,
  ]);

  // Hydrate trips exclusively from Supabase
  useEffect(() => {
    const userId = user?.id;

    if (!userId) {
      hydratedTripsUserIdRef.current = null;
      setTripSyncStatus("idle");
      return;
    }

    hydratedTripsUserIdRef.current = null;
    setTripSyncStatus("loading");
    const hydrationVersion = hydrationVersionRef.current;

    const isCurrentHydration = () =>
      hydrationVersionRef.current === hydrationVersion &&
      previousUserIdRef.current === userId;

    const hydrateTrips = async () => {
      const tripRepository = new SupabaseTripRepository();

      try {
        const fetchedTrips = await tripRepository.fetchTrips(userId);

        if (!isCurrentHydration()) return;

        const resolvedTrips = fetchedTrips || [];
        setTrips?.(resolvedTrips);
        previousTripsRef.current = resolvedTrips;
        hydratedTripsUserIdRef.current = userId;
        setTripSyncStatus("ready");
      } catch (error) {
        if (!isCurrentHydration()) return;
        console.error(
          "[Meguruto Sync] Failed to load trips from server:",
          error,
        );
        setTripSyncStatus("error");
      }
    };

    void hydrateTrips();
  }, [user?.id, retryTripTrigger, setTrips]);

  // Persist profile changes only after successful hydration
  useEffect(() => {
    const userId = user?.id;
    const client = supabase;

    if (
      !userId ||
      !client ||
      hydratedUserIdRef.current !== userId ||
      profileSyncStatus === "error"
    ) {
      return;
    }

    if (profileSyncTimeoutRef.current) {
      clearTimeout(profileSyncTimeoutRef.current);
    }

    profileSyncTimeoutRef.current = setTimeout(() => {
      setProfileSyncStatus("saving");
      const normalizedVisitedDates = normalizeVisitDates(visitedDates ?? {});
      const safeVisited = uniqueStrings([
        ...visited,
        ...Object.keys(normalizedVisitedDates),
      ]);
      const safePrefectures = deriveVisitedPrefectures(
        safeVisited,
        visitedPrefectures,
      );
      const updatedAt = new Date().toISOString();

      const payload = {
        id: userId,
        favorites: uniqueStrings(favorites),
        visited: safeVisited,
        visited_prefectures: safePrefectures,
        visited_dates: normalizedVisitedDates,
        destination_ratings: normalizeDestinationRatings(
          destinationRatings ?? {},
        ),
        home_station: homeStation,
        updated_at: updatedAt,
      };

      void client
        .from("user_data")
        .upsert(payload)
        .then(({ error }) => {
          if (error) {
            console.error("[Meguruto Sync] Failed to sync user_data:", error);
            setProfileSyncStatus("error");
            toast.error("Failed to sync profile to cloud.", {
              id: "user-data-sync-error",
            });
            return;
          }

          setProfileSyncStatus("ready");
          const syncedDate = getDatePart(updatedAt);
          if (syncedDate) {
            setLastSyncedDate?.(syncedDate);
          }
        });
    }, 1000);

    return () => {
      if (profileSyncTimeoutRef.current) {
        clearTimeout(profileSyncTimeoutRef.current);
        profileSyncTimeoutRef.current = null;
      }
    };
  }, [
    favorites,
    visited,
    visitedPrefectures,
    visitedDates,
    destinationRatings,
    homeStation,
    user?.id,
    setLastSyncedDate,
  ]);

  // Persist trip changes only after dedicated trip hydration completes
  useEffect(() => {
    const userId = user?.id;

    if (
      !userId ||
      hydratedTripsUserIdRef.current !== userId ||
      tripSyncStatus === "error"
    ) {
      return;
    }

    const tripRepository = new SupabaseTripRepository();

    if (tripSyncTimeoutRef.current) {
      clearTimeout(tripSyncTimeoutRef.current);
    }

    tripSyncTimeoutRef.current = setTimeout(() => {
      setTripSyncStatus("saving");
      const deletedTrips = previousTripsRef.current.filter(
        (previousTrip) => !trips.some((trip) => trip.id === previousTrip.id),
      );

      const tripsToSave = trips.map((trip) => {
        const validId = isValidUUID(trip.id) ? trip.id : generateUUID();

        return {
          ...trip,
          id: validId,
          userId,
        };
      });

      const hasMigratedId = tripsToSave.some(
        (trip, index) => trip.id !== trips[index]?.id,
      );

      if (hasMigratedId) {
        setTrips?.(tripsToSave);
      }

      const deleteRequests = deletedTrips.map((trip) =>
        tripRepository.deleteTrip(trip.id),
      );
      const saveRequests = tripsToSave.map((trip) =>
        tripRepository.saveTrip(trip, userId),
      );

      void Promise.all([...deleteRequests, ...saveRequests])
        .then(() => {
          previousTripsRef.current = tripsToSave;
          setTripSyncStatus("ready");
        })
        .catch((error) => {
          console.error("Failed to sync trips to cloud", error);
          setTripSyncStatus("error");
          toast.error("Failed to sync trips to cloud.", {
            id: "trip-sync-error",
          });
        });
    }, 1000);

    return () => {
      if (tripSyncTimeoutRef.current) {
        clearTimeout(tripSyncTimeoutRef.current);
        tripSyncTimeoutRef.current = null;
      }
    };
  }, [trips, user?.id, setTrips]);

  const retryProfileHydration = () => {
    setRetryProfileTrigger((prev: number) => prev + 1);
  };

  const retryTripHydration = () => {
    setRetryTripTrigger((prev: number) => prev + 1);
  };

  return {
    profileSyncStatus,
    tripSyncStatus,
    retryProfileHydration,
    retryTripHydration,
  };
}
