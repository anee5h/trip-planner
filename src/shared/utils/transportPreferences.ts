import { normalizeCarMode, type CarMode } from "./carMode";

export const PUBLIC_TRANSPORT_MODES = [
  "train",
  "shinkansen",
  "bus",
  "flight",
  "ferry",
] as const;

export type PublicTransportMode = (typeof PUBLIC_TRANSPORT_MODES)[number];

export const DEFAULT_PUBLIC_MODES: PublicTransportMode[] = [
  ...PUBLIC_TRANSPORT_MODES,
];

export interface TransportPreferences {
  /** Whether the traveller can use public transport at all. */
  publicTransport: boolean;
  /** At most one car access strategy is valid. */
  carMode: CarMode;
  /** Submodes remain saved while public transport is switched off. */
  publicModes: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function normalizePublicModes(value: unknown): string[] {
  if (!Array.isArray(value)) return [...DEFAULT_PUBLIC_MODES];
  const allowed = new Set<string>(PUBLIC_TRANSPORT_MODES);
  return Array.from(
    new Set(value.filter((mode): mode is string => typeof mode === "string")),
  ).filter((mode) => allowed.has(mode));
}

/**
 * Normalize the persisted preference boundary.
 *
 * Older profiles did not have `publicTransport`; infer it from their saved
 * modes. A profile with neither public transit nor a car is not a valid
 * preference state, so it is repaired to the existing public-only default.
 */
export function normalizeTransportPreferences(
  value: unknown,
): TransportPreferences {
  const raw = isRecord(value) ? value : {};
  const publicModes = normalizePublicModes(raw.publicModes);
  const carMode = normalizeCarMode(
    typeof raw.carMode === "string" ? raw.carMode : undefined,
  );
  const publicTransport =
    typeof raw.publicTransport === "boolean"
      ? raw.publicTransport
      : publicModes.length > 0;

  if (!publicTransport && carMode === "none") {
    return { publicTransport: true, carMode, publicModes };
  }

  // Public transit without a visible submode is not a meaningful saved
  // preference. Repair legacy/hand-edited state before it reaches consumers;
  // consumers must never interpret [] as "all public modes".
  if (publicTransport && publicModes.length === 0) {
    return {
      publicTransport: true,
      carMode,
      publicModes: [...DEFAULT_PUBLIC_MODES],
    };
  }

  return { publicTransport, carMode, publicModes };
}

export function serializeTransportPreferences(
  preferences: TransportPreferences,
): Pick<TransportPreferences, "publicTransport" | "carMode" | "publicModes"> {
  return {
    publicTransport: preferences.publicTransport,
    carMode: preferences.carMode,
    publicModes: [...preferences.publicModes],
  };
}
