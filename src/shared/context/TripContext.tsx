import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { BUDGET_TIER_LIMITS } from "@/shared/types/planner";
import type { TripDuration } from "@/shared/types/tripDuration";
import type { CarMode } from "@/shared/utils/carMode";
import type { SavedOriginLocation } from "@/shared/hooks/useTripStore";
import { useTripStore } from "@/shared/hooks/useTripStore";
import { useLocation } from "react-router-dom";

export type TripDateSemantics = "any" | "today" | "tomorrow" | "custom";

/** KAI-279 preset tiers that carry a real party-total ceiling. */
export type TripBudgetPreset = "economy" | "standard" | "comfortable";

/**
 * KAI-279 canonical budget state — the SOURCE is explicit, never inferred
 * from numeric equality:
 *
 *   none    — Any budget / Flexible: no affordability constraint.
 *   preset  — Economy / Standard / Comfortable: the canonical flat
 *             party-total ceiling for that tier.
 *   custom  — an exact user-entered party-total yen cap. Custom is FIRST
 *             CLASS: a Custom ¥100,000 stays Custom even though it equals the
 *             Standard ceiling, and a Custom cap chosen after Flexible stays
 *             Custom (the previous tier never reclassifies it).
 *
 * Legacy persisted shapes ({ kind: "any" } / { kind: "cap", cap, tier }) are
 * normalized on read via normalizeTripBudget.
 */
export type TripBudget =
  | { kind: "none" }
  | { kind: "preset"; preset: TripBudgetPreset }
  | { kind: "custom"; cap: number };

export interface TripContext {
  origin: SavedOriginLocation | null;
  travelDate: string | null;
  dateSemantics: TripDateSemantics;
  duration: TripDuration;
  partySize: number;
  publicModes: string[];
  carMode: CarMode;
  budget: TripBudget;
  destinationId?: string;
}

export type TripContextPatch = Partial<TripContext>;

const TRIP_CONTEXT_STORAGE_KEY = "meguruto-active-trip-context";

const PRESET_TIER_SET = new Set<string>(["economy", "standard", "comfortable"]);

function isPresetName(value: unknown): value is TripBudgetPreset {
  return typeof value === "string" && PRESET_TIER_SET.has(value);
}

/**
 * Tolerant read-path normalizer: maps the canonical shapes, the legacy
 * { kind: "any" } / { kind: "cap", cap, tier? } shapes and bare numbers into
 * the explicit three-kind canonical TripBudget. Legacy inference is only
 * applied when the source field is absent (old persisted contexts); every new
 * write path stamps an explicit kind.
 */
export function normalizeTripBudget(value: unknown): TripBudget {
  if (value === null || value === undefined) return { kind: "none" };
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0
      ? { kind: "custom", cap: value }
      : { kind: "none" };
  }
  if (typeof value !== "object") return { kind: "none" };
  const record = value as Record<string, unknown>;
  if (record.kind === "none") return { kind: "none" };
  if (record.kind === "preset" && isPresetName(record.preset)) {
    return { kind: "preset", preset: record.preset };
  }
  if (record.kind === "custom") {
    const cap = record.cap;
    return typeof cap === "number" && Number.isFinite(cap) && cap > 0
      ? { kind: "custom", cap }
      : { kind: "none" };
  }
  if (record.kind === "any") return { kind: "none" };
  // Legacy { kind: "cap", cap, tier? }.
  if (record.kind === "cap" || record.cap !== undefined) {
    const cap = Number(record.cap);
    const tier = record.tier;
    if (typeof tier === "string" && PRESET_TIER_SET.has(tier)) {
      if (
        Number.isFinite(cap) &&
        cap === BUDGET_TIER_LIMITS[tier as TripBudgetPreset]
      ) {
        return { kind: "preset", preset: tier as TripBudgetPreset };
      }
      return Number.isFinite(cap) && cap > 0
        ? { kind: "custom", cap }
        : { kind: "none" };
    }
    // Legacy luxury/any/undefined tier cap: luxury/Infinity means no
    // constraint; a finite number (numeric-only legacy custom) is Custom.
    if (!Number.isFinite(cap) || cap <= 0) return { kind: "none" };
    if (tier === "luxury" || tier === "flexible") {
      return cap === Number.POSITIVE_INFINITY
        ? { kind: "none" }
        : { kind: "custom", cap };
    }
    return { kind: "custom", cap };
  }
  return { kind: "none" };
}

export function createDefaultTripContext(): TripContext {
  return {
    origin: null,
    travelDate: null,
    dateSemantics: "any",
    duration: "halfDay",
    partySize: 2,
    publicModes: [],
    carMode: "none",
    // KAI-279: the default budget is the canonical Standard whole-trip
    // party-total ceiling (¥100,000), never a magic non-tier ¥75,000.
    budget: { kind: "preset", preset: "standard" },
  };
}

