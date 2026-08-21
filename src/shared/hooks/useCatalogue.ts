import { useCallback, useEffect, useState } from "react";
import {
  getFullPlaces,
  getLoadedLitePlaces,
  hasLoadedFullIndex,
  hasLoadedLiteIndex,
  loadCatalogue,
  type CanonicalPlace,
  type CatalogueNeed,
} from "@/shared/services/place/PlaceCatalog";

export type CatalogueStatus = "idle" | "loading" | "ready" | "error";

export interface CatalogueState {
  /** Current catalogue request state. */
  status: CatalogueStatus;
  /** Last successful snapshot; retained while a later retry is loading. */
  places: CanonicalPlace[];
  /** Non-null when the most recent enabled load failed. */
  error: Error | null;
  /** Starts another load attempt. */
  retry: () => void;
}

export interface UseCatalogueOptions {
  need: CatalogueNeed;
  enabled?: boolean;
}

function alreadyLoadedPlaces(need: CatalogueNeed): CanonicalPlace[] {
  if (need === "summary" && hasLoadedLiteIndex()) return getLoadedLitePlaces();
  if (need === "full" && hasLoadedFullIndex()) return getFullPlaces();
  return [];
}

/**
 * The UI-facing catalogue seam. Callers declare summary/full intent and get
 * one explicit loading/error/retry contract; asset choice, cache state, and
 * source-specific loaders stay behind PlaceCatalog.
 */
export function useCatalogue({
  need,
  enabled = true,
}: UseCatalogueOptions): CatalogueState {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<CatalogueState>(() => {
    const places = enabled ? alreadyLoadedPlaces(need) : [];
    return {
      status: !enabled ? "idle" : places.length > 0 ? "ready" : "loading",
      places,
      error: null,
      retry: () => setAttempt((value) => value + 1),
    };
  });

  const retry = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setState((previous) => ({
        ...previous,
        status: "idle",
        error: null,
        retry,
      }));
      return;
    }

    let cancelled = false;
    setState((previous) => ({
      ...previous,
      status: "loading",
      error: null,
      retry,
    }));

    loadCatalogue(need).then(
      (places) => {
        if (cancelled) return;
        setState({ status: "ready", places, error: null, retry });
      },
      (cause: unknown) => {
        if (cancelled) return;
        const error = cause instanceof Error ? cause : new Error(String(cause));
        console.error(`[useCatalogue] ${need} catalogue load failed:`, error);
        setState((previous) => ({
          ...previous,
          status: "error",
          error,
          retry,
        }));
      },
    );

    return () => {
      cancelled = true;
    };
  }, [attempt, enabled, need, retry]);

  return { ...state, retry };
}
