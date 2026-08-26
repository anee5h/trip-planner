import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { Destination } from "../../src/shared/types/destination";

const indexPath = path.join(
  process.cwd(),
  "src/shared/data/destinations-index.json",
);
const truthPath = path.join(
  process.cwd(),
  "scripts/audit/kai-89-calibration-truth.json",
);

const destinations = JSON.parse(
  fs.readFileSync(indexPath, "utf8"),
) as Destination[];
const truth = JSON.parse(fs.readFileSync(truthPath, "utf8")) as {
  ticketEvidence?: Record<
    string,
    { jpy?: number; kind?: string; source?: string[]; evidence?: string }
  >;
};
const ticket = truth.ticketEvidence ?? {};
const byId = new Map(destinations.map((d) => [d.id, d]));

const AMBIGUOUS_KINDS = new Set([
  "FIXED_PAID_WITH_BUNDLE",
  "FIXED_ENTRY_PLUS_ACTIVITIES",
  "FREE_AREA_SEPARATE_PAID_FACILITIES",
  "FREE_ENTRY_PAID_EXPERIENCES",
  "FREE_ENTRY_PAY_PER_RIDE",
  "FREE_ENTRY_PURCHASES_VARIABLE",
  "FIXED_COLLECTION_PLUS_VARIABLE_SPECIAL",
]);

