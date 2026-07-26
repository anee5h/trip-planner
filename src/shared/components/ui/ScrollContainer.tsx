import type React from "react";
import { useRef, useState, useEffect, useCallback } from "react";
import { cn } from "@/shared/utils/utils";

interface ScrollContainerProps {
  children: React.ReactNode;
  className?: string;
}

export function ScrollContainer({ children, className }: ScrollContainerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener("scroll", updateScrollState, { passive: true });
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", updateScrollState);
      observer.disconnect();
    };
  }, [updateScrollState]);

  return (
    <div className="relative w-full">
      {canScrollLeft && (
        <div
          className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none"
          aria-hidden="true"
        />
      )}
      <div
        ref={ref}
        tabIndex={0}
        role="region"
        aria-label="Scrollable content"
        className={cn(
          "overflow-x-auto scrollbar-hide snap-x snap-mandatory focus:outline-none focus:ring-1 focus:ring-emerald-500/50 rounded-lg",
          className,
        )}
      >
        {children}
      </div>
      {canScrollRight && (
        <div
          className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none"
          aria-hidden="true"
        />
      )}
    </div>
  );
}
