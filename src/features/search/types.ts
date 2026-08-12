import type { ComponentType } from "react";

export type SearchDocumentType =
  "destination" | "collection" | "action" | "navigation";

export interface SearchDocument {
  id: string;
  title: string;
  subtitle: string;
  type: SearchDocumentType;
  url: string;
  keywords: string[];
  icon?: ComponentType<{ className?: string }>;
  badge?: string;
  category?: string;
  score?: number;
  metadata?: Record<string, any>;
}

export interface SearchGroup {
  type: SearchDocumentType;
  label: string;
  items: SearchDocument[];
  /** Collapse items past the first four on mobile with a "See more" toggle
   *  (KAI-83). Desktop always shows the full group. */
  mobileCollapsible?: boolean;
}
