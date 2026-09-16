import { normalizeCarMode, type CarMode } from "@/shared/utils/carMode";
import { DEFAULT_PUBLIC_MODES } from "@/shared/utils/transportPreferences";

export interface TransportSelection {
  carMode: CarMode;
  publicModes: string[];
}

export const ALL_PUBLIC_MODES = [...DEFAULT_PUBLIC_MODES];

/**
 * Resolve the planner's split-domain transport state into the canonical
 * recommendation inputs. Public transport is a capability toggle over the
 * existing public-mode collection; car access remains one mutually exclusive
 * CarMode. An omitted public-mode collection uses the full public-mode
 * default; an explicitly empty collection remains empty and is never
 * silently widened to all modes.
 */
export function resolveTransportSelection(
  publicTransport: boolean,
  carMode: CarMode = "none",
  publicModes?: string[],
): TransportSelection {
  const selectedPublicModes = publicModes ?? ALL_PUBLIC_MODES;
  return {
    carMode: normalizeCarMode(carMode),
    publicModes: publicTransport ? [...selectedPublicModes] : [],
  };
}
