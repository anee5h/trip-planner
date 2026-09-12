import type {
  GtfsJpScheduledStopTimeSourceSemantics,
  GtfsScheduledServiceSourceSemantics,
  TransitScheduledService,
  TransitScheduledStopTime,
} from "../transitGraphTypes";

type IsAssignable<From, To> = [From] extends [To] ? true : false;
type Rejects<From, To> = IsAssignable<From, To> extends false ? true : false;

type ScheduledServiceCore = Omit<
  Extract<TransitScheduledService, { provider: "gtfs" }>,
  "provider" | "sourceSemantics"
>;
type OdptServiceWithGtfsSemantics = ScheduledServiceCore & {
  readonly provider: "odpt";
  readonly sourceSemantics: GtfsScheduledServiceSourceSemantics;
};

type ScheduledStopTimeCore = Omit<
  Extract<TransitScheduledStopTime, { provider: "gtfs" }>,
  "provider" | "sourceSemantics"
>;
type GtfsStopTimeWithGtfsJpSemantics = ScheduledStopTimeCore & {
  readonly provider: "gtfs";
  readonly sourceSemantics: GtfsJpScheduledStopTimeSourceSemantics;
};

/** Compile-time contracts for the provider/sourceSemantics discriminants. */
export const transitScheduledTypeSafetyChecks: [true, true] = [
  true satisfies Rejects<OdptServiceWithGtfsSemantics, TransitScheduledService>,
  true satisfies Rejects<
    GtfsStopTimeWithGtfsJpSemantics,
    TransitScheduledStopTime
  >,
];
