import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import destinationsIndex from "@/shared/data/destinations-index.json";
import corrections from "../kai-89-corrections.json";
import auditReport from "../kai-89-structured-template-audit.json";
import type { Destination } from "@/shared/types/destination";

// The committed index JSON is typed catalogue data (generated from the
// canonical Destination shape); the unchecked cast is required because the
// JSON module type is a structural array, not the Destination interface.
const index = destinationsIndex as unknown as Destination[];
const byId = new Map(index.map((d) => [d.id, d]));
const get = (id: string): Destination => {
  const d = byId.get(id);
  if (!d) throw new Error(`missing ${id}`);
  return d;
};

describe("KAI-89 final-pass regression tests", () => {
  describe("deterministic audit", () => {
    it("committed audit date is the stable constant, not the current clock", () => {
      // The generator stamps AUDITED_AT ("2026-08-13") instead of
      // new Date(): --check byte-compares the regenerated report, so a
      // wall-clock date would fail CI on UTC rollover with no data change.
      expect(auditReport.auditedAt).toBe("2026-08-13");
    });

    it("generator never uses the current clock in checked output", () => {
      const generatorPath = path.join(
        process.cwd(),
        "scripts/audit-kai-89-structured-templates.ts",
      );
      const source = fs.readFileSync(generatorPath, "utf8");
      expect(source).not.toMatch(/new Date\(|Date\.now\(|\.toISOString\(/);
      expect(source).toMatch(/AUDITED_AT\s*=\s*"2026-08-13"/);
    });
  });

  describe("budget corrections keep factual integrity over arithmetic sums", () => {
    it("verified ticket prices are applied without rescaling other components", () => {
      // A verified admission price is NOT evidence about food/transport
      // costs: transport/food/cafe must remain byte-identical to their
      // pre-KAI-89 baseline (no synthetic precision from rebalancing).
      for (const c of corrections.sections.budgetTicketCorrections) {
        const d = get(c.id);
        const baseline = corrections.sections.budgetComponentBaseline[c.id];
        expect(baseline, `baseline for ${c.id}`).toBeDefined();
        expect(d.budgetBreakdown.tickets, `${c.id} tickets`).toBe(c.value);
        expect(d.budgetBreakdown.transport, `${c.id} transport untouched`).toBe(
          baseline.transport,
        );
        expect(d.budgetBreakdown.food, `${c.id} food untouched`).toBe(
          baseline.food,
        );
        expect(d.budgetBreakdown.cafe, `${c.id} cafe untouched`).toBe(
          baseline.cafe,
        );
      }
    });

    it("rebalance-only records use the documented midpoint, components untouched", () => {
      for (const c of corrections.sections.budgetRebalanceOnly) {
        const d = get(c.id);
        const baseline = corrections.sections.budgetComponentBaseline[c.id];
        expect(baseline, `baseline for ${c.id}`).toBeDefined();
        expect(d.budgetRecommended).toBe(
          Math.round((d.budgetMin + d.budgetMax) / 2),
        );
        // KAI-219C1/D1 migration (narrowed per review R6): ONLY the legacy
        // budgetBreakdown.tickets field may be exempt when it was
        // intentionally retired because an authoritative v2 admission fact
        // exists. transport / food / cafe MUST remain asserted unchanged —
        // an authoritative admission fact never justifies changing them.
        const hasAuthoritativeAdmission =
          d.admission &&
          (d.admission.state === "verified_paid" ||
            d.admission.state === "verified_free" ||
            d.admission.state === "not_applicable");
        expect(d.budgetBreakdown.transport).toBe(baseline.transport);
        expect(d.budgetBreakdown.food).toBe(baseline.food);
        expect(d.budgetBreakdown.cafe).toBe(baseline.cafe);
        if (hasAuthoritativeAdmission) continue;
        expect(d.budgetBreakdown.tickets).toBe(baseline.tickets);
      }
    });
  });

  describe("cross-field factual consistency", () => {
    it("Hamarikyu: hours/parking/website/sources all agree with the official park page", () => {
      const h = get("hamarikyu-gardens");
      // No stale 24-hour / open-access claims anywhere (EN or JA).
      const hoursText = [
        h.businessHours,
        h.openingHours,
        h.content?.en?.openingHours,
        h.content?.ja?.openingHours,
      ]
        .filter(Boolean)
        .join(" ");
      expect(hoursText).not.toMatch(/24 hours|open access|24時間|散策自由/i);
      expect(hoursText).toMatch(/09:00-17:00|9時〜午後5時|9:00〜17:00/i);
      // Parking: no general on-site parking claim.
      expect(h.parking).toMatch(/No general on-site parking/i);
      expect(h.content?.ja?.parking).toMatch(
        /駐車場はありません|最寄りの公共駐車場/,
      );
      // Official website + source provenance.
      expect(h.officialWebsite).toBe(
        "https://www.tokyo-park.or.jp/park/hama-rikyu/",
      );
      expect(h.editorial?.sources?.map((s) => s.url)).toContain(
        "https://www.tokyo-park.or.jp/park/hama-rikyu/",
      );
      expect(h.editorial.fieldSources?.openingHours).toBeDefined();
      expect(h.editorial.fieldSources?.parking).toBeDefined();
      // Admission 300 remains the verified value.
      expect(h.budgetBreakdown.tickets).toBe(300);
    });

    it("Engakuji: no on-site parking claim; admission 500 current", () => {
      const e = get("engakuji");
      expect(e.parking).toMatch(/No on-site parking/i);
      expect(e.content?.en?.parking).toMatch(/No on-site parking/i);
      expect(e.parkingJa).toMatch(/周辺の有料駐車場/);
      expect(e.budgetBreakdown.tickets).toBe(500);
      expect(e.editorial.fieldSources?.parking).toBeDefined();
    });

    it("honmaru-palace: nameJa mirrors content.ja.name", () => {
      const d = get("honmaru-palace");
      expect(d.nameJa).toBe("本丸御殿");
      expect(d.content.ja.name).toBe(d.nameJa);
    });
  });
});
