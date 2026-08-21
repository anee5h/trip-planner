import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { User } from "@supabase/supabase-js";
import { normalizeCarMode } from "@/shared/utils/carMode";
import {
  ACCOMMODATION_ALLOWANCE_PRESETS,
  createDefaultPlannerControls,
  isValidAccommodationAllowance,
  MAX_ACCOMMODATION_ALLOWANCE,
  type PlannerControlsState,
  type HomepageTripDuration,
  type BudgetTier,
  type TransportPreference,
  type TripMode,
} from "@/shared/types/homePlannerState";

export interface HomePlannerStateValue {
  draftState: PlannerControlsState;
  appliedState: PlannerControlsState;
  vibe: string;
  setVibe: (vibe: string) => void;
  setTripType: (vibe: string) => void;
  tripDuration: HomepageTripDuration;
  setTripDuration: (duration: HomepageTripDuration) => void;
  partySize: number;
  setPartySize: (partySize: number) => void;
  budgetTier: BudgetTier;
  setBudgetTier: (tier: BudgetTier) => void;
  transportPreference: TransportPreference;
  setTransportPreference: (preference: TransportPreference) => void;
  tripMode: TripMode;
  setTripMode: (mode: TripMode) => void;
  accommodationAllowance: number;
  setAccommodationAllowance: (value: number) => void;
  hasUserApplied: boolean;
  isDirty: boolean;
  applyPlannerState: () => void;
  configuredCarMode: "none" | "my_car" | "rental";
}

const HomePlannerStateContext = createContext<HomePlannerStateValue | null>(
  null,
);

export function HomePlannerStateProvider({
  user,
  children,
}: {
  user: User | null;
  children: React.ReactNode;
}) {
  const [configuredCarMode, setConfiguredCarMode] = useState<
    "none" | "my_car" | "rental"
  >("none");
  const [draftState, setDraftState] = useState(createDefaultPlannerControls);
  const [appliedState, setAppliedState] = useState(
    createDefaultPlannerControls,
  );
  const [hasUserApplied, setHasUserApplied] = useState(false);

  useEffect(() => {
    const preferences = user?.user_metadata?.preferences;
    if (!preferences) return;
    const userCarMode = normalizeCarMode(preferences.carMode);
    const userPartySize = preferences.partySize || 2;
    setConfiguredCarMode(userCarMode);
    setDraftState((previous) => ({ ...previous, partySize: userPartySize }));
    setAppliedState((previous) => ({ ...previous, partySize: userPartySize }));
  }, [user]);

  const isDirty = useMemo(
    () =>
      (Object.keys(draftState) as Array<keyof PlannerControlsState>).some(
        (key) => draftState[key] !== appliedState[key],
      ),
    [draftState, appliedState],
  );

  const applyPlannerState = useCallback(() => {
    setAppliedState(draftState);
    setHasUserApplied(true);
  }, [draftState]);

  const setVibe = useCallback((vibe: string) => {
    setDraftState((previous) => ({ ...previous, vibe }));
  }, []);
  const setTripDuration = useCallback((tripDuration: HomepageTripDuration) => {
    setDraftState((previous) => ({ ...previous, tripDuration }));
  }, []);
  const setPartySize = useCallback((partySize: number) => {
    const clamped = Math.max(1, Math.min(8, partySize));
    setDraftState((previous) => ({ ...previous, partySize: clamped }));
  }, []);
  const setBudgetTier = useCallback((budgetTier: BudgetTier) => {
    setDraftState((previous) => ({ ...previous, budgetTier }));
  }, []);
  const setTransportPreference = useCallback(
    (transportPreference: TransportPreference) => {
      setDraftState((previous) => ({ ...previous, transportPreference }));
    },
    [],
  );
  const setTripMode = useCallback((tripMode: TripMode) => {
    setDraftState((previous) => ({ ...previous, tripMode }));
  }, []);
  const setAccommodationAllowance = useCallback((value: number) => {
    const nextValue = isValidAccommodationAllowance(value)
      ? value
      : value < 0
        ? 0
        : MAX_ACCOMMODATION_ALLOWANCE;
    setDraftState((previous) => ({
      ...previous,
      accommodationAllowance: nextValue,
    }));
  }, []);

  const value = useMemo<HomePlannerStateValue>(
    () => ({
      draftState,
      appliedState,
      vibe: draftState.vibe,
      setVibe,
      setTripType: setVibe,
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
      hasUserApplied,
      isDirty,
      applyPlannerState,
      configuredCarMode,
    }),
    [
      draftState,
      appliedState,
      setVibe,
      setTripDuration,
      setPartySize,
      setBudgetTier,
      setTransportPreference,
      setTripMode,
      setAccommodationAllowance,
      hasUserApplied,
      isDirty,
      applyPlannerState,
      configuredCarMode,
    ],
  );

  return (
    <HomePlannerStateContext.Provider value={value}>
      {children}
    </HomePlannerStateContext.Provider>
  );
}

export function useHomePlannerState(): HomePlannerStateValue {
  const context = useContext(HomePlannerStateContext);
  if (!context) {
    throw new Error(
      "useHomePlannerState must be used within HomePlannerStateProvider",
    );
  }
  return context;
}

export { ACCOMMODATION_ALLOWANCE_PRESETS };
