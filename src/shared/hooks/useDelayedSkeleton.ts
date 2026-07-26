import { useState, useEffect } from "react";

/**
 * Anti-flash skeleton hook.
 * Returns true only if loading remains true for longer than delayMs (default 120ms).
 * On ultra-fast loads (<120ms), avoids flashing a skeleton placeholder.
 */
export function useDelayedSkeleton(loading: boolean, delayMs = 120): boolean {
  const [showSkeleton, setShowSkeleton] = useState(false);

  useEffect(() => {
    if (!loading) {
      setShowSkeleton(false);
      return;
    }

    const timer = setTimeout(() => {
      setShowSkeleton(true);
    }, delayMs);

    return () => clearTimeout(timer);
  }, [loading, delayMs]);

  return showSkeleton;
}
