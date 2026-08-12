export interface CollectionMetadata {
  authority:
    | "international"
    | "government"
    | "foundation"
    | "association"
    | "historical_consensus"
    | "curated";
  status: "active" | "review_needed" | "deprecated";
  lastVerified: string;
  verificationSource?: string;
  expectedMembers?: number; // Target total catalog size for complete collection (e.g. 12 for Original 12 Castles, 3 for Three Great Gardens)
  reviewIntervalMonths?: number;
}

export interface Collection {
  id: string;
  slug: string;
  name: string;
  description: string;
  nameJa?: string;
  descriptionJa?: string;
  category: string;
  type: "official" | "historical" | "curated";
  /** True for Passport-tracked achievements; false/undefined for browse-only directory collections */
  isAchievement?: boolean;
  icon: string;
  badgeColor: string;
  sortOrder: number;
  officialSource?: string;
  sourceUrl?: string;
  metadata: CollectionMetadata;
  content?: Partial<Record<"en" | "ja", { name: string; description: string }>>;
}

export interface CollectionMembership {
  collectionId: string;
  sortOrder?: number;
  confirmed: boolean;
  source?: string;
}
