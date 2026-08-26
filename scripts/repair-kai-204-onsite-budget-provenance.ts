/**
 * KAI-204 — deterministic on-site budget provenance repair.
 *
 * Repairs ONLY what committed evidence supports:
 *
 *   A. LEDGER_TICKET_META_UPGRADE — records whose verified ticket price is
 *      in scripts/audit/kai-89-calibration-truth.json ticketEvidence but
 *      whose budgetMetadata is absent or unknown. These are upgraded to
 *      method "manual" with the ledger ticket as the tickets component and
 *      the ledger source URL in the basis. Discretionary components are
 *      NEVER invented: when the record has no budget at all, a minimal
 *      breakdown {transport:0, tickets:ledgerJpy, food:0, cafe:0} is
 *      written (matching the accepted-debt manual pattern of
 *      shinjuku-gyo-en); when the record already has a breakdown, only the
 *      tickets component is reconciled to the ledger price.
 *
 *   B. MANUAL_TICKET_CONFLICT — records with method "manual" whose basis
 *      claims "verified ticket ¥X preserved" but whose breakdown.tickets
 *      disagrees with the ledger. The tickets component is corrected to the
 *      ledger value (the basis already states the verified fact; the
 *      breakdown must agree).
 *
 *   C. VERIFIED_FREE — records with ledger ticketEvidence jpy=0 (verified
 *      free admission). Their tickets component is set to 0 and metadata
 *      upgraded to manual with the free evidence (FREE_ENTRY / LEDGER_VERIFIED
 *      / etc). NEVER inferred from keywords — only from ledger proof.
 *
 *   D. HUB_TICKET_CONVENTION — hub-class records (kind city/ward/town/village
 *      or role hub) with tickets != 0 and no ledger evidence are NOT touched
 *      here (legacy debt; the hub tickets=0 convention is a class rule, not
 *      a per-record repair, and forcing it would fabricate a budget shape).
 *
 * Idempotent: running twice produces a byte-identical catalogue.
 * Deterministic: no timestamps, no randomness, sorted id processing.
 *
 * Run:
 *   npx tsx scripts/repair-kai-204-onsite-budget-provenance.ts --check  (no write)
 *   npx tsx scripts/repair-kai-204-onsite-budget-provenance.ts           (write)
 */

import fs from "node:fs";
import path from "node:path";
import type { Destination } from "../src/shared/types/destination";

const rootDir = process.cwd();
const indexPath = path.join(rootDir, "src/shared/data/destinations-index.json");
const truthPath = path.join(
  rootDir,
  "scripts/audit/kai-89-calibration-truth.json",
);
const HUB_KINDS = new Set(["city", "ward", "town", "village"]);

interface EvidenceEntry {
  jpy?: number;
  source?: string[];
  kind?: string;
  evidence?: string;
}

interface RepairRecord {
  id: string;
  kind:
    | "A_LEDGER_TICKET_META_UPGRADE"
    | "B_MANUAL_TICKET_CONFLICT"
    | "C_VERIFIED_FREE";
  ledgerJpy: number;
  ledgerKind: string;
  source: string[];
  action: string;
  ambiguous?: boolean;
}

const destinations = JSON.parse(
  fs.readFileSync(indexPath, "utf8"),
) as Destination[];
const truth = JSON.parse(fs.readFileSync(truthPath, "utf8")) as {
  ticketEvidence?: Record<string, EvidenceEntry>;
};
const ticket = truth.ticketEvidence ?? {};