export function mergeTripContext(
  current: TripContext,
  patch: TripContextPatch,
): TripContext {
  return {
    ...current,
    ...patch,
    // Preserve explicit [] and 0 values; never use truthy fallbacks here.
    ...(patch.publicModes !== undefined
      ? { publicModes: [...patch.publicModes] }
      : {}),
    ...(patch.budget !== undefined
      ? { budget: normalizeTripBudget(patch.budget) }
      : {}),
  };
}

function dateSemanticsFor(date: string): TripDateSemantics {
  const today = new Date();
  const toIso = (value: Date) =>
    `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  if (date === toIso(today)) return "today";
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (date === toIso(tomorrow)) return "tomorrow";
  return "custom";
}

function parsePartySize(value: string | null): number | undefined {
  if (value === null || !/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseBudget(params: URLSearchParams): TripBudget | undefined {
  const tier = params.get("budgetTier") ?? undefined;
  const raw = params.get("budget");
  const rawKind = params.get("budgetKind");
  // KAI-279 review fix: when NO budget-related parameter is present, return
  // undefined so the route patch carries no budget — missing URL state must
  // never overwrite explicit/session context (KAI-276 rule). Only explicit
  // budget state (any/flexible/luxury, valid preset, valid custom, supported
  // legacy numeric) creates a budget patch.
  if (tier === undefined && raw === null && rawKind === null) return undefined;
  const numeric = raw !== null && /^\d+$/.test(raw);
  // EXPLICIT custom marker: budgetKind=custom wins over any tier signal so a
  // Custom cap chosen after Flexible (budgetTier=luxury) or a Custom cap that
  // equals a preset ceiling (Standard -> Custom ¥100,000) stays Custom.
  if (rawKind === "custom" && numeric) {
    const cap = Number(raw);
    if (Number.isFinite(cap) && cap > 0) return { kind: "custom", cap };
    return { kind: "none" };
  }
  if (tier === "any" || raw === "any" || raw === "flexible") {
    return { kind: "none" };
  }
  if (numeric) {
    const cap = Number(raw);
    // Legacy URLs carry no budgetKind; infer preset ONLY when the cap equals
    // the tier's canonical ceiling. Every new write path is explicit.
    if (
      tier !== undefined &&
      (tier === "economy" || tier === "standard" || tier === "comfortable") &&
      Number.isFinite(cap) &&
      cap === BUDGET_TIER_LIMITS[tier]
    ) {
      return { kind: "preset", preset: tier };
    }
    return Number.isFinite(cap) && cap > 0
      ? { kind: "custom", cap }
      : { kind: "none" };
  }
  if (tier === "economy" || tier === "standard" || tier === "comfortable") {
    // Tier-only URL maps to that tier's canonical flat party-total ceiling.
    return { kind: "preset", preset: tier };
  }
  if (tier === "luxury" || tier === "flexible") {
    // Flexible/luxury (no numeric budget) = no constraint.
    return { kind: "none" };
  }
  // Malformed/unrecognized budget params are not a valid state — do not
  // fabricate a no-constraint patch that would erase the active budget.
  return undefined;
}

export function tripContextFromSearchParams(
  params: URLSearchParams,
): TripContextPatch {
  const patch: TripContextPatch = {};
  const rawDate = params.get("date");
  if (rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    patch.travelDate = rawDate;
    patch.dateSemantics = dateSemanticsFor(rawDate);
  }
  const rawDuration = params.get("duration") ?? params.get("tripMode");
  if (
    rawDuration === "any" ||
    rawDuration === "halfDay" ||
    rawDuration === "fullDay" ||
    /^\d+d\d+n$/.test(rawDuration ?? "")
  ) {
    patch.duration = rawDuration as TripDuration;
  }
  const partySize = parsePartySize(params.get("partySize"));
  if (partySize !== undefined) patch.partySize = partySize;
  if (params.has("mode")) {
    patch.publicModes =
      params.get("mode") === "none" ? [] : params.getAll("mode");
  }
  if (params.has("car")) {
    const car = params.get("car");
    if (car === "none" || car === "my_car" || car === "rental") {
      patch.carMode = car;
    }
  }
  const budget = parseBudget(params);
  if (budget) patch.budget = budget;
  return patch;
}

export function tripContextFromRouteState(state: unknown): TripContextPatch {
  if (!state || typeof state !== "object") return {};
  const record = state as Record<string, unknown>;
  const nested = record.tripContext;
  const source =
    nested && typeof nested === "object"
      ? (nested as Record<string, unknown>)
      : record;
  const patch: TripContextPatch = {};
  if ("origin" in source)
    patch.origin = source.origin as SavedOriginLocation | null;
  if (typeof source.travelDate === "string") {
    patch.travelDate = source.travelDate;
    patch.dateSemantics =
      source.dateSemantics === "today" ||
      source.dateSemantics === "tomorrow" ||
      source.dateSemantics === "custom"
        ? source.dateSemantics
        : dateSemanticsFor(source.travelDate);
  }
  if (
    source.dateSemantics === "any" &&
    (source.travelDate === null || source.travelDate === undefined)
  ) {
    patch.travelDate = null;
    patch.dateSemantics = "any";
  }
  if (
    source.duration === "any" ||
    source.duration === "halfDay" ||
    source.duration === "fullDay" ||
    (typeof source.duration === "string" && /^\d+d\d+n$/.test(source.duration))
  ) {
    patch.duration = source.duration as TripDuration;
  }
  if (typeof source.partySize === "number") patch.partySize = source.partySize;
  if (Array.isArray(source.publicModes)) {
    patch.publicModes = source.publicModes.filter(
      (value): value is string => typeof value === "string",
    );
  }
  if (
    source.carMode === "none" ||
    source.carMode === "my_car" ||
    source.carMode === "rental"
  ) {
    patch.carMode = source.carMode;
  }
  if (source.budget !== undefined) {
    patch.budget = normalizeTripBudget(source.budget);
  }
  if (typeof source.destinationId === "string")
    patch.destinationId = source.destinationId;
  return patch;
}

interface TripContextValue {
  tripContext: TripContext;
  hasExplicitTripContext: boolean;
  updateTripContext: (patch: TripContextPatch) => void;
}

const TripContextReact = createContext<TripContextValue | null>(null);

function readStoredContext(): TripContextPatch {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(TRIP_CONTEXT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const patch: TripContextPatch = { ...(parsed as TripContextPatch) };
    if (parsed.budget !== undefined) {
      patch.budget = normalizeTripBudget(parsed.budget);
    }
    return patch;
  } catch {
    return {};
  }
}

export function TripContextProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const location = useLocation();
  const { homeStation, homeStationCoords, homeStationTransportZoneId } =
    useTripStore();
  const [tripContext, setTripContext] = useState<TripContext>(() =>
    mergeTripContext(createDefaultTripContext(), readStoredContext()),
  );
  const [hasExplicitTripContext, setHasExplicitTripContext] = useState(
    () => Object.keys(readStoredContext()).length > 0,
  );

  useEffect(() => {
    if (tripContext.origin || !homeStationCoords) return;
    setTripContext((current) =>
      mergeTripContext(current, {
        origin: {
          label: homeStation,
          coordinates: homeStationCoords,
          source: "default",
          transportZoneId: homeStationTransportZoneId,
        },
      }),
    );
  }, [
    homeStation,
    homeStationCoords,
    homeStationTransportZoneId,
    tripContext.origin,
  ]);

  useEffect(() => {
    const statePatch = tripContextFromRouteState(location.state);
    const queryPatch =
      location.pathname === "/destinations"
        ? tripContextFromSearchParams(new URLSearchParams(location.search))
        : {};
    const destinationMatch = location.pathname.match(
      /^\/destinations\/([^/]+)$/,
    );
    const routePatch = {
      ...queryPatch,
      ...statePatch,
      ...(destinationMatch
        ? { destinationId: decodeURIComponent(destinationMatch[1]) }
        : {}),
    };
    if (Object.keys(routePatch).length > 0) {
      setHasExplicitTripContext(true);
      setTripContext((current) => mergeTripContext(current, routePatch));
    }
  }, [location.pathname, location.search, location.state]);

  useEffect(() => {
    if (!hasExplicitTripContext) return;
    try {
      window.sessionStorage.setItem(
        TRIP_CONTEXT_STORAGE_KEY,
        JSON.stringify(tripContext),
      );
    } catch {
      // Session storage is an optimization; navigation still works in memory.
    }
  }, [tripContext, hasExplicitTripContext]);

  const updateTripContext = useCallback((patch: TripContextPatch) => {
    setHasExplicitTripContext(true);
    setTripContext((current) => mergeTripContext(current, patch));
  }, []);
  const value = useMemo<TripContextValue>(
    () => ({
      tripContext,
      hasExplicitTripContext,
      updateTripContext,
    }),
    [tripContext, hasExplicitTripContext, updateTripContext],
  );
  return (
    <TripContextReact.Provider value={value}>
      {children}
    </TripContextReact.Provider>
  );
}

export function useOptionalTripContext(): TripContextValue {
  const value = useContext(TripContextReact);
  return (
    value ?? {
      tripContext: createDefaultTripContext(),
      hasExplicitTripContext: false,
      updateTripContext: () => undefined,
    }
  );
}

export function useTripContext(): TripContextValue {
  const value = useContext(TripContextReact);
  if (!value)
    throw new Error("useTripContext must be used within TripContextProvider");
  return value;
}
