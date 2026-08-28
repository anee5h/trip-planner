import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  buildFact,
  factsEqual,
  type ManifestEntry,
} from "../../kai-219d1-admission-cohort";
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
    id: "ueno-park",
    classification: "verified_free",
    sourceUrls: ["https://example.com"],
    checkedAt: "2026-08-27",
    basis: "Official page: free admission.",
    freeEvidence: "入場無料 (free admission)",
    ...overrides,
  } as ManifestEntry;
}

describe("KAI-219D1 strict classification (free evidence rules)", () => {
  it("verified_free requires freeEvidence", () => {
    expect(() =>
      buildFact(entry({ freeEvidence: undefined }), byId.get("ueno-park")!),
    ).toThrow(/requires freeEvidence/);
  });

  it("verified_free requires a source URL", () => {
    expect(() =>
      buildFact(entry({ sourceUrls: [] }), byId.get("ueno-park")!),
    ).toThrow(/no source URL/);
  });

  it("not_applicable free-area requires optionalPaidNote", () => {
    expect(() =>
      buildFact(
        entry({
          classification: "not_applicable_free_area",
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
        optionalPaidNote: "individual rides paid",
        freeEvidence: undefined,
      }),
      byId.get("ueno-park")!,
    );
    expect(fact.state).toBe("not_applicable");
    expect(fact.reasonCode).toBe("free_area_with_optional_paid_components");
    expect(fact.cost.kind).toBe("not_applicable");
  });

  it("verified_free builds a legitimate [0,0] bounded fact", () => {
    const fact = buildFact(entry({}), byId.get("ueno-park")!);
    expect(fact.state).toBe("verified_free");
    expect(fact.cost).toEqual({ kind: "bounded", min: 0, max: 0 });
    expect(fact.provenance).toBe("verified_source");
  });

  it("unavailable builds the honest non-numeric fact", () => {
    const fact = buildFact(
      entry({
        classification: "unavailable",
        freeEvidence: undefined,
        sourceUrls: [],
      }),
      byId.get("ueno-park")!,
    );
    expect(fact.state).toBe("unavailable");
    expect(fact.cost.kind).toBe("unavailable");
  });

  it("R1: non-free evidence FAILS CLOSED via the shared hasVerifiedFreeEvidence rule", () => {
    // "admission fee ¥1,000" → throws (not free)
    expect(() =>
      buildFact(
        entry({ freeEvidence: "admission fee ¥1,000" }),
        byId.get("ueno-park")!,
      ),
    ).toThrow(/hasVerifiedFreeEvidence/);
    // "not free" → throws
    expect(() =>
      buildFact(entry({ freeEvidence: "not free" }), byId.get("ueno-park")!),
    ).toThrow(/hasVerifiedFreeEvidence/);
    // "tickets required" → throws
    expect(() =>
      buildFact(
        entry({ freeEvidence: "tickets required" }),
        byId.get("ueno-park")!,
      ),
    ).toThrow(/hasVerifiedFreeEvidence/);
  });

  it("R1: free evidence ACCEPTED by the shared rule", () => {
    expect(() =>
      buildFact(entry({ freeEvidence: "入場無料" }), byId.get("ueno-park")!),
    ).not.toThrow();
    expect(() =>
      buildFact(
        entry({ freeEvidence: "no admission fee" }),
        byId.get("ueno-park")!,
      ),
    ).not.toThrow();
  });

  it("R1: the shared rule itself is the single implementation", () => {
    expect(hasVerifiedFreeEvidence("admission fee ¥1,000")).toBe(false);
    expect(hasVerifiedFreeEvidence("not free")).toBe(false);
    expect(hasVerifiedFreeEvidence("tickets required")).toBe(false);
    expect(hasVerifiedFreeEvidence("入場無料")).toBe(true);
    expect(hasVerifiedFreeEvidence("no admission fee")).toBe(true);
  });

  it("R7: strict checkedAt — impossible/ambiguous dates are REJECTED", () => {
    expect(() =>
      buildFact(entry({ checkedAt: "2026-02-30" }), byId.get("ueno-park")!),
    ).toThrow(/strict YYYY-MM-DD/);
    expect(() =>
      buildFact(entry({ checkedAt: "2026/08/28" }), byId.get("ueno-park")!),
    ).toThrow(/strict YYYY-MM-DD/);
  });

  it("R7: valid YYYY-MM-DD checkedAt is ACCEPTED", () => {
    expect(() =>
      buildFact(entry({ checkedAt: "2026-08-28" }), byId.get("ueno-park")!),
    ).not.toThrow();
  });

  it("STATE B no-op: committed manifest facts match on the real index", () => {
    const manPath = path.join(
      REPO_ROOT,
      "scripts/audit/kai-219d1-candidates.json",
    );
    if (!fs.existsSync(manPath)) return; // manifest not authored yet
    const man = JSON.parse(fs.readFileSync(manPath, "utf8")) as ManifestEntry[];
    const mismatches = man
      .map((e) => {
        const d = byId.get(e.id)!;
        return d.admission && factsEqual(d.admission, buildFact(e, d))
          ? null
          : e.id;
      })
      .filter(Boolean);
    expect(mismatches).toEqual([]);
  });

  it("S2: STATE A/B MIXED → migration FAILS CLOSED with zero writes", () => {
    // Build a temp index: record A absent (STATE A side), record B with
    // the expected fact (STATE B side). The real migration must THROW
    // (fail-closed) and leave the temp file byte-identical.
    const manPath = path.join(
      REPO_ROOT,
      "scripts/audit/kai-219d1-candidates.json",
    );
    if (!fs.existsSync(manPath)) return;
    const man = JSON.parse(fs.readFileSync(manPath, "utf8")) as ManifestEntry[];
    const real = JSON.parse(
      fs.readFileSync(INDEX_PATH, "utf8"),
    ) as Destination[];
    const realById = new Map(real.map((d) => [d.id, d]));
    // A: absent; B: expected fact present.
    const a = realById.get(man[0].id)!;
    const b = realById.get(man[1].id)!;
    delete a.admission;
    b.admission = buildFact(man[1], b);
    const tmpIndex = path.join(REPO_ROOT, "tmp-d1-mixed-index.json");
    fs.writeFileSync(tmpIndex, JSON.stringify(real, null, 2) + "\n");
    const beforeBytes = fs.readFileSync(tmpIndex, "utf8");
    const { execSync } = require("node:child_process");
    let threw = false;
    try {
      execSync(
        "npx tsx --tsconfig tsconfig.app.json scripts/kai-219d1-admission-cohort.ts",
        {
          cwd: REPO_ROOT,
          stdio: "pipe",
          env: {
            ...process.env,
            TMPDIR: process.env.HOME + "/.tmp-vitest",
            KAI219D1_INDEX_PATH: tmpIndex,
          },
        },
      );
    } catch {
      threw = true;
    }
    expect(threw).toBe(true); // fail-closed on mixed A/B
    const afterBytes = fs.readFileSync(tmpIndex, "utf8");
    expect(afterBytes).toBe(beforeBytes); // zero writes
    fs.rmSync(tmpIndex, { force: true });
  });

  it("S2: existing DIFFERENT fact → migration FAILS CLOSED (no overwrite)", () => {
    // A manifest candidate with an unexpected admission fact must fail
    // closed — the authoring script NEVER overwrites.
    const manPath = path.join(
      REPO_ROOT,
      "scripts/audit/kai-219d1-candidates.json",
    );
    if (!fs.existsSync(manPath)) return;
    const man = JSON.parse(fs.readFileSync(manPath, "utf8")) as ManifestEntry[];
    const real = JSON.parse(
      fs.readFileSync(INDEX_PATH, "utf8"),
    ) as Destination[];
    const realById = new Map(real.map((d) => [d.id, d]));
    const d = realById.get(man[0].id)!;
    d.admission = {
      state: "verified_paid",
      provenance: "verified_source",
      cost: { kind: "bounded", min: 999, max: 999 },
      scope: "general_entry",
      basis: "unexpected different fact",
      sourceUrls: ["https://example.com"],
      checkedAt: "2026-08-27",
    };
    const tmpIndex = path.join(REPO_ROOT, "tmp-d1-diff-index.json");
    fs.writeFileSync(tmpIndex, JSON.stringify(real, null, 2) + "\n");
    const beforeBytes = fs.readFileSync(tmpIndex, "utf8");
    const { execSync } = require("node:child_process");
    let threw = false;
    try {
      execSync(
        "npx tsx --tsconfig tsconfig.app.json scripts/kai-219d1-admission-cohort.ts",
        {
          cwd: REPO_ROOT,
          stdio: "pipe",
          env: {
            ...process.env,
            TMPDIR: process.env.HOME + "/.tmp-vitest",
            KAI219D1_INDEX_PATH: tmpIndex,
          },
        },
      );
    } catch {
      threw = true;
    }
    expect(threw).toBe(true); // fail-closed on unexpected different fact
    const afterBytes = fs.readFileSync(tmpIndex, "utf8");
    expect(afterBytes).toBe(beforeBytes); // zero writes
    fs.rmSync(tmpIndex, { force: true });
  });

  it("S2: REAL CLI rerun on the committed index → byte-identical zero diff", () => {
    const before = fs.readFileSync(INDEX_PATH, "utf8");
    const { execSync } = require("node:child_process");
    execSync(
      "npx tsx --tsconfig tsconfig.app.json scripts/kai-219d1-admission-cohort.ts",
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
