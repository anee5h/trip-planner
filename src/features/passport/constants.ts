import { Icons } from "@/shared/icons";
import type { ComponentType } from "react";

export interface PassportSectionConfig {
  id: "overview" | "japan-map" | "timeline" | "achievements" | "badges";
  label: string;
  shortLabel: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
}

export const PASSPORT_SECTIONS: readonly PassportSectionConfig[] = [
  {
    id: "overview",
    label: "Overview",
    shortLabel: "Overview",
    description: "Summary overview of travel history & achievements",
    icon: Icons.overview,
  },
  {
    id: "japan-map",
    label: "Japan Map",
    shortLabel: "Japan Map",
    description: "Interactive explored prefectures map & region breakdown",
    icon: Icons.japanMap,
  },
  {
    id: "timeline",
    label: "Timeline",
    shortLabel: "Timeline",
    description: "Chronological travel activity feed",
    icon: Icons.timeline,
  },
  {
    id: "achievements",
    label: "Achievements",
    shortLabel: "Achievements",
    description: "Unlocked heritage list benchmarks & curated travel goals",
    icon: Icons.achievements,
  },
  {
    id: "badges",
    label: "Badges",
    shortLabel: "Badges",
    description: "Earned travel milestone & regional exploration badges",
    icon: Icons.badges,
  },
] as const;
