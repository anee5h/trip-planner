import { useState, type ImgHTMLAttributes } from "react";
import { cn } from "@/shared/utils/utils";

interface LazyImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  /** Set to true for hero/above-fold images that should load eagerly */
  priority?: boolean;
}

export function LazyImage({
  src,
  alt,
  className,
  priority = false,
  sizes,
  onLoad,
  ...props
}: LazyImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-slate-200/60 dark:bg-slate-800/60",
        className,
      )}
    >
      {!isLoaded && (
        <div className="absolute inset-0 bg-slate-200/80 dark:bg-slate-800/80 animate-pulse pointer-events-none z-0" />
      )}
      <img
        src={src}
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
