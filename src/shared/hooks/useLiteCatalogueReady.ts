import { useCatalogue } from "@/shared/hooks/useCatalogue";

export interface LiteCatalogueState {
  /** True once the loader resolved (or never true on failure). */
  ready: boolean;
  /** Non-null when the most recent load attempt failed. */
  error: Error | null;
  /** Re-invokes the loader (retry after a failure). */
  retry: () => void;
}

/**
 * Compatibility adapter for existing callers. New consumers should use
 * `useCatalogue({ need: "summary" })` directly.
 */
export function useLiteCatalogueReady(enabled = true): LiteCatalogueState {
  const { status, error, retry } = useCatalogue({
    need: "summary",
    enabled,
  });
  return { ready: status === "ready", error, retry };
}
