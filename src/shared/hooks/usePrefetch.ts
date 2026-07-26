import { useCallback, useRef } from "react";

const PREFETCH_MAP: Record<string, () => Promise<unknown>> = {
  "/destinations": () => import("@/features/destinations/Destinations"),
  "/collections": () => import("@/features/collections/CollectionsDirectory"),
  "/passport": () => import("@/features/passport/Passport"),
  "/my-trips": () => import("@/features/profile/MyTrips"),
  "/profile": () => import("@/features/profile/Profile"),
  "/settings": () => import("@/features/settings/Settings"),
  "/help": () => import("@/features/help/Help"),
};

export function usePrefetch(to: string) {
  const prefetched = useRef(false);

  const prefetch = useCallback(() => {
    if (prefetched.current) return;
    const loader = PREFETCH_MAP[to];
    if (loader) {
      prefetched.current = true;
      loader();
    }
  }, [to]);

  return {
    onMouseEnter: prefetch,
    onTouchStart: prefetch,
    onFocus: prefetch,
  };
}
