import type { TransportMode } from "../services/transport/types";

/**
 * Transport topology zone identifiers.
 * Mainland zones are the four main islands of Japan (honshu, kyushu, shikoku,
 * hokkaido); the rest are islands reachable only via explicit edges.
 * "unknown" is the conservative fallback for origins that cannot be resolved.
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
  | "unknown";

export interface TransportZone {
  id: TransportZoneId;
  name: string;
  nameJa: string;
  isIsland: boolean;
  isRemote: boolean;
  localModes: TransportMode[];
}

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

export interface JourneyEstimate {
  primaryMode: TransportMode | null;
  legs: JourneyLeg[];
  totalTimeRange: [number, number] | null;
  totalCostRange: [number, number] | null;
  available: boolean;
  unavailableReason?: string;
}

export interface JourneyLeg {
  mode: TransportMode;
  legType: "origin-access" | "cross-zone" | "local-access";
  label: string;
  timeRange?: [number, number];
  costRange?: [number, number];
}
