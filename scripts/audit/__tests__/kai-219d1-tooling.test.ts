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

  it("hasVerifiedFreeEvidence rejects non-free text (shared rule)", () => {
    expect(hasVerifiedFreeEvidence("The garden is free to enter")).toBe(true);
    expect(hasVerifiedFreeEvidence("admission fee ¥1,000")).toBe(false);
    expect(hasVerifiedFreeEvidence("入場無料")).toBe(true);
    expect(hasVerifiedFreeEvidence("大人1,000円")).toBe(false);
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
});
