import { memo, useId } from "react";
import type { Destination } from "@/shared/types/destination";
import { ScrollContainer } from "@/shared/components/ui/ScrollContainer";
import DestinationCard from "./DestinationCard";

interface DestinationDetailRailProps {
  title: string;
  description?: string;
  destinations: Destination[];
  currentDestinationId?: string;
  partySize: number;
  carMode?: string;
  publicModes?: string[];
  previousLabel: string;
  nextLabel: string;
  /** Keep detail-page discovery rails scannable without removing actions. */
  compact?: boolean;
}

const RAIL_CARD_CLASS =
  "flex h-full w-[78vw] min-w-[260px] max-w-[300px] shrink-0 snap-start flex-col sm:w-[280px] sm:min-w-[280px] sm:max-w-[280px] lg:w-[300px] lg:min-w-[300px] lg:max-w-[300px]";

export function DestinationDetailRail({
  title,
  description,
  destinations,
  currentDestinationId,
  partySize,
  carMode = "none",
  publicModes = ["train", "shinkansen", "bus", "flight"],
  previousLabel,
  nextLabel,
  compact = false,
}: DestinationDetailRailProps) {
  const headingId = `destination-rail-${useId().replace(/:/g, "")}`;
  const uniqueDestinations = destinations
    .filter((destination) => destination.id !== currentDestinationId)
    .filter(
      (destination, index, all) =>
        all.findIndex((candidate) => candidate.id === destination.id) === index,
    );

  if (uniqueDestinations.length === 0) return null;

  return (
    <section
      data-testid="destination-detail-rail"
      aria-labelledby={headingId}
      className="space-y-3"
    >
      <div>
        <h3
          id={headingId}
          className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-2xl"
        >
          {title}
        </h3>
        {description && (
          <p className="mt-1 text-sm leading-relaxed text-slate-500 dark:text-slate-300">
            {description}
          </p>
        )}
      </div>

      <ScrollContainer
        ariaLabel={title}
        previousLabel={previousLabel}
        nextLabel={nextLabel}
        className="-mx-4 flex gap-3 px-4 py-2 sm:gap-4 md:mx-0 md:px-10"
      >
        {uniqueDestinations.map((destination) => (
          <div key={destination.id} className={RAIL_CARD_CLASS}>
            <DestinationCard
              destination={destination}
              partySize={partySize}
              carMode={carMode}
              publicModes={publicModes}
              activeTransportMode="all"
              compact={compact}
            />
          </div>
        ))}
        <div className="w-2 shrink-0 sm:hidden" aria-hidden="true" />
      </ScrollContainer>
    </section>
  );
}

export default memo(DestinationDetailRail);
