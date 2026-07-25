# Architecture Specification: Search & Command Palette Platform

## 1. Abstraction: Unified `SearchDocument`

Every entity in TabiMap (Destinations, Collections, Navigation links, Actions) maps to a standardized `SearchDocument`:

```typescript
export type SearchDocumentType =
  "destination" | "collection" | "action" | "navigation";

export interface SearchDocument {
  id: string;
  title: string;
  subtitle: string;
  type: SearchDocumentType;
  url: string;
  keywords: string[];
  icon?: React.ComponentType<{ className?: string }>;
  badge?: string;
  category?: string;
  score?: number;
  metadata?: Record<string, any>;
}
```

## 2. Search Scoring Pipeline & Tie-Breaking

Relevance scoring algorithm:

1. **Exact Title Match**: `+100`
2. **Title Prefix Match**: `+80`
3. **Keyword Match**: `+60`
4. **Category / Prefecture Match**: `+40`
5. **Description / Tag Match**: `+20`

### Tie-Breaking Priority Rule

> If relevance scores are equal, prioritize **Destinations** over **Collections**, then **Collections** over **Navigation/Actions**.

This ensures content search results (e.g. Kyoto destination) always take precedence over utility actions (e.g. Open Settings).

## 3. Command Palette UX

- Keybinding: `Cmd+K` (macOS) / `Ctrl+K` (Windows/Linux)
- Displays Raycast / Spotlight grouped categories:
  1. **Navigation & Actions** (`Go to Passport`, `Go to Settings`, `Go to Help`)
  2. **Destinations** (Ranked sights)
  3. **Collections** (Curated themes)
- Supports full keyboard accessibility (`ArrowUp`, `ArrowDown`, `Enter`, `Esc`).