describe("KAI-204 on-site budget provenance repair", () => {
  it("every non-ambiguous paid ledger record carries trusted metadata with a matching ticket", () => {
    // The systemic repair upgraded every record whose verified ticket was in
    // the ledger to trusted provenance (manual for repaired/rescued records,
    // model for records the KAI-89 model filled with the same ledger ticket)
    // with breakdown.tickets == ledger jpy.
    const failures: string[] = [];
    for (const [id, ev] of Object.entries(ticket)) {
      if (typeof ev.jpy !== "number" || ev.jpy <= 0) continue;
      if (AMBIGUOUS_KINDS.has(ev.kind ?? "")) continue;
      const d = byId.get(id);
      if (!d) continue;
      const method = d.budgetMetadata?.method;
      if (method !== "manual" && method !== "model") {
        failures.push(`${id}: metadata ${method ?? "absent"} not trusted`);
        continue;
      }
      if (d.budgetBreakdown?.tickets !== ev.jpy) {
        failures.push(
          `${id}: tickets ${d.budgetBreakdown?.tickets} != ledger ${ev.jpy}`,
        );
      }
    }
    expect(failures).toEqual([]);
  });

  it("unambiguous verified-free ledger records are manual with tickets=0", () => {
    for (const id of ["ikebukuro-toshima", "odaiba-minato", "farm-tomita"]) {
      const d = byId.get(id);
      expect(d, id).toBeDefined();
      expect(d!.budgetMetadata?.method, `${id} metadata`).toBe("manual");
      expect(d!.budgetBreakdown?.tickets, `${id} tickets`).toBe(0);
      expect(d!.budgetMetadata?.basis ?? "", `${id} basis`).toMatch(/free/i);
    }
  });

  it("ambiguous-evidence records never carry a fabricated trusted budget", () => {
    for (const id of [
      "genkyuen-garden",
      "shikisai-no-oka",
      "cupnoodles-museum-osaka-ikeda",
      "amanohashidate-kyoto",
      "mount-yoshino-nara",
      "national-museum-western-art-tokyo",
    ]) {
      const d = byId.get(id);
      expect(d, id).toBeDefined();
      const meta = d!.budgetMetadata?.method ?? "absent";
      // These must NOT carry manual/model provenance with a fabricated
      // budget. They may be unknown, absent, or (for records the model
      // legitimately filled from the same ledger entry, e.g. free-entry
      // yokohama-cosmo-world) model — but never with invented numbers.
      expect(["unknown", "absent", "model"], `${id} method ${meta}`).toContain(
        meta,
      );
      if (meta === "unknown") {
        // unknown is authoritative: no numeric budget may coexist.
        expect(d!.budgetMin, `${id} min`).toBeUndefined();
        expect(d!.budgetMax, `${id} max`).toBeUndefined();
        expect(d!.budgetBreakdown, `${id} breakdown`).toBeUndefined();
      }
      if (meta === "model" && d!.budgetBreakdown) {
        // Model-filled ambiguous records must still use the ledger ticket
        // exactly — never an invented admission.
        const ev = ticket[id];
        if (ev && typeof ev.jpy === "number") {
          expect(d!.budgetBreakdown.tickets, `${id} tickets`).toBe(ev.jpy);
        }
      }
    }
  });

  it("the manual-ticket conflicts are reconciled to the ledger values", () => {
    const cases: Record<string, number> = {
      "mukojima-hyakkaen": 150,
      buaiso: 1500,
      "tachikawa-manga-park": 400,
      "fukuoka-tower": 1000,
    };
    for (const [id, jpy] of Object.entries(cases)) {
      const d = byId.get(id);
      expect(d, id).toBeDefined();
      expect(d!.budgetBreakdown?.tickets, `${id} tickets`).toBe(jpy);
      expect(d!.budgetMetadata?.method, `${id} metadata`).toBe("manual");
      expect(d!.budgetMetadata?.basis ?? "", `${id} basis`).toContain(
        `¥${jpy}`,
      );
    }
  });

  it("dead-end rescued records carry the verified ticket in a minimal breakdown", () => {
    const rescued: Record<string, number> = {
      "koko-en-garden": 400,
      "genbudo-cave-park": 500,
      "ikuno-silver-mine": 1200,
      "miho-museum-koka": 1300,
      "sakai-city-museum": 200,
      "kenroku-en": 320,
      "hakone-open-air-museum": 2000,
    };
    for (const [id, jpy] of Object.entries(rescued)) {
      const d = byId.get(id);
      expect(d, id).toBeDefined();
      expect(d!.budgetMetadata?.method, `${id} metadata`).toBe("manual");
      expect(d!.budgetBreakdown?.tickets, `${id} tickets`).toBe(jpy);
      // Discretionary components were never invented — only the verified
      // ticket was restored.
      expect(d!.budgetBreakdown?.food ?? 0, `${id} food`).toBe(0);
      expect(d!.budgetBreakdown?.cafe ?? 0, `${id} cafe`).toBe(0);
    }
  });

  it("no numeric budget coexists with method 'unknown' (two-truths invariant)", () => {
    const bad = destinations.filter((d) => {
      if (d.budgetMetadata?.method !== "unknown") return false;
      return (
        d.budgetMin !== undefined ||
        d.budgetRecommended !== undefined ||
        d.budgetMax !== undefined ||
        d.budgetBreakdown !== undefined
      );
    });
    expect(bad.map((d) => d.id)).toEqual([]);
  });

  it("the model cohort invariant holds: tickets from ledger or hub convention only", () => {
    const HUB_KINDS = new Set(["city", "ward", "town", "village"]);
    const bad: string[] = [];
    for (const d of destinations) {
      if (d.budgetMetadata?.method !== "model") continue;
      const isHub = HUB_KINDS.has(d.kind ?? "") || d.role === "hub";
      const hasLedger = ticket[d.id] !== undefined;
      if (!hasLedger && !isHub) bad.push(`${d.id}: no ledger and not hub`);
      if (hasLedger && d.budgetBreakdown?.tickets !== ticket[d.id]!.jpy) {
        bad.push(`${d.id}: tickets != ledger`);
      }
      if (isHub && !hasLedger && d.budgetBreakdown?.tickets !== 0) {
        bad.push(`${d.id}: hub tickets != 0 convention`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("catalogue metadata baseline is stable after repair", () => {
    const counts = { manual: 0, model: 0, unknown: 0, absent: 0 };
    for (const d of destinations) {
      const m = d.budgetMetadata?.method ?? "absent";
      counts[m as keyof typeof counts]++;
    }
    // Exact post-repair state: 38 manual, 112 model, 462 unknown, 445 absent.
    expect(counts).toEqual({
      manual: 38,
      model: 112,
      unknown: 462,
      absent: 445,
    });
  });
});
