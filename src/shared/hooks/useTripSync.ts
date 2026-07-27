import { useEffect, useRef } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import type { Trip } from "@/shared/types/trip";
import { SupabaseTripRepository } from "@/shared/services/trips/TripRepository";
import { generateUUID, isValidUUID } from "@/shared/utils/uuid";

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
  visitedDates?: Record<string, string[] | string>;
  setVisitedDates?: (
    val:
      | Record<string, string[] | string>
      | ((
          prev: Record<string, string[] | string>,
        ) => Record<string, string[] | string>),
  ) => void;
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
  setCompareList,
  homeStation,
  setHomeStation,
  setHomeStationCoords,
  trips = [],
  setTrips,
}: UseTripSyncProps) {
  const isLoadedRef = useRef(false);
  const prevUserIdRef = useRef(user?.id);
  const syncTimeoutRef = useRef<number | ReturnType<typeof setTimeout> | null>(
    null,
  );
  const tripSyncTimeoutRef = useRef<
    number | ReturnType<typeof setTimeout> | null
  >(null);
  const prevTripsRef = useRef<Trip[]>(trips);

  // Clear data on logout, reset load state on user change
  useEffect(() => {
    if (prevUserIdRef.current && !user?.id) {
      setFavorites([]);
      setVisited([]);
      setVisitedPrefectures([]);
      if (setVisitedDates) setVisitedDates({});
      setCompareList([]);
      if (setTrips) setTrips([]);
      isLoadedRef.current = false;
    } else if (user?.id && user.id !== prevUserIdRef.current) {
      isLoadedRef.current = false;
    }
    prevUserIdRef.current = user?.id;
  }, [
    user?.id,
    setFavorites,
    setVisited,
    setVisitedPrefectures,
    setVisitedDates,
    setCompareList,
    setTrips,
  ]);

  // Fetch initial data on login
  useEffect(() => {
    if (user?.id && !isLoadedRef.current) {
      if (!supabase) return;

      // Load user metadata
      supabase
        .from("user_data")
        .select(
          "favorites, visited, visited_prefectures, home_station, visited_dates",
        )
        .eq("id", user.id)
        .single()
        .then(({ data, error }) => {
          if (error && error.code !== "PGRST116") {
            console.error("Failed to load user data", error);
            return;
          }
          if (data) {
            if (data.favorites) setFavorites(data.favorites);
            if (data.visited) setVisited(data.visited);
            if (data.visited_prefectures)
              setVisitedPrefectures(data.visited_prefectures);
            if (data.visited_dates && setVisitedDates) {
              setVisitedDates((prev) => {
                const merged = { ...prev };
                for (const [id, remoteVal] of Object.entries(
                  data.visited_dates as Record<string, string[] | string>,
                )) {
                  const remoteDates = Array.isArray(remoteVal)
                    ? remoteVal
                    : [remoteVal];
                  const localDates = merged[id]
                    ? Array.isArray(merged[id])
                      ? (merged[id] as string[])
                      : [merged[id] as string]
                    : [];
                  const combined = Array.from(
                    new Set([...localDates, ...remoteDates]),
                  ).sort();
                  if (combined.length > 0) {
                    merged[id] = combined;
                  }
                }
                return merged;
              });
            }
            if (data.home_station && data.home_station !== "Tokyo Station") {
              setHomeStation(data.home_station);

              if (data.home_station.includes(", ")) {
                const [stName, pref] = data.home_station.split(", ");
                fetch("/data/stations-by-prefecture.json")
                  .then((r) => r.json())
                  .then((stationsMap) => {
                    const st = stationsMap[pref]?.find(
                      (s: { name: string; lat: number; lng: number }) =>
                        s.name === stName,
                    );
                    if (st) setHomeStationCoords({ lat: st.lat, lng: st.lng });
                  })
                  .catch(console.error);
              } else if (
                /^\d{3}-?\d{4}$/.test(data.home_station) ||
                /^\d+$/.test(data.home_station)
              ) {
                const cleanZip = data.home_station.replace("-", "");
                fetch(
                  `https://nominatim.openstreetmap.org/search?postalcode=${cleanZip}&country=japan&format=json`,
                )
                  .then((r) => r.json())
                  .then((d) => {
                    if (d && d.length > 0) {
                      setHomeStationCoords({
                        lat: parseFloat(d[0].lat),
                        lng: parseFloat(d[0].lon),
                      });
                    }
                  })
                  .catch(console.error);
              }
            }
          }
        });

      // Load trips using repository
      const tripRepo = new SupabaseTripRepository();
      tripRepo
        .fetchTrips(user.id)
        .then((fetchedTrips) => {
          if (fetchedTrips && fetchedTrips.length > 0 && setTrips) {
            setTrips(fetchedTrips);
            prevTripsRef.current = fetchedTrips;
          }
        })
        .catch((err) => {
          console.warn(
            "Could not load trips from server, using local copy.",
            err,
          );
        })
        .finally(() => {
          setTimeout(() => {
            isLoadedRef.current = true;
          }, 0);
        });
    }
  }, [
    user?.id,
    setFavorites,
    setVisited,
    setVisitedPrefectures,
    setVisitedDates,
    setHomeStation,
    setHomeStationCoords,
    setTrips,
  ]);

  // Sync user metadata back to db when state changes
  useEffect(() => {
    if (user?.id && isLoadedRef.current) {
      const client = supabase;
      if (!client) return;

      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);

      syncTimeoutRef.current = setTimeout(() => {
        client
          .from("user_data")
          .upsert({
            id: user.id,
            favorites,
            visited,
            visited_prefectures: visitedPrefectures,
            visited_dates: visitedDates || {},
            home_station: homeStation,
          })
          .then(({ error }) => {
            if (error) {
              console.error("Failed to sync user data", error);
              toast.error("Failed to sync profile to cloud. Saved locally.", {
                id: "user-data-sync-error",
              });
            }
          });
      }, 1000);
    }

    return () => {
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    };
  }, [
    favorites,
    visited,
    visitedPrefectures,
    visitedDates,
    homeStation,
    user?.id,
  ]);

  // Sync trips back to db when trips state changes (debounced)
  useEffect(() => {
    if (user?.id && isLoadedRef.current) {
      const tripRepo = new SupabaseTripRepository();

      // Handle deleted trips
      const deletedTrips = prevTripsRef.current.filter(
        (prevTrip) => !trips.some((t) => t.id === prevTrip.id),
      );
      deletedTrips.forEach((t) => {
        tripRepo.deleteTrip(t.id).catch((err) => {
          console.error("Failed to delete trip from cloud", err);
          toast.error("Failed to sync trip deletion to cloud.", {
            id: "trip-delete-error",
          });
        });
      });

      if (tripSyncTimeoutRef.current) clearTimeout(tripSyncTimeoutRef.current);

      tripSyncTimeoutRef.current = setTimeout(() => {
        let hasMigratedId = false;
        const tripsToSave = trips.map((t) => {
          const validId = isValidUUID(t.id) ? t.id : generateUUID();
          if (validId !== t.id) hasMigratedId = true;
          return {
            ...t,
            id: validId,
            userId: t.userId || user.id,
          };
        });

        if (hasMigratedId && setTrips) {
          setTrips(tripsToSave);
        }

        Promise.all(tripsToSave.map((t) => tripRepo.saveTrip(t, user.id)))
          .then(() => {
            // Trips successfully synced to cloud
          })
          .catch((err) => {
            console.error("Failed to sync trips to cloud", err);
            toast.error("Failed to sync trips to cloud. Saved locally.", {
              id: "trip-sync-error",
            });
          });
      }, 1000);

      prevTripsRef.current = trips;
    }

    return () => {
      if (tripSyncTimeoutRef.current) clearTimeout(tripSyncTimeoutRef.current);
    };
  }, [trips, user?.id]);
}
