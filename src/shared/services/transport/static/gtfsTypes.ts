/**
 * KAI-291C1 — provider-neutral input shape for a bounded GTFS topology import.
 *
 * The ZIP reader and CSV decoder are Node-only. These table types deliberately
 * contain only decoded source values so the normalized adapter stays pure and
 * cannot acquire network, filesystem, clock, or runtime UI dependencies.
 */

/** One CSV record with raw string values preserved. */
export type GtfsTableRow = Readonly<Record<string, string>>;

/** Required and C1-allow-listed GTFS/GTFS-JP tables. */
export interface GtfsFeedTables {
  readonly agency: readonly GtfsTableRow[];
  readonly stops: readonly GtfsTableRow[];
  readonly routes: readonly GtfsTableRow[];
  readonly trips: readonly GtfsTableRow[];
  readonly stopTimes: readonly GtfsTableRow[];
  readonly feedInfo?: readonly GtfsTableRow[];
  readonly routesJp?: readonly GtfsTableRow[];
}
