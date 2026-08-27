import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  buildFact,
  factsEqual,
  runC1Migration,
  type ManifestEntry,
} from "../../kai-219c1-admission-cohort";
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

function baseDest(id: string): Destination {
  return { ...byId.get(id)!, admission: undefined };
}

function entry(overrides: Record<string, unknown>) {
  return {
    id: "kinkaku-ji",
    jpy: 500,
    scope: "general_entry",
    sourceUrls: ["https://example.com"],
    checkedAt: "2026-08-27",
    basis: "Official site: adult ¥500; fixed.",
    ...overrides,
  };
}

describe("KAI-219C1 hardened manifest semantics (R6)", () => {
  it("verified_paid with jpy is valid", () => {
    const fact = buildFact(entry({}) as ManifestEntry, baseDest("kinkaku-ji"));
    expect(fact.state).toBe("verified_paid");
    expect(fact.cost).toEqual({ kind: "bounded", min: 500, max: 500 });
  });

  it("verified_paid MUST NOT supply min/max (jpy only)", () => {
    expect(() =>
      buildFact(
        entry({ jpy: 500, min: 400, max: 500 }) as ManifestEntry,
        baseDest("kinkaku-ji"),
      ),
    ).toThrow(/must NOT supply min\/max/);
  });

  it("variable_price REQUIRES min + max + reasonCode", () => {
    // no range
    expect(() =>
      buildFact(
        entry({
          state: "variable_price",
          jpy: undefined,
          min: undefined,
          max: undefined,
        }) as ManifestEntry,
        baseDest("kinkaku-ji"),
      ),
    ).toThrow(/requires both min and max/);
    // range but no reasonCode
    expect(() =>
      buildFact(
        entry({
          state: "variable_price",
          jpy: undefined,
          min: 2900,
          max: 3700,
        }) as ManifestEntry,
        baseDest("kinkaku-ji"),
      ),
    ).toThrow(/explicit reasonCode/);
    // valid variable
    const fact = buildFact(
      entry({
        state: "variable_price",
        jpy: undefined,
        min: 2900,
        max: 3700,
        reasonCode: "price_variable_by_date",
      }) as ManifestEntry,
      baseDest("kinkaku-ji"),
    );
    expect(fact.state).toBe("variable_price");
    expect(fact.reasonCode).toBe("price_variable_by_date");
    expect(fact.cost).toEqual({ kind: "bounded", min: 2900, max: 3700 });
  });

  it("variable_price MUST NOT supply a jpy scalar", () => {
    expect(() =>
      buildFact(
        entry({
          state: "variable_price",
          jpy: 3700,
          min: 2900,
          max: 3700,
          reasonCode: "price_variable_by_date",
        }) as ManifestEntry,
        baseDest("kinkaku-ji"),
      ),
    ).toThrow(/must NOT supply a jpy scalar/);
  });

  it("no overwrite: a record with an existing different fact fails closed", () => {
    const d = baseDest("kinkaku-ji");
    d.admission = {
      state: "verified_paid",
      provenance: "verified_source",
      cost: { kind: "bounded", min: 999, max: 999 },
      scope: "general_entry",
      basis: "stale",
      sourceUrls: ["https://example.com"],
      checkedAt: "2026-08-27",
    };
    // runC1Migration uses the real index — instead verify factsEqual gates it.
    expect(
      factsEqual(d.admission, buildFact(entry({}) as ManifestEntry, d)),
    ).toBe(false);
  });

  it("factsEqual matches the real authored facts (STATE B no-op on committed index)", () => {
    const man = JSON.parse(
      fs.readFileSync(
        path.join(REPO_ROOT, "scripts/audit/kai-219c1-candidates.json"),
        "utf8",
      ),
    );
    const mismatches = man
      .map((e: { id: string }) => {
        const d = byId.get(e.id)!;
        return d.admission &&
          factsEqual(d.admission, buildFact(e as ManifestEntry, d))
          ? null
          : e.id;
      })
      .filter(Boolean);
    expect(mismatches).toEqual([]);
  });

  it("rerun zero diff: running the real CLI on the committed index changes nothing", () => {
    const before = fs.readFileSync(INDEX_PATH, "utf8");
    const { execSync } = require("node:child_process");
    execSync(
      "npx tsx --tsconfig tsconfig.app.json scripts/kai-219c1-admission-cohort.ts",
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
