import type React from "react";
import { useRef, useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/shared/utils/utils";

interface ScrollContainerProps {
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
  previousLabel?: string;
  nextLabel?: string;
  resetKey?: unknown;
}

export function ScrollContainer({
  children,
  className,
  ariaLabel = "Scrollable content",
  previousLabel = "Scroll left",
  nextLabel = "Scroll right",
  resetKey,
}: ScrollContainerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const leadingPadding = Number.parseFloat(
      window.getComputedStyle(el).paddingLeft,
    );
    setCanScrollLeft(
      el.scrollLeft >
        (Number.isFinite(leadingPadding) ? leadingPadding : 0) + 1,
    );
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (resetKey !== undefined) el.scrollLeft = 0;
    updateScrollState();
    el.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", updateScrollState);
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(updateScrollState);
    resizeObserver?.observe(el);
    const mutationObserver =
      typeof MutationObserver === "undefined"
        ? undefined
        : new MutationObserver(updateScrollState);
    mutationObserver?.observe(el, { childList: true, subtree: true });
    const frame =
      typeof requestAnimationFrame === "function"
        ? requestAnimationFrame(updateScrollState)
        : undefined;
    return () => {
      el.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      if (frame !== undefined && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(frame);
      }
    };
  }, [resetKey, updateScrollState]);

  const scrollRail = (direction: -1 | 1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy?.({
      left: direction * Math.max(el.clientWidth * 0.8, 1),
      behavior: "smooth",
    });
  };

  return (
    <div className="relative w-full">
      {canScrollLeft && (
        <button
          type="button"
          onClick={() => scrollRail(-1)}
          className="absolute left-1 top-1/2 z-20 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200/80 bg-white/95 text-slate-700 shadow-lg backdrop-blur transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 md:flex dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100 dark:hover:bg-slate-800"
          aria-label={previousLabel}
        >
          <ChevronLeft className="size-5" aria-hidden="true" />
        </button>
      )}
      <div
        ref={ref}
        tabIndex={0}
        role="region"
        aria-label={ariaLabel}
        className={cn(
          "max-w-full overflow-x-auto rounded-lg scrollbar-hide snap-x snap-mandatory focus:outline-none focus:ring-1 focus:ring-emerald-500/50",
          className,
        )}
      >
        {children}
      </div>
      {canScrollRight && (
        <button
          type="button"
          onClick={() => scrollRail(1)}
          className="absolute right-1 top-1/2 z-20 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200/80 bg-white/95 text-slate-700 shadow-lg backdrop-blur transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 md:flex dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100 dark:hover:bg-slate-800"
          aria-label={nextLabel}
        >
          <ChevronRight className="size-5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
