import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  buildFact,
  factsEqual,
  runC2Migration,
  type ManifestEntry,
} from "../../kai-219c2-admission-cohort";
import type { Destination } from "../../../src/shared/types/destination";
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

function baseDest(id: string): Destination {
  return { ...byId.get(id)!, admission: undefined };
}

function entry(overrides: Record<string, unknown>): ManifestEntry {
  return {
    id: "nokonoshima-island-park",
    jpy: 1500,
    scope: "general_entry",
    sourceUrls: ["https://example.com"],
    checkedAt: "2026-08-28",
    basis: "Official site: adult ¥1,500; fixed.",
    ...overrides,
  } as ManifestEntry;
}

describe("KAI-219C2 hardened manifest semantics", () => {
  it("verified_paid with jpy is valid", () => {
    const fact = buildFact(entry({}), baseDest("nokonoshima-island-park"));
    expect(fact.state).toBe("verified_paid");
    expect(fact.provenance).toBe("verified_source");
    expect(fact.cost).toEqual({ kind: "bounded", min: 1500, max: 1500 });
    expect(fact.scope).toBe("general_entry");
    expect(fact.reviewIntervalMonths).toBe(12);
  });

  it("verified_paid MUST NOT supply min/max (scalar only — variable goes to E1)", () => {
    expect(() =>
      buildFact(
        entry({
          jpy: undefined,
          min: 1200,
          max: 1300,
        }) as unknown as ManifestEntry,
        baseDest("nokonoshima-island-park"),
      ),
    ).toThrow(/verified_paid requires a scalar jpy/);
  });

  it("verified_paid requires a positive jpy", () => {
    // jpy undefined → the scalar guard fires (variable facts belong to E1)
    expect(() =>
      buildFact(
        entry({ jpy: undefined }) as ManifestEntry,
        baseDest("nokonoshima-island-park"),
      ),
    ).toThrow(/requires a scalar jpy/);
    expect(() =>
      buildFact(
        entry({ jpy: 0 }) as ManifestEntry,
        baseDest("nokonoshima-island-park"),
      ),
    ).toThrow(/requires a positive adult general-entry price/);
    expect(() =>
      buildFact(
        entry({ jpy: -5 }) as ManifestEntry,
        baseDest("nokonoshima-island-park"),
      ),
    ).toThrow(/requires a positive adult general-entry price/);
  });

  it("requires a source URL", () => {
    expect(() =>
      buildFact(
        entry({ sourceUrls: [] }) as ManifestEntry,
        baseDest("nokonoshima-island-park"),
      ),
    ).toThrow(/no source URL/);
  });

  it("strict shared checkedAt validation (invalid dates fail closed)", () => {
    expect(() =>
      buildFact(
        entry({ checkedAt: "2026-02-30" }) as ManifestEntry,
        baseDest("nokonoshima-island-park"),
      ),
    ).toThrow(/strict YYYY-MM-DD/);
    expect(() =>
      buildFact(
        entry({ checkedAt: "2026/08/28" }) as ManifestEntry,
        baseDest("nokonoshima-island-park"),
      ),
    ).toThrow(/strict YYYY-MM-DD/);
  });

  it("no overwrite: a record with an existing different fact fails closed", () => {
    const d = baseDest("nokonoshima-island-park");
    d.admission = {
      state: "verified_paid",
      provenance: "verified_source",
      cost: { kind: "bounded", min: 999, max: 999 },
      scope: "general_entry",
      basis: "stale",
      sourceUrls: ["https://example.com"],
      checkedAt: "2026-08-28",
    };
    expect(
      factsEqual(d.admission, buildFact(entry({}) as ManifestEntry, d)),
    ).toBe(false);
  });

  it("STATE C: mixed expected-present + absent → fail closed + byte-identical file", () => {
    // Real temp-index regression: a manifest candidate already authored
    // (matching) alongside an absent one MUST fail closed BEFORE writing.
    const fs2 = require("node:fs");
    const os = require("node:os");
    const tmp = path.join(os.tmpdir(), `kai219c2-mixed-${Date.now()}.json`);
    // Start from a temp copy of the committed index (all manifest entries
    // are present+exact = STATE B), then make ONE manifest entry absent in
    // the temp index → the manifest (unchanged, full list) is now a MIX.
    fs2.writeFileSync(tmp, fs2.readFileSync(INDEX_PATH, "utf8"));
    const tmpIdx = JSON.parse(fs2.readFileSync(tmp, "utf8"));
    const man = JSON.parse(
      fs2.readFileSync(
        path.join(REPO_ROOT, "scripts/audit/kai-219c2-candidates.json"),
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
      KAI219C2_INDEX_PATH: tmp,
      TMPDIR: process.env.HOME + "/.tmp-vitest",
    };
    const { execSync } = require("node:child_process");
    let threw = false;
    try {
      execSync(
        "npx tsx --tsconfig tsconfig.app.json scripts/kai-219c2-admission-cohort.ts",
        { cwd: REPO_ROOT, stdio: "pipe", env },
      );
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    const afterBytes = fs2.readFileSync(tmp, "utf8");
    expect(afterBytes).toBe(beforeBytes); // zero writes
    try {
      fs2.unlinkSync(tmp);
    } catch {}
  });

  it("STATE C: existing different fact → fail closed + byte-identical file", () => {
    const fs2 = require("node:fs");
    const os = require("node:os");
    const tmp = path.join(os.tmpdir(), `kai219c2-diff-${Date.now()}.json`);
    fs2.writeFileSync(tmp, fs2.readFileSync(INDEX_PATH, "utf8"));
    const tmpIdx = JSON.parse(fs2.readFileSync(tmp, "utf8"));
    const man = JSON.parse(
      fs2.readFileSync(
        path.join(REPO_ROOT, "scripts/audit/kai-219c2-candidates.json"),
        "utf8",
      ),
    );
    // Corrupt one record's fact (different from expected).
    const victim = man[0].id;
    const victimDest = tmpIdx.find((d: { id: string }) => d.id === victim);
    if (victimDest && victimDest.admission) {
      victimDest.admission.basis = "CORRUPTED different basis";
    }
    fs2.writeFileSync(tmp, JSON.stringify(tmpIdx, null, 2) + "\n");
    const beforeBytes = fs2.readFileSync(tmp, "utf8");
    const env = {
      ...process.env,
      KAI219C2_INDEX_PATH: tmp,
      TMPDIR: process.env.HOME + "/.tmp-vitest",
    };
    const { execSync } = require("node:child_process");
    let threw = false;
    try {
      execSync(
        "npx tsx --tsconfig tsconfig.app.json scripts/kai-219c2-admission-cohort.ts",
        { cwd: REPO_ROOT, stdio: "pipe", env },
      );
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    const afterBytes = fs2.readFileSync(tmp, "utf8");
    expect(afterBytes).toBe(beforeBytes); // zero writes
    try {
      fs2.unlinkSync(tmp);
    } catch {}
  });

  it("STATE A: all-absent manifest authors the expected facts", () => {
    const fs2 = require("node:fs");
    const os = require("node:os");
    const tmp = path.join(os.tmpdir(), `kai219c2-stateA-${Date.now()}.json`);
    fs2.writeFileSync(tmp, fs2.readFileSync(INDEX_PATH, "utf8"));
    const tmpIdx = JSON.parse(fs2.readFileSync(tmp, "utf8"));
    const man = JSON.parse(
      fs2.readFileSync(
        path.join(REPO_ROOT, "scripts/audit/kai-219c2-candidates.json"),
        "utf8",
      ),
    );
    // Remove admission from ALL manifest candidates → pure STATE A.
    const ids = new Set(man.map((e: { id: string }) => e.id));
    for (const d of tmpIdx) {
      if (ids.has(d.id)) d.admission = undefined;
    }
    fs2.writeFileSync(tmp, JSON.stringify(tmpIdx, null, 2) + "\n");
    const env = {
      ...process.env,
      KAI219C2_INDEX_PATH: tmp,
      TMPDIR: process.env.HOME + "/.tmp-vitest",
    };
    const { execSync } = require("node:child_process");
    execSync(
      "npx tsx --tsconfig tsconfig.app.json scripts/kai-219c2-admission-cohort.ts",
      { cwd: REPO_ROOT, stdio: "pipe", env },
    );
    const afterIdx = JSON.parse(fs2.readFileSync(tmp, "utf8"));
    for (const e of man) {
      const d = afterIdx.find((x: { id: string }) => x.id === e.id);
      expect(d.admission).toBeTruthy();
      expect(d.admission.state).toBe("verified_paid");
    }
    // rerun on the now-all-present temp index = STATE B zero diff
    const b1 = fs2.readFileSync(tmp, "utf8");
    execSync(
      "npx tsx --tsconfig tsconfig.app.json scripts/kai-219c2-admission-cohort.ts",
      { cwd: REPO_ROOT, stdio: "pipe", env },
    );
    expect(fs2.readFileSync(tmp, "utf8")).toBe(b1);
    try {
      fs2.unlinkSync(tmp);
    } catch {}
  });

  it("STATE B no-op: real CLI rerun on committed index is byte-identical (zero diff)", () => {
    const before = fs.readFileSync(INDEX_PATH, "utf8");
    const { execSync } = require("node:child_process");
    execSync(
      "npx tsx --tsconfig tsconfig.app.json scripts/kai-219c2-admission-cohort.ts",
      {
        cwd: REPO_ROOT,
        stdio: "pipe",
        env: { ...process.env, TMPDIR: process.env.HOME + "/.tmp-vitest" },
      },
    );
    const after = fs.readFileSync(INDEX_PATH, "utf8");
    expect(after).toBe(before);
  });

  it("catalogue admission is absent or a valid non-null fact", () => {
    for (const destination of destinations) {
      if (destination.admission === undefined) continue;
      expect(destination.admission).not.toBeNull();
      expect(validateAdmissionFact(destination.admission).valid).toBe(true);
    }
  });

  it("manifest matches the committed candidates file (all entries valid)", () => {
    const man = JSON.parse(
      fs.readFileSync(
        path.join(REPO_ROOT, "scripts/audit/kai-219c2-candidates.json"),
        "utf8",
      ),
    );
    expect(man.length).toBeGreaterThan(0);
    const ids = new Set(destinations.map((d) => d.id));
    for (const e of man) {
      expect(ids.has(e.id)).toBe(true);
      expect(e.jpy).toBeGreaterThan(0);
      expect(e.sourceUrls.length).toBeGreaterThan(0);
      expect(e.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
