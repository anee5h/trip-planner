import { useEffect, useRef, useState, type ImgHTMLAttributes } from "react";
import { cn } from "@/shared/utils/utils";
import { getWikimediaSrcSet } from "@/shared/utils/wikimediaImages";

interface LazyImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  /** Set to true for hero/above-fold images that should load eagerly */
  priority?: boolean;
  /**
   * KAI-129: when true (or when srcSet is passed explicitly), the image
   * gets responsive variants for Wikimedia-hosted srcs. Cards/rails pass
   * this to stop multi-megapixel originals downloading for ~200-300px
   * rendered widths. Default false — hero/detail surfaces keep their
   * original large image unless they opt in with explicit widths.
   */
  responsive?: boolean;
  /** Optional override: explicit pixel widths for the srcSet (default [320, 480, 640, 960]) */
  responsiveWidths?: number[];
  /**
   * KAI-129: rail-aware lazy loading. When true, the image is NOT
   * requested until it enters the horizontal rail viewport (the closest
   * [data-rail] scroll container) plus a lookahead margin. Native
   * loading="lazy" only defers by the VERTICAL viewport, so horizontally
   * off-screen rail cards would otherwise all download on cold load.
   * Client-only: SSR/prerender still renders the real src (SEO intact).
   */
  deferUntilVisible?: boolean;
  /** Lookahead margin beyond the rail viewport (default "0px 200px" ≈ one card) */
  railLookahead?: string;
}

export function LazyImage({
  src,
  alt,
  className,
  priority = false,
  responsive = false,
  responsiveWidths,
  deferUntilVisible = false,
  railLookahead = "0px 200px",
  sizes,
  onLoad,
  ...props
}: LazyImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [inRailView, setInRailView] = useState(!deferUntilVisible);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // KAI-129: for Wikimedia srcs, build a srcSet from the requested widths
  // so the browser picks a card-sized variant instead of the original.
  // Non-Wikimedia/malformed srcs fall back to the plain src (passthrough).
  const srcSet = responsive
    ? (getWikimediaSrcSet(src ?? "", responsiveWidths) ?? undefined)
    : undefined;

  // Rail-aware gating (client-only): find the [data-rail] ancestor and
  // observe intersection with the rail viewport as root.
  useEffect(() => {
    if (!deferUntilVisible || typeof IntersectionObserver === "undefined") {
      setInRailView(true);
      return;
    }
    const img = imgRef.current;
    if (!img) {
      setInRailView(true);
      return;
    }
    const rail = img.closest("[data-rail]") as HTMLElement | null;
    if (!rail) {
      // Not in a rail — no gating (matches previous behavior).
      setInRailView(true);
      return;
    }
    // Already visible within the rail viewport (+ lookahead)? Load now.
    // Guard: if rects are all zero (jsdom / pre-layout), don't treat that
    // as "visible" — let the observer decide.
    const rect = img.getBoundingClientRect();
    const railRect = rail.getBoundingClientRect();
    const hasRealLayout =
      rect.width > 0 || rect.height > 0 || railRect.width > 0;
    if (
      hasRealLayout &&
      rect.left < railRect.right + 200 &&
      rect.right > railRect.left - 200
    ) {
      setInRailView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInRailView(true);
            io.disconnect();
          }
        }
      },
      { root: rail, rootMargin: railLookahead, threshold: 0 },
    );
    io.observe(img);
    return () => io.disconnect();
  }, [deferUntilVisible, railLookahead]);

  // SSR/prerender + non-gated: always render the real src. Gated client
  // renders keep the src off until the rail brings the card into view.
  const shouldRenderSrc = !deferUntilVisible || inRailView;

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative overflow-hidden bg-slate-200/60 dark:bg-slate-800/60",
        className,
      )}
    >
      {!isLoaded && (
        <div className="absolute inset-0 bg-slate-200/80 dark:bg-slate-800/80 animate-pulse pointer-events-none z-0" />
      )}
      <img
        ref={imgRef}
        src={shouldRenderSrc ? src : undefined}
        srcSet={shouldRenderSrc ? srcSet : undefined}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        decoding={priority ? "sync" : "async"}
        fetchPriority={priority ? "high" : "auto"}
        sizes={sizes}
        onLoad={(e) => {
          setIsLoaded(true);
          onLoad?.(e);
        }}
        className={cn(
          "w-full h-full object-cover transition-opacity duration-300 ease-out z-10 relative",
          isLoaded ? "opacity-100" : "opacity-0",
        )}
        {...props}
      />
    </div>
  );
}
