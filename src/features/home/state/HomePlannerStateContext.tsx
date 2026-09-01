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
  createDefaultPlannerControls,
  type PlannerControlsState,
  type HomepageTripDuration,
  type BudgetTier,
} from "@/shared/types/homePlannerState";
import { normalizeHomepageTripDuration } from "@/shared/types/tripDuration";

function homepageDurationFromUrl(): HomepageTripDuration | undefined {
  if (typeof window === "undefined") return undefined;
  const params = new URLSearchParams(window.location.search);
  const explicitDuration = normalizeHomepageTripDuration(
    params.get("duration"),
  );
  const legacyDuration = normalizeHomepageTripDuration(params.get("tripMode"));
  return explicitDuration ?? legacyDuration;
}

function replaceHomepageUrl(params: URLSearchParams) {
  const query = params.toString();
  window.history.replaceState(
    window.history.state,
    "",
    `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
  );
}

function migrateHomepageDurationUrl() {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const explicitDuration = normalizeHomepageTripDuration(
    params.get("duration"),
  );
  const legacyDuration = normalizeHomepageTripDuration(params.get("tripMode"));
  const duration = explicitDuration ?? legacyDuration;
  if (!duration) {
    if (params.has("duration") || params.has("tripMode")) {
      params.delete("duration");
      params.delete("tripMode");
      replaceHomepageUrl(params);
    }
    return;
  }

  if (params.get("duration") === duration && !params.has("tripMode")) {
    return;
  }

  params.delete("tripMode");
  params.set("duration", duration);
  replaceHomepageUrl(params);
}

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
  onPlannerPreferencesPersist,
}: {
  user: User | null;
  children: React.ReactNode;
  onTransportPreferencesPersist?: (selection: TransportSelection) => void;
  onPlannerPreferencesPersist?: (
    preferences: TransportSelection & { tripDuration: HomepageTripDuration },
  ) => void;
}) {
  const urlDuration = homepageDurationFromUrl();
  const createInitialPlannerState = () => {
    const defaults = createDefaultPlannerControls();
    return urlDuration ? { ...defaults, tripDuration: urlDuration } : defaults;
  };
  const [draftState, setDraftState] = useState(createInitialPlannerState);
  const [appliedState, setAppliedState] = useState(createInitialPlannerState);
  const [hasUserApplied, setHasUserApplied] = useState(false);

  useEffect(() => {
    migrateHomepageDurationUrl();
  }, []);

  useEffect(() => {
    const preferences = user?.user_metadata?.preferences;
    if (!preferences) return;
    const userCarMode = normalizeCarMode(preferences.carMode);
    const persistedPublicModes = preferences.publicModes;
    const userPublicTransport = Array.isArray(persistedPublicModes)
      ? persistedPublicModes.length > 0
      : true;
    const userPartySize = preferences.partySize || 2;
    const persistedDuration = normalizeHomepageTripDuration(
      preferences.tripDuration ?? preferences.duration,
    );
    const migratedDuration =
      urlDuration ??
      persistedDuration ??
      normalizeHomepageTripDuration(preferences.tripMode);
    setDraftState((previous) => ({
      ...previous,
      publicModes: Array.isArray(persistedPublicModes)
        ? [...persistedPublicModes]
        : [],
      carMode: userCarMode,
      publicTransport: userPublicTransport,
      partySize: userPartySize,
      ...(migratedDuration ? { tripDuration: migratedDuration } : {}),
    }));
    setAppliedState((previous) => ({
      ...previous,
      publicModes: Array.isArray(persistedPublicModes)
        ? [...persistedPublicModes]
        : [],
      carMode: userCarMode,
      publicTransport: userPublicTransport,
      partySize: userPartySize,
      ...(migratedDuration ? { tripDuration: migratedDuration } : {}),
    }));
  }, [user, urlDuration]);

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
    const transportSelection = resolveTransportSelection(
      draftState.publicTransport,
      draftState.carMode,
      draftState.publicModes,
    );
    onTransportPreferencesPersist?.(transportSelection);
    onPlannerPreferencesPersist?.({
      ...transportSelection,
      tripDuration: draftState.tripDuration,
    });
  }, [draftState, onTransportPreferencesPersist, onPlannerPreferencesPersist]);

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
