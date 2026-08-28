import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  buildFact,
  factsEqual,
  type ManifestEntry,
} from "../../kai-219d2-admission-cohort";
import { hasVerifiedFreeEvidence } from "../../../src/shared/services/budget/freeEvidence";
import type { Destination } from "../../../src/shared/types/destination";

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
    id: "fushimi-inari-taisha",
    classification: "verified_free",
    sourceUrls: ["https://inari.jp/en/"],
    checkedAt: "2026-08-28",
    basis: "Official site: free worship, no admission system.",
    freeEvidence: "拝観無料 (free worship; no admission system)",
    ...overrides,
  } as ManifestEntry;
}

describe("KAI-219D2 strict classification (free evidence rules)", () => {
  it("verified_free requires freeEvidence", () => {
    expect(() =>
      buildFact(
        entry({ freeEvidence: undefined }),
        byId.get("fushimi-inari-taisha")!,
      ),
    ).toThrow(/requires freeEvidence/);
  });

  it("verified_free requires a source URL", () => {
    expect(() =>
      buildFact(entry({ sourceUrls: [] }), byId.get("fushimi-inari-taisha")!),
    ).toThrow(/no source URL/);
  });

  it("verified_free freeEvidence must satisfy the SHARED hasVerifiedFreeEvidence rule", () => {
    // The shared rule is the single source of truth — a basis that the
    // shared rule rejects must fail closed even if it looks like free.
    expect(
      hasVerifiedFreeEvidence("Admission fee ¥1,000 applies", undefined),
    ).toBe(false);
    expect(
      hasVerifiedFreeEvidence("Tickets required for entry", undefined),
    ).toBe(false);
    expect(hasVerifiedFreeEvidence("入場無料", undefined)).toBe(true);
    expect(
      hasVerifiedFreeEvidence("There is no admission fee", undefined),
    ).toBe(true);
  });

  it("verified_free builds a legitimate [0,0] bounded fact", () => {
    const fact = buildFact(entry({}), byId.get("fushimi-inari-taisha")!);
    expect(fact.state).toBe("verified_free");
    expect(fact.provenance).toBe("verified_source");
    expect(fact.cost).toEqual({ kind: "bounded", min: 0, max: 0 });
    expect(fact.scope).toBe("general_entry");
    expect(fact.reviewIntervalMonths).toBe(12);
  });

  it("not_applicable free-area requires optionalPaidNote", () => {
    expect(() =>
      buildFact(
        entry({
          classification: "not_applicable_free_area",
          freeEvidence: undefined,
          optionalPaidNote: undefined,
        }),
        byId.get("ueno-park")!,
      ),
    ).toThrow(/requires optionalPaidNote/);
  });

  it("not_applicable free-area builds the free_area_with_optional_paid_components fact", () => {
    const fact = buildFact(
      entry({
        classification: "not_applicable_free_area",
        freeEvidence: undefined,
        optionalPaidNote: "zoo and museums (optional paid)",
      }),
      byId.get("ueno-park")!,
    );
    expect(fact.state).toBe("not_applicable");
    expect(fact.reasonCode).toBe("free_area_with_optional_paid_components");
    expect(fact.cost.kind).toBe("not_applicable");
    expect(fact.scope).toBe("open_area");
  });

  it("strict shared checkedAt validation (invalid dates fail closed)", () => {
    expect(() =>
      buildFact(
        entry({ checkedAt: "2026-02-30" }),
        byId.get("fushimi-inari-taisha")!,
      ),
    ).toThrow(/strict YYYY-MM-DD/);
    expect(() =>
      buildFact(
        entry({ checkedAt: "2026/08/28" }),
        byId.get("fushimi-inari-taisha")!,
      ),
    ).toThrow(/strict YYYY-MM-DD/);
  });

  it("no overwrite: a record with an existing different fact fails closed", () => {
    const d = byId.get("fushimi-inari-taisha")!;
    const fact = buildFact(entry({}), d);
    d.admission = {
      state: "verified_free",
      provenance: "verified_source",
      cost: { kind: "bounded", min: 0, max: 0 },
      scope: "general_entry",
      basis: "different basis",
      sourceUrls: ["https://example.com"],
      checkedAt: "2026-08-28",
    };
    expect(factsEqual(d.admission, fact)).toBe(false);
  });

  it("STATE B no-op: real CLI rerun on committed index is byte-identical (zero diff)", () => {
    const before = fs.readFileSync(INDEX_PATH, "utf8");
    const { execSync } = require("node:child_process");
    execSync(
      "npx tsx --tsconfig tsconfig.app.json scripts/kai-219d2-admission-cohort.ts",
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
    const tmp = path.join(os.tmpdir(), `kai219d2-mixed-${Date.now()}.json`);
    fs2.writeFileSync(tmp, fs2.readFileSync(INDEX_PATH, "utf8"));
    const tmpIdx = JSON.parse(fs2.readFileSync(tmp, "utf8"));
    const man = JSON.parse(
      fs2.readFileSync(
        path.join(REPO_ROOT, "scripts/audit/kai-219d2-candidates.json"),
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
      KAI219D2_INDEX_PATH: tmp,
      TMPDIR: process.env.HOME + "/.tmp-vitest",
    };
    const { execSync } = require("node:child_process");
    let threw = false;
    try {
      execSync(
        "npx tsx --tsconfig tsconfig.app.json scripts/kai-219d2-admission-cohort.ts",
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
    const tmp = path.join(os.tmpdir(), `kai219d2-diff-${Date.now()}.json`);
    fs2.writeFileSync(tmp, fs2.readFileSync(INDEX_PATH, "utf8"));
    const tmpIdx = JSON.parse(fs2.readFileSync(tmp, "utf8"));
    const man = JSON.parse(
      fs2.readFileSync(
        path.join(REPO_ROOT, "scripts/audit/kai-219d2-candidates.json"),
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
      KAI219D2_INDEX_PATH: tmp,
      TMPDIR: process.env.HOME + "/.tmp-vitest",
    };
    const { execSync } = require("node:child_process");
    let threw = false;
    try {
      execSync(
        "npx tsx --tsconfig tsconfig.app.json scripts/kai-219d2-admission-cohort.ts",
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
    const tmp = path.join(os.tmpdir(), `kai219d2-stateA-${Date.now()}.json`);
    fs2.writeFileSync(tmp, fs2.readFileSync(INDEX_PATH, "utf8"));
    const tmpIdx = JSON.parse(fs2.readFileSync(tmp, "utf8"));
    const man = JSON.parse(
      fs2.readFileSync(
        path.join(REPO_ROOT, "scripts/audit/kai-219d2-candidates.json"),
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
      KAI219D2_INDEX_PATH: tmp,
      TMPDIR: process.env.HOME + "/.tmp-vitest",
    };
    const { execSync } = require("node:child_process");
    execSync(
      "npx tsx --tsconfig tsconfig.app.json scripts/kai-219d2-admission-cohort.ts",
      { cwd: REPO_ROOT, stdio: "pipe", env },
    );
    const afterIdx = JSON.parse(fs2.readFileSync(tmp, "utf8"));
    for (const e of man) {
      const d = afterIdx.find((x: { id: string }) => x.id === e.id);
      expect(d.admission).toBeTruthy();
      expect(d.admission.state).toBe("not_applicable");
    }
    const b1 = fs2.readFileSync(tmp, "utf8");
    execSync(
      "npx tsx --tsconfig tsconfig.app.json scripts/kai-219d2-admission-cohort.ts",
      { cwd: REPO_ROOT, stdio: "pipe", env },
    );
    expect(fs2.readFileSync(tmp, "utf8")).toBe(b1);
    try {
      fs2.unlinkSync(tmp);
    } catch {}
  });

  it("manifest matches the committed candidates file (all entries valid)", () => {
    const man = JSON.parse(
      fs.readFileSync(
        path.join(REPO_ROOT, "scripts/audit/kai-219d2-candidates.json"),
        "utf8",
      ),
    );
    expect(man.length).toBeGreaterThan(0);
    const ids = new Set(destinations.map((d) => d.id));
    for (const e of man) {
      expect(ids.has(e.id)).toBe(true);
      expect(
        ["verified_free", "not_applicable_free_area"].includes(
          e.classification,
        ),
      ).toBe(true);
      expect(e.sourceUrls.length).toBeGreaterThan(0);
      expect(e.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (e.classification === "verified_free") {
        expect(e.freeEvidence).toBeTruthy();
      } else {
        expect(e.optionalPaidNote).toBeTruthy();
      }
    }
  });
});
