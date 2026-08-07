import { useState, useEffect, useMemo, useCallback } from "react";
import type { User } from "@supabase/supabase-js";
import type { BudgetTier } from "@/shared/types/planner";
import type { TripMode } from "@/shared/services/recommendation/RecommendationContext";
import {
  getPlannerBudgetLimit,
  type HomepageTripDuration,
} from "../services/PlannerBudgetPolicy";
import {
  resolveTransportSelection,
  type TransportPreference,
} from "../services/TransportResolver";
import { normalizeCarMode } from "@/shared/utils/carMode";
import {
  getDefaultTripDuration,
  type ForecastDateSelection,
} from "../services/DefaultDurationPolicy";
import {
  ACCOMMODATION_ALLOWANCE_PRESETS,
  isValidAccommodationAllowance,
  MAX_ACCOMMODATION_ALLOWANCE,
} from "@/shared/services/budget/BudgetService";

export const DEFAULT_PLANNER_BUDGET_TIER: BudgetTier = "standard";

export interface PlannerControlsState {
  vibe: string;
  tripDuration: HomepageTripDuration;
  partySize: number;
  budgetTier: BudgetTier;
  transportPreference: TransportPreference;
  tripMode: TripMode;
  accommodationAllowance: number;
}

export interface ResolvedPlannerState extends PlannerControlsState {
  budget: number;
  carMode: "none" | "my_car" | "rental";
  publicModes: string[];
}

export function useTripPlannerState(
  user: User | null,
  initialDateSelection: ForecastDateSelection = { type: "today" },
) {
  const initialDuration = getDefaultTripDuration({
    selection: initialDateSelection,
  });

  const [configuredCarMode, setConfiguredCarMode] = useState<
    "none" | "my_car" | "rental"
  >("none");

  const [draftState, setDraftState] = useState<PlannerControlsState>({
    vibe: "any",
    tripDuration: initialDuration,
    partySize: 2,
    budgetTier: DEFAULT_PLANNER_BUDGET_TIER,
    transportPreference: "public",
    tripMode: "day_trip",
    accommodationAllowance: ACCOMMODATION_ALLOWANCE_PRESETS.standard,
  });

  const [appliedState, setAppliedState] = useState<PlannerControlsState>({
    vibe: "any",
    tripDuration: initialDuration,
    partySize: 2,
    budgetTier: DEFAULT_PLANNER_BUDGET_TIER,
    transportPreference: "public",
    tripMode: "day_trip",
    accommodationAllowance: ACCOMMODATION_ALLOWANCE_PRESETS.standard,
  });

  const [hasUserApplied, setHasUserApplied] = useState(false);

  useEffect(() => {
    if (user?.user_metadata?.preferences) {
      const prefs = user.user_metadata.preferences;
      const userCarMode = normalizeCarMode(prefs.carMode);
      const userPartySize = prefs.partySize || 2;
      setConfiguredCarMode(userCarMode);

      setDraftState((prev) => ({
        ...prev,
        partySize: userPartySize,
      }));
      setAppliedState((prev) => ({
        ...prev,
        partySize: userPartySize,
      }));
    }
  }, [user]);

  const isDirty = useMemo(() => {
    return (
      draftState.vibe !== appliedState.vibe ||
      draftState.tripDuration !== appliedState.tripDuration ||
      draftState.partySize !== appliedState.partySize ||
      draftState.budgetTier !== appliedState.budgetTier ||
      draftState.transportPreference !== appliedState.transportPreference ||
      draftState.tripMode !== appliedState.tripMode ||
      draftState.accommodationAllowance !== appliedState.accommodationAllowance
    );
  }, [draftState, appliedState]);

  const applyPlannerState = useCallback(() => {
    setAppliedState(draftState);
    setHasUserApplied(true);
  }, [draftState]);

  const resolveFullState = useCallback(
    (state: PlannerControlsState): ResolvedPlannerState => {
      const { carMode, publicModes } = resolveTransportSelection(
        state.transportPreference,
        configuredCarMode,
      );
      const budget = getPlannerBudgetLimit(
        state.budgetTier,
        state.partySize,
        state.tripDuration,
        state.tripMode,
        state.accommodationAllowance,
      );
      return {
        ...state,
        budget,
        carMode,
        publicModes,
      };
    },
    [configuredCarMode],
  );

  const resolvedDraft = useMemo(
    () => resolveFullState(draftState),
    [resolveFullState, draftState],
  );

  const resolvedApplied = useMemo(
    () => resolveFullState(appliedState),
    [resolveFullState, appliedState],
  );

  // Setters for draft state
  const setVibe = useCallback((vibe: string) => {
    setDraftState((prev) => ({ ...prev, vibe }));
  }, []);

  const setTripDuration = useCallback((tripDuration: HomepageTripDuration) => {
    setDraftState((prev) => ({ ...prev, tripDuration }));
  }, []);

  const setPartySize = useCallback((partySize: number) => {
    const clamped = Math.max(1, Math.min(8, partySize));
    setDraftState((prev) => ({ ...prev, partySize: clamped }));
  }, []);

  const setBudgetTier = useCallback((budgetTier: BudgetTier) => {
    setDraftState((prev) => ({ ...prev, budgetTier }));
  }, []);

  const setTransportPreference = useCallback(
    (transportPreference: TransportPreference) => {
      setDraftState((prev) => ({ ...prev, transportPreference }));
    },
    [],
  );

  const setTripMode = useCallback((tripMode: TripMode) => {
    setDraftState((prev) => ({ ...prev, tripMode }));
  }, []);

  const setAccommodationAllowance = useCallback((value: number) => {
    if (isValidAccommodationAllowance(value)) {
      setDraftState((prev) => ({ ...prev, accommodationAllowance: value }));
      return;
    }
    // Clamp to nearest valid bound
    const nearest = value < 0 ? 0 : MAX_ACCOMMODATION_ALLOWANCE;
    setDraftState((prev) => ({ ...prev, accommodationAllowance: nearest }));
  }, []);

  return {
    // Draft control values & setters
    draftState,
    vibe: draftState.vibe,
    setVibe,
    setTripType: setVibe, // Alias for backward compatibility
    tripDuration: draftState.tripDuration,
    setTripDuration,
    partySize: draftState.partySize,
    setPartySize,
    budgetTier: draftState.budgetTier,
    setBudgetTier,
    transportPreference: draftState.transportPreference,
    setTransportPreference,
    tripMode: draftState.tripMode,
    setTripMode,
    accommodationAllowance: draftState.accommodationAllowance,
    setAccommodationAllowance,

    // Resolved draft & applied states
    resolvedDraft,
    resolvedApplied,

    // State machine flags & actions
    hasUserApplied,
    isDirty,
    applyPlannerState,

    // Configured user preference
    configuredCarMode,
  };
}
