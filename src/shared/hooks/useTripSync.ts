import { useEffect, useRef, useState } from "react";
import type { PostgrestError, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import type { Trip } from "@/shared/types/trip";
import { SupabaseTripRepository } from "@/shared/services/trips/TripRepository";
import { generateUUID, isValidUUID } from "@/shared/utils/uuid";
// KAI-121: useTripSync runs inside the app ROOT (TripStore). It must NOT
// pull the full catalogue (6.5 MB) into the entry closure — it only needs
// prefecture lookups, which the SUMMARY (lite) index provides. The full
// index stays a runtime-lazy fetch for full-data surfaces only.
import destinationsIndex from "@/shared/data/destinations-index.lite.json";
import type { Destination } from "@/shared/types/destination";
import { formatPrefectureId } from "@/shared/hooks/useTripStore";
import type { OriginLocation } from "@/shared/hooks/useTripStore";
import { resolveOriginTransportZone } from "@/shared/services/transport/TransportTopologyService";
import { withJwtFutureRecovery } from "@/shared/hooks/jwtRecovery";
import { getLocalizedStationNameOnly } from "@/shared/utils/formatOriginLocation";

type VisitDates = Record<string, string[] | string>;
type DestinationRatings = Record<string, "up" | "down">;

interface ProfileSnapshot {
  favorites: string[];
  visited: string[];
  visitedPrefectures: string[];
  visitedDates: VisitDates;
  destinationRatings: DestinationRatings;
  homeStation: string;
}

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
  savedHomeStation: string;
  guestOrigin: OriginLocation;
  setActiveOrigin: (origin: OriginLocation) => void;
  trips?: Trip[];
  setTrips?: (val: Trip[] | ((prev: Trip[]) => Trip[])) => void;
  destinationRatings?: DestinationRatings;
  setDestinationRatings?: (
    val:
      DestinationRatings | ((prev: DestinationRatings) => DestinationRatings),
  ) => void;
}

export type ProfileSyncStatus =
  | "idle"
  | "loading"
  | "ready"
  | "saving"
  | "error"
  /** Coordinate resolution for the saved station failed; the user may
   * re-select their station to recover. Other profile mutations remain
   * blocked until the corrected station is persisted successfully. */
  | "origin_error";

export type TripSyncStatus = "idle" | "loading" | "ready" | "saving" | "error";

export interface UseTripSyncReturn {
  profileSyncStatus: ProfileSyncStatus;
  tripSyncStatus: TripSyncStatus;
  retryProfileHydration: () => void;
  retryTripHydration: () => void;
  /** Persist a user-chosen corrected station after a coordinate-resolution
   * failure. Only callable when profileSyncStatus === "origin_error". */
  persistCorrectedOrigin: (
    origin: import("./useTripStore").OriginLocation,
  ) => Promise<void>;
}

const DEFAULT_TOKYO_COORDS = { lat: 35.6812, lng: 139.7671 };

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

function serializeProfileSnapshot(snapshot: ProfileSnapshot): string {
  return JSON.stringify(snapshot);
}

function isValidResolvedCoordinates(
  coords: unknown,
): coords is { lat: number; lng: number } {
  return (
    coords !== null &&
    typeof coords === "object" &&
    typeof (coords as Record<string, unknown>).lat === "number" &&
    typeof (coords as Record<string, unknown>).lng === "number" &&
    Number.isFinite((coords as Record<string, number>).lat) &&
    Number.isFinite((coords as Record<string, number>).lng) &&
    (coords as Record<string, number>).lat >= -90 &&
    (coords as Record<string, number>).lat <= 90 &&
    (coords as Record<string, number>).lng >= -180 &&
    (coords as Record<string, number>).lng <= 180
  );
}

interface ResolvedStation {
  lat: number;
  lng: number;
  /** Whether the label contained a prefecture suffix ("Station, Prefecture")
   * or was resolved as a unique legacy name without a prefecture. Postal
   * codes always produce "postal_code". */
  source: "station" | "postal_code";
}

