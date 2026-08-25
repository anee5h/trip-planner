import { useCallback, useEffect, useState } from "react";
import {
  hasLoadedRelationshipIndex,
  loadRelationshipIndex,
} from "@/shared/services/destination/DestinationRelationshipService";

export type RelationshipCatalogueStatus =
  "idle" | "loading" | "ready" | "error";

export interface RelationshipCatalogueState {
  status: RelationshipCatalogueStatus;
  error: Error | null;
  retry: () => void;
}

export function useDestinationRelationships(
  enabled = true,
): RelationshipCatalogueState {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<RelationshipCatalogueState>(() => ({
    status: !enabled
      ? "idle"
      : hasLoadedRelationshipIndex()
        ? "ready"
        : "loading",
    error: null,
    retry: () => setAttempt((value) => value + 1),
  }));

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

    loadRelationshipIndex().then(
      () => {
        if (cancelled) return;
        setState({ status: "ready", error: null, retry });
      },
      (cause: unknown) => {
        if (cancelled) return;
        const error = cause instanceof Error ? cause : new Error(String(cause));
        console.error("[useDestinationRelationships] load failed:", error);
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
  }, [attempt, enabled, retry]);

  return { ...state, retry };
}