function isFiniteNonNegative(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

const repairs: RepairRecord[] = [];

// ---- Classify all ledger-backed records ----
const byId = new Map(destinations.map((d) => [d.id, d]));
const ledgerIds = Object.keys(ticket).sort();

for (const id of ledgerIds) {
  const d = byId.get(id);
  if (!d) continue; // ledger id not in catalogue (historical/retired)
  const ev = ticket[id];
  if (!isFiniteNonNegative(ev.jpy)) continue;
  const meta = d.budgetMetadata;
  const isHub = HUB_KINDS.has(d.kind ?? "") || d.role === "hub";
  const currentTickets = d.budgetBreakdown?.tickets;

  // Ambiguous evidence kinds: the ledger itself flags these as needing a
  // product decision (bundle vs standalone, entry+activities). Do NOT
  // upgrade — a verified partial price must not masquerade as the full
  // admission fact.
  const ambiguousKinds = new Set([
    "FIXED_PAID_WITH_BUNDLE",
    "FIXED_ENTRY_PLUS_ACTIVITIES",
    "FREE_AREA_SEPARATE_PAID_FACILITIES",
    "FREE_ENTRY_PAID_EXPERIENCES",
    "FREE_ENTRY_PAY_PER_RIDE",
    "FREE_ENTRY_PURCHASES_VARIABLE",
    "FIXED_COLLECTION_PLUS_VARIABLE_SPECIAL",
  ]);

  if (ev.jpy === 0) {
    // C. VERIFIED_FREE (only for unambiguous free kinds — LEDGER_VERIFIED
    // free district or FREE_ENTRY plain). Already-manual free records are
    // skipped entirely (idempotent second run → zero work).
    if (ev.kind === "LEDGER_VERIFIED" || ev.kind === "FREE_ENTRY") {
      if (meta?.method === "manual" && d.budgetBreakdown?.tickets === 0) {
        continue; // already repaired
      }
      repairs.push({
        id,
        kind: "C_VERIFIED_FREE",
        ledgerJpy: 0,
        ledgerKind: ev.kind ?? "?",
        source: ev.source ?? [],
        action:
          meta?.method === "manual"
            ? "free already tagged; no change"
            : "upgrade to manual with verified-free evidence",
      });
    } else if (ambiguousKinds.has(ev.kind ?? "")) {
      // Free-with-paid-experiences etc: admission is free but the record
      // must not claim a zero total. Leave as-is (unknown/absent).
      repairs.push({
        id,
        kind: "C_VERIFIED_FREE",
        ledgerJpy: 0,
        ledgerKind: ev.kind ?? "?",
        source: ev.source ?? [],
        action:
          "leave: free-entry-but-paid-experiences (admission free, total not zero)",
        ambiguous: true,
      });
    }
    continue;
  }

  // Paid ledger ticket.
  if (ambiguousKinds.has(ev.kind ?? "")) {
    repairs.push({
      id,
      kind: "A_LEDGER_TICKET_META_UPGRADE",
      ledgerJpy: ev.jpy,
      ledgerKind: ev.kind ?? "?",
      source: ev.source ?? [],
      action: "leave: ambiguous evidence kind (bundle/activities/variable)",
      ambiguous: true,
    });
    continue;
  }

  if (isHub) {
    // Hub with a ledger ticket: rare; preserve the source-verified ticket
    // if the record already carries it, else leave.
    if (meta?.method === "manual" && currentTickets === ev.jpy) continue;
    repairs.push({
      id,
      kind: "A_LEDGER_TICKET_META_UPGRADE",
      ledgerJpy: ev.jpy,
      ledgerKind: ev.kind ?? "?",
      source: ev.source ?? [],
      action:
        currentTickets === ev.jpy
          ? "hub with matching ticket; metadata upgrade to manual"
          : "leave: hub record, ledger ticket differs from breakdown",
    });
    continue;
  }

  if (!meta) {
    repairs.push({
      id,
      kind: "A_LEDGER_TICKET_META_UPGRADE",
      ledgerJpy: ev.jpy,
      ledgerKind: ev.kind ?? "?",
      source: ev.source ?? [],
      action:
        currentTickets === ev.jpy
          ? "absent metadata with matching ticket; upgrade to manual"
          : currentTickets === undefined
            ? "absent metadata, no budget; restore minimal breakdown with verified ticket"
            : "absent metadata, ticket mismatch; reconcile tickets to ledger",
    });
  } else if (meta.method === "unknown") {
    repairs.push({
      id,
      kind: "A_LEDGER_TICKET_META_UPGRADE",
      ledgerJpy: ev.jpy,
      ledgerKind: ev.kind ?? "?",
      source: ev.source ?? [],
      action:
        currentTickets === undefined
          ? "unknown metadata, no budget; restore minimal breakdown with verified ticket (dead-end rescue)"
          : "unknown metadata with numbers (two truths); upgrade to manual and reconcile tickets",
    });
  } else if (meta.method === "manual" && currentTickets !== ev.jpy) {
    repairs.push({
      id,
      kind: "B_MANUAL_TICKET_CONFLICT",
      ledgerJpy: ev.jpy,
      ledgerKind: ev.kind ?? "?",
      source: ev.source ?? [],
      action: `manual basis claims ¥${ev.jpy} but breakdown.tickets=${currentTickets}; correct tickets`,
    });
  }
  // model records with matching tickets are already correct (invariant verified);
  // manual records with matching tickets are already repaired (idempotent).
}

const byKind = new Map<string, RepairRecord[]>();
for (const r of repairs) {
  const arr = byKind.get(r.kind) ?? [];
  arr.push(r);
  byKind.set(r.kind, arr);
}

// ---- Apply (or preview) ----
const changes: string[] = [];

function applyRepair(r: RepairRecord): void {
  const d = byId.get(r.id)!;
  if (r.ambiguous) return;

  if (r.kind === "C_VERIFIED_FREE") {
    if (!d.budgetBreakdown)
      d.budgetBreakdown = { transport: 0, tickets: 0, food: 0, cafe: 0 };
    d.budgetBreakdown.tickets = 0;
    d.budgetMetadata = {
      method: "manual",
      modelVersion: "budget-model-v1",
      confidence: "low",
      basis: `verified free admission (ledger ${r.ledgerKind})${r.source.length ? `; source: ${r.source[0]}` : ""}`,
    };
    changes.push(`${r.id}: free verified (${r.ledgerKind})`);
    return;
  }

  // A/B — paid ticket upgrade.
  if (!d.budgetBreakdown) {
    // Minimal accepted-debt breakdown: only the verified ticket, no
    // invented discretionary spend.
    d.budgetBreakdown = {
      transport: 0,
      tickets: r.ledgerJpy,
      food: 0,
      cafe: 0,
    };
    changes.push(`${r.id}: restored minimal breakdown tickets=¥${r.ledgerJpy}`);
  } else if (d.budgetBreakdown.tickets !== r.ledgerJpy) {
    const before = d.budgetBreakdown.tickets;
    d.budgetBreakdown.tickets = r.ledgerJpy;
    changes.push(`${r.id}: reconciled tickets ${before}→¥${r.ledgerJpy}`);
  }
  d.budgetMetadata = {
    method: "manual",
    modelVersion: "budget-model-v1",
    confidence: "low",
    basis: `verified ticket ¥${r.ledgerJpy} (ledger ${r.ledgerKind})${r.source.length ? `; source: ${r.source[0]}` : ""}`,
  };
  // Record the upgrade even when tickets already matched (metadata was the
  // only missing piece).
  if (changes[changes.length - 1]?.startsWith(`${r.id}:`) !== true) {
    changes.push(
      `${r.id}: metadata upgraded to manual (ticket ¥${r.ledgerJpy} already present)`,
    );
  }
}

if (process.argv.includes("--check")) {
  console.log("KAI-204 repair preview (--check, no writes)");
  for (const [k, arr] of byKind) {
    console.log(`\n${k}: ${arr.length}`);
    for (const r of arr) {
      console.log(`  ${r.id}: ${r.action}`);
    }
  }
} else {
  for (const r of repairs) applyRepair(r);
  // Deterministic output: the canonical committed format is
  // JSON.stringify(records, null, 2) + "\n" (identical to what
  // normalize-destination-budgets.ts produces and what check-catalog-sync
  // compares against). Prettier must NOT reflow the file — it would create
  // a whole-file diff unrelated to the repair.
  const out = `${JSON.stringify(destinations, null, 2)}\n`;
  fs.writeFileSync(indexPath, out);
  console.log("KAI-204 repair applied");
  console.log(
    `records repaired: ${repairs.filter((r) => !r.ambiguous).length}`,
  );
  console.log("\nchanges:");
  for (const c of changes) console.log(`  ${c}`);
  console.log("\nskipped (ambiguous):");
  for (const r of repairs.filter((x) => x.ambiguous))
    console.log(`  ${r.id} (${r.ledgerKind})`);
}
