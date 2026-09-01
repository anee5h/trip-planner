import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  buildFact,
  factsEqual,
  type ManifestEntry,
} from "../../kai-219e1-admission-cohort";
import type { Destination } from "../../../src/shared/types/destination";
import { calculateTripCost } from "@/shared/services/budget/tripCostEngine";
import { validateAdmissionFact } from "@/shared/services/budget/factValidation";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const INDEX_PATH = path.join(
  REPO_ROOT,
  "src/shared/data/destinations-index.json",
);

let destinations: Destination[];
let byId: Map<string, Destination>;

beforeAll(() => {
  destinations = JSON.parse(
    fs.readFileSync(INDEX_PATH, "utf8"),
  ) as Destination[];
  byId = new Map(destinations.map((d) => [d.id, d]));
});

function entry(overrides: Record<string, unknown>): ManifestEntry {
  return {
    id: "kobe-suma-sea-world",
    state: "variable_price",
    min: 2900,
    max: 3700,
    reasonCode: "price_variable_by_date",
    scope: "general_entry",
    sourceUrls: ["https://www.kobesuma-seaworld.jp/guide/price_ticket/"],
    checkedAt: "2026-08-28",
    basis: "Official calendar: adult ¥2,900–¥3,700 by date.",
    ...overrides,
  } as ManifestEntry;
}

