/**
 * Mutation tests for the KAI-89 validate-models gates (review fix #1):
 * every gate must FAIL when its invariant is corrupted. The gates only
 * enforce what the generator must not produce, so each mutation injects a
 * corruption the models are contractually forbidden to emit.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { validateCatalogue, type GateResult } from "../validate-models";

const ROOT = path.resolve(__dirname, "..", "..", "..");
const INDEX_PATH = path.join(ROOT, "src/shared/data/destinations-index.json");

function loadIndex(): Array<Record<string, any>> {
  const index = JSON.parse(fs.readFileSync(INDEX_PATH, "utf8")) as Array<
    Record<string, any>
  >;
  // KAI-220 removed these fields from production data. Keep one isolated
  // legacy-shaped fixture in mutation tests so the validator's historical
  // fail-closed gates remain exercised without reintroducing catalogue debt.
  const fixture = index.find((item) => item.role === "hub")!;
  fixture.budgetMin = 1000;
  fixture.budgetRecommended = 2000;
  fixture.budgetMax = 3000;
  fixture.budgetBreakdown = {
    transport: 0,
    tickets: 0,
    food: 1000,
    cafe: 1000,
  };
  fixture.budgetMetadata = {
    method: "model",
    modelVersion: "budget-model-v1",
    confidence: "low",
    basis: "hub convention",
  };
  fixture.editorial = fixture.editorial ?? { sources: [], fieldSources: {} };
  fixture.editorial.fieldSources = fixture.editorial.fieldSources ?? {};
  fixture.editorial.fieldSources.budgetRecommended = [
    {
      type: "calculated",
      url: "catalogue-model://kai-89",
      title: "budget-model-v1; hub convention",
      accessedAt: "2026-08-14",
    },
  ];
  return index;
}

function withMutations(
  mutate: (index: Array<Record<string, any>>) => void,
): string {
  const index = loadIndex();
  mutate(index);
  const tmp = path.join(
    os.tmpdir(),
    `kai89-mutated-index-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
  );
  fs.writeFileSync(tmp, JSON.stringify(index));
  return tmp;
}

// gateOf: 6+ call sites need lockstep gate-name lookup, so the tiny helper
// is a deliberate contract, not a rename.
const gateOf = (results: GateResult[], gate: string) =>
  results.find((r) => r.gate === gate);

describe("KAI-89 validate-models mutation guards", () => {
  it("baseline: all gates pass on the committed catalogue", () => {
    const results = validateCatalogue(INDEX_PATH);
    const failed = results.filter((r) => !r.pass);
    expect(failed).toEqual([]);
  });

  it("NaN/Infinity gate catches a non-finite budget", () => {
    const p = withMutations((idx) => {
      const d = idx.find((x) => x.budgetMin !== undefined)!;
      d.budgetMin = NaN;
    });
    const results = validateCatalogue(p);
    expect(gateOf(results, "NaN/Infinity")?.pass).toBe(false);
    fs.rmSync(p, { force: true });
  });

  it("min>max gate catches an inverted budget range", () => {
    const p = withMutations((idx) => {
      const d = idx.find(
        (x) => x.budgetMin !== undefined && x.budgetMax !== undefined,
      )!;
      d.budgetMin = d.budgetMax + 1000;
    });
    const results = validateCatalogue(p);
    expect(gateOf(results, "min>max")?.pass).toBe(false);
    fs.rmSync(p, { force: true });
  });

  it("tickets-never-modelled catches a fabricated ticket on a model-touched budget", () => {
    const touched = loadIndex()
      .filter((d) => d.budgetMetadata?.method === "model")
      .map((d) => d.id);
    const p = withMutations((idx) => {
      // A hub-convention record (tickets must be 0 without evidence);
      // fabricate a non-zero ticket on it.
      const d = idx.find(
        (x) =>
          touched.includes(x.id) &&
          ["city", "ward", "town", "village"].includes(x.kind) &&
          x.budgetBreakdown !== undefined,
      )!;
      expect(d, "fixture: a touched hub with a breakdown").toBeTruthy();
      d.budgetBreakdown = { ...d.budgetBreakdown, tickets: 4800 };
    });
    const results = validateCatalogue(p);
    expect(gateOf(results, "tickets-never-modelled")?.pass).toBe(false);
    fs.rmSync(p, { force: true });
  });

  it("midpoint-invariant catches an off-midpoint recommended budget", () => {
    const touched = loadIndex()
      .filter((d) => d.budgetMetadata?.method === "model")
      .map((d) => d.id);
    const p = withMutations((idx) => {
      const d = idx.find(
        (x) =>
          touched.includes(x.id) &&
          x.budgetMin !== undefined &&
          x.budgetMax !== undefined &&
          x.budgetRecommended !== undefined,
      )!;
      expect(d, "fixture: a touched budget with a full range").toBeTruthy();
      d.budgetRecommended = d.budgetMax + 500;
    });
    const results = validateCatalogue(p);
    expect(gateOf(results, "midpoint-invariant")?.pass).toBe(false);
    fs.rmSync(p, { force: true });
  });

  it("out-of-range catches a fractional comfort value on a model-touched comfort record", () => {
    const touched = loadIndex()
      .filter(
        (d) =>
          d.comfortMetadata?.method === "model" &&
          // FIX_CONTRADICTION records derive ONLY walkingIntensity; the
          // integer gate scopes to it, so pick a full-vector model record.
          !(
            typeof d.comfortMetadata.basis === "string" &&
            d.comfortMetadata.basis.includes("FIX_CONTRADICTION")
          ),
      )
      .map((d) => d.id);
    const p = withMutations((idx) => {
      const d = idx.find(
        (x) => touched.includes(x.id) && x.comfort !== undefined,
      )!;
      expect(d, "fixture: a touched comfort record").toBeTruthy();
      d.comfort = { ...d.comfort, rainFriendly: 7.5 };
    });
    const results = validateCatalogue(p);
    expect(gateOf(results, "out-of-range")?.pass).toBe(false);
    fs.rmSync(p, { force: true });
  });

  it("giant-cluster guard catches rating-vector growth beyond the gated baseline", () => {
    // The 114-record template vector is the known gated baseline; growing
    // it must fail the contamination guard.
    const templateVector = [9.5, 9.3, 9, 9.1, 9.2, 9.6, 9.5, 9.2, 9.4, 9.4];
    const keys = [
      "overall",
      "couple",
      "summer",
      "winter",
      "rain",
      "food",
      "photography",
      "relaxation",
      "value",
      "uniqueness",
    ];
    const p = withMutations((idx) => {
      // Re-vector 5 more records to the template profile.
      let mutated = 0;
      for (const d of idx) {
        if (mutated >= 5) break;
        if (
          d.ratings &&
          JSON.stringify(keys.map((k) => d.ratings[k])) !==
            JSON.stringify(templateVector)
        ) {
          d.ratings = Object.fromEntries(
            keys.map((k, i) => [k, templateVector[i]]),
          );
          mutated += 1;
        }
      }
      expect(mutated).toBe(5);
    });
    const results = validateCatalogue(p);
    expect(gateOf(results, "contamination-guard")?.pass).toBe(false);
    fs.rmSync(p, { force: true });
  });
});

describe("KAI-89 provenance-drift guards", () => {
  it("derive --check exits 1 when metadata is deleted with the vector intact", () => {
    // P0 review fix: deleting/corrupting provenance while leaving the data
    // vector unchanged must make derive --check fail. Uses --index <tmp> so
    // the REAL repository index is never touched (vitest runs test files
    // concurrently; a shared-file write would be a race).
    const indexPath = path.join(
      ROOT,
      "src/shared/data/destinations-index.json",
    );
    const tmpIndex = path.join(
      os.tmpdir(),
      `kai89-drift-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
    );
    try {
      const idx = JSON.parse(fs.readFileSync(indexPath, "utf8"));
      const d = idx.find(
        (x) => x.seasonMetadata?.method === "model" && x.season !== undefined,
      )!;
      expect(d, "fixture: a model-owned season record").toBeTruthy();
      delete d.seasonMetadata;
      fs.writeFileSync(tmpIndex, JSON.stringify(idx));
      let exit = 0;
      try {
        execFileSync(
          "npx",
          [
            "tsx",
            "scripts/derive-destination-models.ts",
            "--check",
            "--index",
            tmpIndex,
          ],
          {
            cwd: ROOT,
            stdio: "pipe",
          },
        );
      } catch (e) {
        const status =
          typeof e === "object" && e !== null && "status" in e
            ? (e.status as number)
            : 1;
        exit = status;
      }
      expect(exit).toBe(1);
    } finally {
      fs.rmSync(tmpIndex, { force: true });
    }
  });

  it("metadata-consistency gate catches unknown metadata WITH lingering numbers", () => {
    // Two-truths state: budgetMetadata.method "unknown" + budget numbers.
    const p = withMutations((idx) => {
      const d = idx.find((x) => x.budgetMin !== undefined)!;
      d.budgetMetadata = { method: "unknown" };
    });
    const results = validateCatalogue(p);
    expect(gateOf(results, "metadata-consistency")?.pass).toBe(false);
    fs.rmSync(p, { force: true });
  });

  it("metadata-consistency gate catches unknown metadata with a lingering breakdown", () => {
    // Fourth-pass hole: method "unknown" + budgetBreakdown alone (no range
    // fields) must also fail — getEffectiveBudgetBreakdown would otherwise
    // consume the supposedly-unknown breakdown.
    const p = withMutations((idx) => {
      const d = idx.find((x) => x.budgetBreakdown !== undefined)!;
      expect(d).toBeTruthy();
      delete d.budgetMin;
      delete d.budgetRecommended;
      delete d.budgetMax;
      d.budgetMetadata = { method: "unknown" };
    });
    const results = validateCatalogue(p);
    expect(gateOf(results, "metadata-consistency")?.pass).toBe(false);
    fs.rmSync(p, { force: true });
  });

  it("field-source-agreement gate catches a stale calculated basis", () => {
    // A fieldSource title that no longer matches the canonical metadata
    // basis (e.g. Hamarikyu 'walkingMin=unknown' vs walkingMin=60) fails.
    const p = withMutations((idx) => {
      const d = idx.find(
        (x) =>
          x.comfortMetadata?.method === "model" &&
          x.editorial?.fieldSources?.comfort?.[0]?.title,
      )!;
      expect(d, "fixture: comfort record with a field source").toBeTruthy();
      d.editorial.fieldSources.comfort[0] = {
        ...d.editorial.fieldSources.comfort[0],
        title: "comfort-model-v1; STALE basis",
      };
    });
    const results = validateCatalogue(p);
    expect(gateOf(results, "field-source-agreement")?.pass).toBe(false);
    fs.rmSync(p, { force: true });
  });
});

describe("KAI-89 bidirectional provenance (5th-pass blockers)", () => {
  const gate = (p: string, g: string): boolean | undefined =>
    gateOf(validateCatalogue(p), g)?.pass;

  it("1. model-owned walking value changed to unknown while walkingMin remains fails", () => {
    const p = withMutations((idx) => {
      const d = idx.find(
        (x) =>
          x.walkingMetadata?.method === "model" &&
          Number.isFinite(x.walkingMin),
      )!;
      expect(d, "fixture: model-owned walking record").toBeTruthy();
      d.walkingMetadata = { ...d.walkingMetadata, method: "unknown" };
    });
    expect(gate(p, "metadata-consistency")).toBe(false);
    fs.rmSync(p, { force: true });
  });

  it("2. crowd metadata method model with no crowd vector fails", () => {
    const p = withMutations((idx) => {
      const d = idx.find((x) => x.crowdMetadata?.method === "unknown")!;
      expect(d, "fixture: neutralized crowd record").toBeTruthy();
      d.crowdMetadata = { ...d.crowdMetadata, method: "model" };
      delete d.crowd; // no vector
    });
    expect(gate(p, "metadata-consistency")).toBe(false);
    fs.rmSync(p, { force: true });
  });

  it("3. calculated comfort source without comfort metadata fails", () => {
    const p = withMutations((idx) => {
      const d = idx.find(
        (x) =>
          x.comfortMetadata?.method === "model" &&
          x.editorial?.fieldSources?.comfort?.[0]?.title,
      )!;
      expect(
        d,
        "fixture: comfort record with model metadata + source",
      ).toBeTruthy();
      delete d.comfortMetadata; // source survives, metadata gone
    });
    expect(gate(p, "field-source-agreement")).toBe(false);
    fs.rmSync(p, { force: true });
  });

  it("4. calculated budget source without budget metadata fails", () => {
    const p = withMutations((idx) => {
      const d = idx.find(
        (x) =>
          x.budgetMetadata?.method === "model" &&
          x.editorial?.fieldSources?.budgetRecommended?.[0]?.title,
      )!;
      expect(
        d,
        "fixture: budget record with model metadata + source",
      ).toBeTruthy();
      delete d.budgetMetadata;
    });
    expect(gate(p, "field-source-agreement")).toBe(false);
    fs.rmSync(p, { force: true });
  });

  it("5. model metadata with its field missing fails (walking variant)", () => {
    const p = withMutations((idx) => {
      const d = idx.find(
        (x) =>
          x.walkingMetadata?.method === "model" &&
          Number.isFinite(x.walkingMin),
      )!;
      delete d.walkingMin;
    });
    expect(gate(p, "metadata-consistency")).toBe(false);
    fs.rmSync(p, { force: true });
  });

  it("6. unknown metadata with its field present fails (duration variant)", () => {
    const p = withMutations((idx) => {
      const d = idx.find((x) => x.recommendedVisitHours !== undefined)!;
      d.durationMetadata = { method: "unknown" };
    });
    expect(gate(p, "metadata-consistency")).toBe(false);
    fs.rmSync(p, { force: true });
  });

  it("7. mismatched field-source basis fails", () => {
    const p = withMutations((idx) => {
      const d = idx.find(
        (x) =>
          x.durationMetadata?.method === "model" &&
          x.editorial?.fieldSources?.recommendedVisitHours?.[0]?.title,
      )!;
      expect(d, "fixture: duration record with source").toBeTruthy();
      d.editorial.fieldSources.recommendedVisitHours[0] = {
        ...d.editorial.fieldSources.recommendedVisitHours[0],
        title: "duration-model-v1; STALE basis",
      };
    });
    expect(gate(p, "field-source-agreement")).toBe(false);
    fs.rmSync(p, { force: true });
  });

  it("8. stale calculated source after a field becomes manual fails", () => {
    const p = withMutations((idx) => {
      const d = idx.find(
        (x) =>
          x.budgetMetadata?.method === "model" &&
          x.editorial?.fieldSources?.budgetRecommended?.[0]?.title,
      )!;
      d.budgetMetadata = { ...d.budgetMetadata, method: "manual" };
    });
    expect(gate(p, "field-source-agreement")).toBe(false);
    fs.rmSync(p, { force: true });
  });
});

describe("KAI-89 finishing-pass false-greens + factual-source preservation", () => {
  const gate = (p: string, g: string): boolean | undefined =>
    gateOf(validateCatalogue(p), g)?.pass;

  it("seasonMetadata unknown + bestSeason retained fails metadata-consistency", () => {
    const p = withMutations((idx) => {
      const d = idx.find((x) => x.seasonMetadata?.method === "unknown")!;
      expect(d).toBeTruthy();
      d.bestSeason = "Spring";
    });
    expect(gate(p, "metadata-consistency")).toBe(false);
    fs.rmSync(p, { force: true });
  });

  it("model metadata with missing basis fails metadata-consistency", () => {
    const p = withMutations((idx) => {
      const d = idx.find(
        (x) => x.seasonMetadata?.method === "model" && x.season,
      )!;
      expect(d).toBeTruthy();
      delete d.seasonMetadata.basis;
    });
    expect(gate(p, "metadata-consistency")).toBe(false);
    fs.rmSync(p, { force: true });
  });

  it("walking metadata manual + calculated source fails field-source-agreement", () => {
    const p = withMutations((idx) => {
      const d = idx.find(
        (x) =>
          x.walkingMetadata?.method === "model" &&
          x.editorial?.fieldSources?.walkingMin?.[0]?.title,
      )!;
      expect(d).toBeTruthy();
      d.walkingMetadata = { ...d.walkingMetadata, method: "manual" };
    });
    expect(gate(p, "field-source-agreement")).toBe(false);
    fs.rmSync(p, { force: true });
  });

  it("stale SECOND calculated source in the array fails (not just [0])", () => {
    const p = withMutations((idx) => {
      const d = idx.find(
        (x) =>
          x.comfortMetadata?.method === "model" &&
          x.editorial?.fieldSources?.comfort?.[0]?.title,
      )!;
      expect(d).toBeTruthy();
      // Append a stale calculated entry after the canonical one.
      d.editorial.fieldSources.comfort.push({
        type: "calculated",
        url: "catalogue-model://kai-89",
        title: "comfort-model-v1; STALE basis",
        accessedAt: "2026-08-14",
      });
    });
    expect(gate(p, "field-source-agreement")).toBe(false);
    fs.rmSync(p, { force: true });
  });

  it("incomplete model budget (only budgetMin) fails metadata-consistency", () => {
    const p = withMutations((idx) => {
      const d = idx.find(
        (x) =>
          x.budgetMetadata?.method === "model" && x.budgetMin !== undefined,
      )!;
      expect(d).toBeTruthy();
      delete d.budgetRecommended;
      delete d.budgetMax;
      delete d.budgetBreakdown;
    });
    expect(gate(p, "metadata-consistency")).toBe(false);
    fs.rmSync(p, { force: true });
  });

  it("manual budget metadata + OFFICIAL field source PASSES (factual sources preserved)", () => {
    const p = withMutations((idx) => {
      const d = idx.find(
        (x) =>
          x.budgetMetadata?.method === "model" && x.budgetMin !== undefined,
      )!;
      expect(d).toBeTruthy();
      d.budgetMetadata = { ...d.budgetMetadata, method: "manual" };
      // Keep a legit OFFICIAL source (never treated as calculated).
      d.editorial = d.editorial ?? { lifecycle: "draft" as never, sources: [] };
      d.editorial.fieldSources = d.editorial.fieldSources ?? {};
      d.editorial.fieldSources.budgetRecommended = [
        {
          type: "official",
          url: "https://example.com/official",
          title: "Official admission page",
          accessedAt: "2026-08-14",
        },
      ];
    });
    expect(gate(p, "metadata-consistency")).toBe(true);
    expect(gate(p, "field-source-agreement")).toBe(true);
    fs.rmSync(p, { force: true });
  });
});

describe("KAI-89 score-state gates (rubric v2)", () => {
  const gate = (p: string, g: string): boolean | undefined =>
    gateOf(validateCatalogue(p), g)?.pass;

  it("score-presentation fails when a published record loses scoreMetadata", () => {
    const p = withMutations((idx) => {
      const d = idx.find((x) => x.status === "published" && x.scoreMetadata)!;
      expect(d, "fixture: published with scoreMetadata").toBeTruthy();
      delete d.scoreMetadata;
    });
    expect(gate(p, "score-presentation")).toBe(false);
    fs.rmSync(p, { force: true });
  });

  it("score-provenance fails when an estimated score loses rubricVersion", () => {
    const p = withMutations((idx) => {
      const d = idx.find(
        (x) =>
          x.status === "published" && x.scoreMetadata?.state === "estimated",
      )!;
      expect(d, "fixture: estimated record").toBeTruthy();
      delete d.scoreMetadata.rubricVersion;
    });
    expect(gate(p, "score-provenance")).toBe(false);
    fs.rmSync(p, { force: true });
  });

  it("score-provenance fails when an estimated score drops below the evidence threshold", () => {
    const p = withMutations((idx) => {
      const d = idx.find(
        (x) =>
          x.status === "published" && x.scoreMetadata?.state === "estimated",
      )!;
      expect(d, "fixture: estimated record").toBeTruthy();
      d.scoreMetadata = { ...d.scoreMetadata, coverage: 0.2 };
    });
    expect(gate(p, "score-provenance")).toBe(false);
    fs.rmSync(p, { force: true });
  });

  it("score-provenance fails when an estimated value diverges from the rubric", () => {
    const p = withMutations((idx) => {
      const d = idx.find(
        (x) =>
          x.status === "published" && x.scoreMetadata?.state === "estimated",
      )!;
      expect(d, "fixture: estimated record").toBeTruthy();
      d.scoreMetadata = { ...d.scoreMetadata, value: 9.9 };
    });
    expect(gate(p, "score-provenance")).toBe(false);
    fs.rmSync(p, { force: true });
  });

  it("score-provenance fails when a verified score loses its editorial source URLs", () => {
    const p = withMutations((idx) => {
      const d = idx.find(
        (x) =>
          x.status === "published" &&
          x.scoreMetadata?.state === "verified" &&
          x.scoreMetadata?.provenance?.sourceClass === "editorial-review",
      )!;
      expect(d, "fixture: verified record").toBeTruthy();
      d.scoreMetadata = {
        ...d.scoreMetadata,
        provenance: {
          ...d.scoreMetadata.provenance,
          sources: [],
        },
      };
    });
    expect(gate(p, "score-provenance")).toBe(false);
    fs.rmSync(p, { force: true });
  });

  it("score-provenance fails when a verified value diverges from the rubric", () => {
    const p = withMutations((idx) => {
      const d = idx.find(
        (x) =>
          x.status === "published" &&
          x.scoreMetadata?.state === "verified" &&
          x.scoreMetadata?.provenance?.sourceClass === "editorial-review",
      )!;
      expect(d, "fixture: verified record").toBeTruthy();
      d.scoreMetadata = { ...d.scoreMetadata, value: 10 };
    });
    expect(gate(p, "score-provenance")).toBe(false);
    fs.rmSync(p, { force: true });
  });

  it("score-provenance fails when an unavailable score gains a numeric value", () => {
    const p = withMutations((idx) => {
      const d = idx.find(
        (x) =>
          x.status === "published" && x.scoreMetadata?.state === "unavailable",
      )!;
      expect(d, "fixture: unavailable record").toBeTruthy();
      d.scoreMetadata = { ...d.scoreMetadata, value: 5.5 };
    });
    expect(gate(p, "score-provenance")).toBe(false);
    fs.rmSync(p, { force: true });
  });

  it("score-range fails on an out-of-range value", () => {
    const p = withMutations((idx) => {
      const d = idx.find(
        (x) =>
          x.status === "published" && x.scoreMetadata?.state === "estimated",
      )!;
      d.scoreMetadata = { ...d.scoreMetadata, value: 11.5 };
    });
    expect(gate(p, "score-range")).toBe(false);
    fs.rmSync(p, { force: true });
  });

  it("score-state-agreement fails when persisted state contradicts the shared rubric predicate", () => {
    const p = withMutations((idx) => {
      const d = idx.find(
        (x) =>
          x.status === "published" &&
          x.scoreMetadata?.state === "estimated" &&
          x.scoreMetadata?.provenance?.sourceClass === "model",
      )!;
      expect(d, "fixture: estimated record").toBeTruthy();
      d.scoreMetadata = { ...d.scoreMetadata, state: "verified" };
    });
    expect(gate(p, "score-state-agreement")).toBe(false);
    fs.rmSync(p, { force: true });
  });

  it("score-note-i18n fails on an unknown noteKey", () => {
    const p = withMutations((idx) => {
      const d = idx.find((x) => x.status === "published" && x.scoreMetadata)!;
      d.scoreMetadata = {
        ...d.scoreMetadata,
        noteKey: "destination.nonexistentNote",
      };
    });
    expect(gate(p, "score-note-i18n")).toBe(false);
    fs.rmSync(p, { force: true });
  });

  it("score-audit-counts fails when the catalogue diverges from the committed audit", () => {
    const p = withMutations((idx) => {
      const d = idx.find(
        (x) =>
          x.status === "published" && x.scoreMetadata?.state === "estimated",
      )!;
      // Flip the persisted state so the published counts change (the
      // agreement/provenance gates would also fail; we assert the counts
      // gate here as the contract under test).
      d.scoreMetadata = { ...d.scoreMetadata, state: "unavailable" };
    });
    expect(gate(p, "score-audit-counts")).toBe(false);
    fs.rmSync(p, { force: true });
  });
});
