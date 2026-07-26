import { useEffect } from "react";

/** High-probability routes worth prefetching during idle time */
const HIGH_PROBABILITY_ROUTES = ["/destinations", "/passport", "/my-trips"];

const PREFETCH_MAP: Record<string, () => Promise<unknown>> = {
  "/destinations": () => import("@/features/destinations/Destinations"),
  "/passport": () => import("@/features/passport/Passport"),
  "/my-trips": () => import("@/features/profile/MyTrips"),
};

/** Prefetches an image asset into the browser cache during idle time */
export function prefetchImage(src: string) {
  if (!src || typeof window === "undefined") return;
  const img = new Image();
  img.src = src;
}

export function useIdlePrefetch() {
  useEffect(() => {
    if (!("requestIdleCallback" in window)) return;

    const id = (window as any).requestIdleCallback(() => {
      HIGH_PROBABILITY_ROUTES.forEach((route) => {
        PREFETCH_MAP[route]?.();
      });
    });

    return () => {
      if ("cancelIdleCallback" in window) {
        (window as any).cancelIdleCallback(id);
      }
    };
  }, []);
}