describe("KAI-219E1 variable-price manifest semantics", () => {
  it("bounded variable with min+max+reasonCode is valid", () => {
    const fact = buildFact(entry({}), byId.get("kobe-suma-sea-world")!);
    expect(fact.state).toBe("variable_price");
    expect(fact.provenance).toBe("verified_source");
    expect(fact.reasonCode).toBe("price_variable_by_date");
    expect(fact.cost).toEqual({ kind: "bounded", min: 2900, max: 3700 });
    expect(fact.scope).toBe("general_entry");
    expect(fact.reviewIntervalMonths).toBe(12);
  });

  it("bounded variable preserves the WHOLE range (never a single point)", () => {
    const fact = buildFact(entry({}), byId.get("kobe-suma-sea-world")!);
    const c = fact.cost as { kind: "bounded"; min: number; max: number };
    expect(c.min).toBe(2900);
    expect(c.max).toBe(3700);
    // no midpoint / scalar leakage
    expect((fact.cost as any).jpy).toBeUndefined();
  });

  it("min/max must be ordered (max>=min) and non-negative", () => {
    expect(() =>
      buildFact(
        entry({ min: 3700, max: 2900 }),
        byId.get("kobe-suma-sea-world")!,
      ),
    ).toThrow(/invalid bounded range/);
    expect(() =>
      buildFact(
        entry({ min: -1, max: 3700 }),
        byId.get("kobe-suma-sea-world")!,
      ),
    ).toThrow(/invalid bounded range/);
  });

  it("bounded requires BOTH min and max", () => {
    expect(() =>
      buildFact(
        entry({ min: 2900, max: undefined }),
        byId.get("kobe-suma-sea-world")!,
      ),
    ).toThrow(/requires BOTH min and max/);
  });

  it("reasonCode must be schema-supported", () => {
    expect(() =>
      buildFact(
        entry({ reasonCode: "price_variable_by_mood" }),
        byId.get("kobe-suma-sea-world")!,
      ),
    ).toThrow(/schema-supported reasonCode/);
  });

  it("open_ended 'from' is preserved (never converted to [X,X])", () => {
    const fact = buildFact(
      entry({ min: undefined, max: undefined, openEndedFrom: 3600 }),
      byId.get("teamlab-planets")!,
    );
    expect(fact.state).toBe("variable_price");
    expect(fact.cost).toEqual({ kind: "open_ended", from: 3600 });
  });

  it("cannot supply BOTH min/max AND openEndedFrom", () => {
    expect(() =>
      buildFact(
        entry({ min: 2900, max: 3700, openEndedFrom: 3600 }),
        byId.get("kobe-suma-sea-world")!,
      ),
    ).toThrow(/cannot supply BOTH/);
  });

  it("never a bare scalar for variable (no jpy)", () => {
    expect(() =>
      buildFact(
        entry({ min: undefined, max: undefined, openEndedFrom: undefined }),
        byId.get("kobe-suma-sea-world")!,
      ),
    ).toThrow(/never a bare scalar/);
  });

  it("strict shared checkedAt validation", () => {
    expect(() =>
      buildFact(
        entry({ checkedAt: "2026-02-30" }),
        byId.get("kobe-suma-sea-world")!,
      ),
    ).toThrow(/strict YYYY-MM-DD/);
  });

  it("requires a source URL", () => {
    expect(() =>
      buildFact(entry({ sourceUrls: [] }), byId.get("kobe-suma-sea-world")!),
    ).toThrow(/no source URL/);
  });

  it("no overwrite: existing different fact fails closed", () => {
    const d = byId.get("kobe-suma-sea-world")!;
    d.admission = {
      state: "variable_price",
      provenance: "verified_source",
      reasonCode: "price_variable_by_date",
      cost: { kind: "bounded", min: 2900, max: 2900 },
      scope: "general_entry",
      basis: "stale",
      sourceUrls: ["https://example.com"],
      checkedAt: "2026-08-28",
    };
    const expected = buildFact(entry({}), d);
    expect(factsEqual(d.admission, expected)).toBe(false);
  });

  it("STATE B no-op: real CLI rerun on committed index is byte-identical (zero diff)", () => {
    const before = fs.readFileSync(INDEX_PATH, "utf8");
    const { execSync } = require("node:child_process");
    execSync(
      "npx tsx --tsconfig tsconfig.app.json scripts/kai-219e1-admission-cohort.ts",
      {
        cwd: REPO_ROOT,
        stdio: "pipe",
        env: { ...process.env, TMPDIR: process.env.HOME + "/.tmp-vitest" },
      },
    );
    const after = fs.readFileSync(INDEX_PATH, "utf8");
    expect(after).toBe(before);
  });

  it("STATE C: mixed expected-present + absent → fail closed + byte-identical file", () => {
    const fs2 = require("node:fs");
    const os = require("node:os");
    const tmp = path.join(os.tmpdir(), `kai219e1-mixed-${Date.now()}.json`);
    fs2.writeFileSync(tmp, fs2.readFileSync(INDEX_PATH, "utf8"));
    const tmpIdx = JSON.parse(fs2.readFileSync(tmp, "utf8"));
    const man = JSON.parse(
      fs2.readFileSync(
        path.join(REPO_ROOT, "scripts/audit/kai-219e1-candidates.json"),
        "utf8",
      ),
    );
    const victim = man[0].id;
    const victimDest = tmpIdx.find((d: { id: string }) => d.id === victim);
    if (victimDest) victimDest.admission = undefined;
    fs2.writeFileSync(tmp, JSON.stringify(tmpIdx, null, 2) + "\n");
    const beforeBytes = fs2.readFileSync(tmp, "utf8");
    const env = {
      ...process.env,
      KAI219E1_INDEX_PATH: tmp,
      TMPDIR: process.env.HOME + "/.tmp-vitest",
    };
    const { execSync } = require("node:child_process");
    let threw = false;
    try {
      execSync(
        "npx tsx --tsconfig tsconfig.app.json scripts/kai-219e1-admission-cohort.ts",
        { cwd: REPO_ROOT, stdio: "pipe", env },
      );
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    expect(fs2.readFileSync(tmp, "utf8")).toBe(beforeBytes);
    try {
      fs2.unlinkSync(tmp);
    } catch {}
  });

  it("STATE C: existing different fact → fail closed + byte-identical file", () => {
    const fs2 = require("node:fs");
    const os = require("node:os");
    const tmp = path.join(os.tmpdir(), `kai219e1-diff-${Date.now()}.json`);
    fs2.writeFileSync(tmp, fs2.readFileSync(INDEX_PATH, "utf8"));
    const tmpIdx = JSON.parse(fs2.readFileSync(tmp, "utf8"));
    const man = JSON.parse(
      fs2.readFileSync(
        path.join(REPO_ROOT, "scripts/audit/kai-219e1-candidates.json"),
        "utf8",
      ),
    );
    const victim = man[0].id;
    const victimDest = tmpIdx.find((d: { id: string }) => d.id === victim);
    if (victimDest && victimDest.admission) {
      victimDest.admission.basis = "CORRUPTED different basis";
    }
    fs2.writeFileSync(tmp, JSON.stringify(tmpIdx, null, 2) + "\n");
    const beforeBytes = fs2.readFileSync(tmp, "utf8");
    const env = {
      ...process.env,
      KAI219E1_INDEX_PATH: tmp,
      TMPDIR: process.env.HOME + "/.tmp-vitest",
    };
    const { execSync } = require("node:child_process");
    let threw = false;
    try {
      execSync(
        "npx tsx --tsconfig tsconfig.app.json scripts/kai-219e1-admission-cohort.ts",
        { cwd: REPO_ROOT, stdio: "pipe", env },
      );
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    expect(fs2.readFileSync(tmp, "utf8")).toBe(beforeBytes);
    try {
      fs2.unlinkSync(tmp);
    } catch {}
  });

  it("STATE A: all-absent manifest authors the expected facts", () => {
    const fs2 = require("node:fs");
    const os = require("node:os");
    const tmp = path.join(os.tmpdir(), `kai219e1-stateA-${Date.now()}.json`);
    fs2.writeFileSync(tmp, fs2.readFileSync(INDEX_PATH, "utf8"));
    const tmpIdx = JSON.parse(fs2.readFileSync(tmp, "utf8"));
    const man = JSON.parse(
      fs2.readFileSync(
        path.join(REPO_ROOT, "scripts/audit/kai-219e1-candidates.json"),
        "utf8",
      ),
    );
    const ids = new Set(man.map((e: { id: string }) => e.id));
    for (const d of tmpIdx) {
      if (ids.has(d.id)) d.admission = undefined;
    }
    fs2.writeFileSync(tmp, JSON.stringify(tmpIdx, null, 2) + "\n");
    const env = {
      ...process.env,
      KAI219E1_INDEX_PATH: tmp,
      TMPDIR: process.env.HOME + "/.tmp-vitest",
    };
    const { execSync } = require("node:child_process");
    execSync(
      "npx tsx --tsconfig tsconfig.app.json scripts/kai-219e1-admission-cohort.ts",
      { cwd: REPO_ROOT, stdio: "pipe", env },
    );
    const afterIdx = JSON.parse(fs2.readFileSync(tmp, "utf8"));
    for (const e of man) {
      const d = afterIdx.find((x: { id: string }) => x.id === e.id);
      expect(d.admission).toBeTruthy();
      expect(d.admission.state).toBe("variable_price");
    }
    const b1 = fs2.readFileSync(tmp, "utf8");
    execSync(
      "npx tsx --tsconfig tsconfig.app.json scripts/kai-219e1-admission-cohort.ts",
      { cwd: REPO_ROOT, stdio: "pipe", env },
    );
    expect(fs2.readFileSync(tmp, "utf8")).toBe(b1);
    try {
      fs2.unlinkSync(tmp);
    } catch {}
  });

  it("REAL-FACT range integration: committed catalogue variable facts survive fact → engine → trip cost (no midpoint leak)", () => {
    // Loads the REAL committed facts (kobe-suma bounded, teamlab open-ended)
    // from the catalogue and proves they flow through the TripCostEngine to a
    // user-facing trip-cost shape with full ranges preserved.
    const idx = JSON.parse(fs.readFileSync(INDEX_PATH, "utf8"));
    const byId = new Map(idx.map((d: { id: string }) => [d.id, d]));
    const suma = byId.get("kobe-suma-sea-world");
    const teamlab = byId.get("teamlab-planets");
    expect(suma?.admission?.state).toBe("variable_price");
    expect(teamlab?.admission?.state).toBe("variable_price");
    // Admission normalization/validation is the shared fail-closed gate
    // used by TripCostEngine for persisted catalogue facts.
    expect(validateAdmissionFact(suma.admission).valid).toBe(true);
    expect(validateAdmissionFact(teamlab.admission).valid).toBe(true);

    // Bounded: range preserved × partySize, never midpoint-collapsed.
    const r1 = calculateTripCost({
      dest: suma,
      tripMode: "day_trip",
      partySize: 2,
      mode: "train",
      includeOriginTravel: false,
    } as any);
    const adm1 = r1.components.find(
      (c: any) => c.evidence.scope === "admission",
    );
    expect(adm1.cost).toEqual({ kind: "bounded", min: 5800, max: 7400 });
    expect(adm1.evidence.state).toBe("variable_price");

    // Open-ended: lower bound survives × partySize and receives a
    // deterministic planning ceiling, so the aggregate can be bounded.
    const r2 = calculateTripCost({
      dest: teamlab,
      tripMode: "day_trip",
      partySize: 2,
      mode: "train",
      includeOriginTravel: false,
    } as any);
    const adm2 = r2.components.find(
      (c: any) => c.evidence.scope === "admission",
    );
    expect(adm2.cost).toEqual({ kind: "bounded", min: 7200, max: 12600 });
    expect(adm2.evidence.state).toBe("variable_price");
    expect(r2.completeness).toBe("complete");
  });

  it("manifest matches the committed candidates file (all entries valid)", () => {
    const man = JSON.parse(
      fs.readFileSync(
        path.join(REPO_ROOT, "scripts/audit/kai-219e1-candidates.json"),
        "utf8",
      ),
    );
    expect(man.length).toBeGreaterThan(0);
    const ids = new Set(destinations.map((d) => d.id));
    for (const e of man) {
      expect(ids.has(e.id)).toBe(true);
      expect(e.state).toBe("variable_price");
      expect(e.reasonCode).toBeTruthy();
      expect(e.sourceUrls.length).toBeGreaterThan(0);
      expect(e.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const hasRange = e.min !== undefined || e.max !== undefined;
      const hasOpenEnded = e.openEndedFrom !== undefined;
      expect(hasRange || hasOpenEnded).toBe(true);
      if (hasRange) {
        expect(e.min).toBeGreaterThanOrEqual(0);
        expect(e.max).toBeGreaterThanOrEqual(e.min);
      }
      if (hasOpenEnded) {
        expect(e.openEndedFrom).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
