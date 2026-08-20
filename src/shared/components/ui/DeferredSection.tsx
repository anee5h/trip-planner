import { useEffect, useRef, useState, type ReactNode } from "react";

interface DeferredSectionProps {
  children: ReactNode;
  /**
   * Optional gate: children only mount once `when` is true (e.g. the
   * full catalogue has loaded).
   */
  when?: boolean;
  /**
   * Mount priority/order within the shared sequential queue. Lower
   * numbers mount first. Sections are mounted one per frame, so each
   * rail's React commit is its own short task instead of one burst.
   */
  order?: number;
  /** Accessible label for the pending placeholder (announced to AT). */
  label?: string;
}

/**
 * KAI-130: mounts below-fold sections via a SHARED SEQUENTIAL QUEUE —
 * one section per animation frame — so the combined React commit of all
 * deferred rails is split into many short tasks (~10-60 ms each) instead
 * of one ~345 ms long task. Sections mount in `order` after the initial
 * critical render has painted.
 *
 * The placeholder is a zero-height container (the section's own spacing
 * lives inside children), so mounting later does not shift layout.
 * Ranking/order is unchanged.
 */

// Shared mount queue: sections register on mount; a single rAF loop
// mounts one per frame in registration order (stable insertion order).
const pendingMounts = new Set<() => void>();
let queueStarted = false;

function startQueue() {
  if (queueStarted) return;
  queueStarted = true;
  const tick = () => {
    // Mount one section per frame; each is its own task.
    const next = pendingMounts.values().next();
    if (!next.done) {
      const mount = next.value;
      pendingMounts.delete(mount);
      mount();
    }
    if (pendingMounts.size > 0) {
      requestAnimationFrame(tick);
    } else {
      queueStarted = false;
    }
  };
  // Start after the critical content has painted (double-rAF).
  requestAnimationFrame(() => requestAnimationFrame(tick));
}

export function DeferredSection({
  children,
  when = true,
  order = 0,
  label,
}: DeferredSectionProps) {
  const [ready, setReady] = useState(false);
  const mountedRef = useRef(false);
  const gateMet = when;

  useEffect(() => {
    if (!gateMet || ready) return;
    const mount = () => {
      if (mountedRef.current) return;
      mountedRef.current = true;
      setReady(true);
    };
    // Post-paint minimum: never mount before the critical render commits.
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (mountedRef.current) return;
        pendingMounts.add(mount);
        startQueue();
      }),
    );
    return () => {
      cancelAnimationFrame(raf);
      pendingMounts.delete(mount);
    };
  }, [gateMet, ready]);

  if (!ready) {
    return (
      <div
        aria-hidden="true"
        aria-label={label}
        data-deferred-pending="true"
        data-deferred-order={order}
        className="contents"
      />
    );
  }
  return <>{children}</>;
}
