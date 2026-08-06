/**
 * Type declarations for scripts/catalog/meta.mjs (shared meta builder).
 */

export interface DestinationMetaEntry {
  id: string;
  name: string;
  prefecture: string;
  region: string;
  role: string;
  kind: string;
  status: string;
  relationships: Record<string, unknown>;
}

export interface MetaSourceRecord {
  id: string;
  name?: string;
  prefecture?: string;
  region?: string;
  role?: string;
  kind?: string;
  status?: string;
  relationships?: Record<string, unknown>;
}

export declare function buildDestinationsMeta(
  destinations: MetaSourceRecord[],
): DestinationMetaEntry[];
