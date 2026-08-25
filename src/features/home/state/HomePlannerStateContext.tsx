import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { User } from "@supabase/supabase-js";
import { normalizeCarMode, type CarMode } from "@/shared/utils/carMode";
import {
  resolveTransportSelection,
  type TransportSelection,
} from "@/features/home/services/TransportResolver";
import {
  ACCOMMODATION_ALLOWANCE_PRESETS,
  createDefaultPlannerControls,
  isValidAccommodationAllowance,
  MAX_ACCOMMODATION_ALLOWANCE,
  type PlannerControlsState,
  type HomepageTripDuration,
  type BudgetTier,
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
  publicModes: string[];
  publicTransport: boolean;
  setPublicTransport: (enabled: boolean) => void;
  carMode: CarMode;
  setCarMode: (mode: CarMode) => void;
  tripMode: TripMode;
  setTripMode: (mode: TripMode) => void;
  accommodationAllowance: number;
  setAccommodationAllowance: (value: number) => void;
  hasUserApplied: boolean;
  isDirty: boolean;
  applyPlannerState: () => void;
}

const HomePlannerStateContext = createContext<HomePlannerStateValue | null>(
  null,
);

export function HomePlannerStateProvider({
  user,
  children,
  onTransportPreferencesPersist,
}: {
  user: User | null;
  children: React.ReactNode;
  onTransportPreferencesPersist?: (selection: TransportSelection) => void;
}) {
  const [draftState, setDraftState] = useState(createDefaultPlannerControls);
  const [appliedState, setAppliedState] = useState(
    createDefaultPlannerControls,
  );
  const [hasUserApplied, setHasUserApplied] = useState(false);

  useEffect(() => {
    const preferences = user?.user_metadata?.preferences;
    if (!preferences) return;
    const userCarMode = normalizeCarMode(preferences.carMode);
    const persistedPublicModes = preferences.publicModes;
    const userPublicTransport = Array.isArray(persistedPublicModes)
      ? persistedPublicModes.length > 0
      : true;
    const userPartySize = preferences.partySize || 2;
    setDraftState((previous) => ({
      ...previous,
      publicModes: Array.isArray(persistedPublicModes)
        ? [...persistedPublicModes]
        : [],
      carMode: userCarMode,
      publicTransport: userPublicTransport,
      partySize: userPartySize,
    }));
    setAppliedState((previous) => ({
      ...previous,
      publicModes: Array.isArray(persistedPublicModes)
        ? [...persistedPublicModes]
        : [],
      carMode: userCarMode,
      publicTransport: userPublicTransport,
      partySize: userPartySize,
    }));
  }, [user]);

  const isDirty = useMemo(
    () =>
      (Object.keys(draftState) as Array<keyof PlannerControlsState>).some(
        (key) => {
          const draftValue = draftState[key];
          const appliedValue = appliedState[key];
          if (Array.isArray(draftValue) && Array.isArray(appliedValue)) {
            return (
              draftValue.length !== appliedValue.length ||
              draftValue.some((value, index) => value !== appliedValue[index])
            );
          }
          return draftValue !== appliedValue;
        },
      ),
    [draftState, appliedState],
  );

  const applyPlannerState = useCallback(() => {
    setAppliedState(draftState);
    setHasUserApplied(true);
    onTransportPreferencesPersist?.(
      resolveTransportSelection(
        draftState.publicTransport,
        draftState.carMode,
        draftState.publicModes,
      ),
    );
  }, [draftState, onTransportPreferencesPersist]);

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
  const setPublicTransport = useCallback((publicTransport: boolean) => {
    setDraftState((previous) => ({ ...previous, publicTransport }));
  }, []);
  const setCarMode = useCallback((carMode: CarMode) => {
    setDraftState((previous) => ({ ...previous, carMode }));
  }, []);
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
      publicModes: draftState.publicModes,
      publicTransport: draftState.publicTransport,
      setPublicTransport,
      carMode: draftState.carMode,
      setCarMode,
      tripMode: draftState.tripMode,
      setTripMode,
      accommodationAllowance: draftState.accommodationAllowance,
      setAccommodationAllowance,
      hasUserApplied,
      isDirty,
      applyPlannerState,
    }),
    [
      draftState,
      appliedState,
      setVibe,
      setTripDuration,
      setPartySize,
      setBudgetTier,
      setPublicTransport,
      setCarMode,
      setTripMode,
      setAccommodationAllowance,
      hasUserApplied,
      isDirty,
      applyPlannerState,
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
