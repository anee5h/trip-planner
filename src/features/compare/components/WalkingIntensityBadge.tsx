import { Badge } from "@/shared/components/ui/badge";
import {
  getWalkingIntensityMetadata,
  type WalkingIntensityLevel,
} from "@/shared/utils/walking";
import { cn } from "@/shared/utils/utils";

interface WalkingIntensityBadgeProps {
  level: WalkingIntensityLevel;
  locale?: string;
  className?: string;
}

export function WalkingIntensityBadge({
  level,
  locale,
  className,
}: WalkingIntensityBadgeProps) {
  const metadata = getWalkingIntensityMetadata(level, locale);

  return (
    <Badge
      data-testid="walking-intensity-badge"
      data-level={metadata.level}
      className={cn(metadata.badgeClass, className)}
    >
      {metadata.label}
    </Badge>
  );
}
