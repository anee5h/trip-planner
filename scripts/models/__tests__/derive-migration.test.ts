/** KAI-220 finishing-pass regression tests for model derivation. */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(__dirname, "..", "..", "..");
const INDEX_PATH = path.join(ROOT, "src/shared/data/destinations-index.json");

type FixtureRecord = Record<string, unknown> & {
  id: string;
  comfort?: Record<string, unknown>;
};

function runApply(mutate: (idx: FixtureRecord[]) => void) {
  const idx = JSON.parse(
    fs.readFileSync(INDEX_PATH, "utf8"),
  ) as FixtureRecord[];
  mutate(idx);
  const tmp = path.join(
    os.tmpdir(),
    `kai220-derive-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
  );
  const tmpReport = path.join(
    os.tmpdir(),
    `kai220-derive-report-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
  );
  fs.writeFileSync(tmp, JSON.stringify(idx));
  try {
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
    return JSON.parse(fs.readFileSync(tmp, "utf8")) as FixtureRecord[];
  } finally {
    fs.rmSync(tmpReport, { force: true });
    fs.rmSync(tmp, { force: true });
  }
}

describe("KAI-220 derive migration contract", () => {
  it("does not refill explicit unknown season or walking metadata", () => {
    const out = runApply((idx) => {
      const d = idx.find((x) => x.id === "junglia-okinawa")!;
      expect((d.seasonMetadata as { method?: string })?.method).toBe("unknown");
      expect((d.walkingMetadata as { method?: string })?.method).toBe(
        "unknown",
      );
      delete d.season;
      delete d.bestMonths;
      delete d.bestSeason;
      delete d.walkingMin;
      delete d.comfort?.walkingIntensity;
    });
    const d = out.find((x) => x.id === "junglia-okinawa")!;
    expect(d.season).toBeUndefined();
    expect(d.bestMonths).toBeUndefined();
    expect(d.bestSeason).toBeUndefined();
    expect((d.seasonMetadata as { method?: string })?.method).toBe("unknown");
    expect(d.walkingMin).toBeUndefined();
    expect((d.walkingMetadata as { method?: string })?.method).toBe("unknown");
    expect(d.comfort?.walkingIntensity).toBeUndefined();
  });

  it("does not recreate retired destination-level budget fields", () => {
    const out = runApply((idx) => {
      const d = idx.find((x) => x.id === "akasaka-minato")!;
      d.budgetMin = 7600;
      d.budgetRecommended = 11600;
      d.budgetMax = 15600;
      d.budgetBreakdown = {
        transport: 45,
        tickets: 0,
        food: 5000,
        cafe: 2000,
      };
      d.budgetMetadata = {
        method: "legacy",
        confidence: "unknown",
      };
    });
    const d = out.find((x) => x.id === "akasaka-minato")!;
    expect(d.budgetMin).toBe(7600);
    expect(d.budgetRecommended).toBe(11600);
    expect(d.budgetMax).toBe(15600);
    expect(d.budgetBreakdown).toBeDefined();
    expect(d.budgetMetadata).toEqual({
      method: "legacy",
      confidence: "unknown",
    });
  });
});
