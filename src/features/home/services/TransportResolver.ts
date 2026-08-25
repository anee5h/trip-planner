import type { CarMode } from "@/shared/utils/carMode";

export interface TransportSelection {
  carMode: CarMode;
  publicModes: string[];
}

export const ALL_PUBLIC_MODES = [
  "train",
  "shinkansen",
  "bus",
  "flight",
  "ferry",
];

/**
 * Resolve the planner's split-domain transport state into the canonical
 * recommendation inputs. Public transport is a capability toggle over the
 * existing public-mode collection; car access remains one mutually exclusive
 * CarMode. An empty public collection uses the existing full public-mode
 * default when the high-level toggle is on.
 */
export function resolveTransportSelection(
  publicTransport: boolean,
  carMode: CarMode = "none",
  publicModes: string[] = ALL_PUBLIC_MODES,
): TransportSelection {
  return {
    carMode,
    publicModes: publicTransport
      ? publicModes.length > 0
        ? [...publicModes]
        : [...ALL_PUBLIC_MODES]
      : [],
  };
}
