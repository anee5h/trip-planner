/**
 * kai-89-score-verification — shared loader for score-specific editorial
 * provenance (KAI-89 Overall-Destination Rubric v2).
 *
 * Single source of truth for which records are allowed to be
 * `scoreMetadata.state = "verified"`: only records present in the committed
 * verification ledger's `verified.records` with an authoritative source URL
 * and verification date. Used by BOTH the generator (emission) and the
 * validation gates (state/value agreement) so the two can never drift.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { EditorialScoreProvenance } from "../../src/shared/services/recommendation/scoreRubric";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const ledgerPath = path.join(
  rootDir,
  "scripts/audit/kai-89-score-verification-ledger.json",
);

export interface VerifiedScoreRecord {
  id: string;
  verifiedAt: string;
  sources: string[];
}

/** id -> editorial provenance for every verified record in the ledger. */
export function loadVerifiedScoreProvenance(): Map<
  string,
  EditorialScoreProvenance
> {
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8")) as {
    verified?: { records?: VerifiedScoreRecord[] };
  };
  const map = new Map<string, EditorialScoreProvenance>();
  for (const record of ledger.verified?.records ?? []) {
    if (record.sources.length === 0) continue;
    map.set(record.id, {
      verifiedAt: record.verifiedAt,
      sources: record.sources,
    });
  }
  return map;
}
