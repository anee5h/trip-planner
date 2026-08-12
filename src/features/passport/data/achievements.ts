import type { Achievement } from "../types/badge";

export const ACHIEVEMENTS_CATALOG: Achievement[] = [
  {
    id: "first-journey",
    title: "First Journey",
    description: "Marked your very first destination visited in Japan.",
    category: "Milestones",
    iconName: "Footprints",
    trigger: { type: "visit_count", threshold: 1 },
    badgeRewardId: "first-step",
  },
  {
    id: "castle-master",
    title: "Castle Master",
    description:
      "Completed the Original 12 Castles of Japan curated collection.",
    category: "Collections",
    iconName: "Landmark",
    trigger: {
      type: "collection_complete",
      collectionId: "original-12-castles",
    },
  },
  {
    id: "heritage-guardian",
    title: "Heritage Guardian",
    description:
      "Completed the UNESCO World Heritage Sites of Japan collection.",
    category: "Collections",
    iconName: "Trophy",
    trigger: {
      type: "collection_complete",
      collectionId: "unesco-japan",
    },
  },
  {
    id: "region-wanderer",
    title: "Region Wanderer",
    description:
      "Explored destinations across 10 different Japanese prefectures.",
    category: "Milestones",
    iconName: "Compass",
    trigger: { type: "prefecture_count", threshold: 10 },
  },
  {
    id: "halfway-japan",
    title: "Halfway Across Japan",
    description: "Explored 24 out of 47 Japanese prefectures.",
    category: "Milestones",
    iconName: "Map",
    trigger: { type: "prefecture_count", threshold: 24 },
  },
  {
    id: "japan-complete-achievement",
    title: "Japan Complete",
    description: "Visited all 47 prefectures of Japan.",
    category: "Milestones",
    iconName: "Crown",
    trigger: { type: "prefecture_count", threshold: 47 },
    badgeRewardId: "japan-complete",
  },
];
