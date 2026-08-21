import { useCallback, useMemo } from "react";
import type { User } from "@supabase/supabase-js";
import {
  DEFAULT_PLANNER_BUDGET_TIER,
  type ForecastDateSelection,
  type HomepageTripDuration,
  type PlannerControlsState,
  type TransportPreference,
} from "@/shared/types/homePlannerState";
import { useHomePlannerState } from "@/features/home/state/HomePlannerStateContext";
import { getPlannerBudgetLimit } from "../services/PlannerBudgetPolicy";
import { resolveTransportSelection } from "../services/TransportResolver";
import type { TripMode } from "@/shared/types/homePlannerState";

export { DEFAULT_PLANNER_BUDGET_TIER };
export type {
  ForecastDateSelection,
  HomepageTripDuration,
  PlannerControlsState,
  TransportPreference,
};

export interface ResolvedPlannerState extends PlannerControlsState {
  budget: number;
  carMode: "none" | "my_car" | "rental";
  publicModes: string[];
}

/**
 * Heavy Home adapter: the context owns raw draft/applied state, while this
 * hook adds transport/budget resolution for recommendations only.
 */
export function useTripPlannerState(
  _user: User | null,
  _initialDateSelection: ForecastDateSelection = { type: "today" },
) {
  const state = useHomePlannerState();
  const resolveFullState = useCallback(
    (controls: PlannerControlsState): ResolvedPlannerState => {
      const { carMode, publicModes } = resolveTransportSelection(
        controls.transportPreference,
        state.configuredCarMode,
      );
      const budget = getPlannerBudgetLimit(
        controls.budgetTier,
        controls.partySize,
        controls.tripDuration,
        controls.tripMode,
        controls.accommodationAllowance,
      );
      return { ...controls, budget, carMode, publicModes };
    },
    [state.configuredCarMode],
  );

  const resolvedDraft = useMemo(
    () => resolveFullState(state.draftState),
    [resolveFullState, state.draftState],
  );
  const resolvedApplied = useMemo(
    () => resolveFullState(state.appliedState),
    [resolveFullState, state.appliedState],
  );

  return {
    ...state,
    resolvedDraft,
    resolvedApplied,
  };
}

export type { TripMode };