function stationKey(name: string): string {
  return getLocalizedStationNameOnly(name, "en")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

async function resolveHomeStationCoordinates(
  station: string,
): Promise<ResolvedStation | null> {
  if (station.includes(", ")) {
    const [stationName, prefecture] = station.split(", ", 2);

    try {
      const response = await fetch("/data/stations-by-prefecture.json");
      if (!response.ok) return null;

      const stationsByPrefecture = (await response.json()) as Record<
        string,
        Array<{ name: string; lat: number; lng: number }>
      >;

      const target = stationKey(stationName);
      const match = stationsByPrefecture[prefecture]?.find(
        (candidate) => stationKey(candidate.name) === target,
      );

      if (
        match &&
        isValidResolvedCoordinates({ lat: match.lat, lng: match.lng })
      ) {
        return { lat: match.lat, lng: match.lng, source: "station" };
      }
    } catch (error) {
      console.warn(
        "[Meguruto Sync] Could not resolve home station coordinates:",
        error,
      );
    }

    return null;
  }

  // Legacy cloud labels without a prefecture: search all prefecture lists
  // for an exact unique match. Reject ambiguous or missing matches.
  if (
    station.length > 0 &&
    !/^\d{3}-?\d{4}$/.test(station) &&
    !/^\d+$/.test(station)
  ) {
    try {
      const response = await fetch("/data/stations-by-prefecture.json");
      if (!response.ok) return null;

      const stationsByPrefecture = (await response.json()) as Record<
        string,
        Array<{ name: string; lat: number; lng: number }>
      >;

      const matches: Array<{ lat: number; lng: number }> = [];
      const target = stationKey(station);
      for (const stations of Object.values(stationsByPrefecture)) {
        const found = stations.find(
          (candidate) => stationKey(candidate.name) === target,
        );
        if (
          found &&
          isValidResolvedCoordinates({ lat: found.lat, lng: found.lng })
        ) {
          matches.push({ lat: found.lat, lng: found.lng });
        }
      }

      if (matches.length === 1) {
        return { ...matches[0], source: "station" };
      }
    } catch (error) {
      console.warn(
        "[Meguruto Sync] Could not resolve legacy station label:",
        error,
      );
    }
    return null;
  }

  if (!/^\d{3}-?\d{4}$/.test(station) && !/^\d+$/.test(station)) {
    return null;
  }

  try {
    const postalCode = station.replace("-", "");
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?postalcode=${postalCode}&country=japan&format=json`,
    );

    if (!response.ok) return null;

    const results = (await response.json()) as Array<{
      lat?: string;
      lon?: string;
    }>;

    const first = results[0];
    if (!first?.lat || !first.lon) return null;

    const lat = Number.parseFloat(first.lat);
    const lng = Number.parseFloat(first.lon);

    if (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      isValidResolvedCoordinates({ lat, lng })
    ) {
      return { lat, lng, source: "postal_code" };
    }
  } catch (error) {
    console.warn("[Meguruto Sync] Could not geocode home postal code:", error);
  }

  return null;
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
  savedHomeStation,
  guestOrigin,
  setActiveOrigin,
  trips = [],
  setTrips,
  destinationRatings,
  setDestinationRatings,
}: UseTripSyncProps): UseTripSyncReturn {
  const [profileSyncStatus, setProfileSyncStatus] =
    useState<ProfileSyncStatus>("idle");
  const [profileStatusUserId, setProfileStatusUserId] = useState<string | null>(
    null,
  );
  const [tripSyncStatus, setTripSyncStatus] = useState<TripSyncStatus>("idle");
  const [retryProfileTrigger, setRetryProfileTrigger] = useState<number>(0);
  const [retryTripTrigger, setRetryTripTrigger] = useState<number>(0);

  const hydratedUserIdRef = useRef<string | null>(null);
  const hydratedTripsUserIdRef = useRef<string | null>(null);
  const previousUserIdRef = useRef(user?.id);
  const hydrationVersionRef = useRef(0);
  // Non-null while profileSyncStatus === "origin_error" so that
  // persistCorrectedOrigin knows which account to upsert.
  const pendingOriginRepairUserIdRef = useRef<string | null>(null);
  const profileSyncTimeoutRef = useRef<
    number | ReturnType<typeof setTimeout> | null
  >(null);
  const tripSyncTimeoutRef = useRef<
    number | ReturnType<typeof setTimeout> | null
  >(null);
  const previousTripsRef = useRef<Trip[]>(trips);
  const lastSyncedProfileRef = useRef<string | null>(null);

  // Clear account-scoped memory state on logout or account switch.
  useEffect(() => {
    const previousUserId = previousUserIdRef.current;
    const currentUserId = user?.id;
    const accountChanged =
      Boolean(previousUserId) && previousUserId !== currentUserId;

    if (accountChanged || (previousUserId && !currentUserId)) {
      hydratedUserIdRef.current = null;
      lastSyncedProfileRef.current = null;
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
      setActiveOrigin(guestOrigin);
    } else if (currentUserId && currentUserId !== previousUserId) {
      hydratedUserIdRef.current = null;
      lastSyncedProfileRef.current = null;
      // Current-location origin is runtime-only; account hydration starts from
      // the saved guest snapshot until the account's saved origin is loaded.
      setActiveOrigin(guestOrigin);
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
    guestOrigin,
    setActiveOrigin,
  ]);

  // Hydrate user account data exclusively from Supabase without local merging
  useEffect(() => {
    const userId = user?.id;
    const client = supabase;

    if (!userId || !client) {
      hydratedUserIdRef.current = null;
      lastSyncedProfileRef.current = null;
      setProfileStatusUserId(null);
      setProfileSyncStatus("idle");
      return;
    }

    hydratedUserIdRef.current = null;
    lastSyncedProfileRef.current = null;
    setProfileStatusUserId(userId);
    setProfileSyncStatus("loading");
    const hydrationVersion = ++hydrationVersionRef.current;

    const isCurrentHydration = () =>
      hydrationVersionRef.current === hydrationVersion &&
      previousUserIdRef.current === userId;

    const hydrateUserData = async () => {
      const { data, error } = await withJwtFutureRecovery(
        client,
        () =>
          client.from("user_data").select("*").eq("id", userId).maybeSingle(),
        {
          phase: "user_data.hydrate",
          isStillCurrent: isCurrentHydration,
          userId,
        },
      );

      if (!isCurrentHydration()) return;

      if (error) {
        console.error("[Meguruto Sync] Failed to load user_data:", error);
        setProfileSyncStatus("error");
        toast.error("Cloud data could not be loaded. Sync has been paused.", {
          id: "user-data-load-error",
        });
        return;
      }

      if (!data) {
        // New account: adopt guest origin if it is genuinely guest-owned,
        // otherwise use Tokyo Station default.
        const adoptGuestOrigin = guestOrigin.source !== "default";

        const initialHomeStation = adoptGuestOrigin
          ? guestOrigin.label
          : "Tokyo Station";

        const initialOrigin: OriginLocation = adoptGuestOrigin
          ? guestOrigin
          : {
              label: "Tokyo Station",
              coordinates: DEFAULT_TOKYO_COORDS,
              source: "default",
              transportZoneId: resolveOriginTransportZone({
                coordinates: DEFAULT_TOKYO_COORDS,
                label: "Tokyo Station",
              }),
            };

        const defaultPayload = {
          id: userId,
          favorites: [],
          visited: [],
          visited_prefectures: [],
          visited_dates: {},
          destination_ratings: {},
          home_station: initialHomeStation,
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
          setProfileSyncStatus("error");
          return;
        }

        lastSyncedProfileRef.current = serializeProfileSnapshot({
          favorites: [],
          visited: [],
          visitedPrefectures: [],
          visitedDates: {},
          destinationRatings: {},
          homeStation: initialHomeStation,
        });
        setFavorites([]);
        setVisited([]);
        setVisitedPrefectures([]);
        setVisitedDates?.({});
        setDestinationRatings?.({});
        setActiveOrigin(initialOrigin);
        hydratedUserIdRef.current = userId;
        setProfileSyncStatus("ready");
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
        typeof data.home_station === "string" && data.home_station.length > 0
          ? data.home_station
          : "Tokyo Station";

      lastSyncedProfileRef.current = serializeProfileSnapshot({
        favorites: loadedFavorites,
        visited: loadedVisited,
        visitedPrefectures: loadedPrefectures,
        visitedDates: loadedDates,
        destinationRatings: loadedRatings,
        homeStation: loadedHomeStation,
      });
      setFavorites(loadedFavorites);
      setVisited(loadedVisited);
      setVisitedPrefectures(loadedPrefectures);
      setVisitedDates?.(loadedDates);
      setDestinationRatings?.(loadedRatings);

      if (loadedHomeStation !== "Tokyo Station") {
        const coords = await resolveHomeStationCoordinates(loadedHomeStation);
        if (!isCurrentHydration()) return;

        if (!coords) {
          // Coordinate resolution failed: do NOT pair the station label with
          // default Tokyo coordinates. Use "origin_error" so the user can
          // re-select their station; do not mark hydration complete, do not
          // upsert fallback data. Generic cloud-load errors keep "error".
          console.error(
            "[Meguruto Sync] Could not resolve coordinates for home station:",
            loadedHomeStation,
          );
          setActiveOrigin({
            label: "Tokyo Station",
            coordinates: DEFAULT_TOKYO_COORDS,
            source: "default",
            transportZoneId: resolveOriginTransportZone({
              coordinates: DEFAULT_TOKYO_COORDS,
              label: "Tokyo Station",
            }),
          });
          // Store the user id so persistCorrectedOrigin can target it.
          pendingOriginRepairUserIdRef.current = userId;
          setProfileSyncStatus("origin_error");
          toast.error(
            "Could not resolve your saved home station. Please re-select it below.",
            { id: "home-station-resolve-error" },
          );
          return;
        }

        const { lat, lng, source: stationSource } = coords;
        setActiveOrigin({
          label: loadedHomeStation,
          coordinates: { lat, lng },
          source: stationSource,
          transportZoneId: resolveOriginTransportZone({
            coordinates: { lat, lng },
            label: loadedHomeStation,
          }),
        });
      } else {
        if (isCurrentHydration()) {
          setActiveOrigin({
            label: "Tokyo Station",
            coordinates: DEFAULT_TOKYO_COORDS,
            source: "default",
            transportZoneId: resolveOriginTransportZone({
              coordinates: DEFAULT_TOKYO_COORDS,
              label: "Tokyo Station",
            }),
          });
        }
      }

      if (!isCurrentHydration()) return;

      const syncedDate = getDatePart(data.updated_at);
      if (syncedDate) {
        setLastSyncedDate?.(syncedDate);
      }

      hydratedUserIdRef.current = userId;
      setProfileSyncStatus("ready");
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
    setActiveOrigin,
    setDestinationRatings,
    guestOrigin,
  ]);

  // Hydrate trips exclusively from Supabase
  useEffect(() => {
    const userId = user?.id;
    const client = supabase;

    if (!userId || !client) {
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

      const { data: fetchedTrips, error } = await withJwtFutureRecovery(
        client,
        async () => {
          try {
            const fetched = await tripRepository.fetchTrips(userId);
            return { data: fetched, error: null };
          } catch (requestError) {
            return {
              data: [] as Trip[],
              error: requestError as PostgrestError,
            };
          }
        },
        {
          phase: "trips.hydrate",
          isStillCurrent: isCurrentHydration,
          userId,
        },
      );

      if (!isCurrentHydration()) return;

      if (error) {
        console.error(
          "[Meguruto Sync] Failed to load trips from server:",
          error,
        );
        setTripSyncStatus("error");
        return;
      }

      const resolvedTrips = fetchedTrips || [];
      setTrips?.(resolvedTrips);
      previousTripsRef.current = resolvedTrips;
      hydratedTripsUserIdRef.current = userId;
      setTripSyncStatus("ready");
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

    const normalizedVisitedDates = normalizeVisitDates(visitedDates ?? {});
    const safeVisited = uniqueStrings([
      ...visited,
      ...Object.keys(normalizedVisitedDates),
    ]);
    const safePrefectures = deriveVisitedPrefectures(
      safeVisited,
      visitedPrefectures,
    );
    const normalizedFavorites = uniqueStrings(favorites);
    const normalizedRatings = normalizeDestinationRatings(
      destinationRatings ?? {},
    );
    const snapshot = serializeProfileSnapshot({
      favorites: normalizedFavorites,
      visited: safeVisited,
      visitedPrefectures: safePrefectures,
      visitedDates: normalizedVisitedDates,
      destinationRatings: normalizedRatings,
      homeStation: savedHomeStation,
    });

    if (lastSyncedProfileRef.current === snapshot) return;

    if (profileSyncTimeoutRef.current) {
      clearTimeout(profileSyncTimeoutRef.current);
    }

    profileSyncTimeoutRef.current = setTimeout(() => {
      if (
        previousUserIdRef.current !== userId ||
        hydratedUserIdRef.current !== userId
      ) {
        return;
      }

      setProfileSyncStatus("saving");
      const updatedAt = new Date().toISOString();

      const payload = {
        id: userId,
        favorites: normalizedFavorites,
        visited: safeVisited,
        visited_prefectures: safePrefectures,
        visited_dates: normalizedVisitedDates,
        destination_ratings: normalizedRatings,
        home_station: savedHomeStation,
        updated_at: updatedAt,
      };

      void (async () => {
        const { error } = await withJwtFutureRecovery(
          client,
          () => client.from("user_data").upsert(payload),
          {
            phase: "user_data.save",
            isStillCurrent: () =>
              previousUserIdRef.current === userId &&
              hydratedUserIdRef.current === userId,
            userId,
          },
        );

        if (
          previousUserIdRef.current !== userId ||
          hydratedUserIdRef.current !== userId
        ) {
          return;
        }

        if (error) {
          console.error("[Meguruto Sync] Failed to sync user_data:", error);
          setProfileSyncStatus("error");
          toast.error("Failed to sync profile to cloud.", {
            id: "user-data-sync-error",
          });
          return;
        }

        lastSyncedProfileRef.current = snapshot;
        setProfileSyncStatus("ready");
        const syncedDate = getDatePart(updatedAt);
        if (syncedDate) {
          setLastSyncedDate?.(syncedDate);
        }
      })();
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
    savedHomeStation,
    user?.id,
    setLastSyncedDate,
  ]);

  // Persist trip changes only after dedicated trip hydration completes
  useEffect(() => {
    const userId = user?.id;
    const client = supabase;

    if (
      !userId ||
      !client ||
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

      void (async () => {
        const { error } = await withJwtFutureRecovery(
          client,
          async () => {
            try {
              await Promise.all([...deleteRequests, ...saveRequests]);
              return { data: null, error: null };
            } catch (requestError) {
              return {
                data: null,
                error: requestError as PostgrestError,
              };
            }
          },
          {
            phase: "trips.save",
            isStillCurrent: () =>
              previousUserIdRef.current === userId &&
              hydratedTripsUserIdRef.current === userId,
            userId,
          },
        );

        if (
          previousUserIdRef.current !== userId ||
          hydratedTripsUserIdRef.current !== userId
        ) {
          return;
        }

        if (error) {
          console.error("Failed to sync trips to cloud", error);
          setTripSyncStatus("error");
          toast.error("Failed to sync trips to cloud.", {
            id: "trip-sync-error",
          });
          return;
        }

        previousTripsRef.current = tripsToSave;
        setTripSyncStatus("ready");
      })();
    }, 1000);

    return () => {
      if (tripSyncTimeoutRef.current) {
        clearTimeout(tripSyncTimeoutRef.current);
        tripSyncTimeoutRef.current = null;
      }
    };
  }, [trips, user?.id, setTrips]);

  const retryProfileHydration = () => {
    if (
      !user?.id ||
      (profileSyncStatus !== "error" && profileSyncStatus !== "origin_error")
    )
      return;
    pendingOriginRepairUserIdRef.current = null;
    setRetryProfileTrigger((prev: number) => prev + 1);
  };

  const retryTripHydration = () => {
    setRetryTripTrigger((prev: number) => prev + 1);
  };

  /**
   * Persist a corrected origin chosen by the user after a coordinate-resolution
   * failure. Upserts only home_station; transitions status to "ready" on
   * success so normal sync resumes. Only acts when status is "origin_error".
   */
  const persistCorrectedOrigin = async (
    origin: OriginLocation,
  ): Promise<void> => {
    const userId = pendingOriginRepairUserIdRef.current;
    if (
      !userId ||
      !supabase ||
      profileSyncStatus !== "origin_error" ||
      previousUserIdRef.current !== userId
    ) {
      return;
    }
    const client = supabase;

    setProfileSyncStatus("saving");

    const { error } = await withJwtFutureRecovery(
      client,
      () =>
        client.from("user_data").upsert({
          id: userId,
          home_station: origin.label,
          updated_at: new Date().toISOString(),
        }),
      {
        phase: "user_data.origin_repair",
        isStillCurrent: () =>
          previousUserIdRef.current === userId &&
          pendingOriginRepairUserIdRef.current === userId,
        userId,
      },
    );

    if (previousUserIdRef.current !== userId) return;

    if (error) {
      console.error(
        "[Meguruto Sync] Failed to persist corrected origin:",
        error,
      );
      setProfileSyncStatus("origin_error");
      toast.error("Failed to save corrected station. Please try again.", {
        id: "origin-repair-error",
      });
      return;
    }

    pendingOriginRepairUserIdRef.current = null;
    hydratedUserIdRef.current = userId;
    lastSyncedProfileRef.current = null; // force next save to recalculate
    setActiveOrigin(origin);
    setProfileSyncStatus("ready");
  };

  return {
    profileSyncStatus: !user?.id
      ? "idle"
      : profileStatusUserId === user.id
        ? profileSyncStatus
        : "loading",
    tripSyncStatus,
    retryProfileHydration,
    retryTripHydration,
    persistCorrectedOrigin,
  };
}
