/**
 * Shared destinations-meta.json builder.
 *
 * This is the single canonical mapping for the derived store file, used by
 * both scripts/pipeline.cjs (Stage 5) and scripts/sync-destination-details.ts
 * so the mapping can never drift between generators.
 *
 * META-001: The mapping mirrors pipeline Stage 5 field-for-field (id, name,
 *           prefecture, region, role, kind, status, relationships).
 * META-002: Defaults are applied only for optional fields (region, role,
 *           kind, status); id/name/prefecture are passed through unchanged.
 * META-003: Output is sorted by id (localeCompare) — deterministic across
 *           runs and independent of the input order.
 * META-004: No runtime-required fields are added or dropped by callers; the
 *           store (useTripStore) consumes exactly these keys.
 */

export function buildDestinationsMeta(destinations) {
  const metaData = destinations.map((d) => ({
    id: d.id,
    name: d.name,
    prefecture: d.prefecture,
    region: d.region || "Other",
    role: d.role || "poi",
    kind: d.kind || "attraction",
    status: d.status || "verified",
    relationships: d.relationships || {},
  }));
  metaData.sort((a, b) => a.id.localeCompare(b.id));
  return metaData;
}
