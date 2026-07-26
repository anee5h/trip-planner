import type React from "react";
import { cn } from "@/shared/utils/utils";

interface LazyImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  /** Set to true for hero/above-fold images that should load eagerly */
  priority?: boolean;
}

export function LazyImage({
  src,
  alt,
  className,
  priority = false,
  sizes,
  ...props
}: LazyImageProps) {
  return (
    <img
      src={src}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      decoding={priority ? "sync" : "async"}
      fetchPriority={priority ? "high" : "auto"}
      sizes={sizes}
      className={cn("transition-opacity duration-150", className)}
      {...props}
    />
  );
}
