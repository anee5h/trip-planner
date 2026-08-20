import { useEffect, useRef, useState, type ReactNode } from "react";

interface DeferredSectionProps {
  children: ReactNode;
  /**
   * Optional gate: children only mount once `when` is true (e.g. the
   * full catalogue has loaded). Combined with delayMs, this mounts
   * below-fold rails ONCE with final data instead of rendering them
   * eagerly and re-rendering when the data arrives.
   */
  when?: boolean;
  /**
   * Delay before mounting children, in ms. Default 0 = mount after the
   * next animation frame (post-first-paint). Pass a larger value to
   * spread deferred sections over multiple idle frames.
   */
  delayMs?: number;
  /** Accessible label for the pending placeholder (announced to AT). */
  label?: string;
}

/**
 * KAI-130: mounts children only AFTER the initial critical render has
 * committed (post-first-paint) and, when `when` is provided, only once
 * that gate is true. This keeps below-fold sections (lower rails) out of
 * the initial React commit AND avoids re-rendering them when the lazy
 * catalogue arrives — they mount exactly once, with final data.
 *
 * The placeholder is a zero-height container (the section's own spacing
 * lives inside children), so mounting later does not shift layout.
 * Ranking/order is unchanged.
 */
export function DeferredSection({
  children,
  when = true,
  delayMs = 0,
  label,
}: DeferredSectionProps) {
  const [ready, setReady] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gateMet = when;

  useEffect(() => {
    if (!gateMet) {
      // Wait for the gate; re-run when it flips.
      return;
    }
    // Double-rAF = after the browser has painted the critical content.
    const raf = requestAnimationFrame(() => {
      if (delayMs > 0) {
        timerRef.current = setTimeout(() => setReady(true), delayMs);
      } else {
        requestAnimationFrame(() => setReady(true));
      }
    });
    return () => {
      cancelAnimationFrame(raf);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [gateMet, delayMs]);

  if (!ready) {
    return (
      <div
        aria-hidden="true"
        aria-label={label}
        data-deferred-pending="true"
        className="contents"
      />
    );
  }
  return <>{children}</>;
}
