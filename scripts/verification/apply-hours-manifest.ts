/**
 * Generic opening-hours verification applier (KAI-335 long tail).
 *
 * Reads a verification manifest (scripts/verification/manifest-round-N.json)
 * shaped as [{ id, businessHours?, officialWebsite?, meta?: { sourceUrl,
 * verifiedAt } }], applies the edits to the canonical index, and rewrites
 * it. Deterministic (stable order), idempotent (already-applied entries
 * are skipped and reported). Does NOT touch the allowlist — verified
 * records drop out of the backlog automatically.
 *
 * Usage: npx tsx scripts/verification/apply-hours-manifest.ts <manifest>
 */
import { readFileSync, writeFileSync } from "node:fs";

const INDEX = "src/shared/data/destinations-index.json";
const manifestPath = process.argv[2];
if (!manifestPath) {
  console.error("usage: apply-hours-manifest.ts <manifest.json>");
  process.exit(1);
}

interface ManifestEntry {
  id: string;
  businessHours?: string;
  officialWebsite?: string;
  meta?: { sourceUrl: string; verifiedAt: string };
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
  generatedAt?: string;
  entries: ManifestEntry[];
};
const index = JSON.parse(readFileSync(INDEX, "utf8"));
const list = Array.isArray(index) ? index : Object.values(index);
const byId = new Map(list.map((d: { id: string }) => [d.id, d]));

let applied = 0;
let skipped = 0;
const errors: string[] = [];
for (const entry of manifest.entries) {
  const d = byId.get(entry.id);
  if (!d) {
    errors.push(`missing record: ${entry.id}`);
    continue;
  }
  const hoursSame =
    !entry.businessHours || d.businessHours === entry.businessHours;
  const websiteSame =
    !entry.officialWebsite || d.officialWebsite === entry.officialWebsite;
  const metaSame =
    !entry.meta ||
    (d.openingHoursMetadata?.sourceUrl === entry.meta.sourceUrl &&
      d.openingHoursMetadata?.verifiedAt === entry.meta.verifiedAt);
  if (hoursSame && websiteSame && metaSame) {
    skipped += 1;
    continue;
  }
  if (entry.businessHours) d.businessHours = entry.businessHours;
  if (entry.officialWebsite) d.officialWebsite = entry.officialWebsite;
  if (entry.meta) d.openingHoursMetadata = { ...entry.meta };
  applied += 1;
}

writeFileSync(INDEX, JSON.stringify(index, null, 2) + "\n");
console.log(
  JSON.stringify({ manifest: manifestPath, applied, skipped, errors }),
);
if (errors.length) process.exitCode = 1;
