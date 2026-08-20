import { useCatalogue } from "@/shared/hooks/useCatalogue";

/**
 * Compatibility adapter for existing callers. New consumers should use
 * `useCatalogue({ need: "full" })` directly.
 */
export function useFullCatalogue(): {
  places: ReturnType<typeof useCatalogue>["places"];
  loading: boolean;
  error: string | null;
  retry: () => void;
} {
  const { status, places, error, retry } = useCatalogue({ need: "full" });
  return {
    places,
    loading: status === "loading" || status === "idle",
    error: error?.message ?? null,
    retry,
  };
}
