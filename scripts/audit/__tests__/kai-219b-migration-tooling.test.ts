import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  buildExpectedFact,
  factsEqual,
  isTransitionalNumericUsed,
  FREE_IDS,
  KITARO,
  COSMO,
} from "../../kai-219b-admission-cohort";
import { normalizeBudgetState } from "../../../src/shared/services/budget/budgetState";
import type { Destination } from "../../../src/shared/types/destination";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const INDEX_PATH = path.join(
  REPO_ROOT,
  "src/shared/data/destinations-index.json",
);
const TRUTH_PATH = path.join(
  REPO_ROOT,
  "scripts/audit/kai-89-calibration-truth.json",
);

const truth = JSON.parse(fs.readFileSync(TRUTH_PATH, "utf8"));
const ticketEvidence: Record<
  string,
  { jpy: number; kind: string; source?: string[]; evidence?: string }
> = truth.ticketEvidence || {};

let destinations: Destination[];
let byId: Map<string, Destination>;

beforeAll(() => {
  destinations = JSON.parse(
    fs.readFileSync(INDEX_PATH, "utf8"),
  ) as Destination[];
  byId = new Map(destinations.map((d) => [d.id, d]));
});

function baseDest(id: string): Destination {
  return {
    ...destinations.find((d) => d.id === id)!,
    admission: undefined,
  };
}

describe("KAI-219B migration tooling — classifier (STATE expectations)", () => {
  it("buildExpectedFact: sannai-maruyama is verified_paid ¥500 (source hierarchy)", () => {
    const d = baseDest("sannai-maruyama-jomon-aomori");
    const fact = buildExpectedFact(d, ticketEvidence[d.id]);
    expect(fact.state).toBe("verified_paid");
    expect(fact.cost).toEqual({ kind: "bounded", min: 500, max: 500 });
    expect((fact.sourceUrls ?? []).length).toBeGreaterThan(0);
  });

  it("buildExpectedFact: cosmo world is free-area not_applicable", () => {
    const d = baseDest("yokohama-cosmo-world");
    const fact = buildExpectedFact(d, ticketEvidence[d.id]);
    expect(fact.state).toBe("not_applicable");
    expect(fact.reasonCode).toBe("free_area_with_optional_paid_components");
    expect(fact.scope).toBe("open_area");
  });

  it("buildExpectedFact: kitaro requires FREE_ENTRY_PURCHASES_VARIABLE", () => {
    const d = baseDest(KITARO);
    expect(() =>
      buildExpectedFact(d, {
        jpy: 0,
        kind: "FIXED_PAID",
        source: ["https://x"],
      }),
    ).toThrow(/FREE_ENTRY_PURCHASES_VARIABLE/);
    const ok = buildExpectedFact(d, ticketEvidence[d.id]);
    expect(ok.reasonCode).toBe("free_area_with_optional_paid_components");
  });
});

describe("KAI-219B migration tooling — verified-free FAIL-CLOSED (H2)", () => {
  it("FREE_ID + positive jpy → throws (never synthesizes verified_free [0,0])", () => {
    const d = baseDest("farm-tomita");
    expect(() =>
      buildExpectedFact(d, {
        jpy: 500,
        kind: "LEDGER_VERIFIED",
        source: ["https://farm-tomita.co.jp/en/"],
      }),
    ).toThrow(/jpy=500 \(>0\)/);
  });

  it("FREE_ID + non-free kind → throws", () => {
    const d = baseDest("odaiba-minato");
    expect(() =>
      buildExpectedFact(d, {
        jpy: 0,
        kind: "FIXED_PAID",
        source: ["https://x"],
      }),
    ).toThrow(/not free evidence/);
  });

  it("FREE_ID + missing evidence → throws", () => {
    const d = baseDest("ikebukuro-toshima");
    expect(() => buildExpectedFact(d, undefined)).toThrow(/no ledger evidence/);
  });

  it("FREE_ID + jpy 0 + free kind + source → valid verified_free", () => {
    const d = baseDest("farm-tomita");
    const fact = buildExpectedFact(d, {
      jpy: 0,
      kind: "FREE_ENTRY",
      source: ["https://farm-tomita.co.jp/en/"],
    });
    expect(fact.state).toBe("verified_free");
    expect(fact.cost).toEqual({ kind: "bounded", min: 0, max: 0 });
  });

  it("every FREE_IDS record's EXPECTED FACT has a non-empty source URL", () => {
    for (const id of FREE_IDS) {
      const d = byId.get(id)!;
      const ev = ticketEvidence[id];
      expect(ev).toBeDefined();
      expect(ev!.jpy).toBe(0);
      expect(["FREE_ENTRY", "LEDGER_VERIFIED"]).toContain(ev!.kind);
      // The FACT must carry a source URL — either from the ledger or the
      // officialWebsite fallback (never empty).
      const fact = buildExpectedFact(d, ev);
      expect((fact.sourceUrls ?? []).length).toBeGreaterThan(0);
    }
  });
});

describe("KAI-219B migration tooling — STATE B idempotency (H1)", () => {
  it("the committed index is STATE B: every baseline ID has the expected fact", () => {
    const baseline = JSON.parse(
      fs.readFileSync(
        path.join(REPO_ROOT, "scripts/audit/kai-219-baseline-cohort.json"),
        "utf8",
      ),
    ) as string[];
    expect(baseline.length).toBe(150);
    const mismatches: string[] = [];
    for (const id of baseline) {
      const d = byId.get(id)!;
      const expected = buildExpectedFact(d, ticketEvidence[id]);
      if (!factsEqual(d.admission, expected)) mismatches.push(id);
    }
    expect(mismatches).toEqual([]);
  });

  it("re-running the migration on the committed index is a zero-diff no-op (STATE B)", () => {
    const before = fs.readFileSync(INDEX_PATH, "utf8");
    // The CLI guard means importing already ran nothing; run the migration
    // logic via a child process to prove the real CLI exits 0 with zero
    // file changes.
    const { execSync } = require("node:child_process");
    execSync(
      "npx tsx --tsconfig tsconfig.app.json scripts/kai-219b-admission-cohort.ts",
      {
        cwd: REPO_ROOT,
        stdio: "pipe",
        env: { ...process.env, TMPDIR: process.env.HOME + "/.tmp-vitest" },
      },
    );
    const after = fs.readFileSync(INDEX_PATH, "utf8");
    expect(after).toBe(before);
  });
});

describe("KAI-219B migration tooling — cohort semantics (authoritative)", () => {
  it("isTransitionalNumericUsed matches the KAI-219A normalizer semantics", () => {
    // A migrated record (has admission) is never transitional.
    const migrated = byId.get("farm-tomita")!;
    expect(isTransitionalNumericUsed(migrated)).toBe(false);
    // A clean record WITHOUT admission + trusted + numeric tickets is.
    const clean = {
      ...migrated,
      admission: undefined,
      budgetMetadata: {
        method: "manual",
        confidence: "low",
        basis: "legacy fixture",
      },
      budgetMin: 300,
      budgetRecommended: 300,
      budgetMax: 300,
      budgetBreakdown: {
        transport: 0,
        tickets: 300,
        food: 0,
        cafe: 0,
      },
    };
    expect(isTransitionalNumericUsed(clean as Destination)).toBe(true);
    // normalizer agrees
    const norm = normalizeBudgetState(clean as Destination);
    expect(["trusted", "trusted_estimate"]).toContain(norm.trustLevel);
  });
});
