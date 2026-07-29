import { useState, useEffect } from "react";
import type { User } from "@supabase/supabase-js";
import type { TripDuration } from "@/shared/services/recommendation/RecommendationContext";

export function useTripPlannerState(user: User | null) {
  const [tripType, setTripType] = useState<string>("any");
  const [budget, setBudget] = useState<number>(30000);
  const [carMode, setCarMode] = useState<string>("none");
  const [publicModes, setPublicModes] = useState<string[]>([
    "train",
    "shinkansen",
    "bus",
    "flight",
  ]);
  const [partySize, setPartySize] = useState<number>(2);
  const [weather, setWeather] = useState<string>("any");
  const [tripDuration, setTripDuration] = useState<TripDuration>("any");

  useEffect(() => {
    if (user?.user_metadata?.preferences) {
      setCarMode(user.user_metadata.preferences.carMode || "none");
      setPublicModes(
        user.user_metadata.preferences.publicModes || [
          "train",
          "shinkansen",
          "bus",
          "flight",
        ],
      );
      setPartySize(user.user_metadata.preferences.partySize || 2);
    }
  }, [user]);

  return {
    tripType,
    setTripType,
    budget,
    setBudget,
    carMode,
    setCarMode,
    publicModes,
    setPublicModes,
    partySize,
    setPartySize,
    weather,
    setWeather,
    tripDuration,
    setTripDuration,
  };
}
