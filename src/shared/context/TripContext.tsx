import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { BudgetFilter } from "@/shared/types/planner";
import type { TripDuration } from "@/shared/types/tripDuration";
import type { CarMode } from "@/shared/utils/carMode";
import type { SavedOriginLocation } from "@/shared/hooks/useTripStore";
import { useTripStore } from "@/shared/hooks/useTripStore";
import { useLocation } from "react-router-dom";

export type TripDateSemantics = "any" | "today" | "tomorrow" | "custom";

export type TripBudget =
  | { kind: "any"; tier?: BudgetFilter }
  | { kind: "cap"; cap: number; tier?: BudgetFilter };

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

export function createDefaultTripContext(): TripContext {
  return {
    origin: null,
    travelDate: null,
    dateSemantics: "any",
    duration: "halfDay",
    partySize: 2,
    publicModes: [],
    carMode: "none",
    budget: { kind: "cap", cap: 75000, tier: "standard" },
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
    ...(patch.budget !== undefined ? { budget: { ...patch.budget } } : {}),
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
  if (tier === "any" || raw === "any") return { kind: "any", tier: "any" };
  if (raw !== null && /^\d+$/.test(raw)) {
    return {
      kind: "cap",
      cap: Number(raw),
      ...(tier ? { tier: tier as BudgetFilter } : {}),
    };
  }
  if (tier) {
    return { kind: "cap", cap: 75000, tier: tier as BudgetFilter };
  }
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
  if (source.budget && typeof source.budget === "object") {
    patch.budget = source.budget as TripBudget;
  } else if (typeof source.budget === "number") {
    patch.budget = { kind: "cap", cap: source.budget };
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
    return raw ? (JSON.parse(raw) as TripContextPatch) : {};
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
