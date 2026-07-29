import { useState, useEffect } from "react";
import type { User } from "@supabase/supabase-js";
import type { TripDuration } from "@/shared/services/recommendation/RecommendationContext";
import {
  PARTY_SIZE,
  type DiningStyle,
  type PartyProfile,
} from "@/shared/types/planner";

export function useTripPlannerState(user: User | null) {
  const [vibe, setVibe] = useState<string>("any");
  const [budget, setBudget] = useState<number>(100000);
  const [carMode, setCarMode] = useState<string>("none");
  const [publicModes, setPublicModes] = useState<string[]>([
    "train",
    "shinkansen",
    "bus",
    "flight",
  ]);
  const [partyProfile, setPartyProfile] = useState<PartyProfile>("couple");
  const [diningStyle, setDiningStyle] = useState<DiningStyle>("standard");
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
      const savedPartySize = user.user_metadata.preferences.partySize;
      setPartyProfile(
        savedPartySize === 1
          ? "solo"
          : savedPartySize >= 4
            ? "group"
            : "couple",
      );
    }
  }, [user]);

  return {
    vibe,
    setVibe,
    budget,
    setBudget,
    carMode,
    setCarMode,
    publicModes,
    setPublicModes,
    partyProfile,
    setPartyProfile,
    diningStyle,
    setDiningStyle,
    partySize: PARTY_SIZE[partyProfile],
    tripDuration,
    setTripDuration,
  };
}
