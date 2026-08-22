import type { TransportMode } from "../services/transport/types";

/**
 * Transport zone identifiers.
 *
 * Mainland zones (honshu/kyushu/shikoku/hokkaido) are derived from
 * prefecture metadata. Island zones are assigned explicitly on destination
 * records or resolved from non-overlapping island bounding boxes for
 * origins. "unknown" is the conservative fallback: it never authorizes a
 * mode.
 */
export type TransportZoneId =
  | "mainland-honshu"
  | "mainland-kyushu"
  | "mainland-shikoku"
  | "hokkaido"
  | "okinawa-main"
  | "ogasawara"
  | "sado"
  | "ishigaki"
  | "miyako"
  | "amami"
  | "yakushima"
  | "tsushima"
  | "naoshima"
  | "teshima"
  | "tomogashima"
  | "nokonoshima"
  | "unknown";

export interface TransportZone {
  id: TransportZoneId;
  name: string;
  nameJa: string;
  isIsland: boolean;
  isRemote: boolean;
  /** Local modes available within the zone (rail/road/bus only). */
  localModes: TransportMode[];
}

/**
 * Explicit rail/road/bus connectivity between zones. Flight connectivity is
 * proven by the flight-route registry and ferry connectivity by the ferry
 * route registry; they are never modelled as zone edges.
 */
export interface TransportEdge {
  from: TransportZoneId;
  to: TransportZoneId;
  modes: TransportMode[];
  bidirectional: boolean;
}

export interface TransportTopologyData {
  zones: TransportZone[];
  edges: TransportEdge[];
}

export interface EligibleOriginModesResult {
  originZoneId: TransportZoneId;
  destinationZoneId: TransportZoneId;
  crossZoneModes: TransportMode[];
  localModes: TransportMode[];
}
