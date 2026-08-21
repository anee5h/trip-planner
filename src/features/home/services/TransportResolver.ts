import type { TransportPreference } from "@/shared/types/homePlannerState";

export type { TransportPreference } from "@/shared/types/homePlannerState";

export interface TransportSelection {
  carMode: "none" | "my_car" | "rental";
  publicModes: string[];
}

export const ALL_PUBLIC_MODES = [
  "train",
  "shinkansen",
  "bus",
  "flight",
  "ferry",
];

export function resolveTransportSelection(
  preference: TransportPreference,
  configuredCarMode: "none" | "my_car" | "rental" = "none",
): TransportSelection {
  switch (preference) {
    case "public":
      return { carMode: "none", publicModes: ALL_PUBLIC_MODES };
    case "myCar":
      return { carMode: "my_car", publicModes: [] };
    case "rentalCar":
      return { carMode: "rental", publicModes: [] };
    case "either":
      if (configuredCarMode === "my_car" || configuredCarMode === "rental") {
        return { carMode: configuredCarMode, publicModes: ALL_PUBLIC_MODES };
      }
      return { carMode: "none", publicModes: ALL_PUBLIC_MODES };
  }
}
