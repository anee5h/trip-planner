/**
 * Finishing-pass: pre-metadata migration must require POSITIVE provenance
 * evidence (a calculated source carrying the model version + a value matching
 * the deterministic model output). Value shape alone is NEVER provenance.
 *
 * Runs the REAL generator (`derive --apply --index <tmp>`) against a
 * temporary COPY of the committed index (real peer-cell context); the real
 * repository index is never touched.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(__dirname, "..", "..", "..");
const INDEX_PATH = path.join(ROOT, "src/shared/data/destinations-index.json");

function runApply(mutate: (idx: Array<Record<string, any>>) => void) {
  const idx = JSON.parse(fs.readFileSync(INDEX_PATH, "utf8")) as Array<
    Record<string, any>
  >;
  mutate(idx);
  const tmp = path.join(
    os.tmpdir(),
    `kai89-migration-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
  );
  fs.writeFileSync(tmp, JSON.stringify(idx));
  // Redirect BOTH the index and the derive-report so tests never mutate
  // committed repository artifacts (derive --index alone still writes the
  // report to its fixed repo path).
  const tmpReport = path.join(
    os.tmpdir(),
    `kai89-migration-report-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
  );
  execFileSync(
    "npx",
    [
      "tsx",
      "scripts/derive-destination-models.ts",
      "--apply",
      "--index",
      tmp,
      "--report",
      tmpReport,
    ],
    { cwd: ROOT, stdio: "pipe" },
  );
  fs.rmSync(tmpReport, { force: true });
  const out = JSON.parse(fs.readFileSync(tmp, "utf8")) as Array<
    Record<string, any>
  >;
  fs.rmSync(tmp, { force: true });
  return out;
}

describe("pre-metadata migration requires positive provenance (finishing pass)", () => {
  it("record with model-shaped values and NO calculated source is NEVER promoted", () => {
    // akasaka-minato: complete per-person budget (model-shaped) but no
    // calculated source and no budgetMetadata. Value shape alone must not
    // create model provenance.
    const out = runApply((idx) => {
      const d = idx.find((x) => x.id === "akasaka-minato")!;
      expect(d.budgetMetadata?.method).toBeUndefined();
      expect(d.budgetBreakdown).toBeTruthy();
      expect(d.editorial?.fieldSources?.budgetRecommended).toBeUndefined();
    });
    const d = out.find((x) => x.id === "akasaka-minato")!;
    expect(d.budgetMetadata?.method).toBeUndefined();
  });

  it("genuine calculated pre-metadata record is migrated", () => {
    // hiraizumi-chusonji-iwate: model-filled (metadata model + calculated
    // source). Strip the metadata; the calculated source + matching values
    // are positive evidence → migration restores model metadata.
    const out = runApply((idx) => {
      const d = idx.find((x) => x.id === "hiraizumi-chusonji-iwate")!;
      expect(d.budgetMetadata?.method).toBe("model");
      expect(d.editorial?.fieldSources?.budgetRecommended?.[0]?.title).toMatch(
        /^budget-model-v1/,
      );
      delete d.budgetMetadata;
    });
    const d = out.find((x) => x.id === "hiraizumi-chusonji-iwate")!;
    expect(d.budgetMetadata?.method).toBe("model");
  });

  it("stale calculated source is removed WITHOUT deleting factual sources", () => {
    const out = runApply((idx) => {
      const d = idx.find((x) => x.id === "hiraizumi-chusonji-iwate")!;
      delete d.budgetMetadata;
      d.budgetRecommended = 9999; // no longer matches model output
      // Keep the calculated source + add a legitimate OFFICIAL one.
      d.editorial.fieldSources.budgetRecommended.push({
        type: "official",
        url: "https://example.com/official",
        title: "Official admission page",
        accessedAt: "2026-08-14",
      });
    });
    const d = out.find((x) => x.id === "hiraizumi-chusonji-iwate")!;
    const types = (d.editorial?.fieldSources?.budgetRecommended ?? []).map(
      (s: any) => s.type,
    );
    expect(types).not.toContain("calculated");
    expect(types).toContain("official");
  });
});
