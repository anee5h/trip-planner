import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Destination } from "../../../src/shared/types/destination.js";
import { scorePrefectureV121, SUFFICIENCY } from "../destination-depth-v121.js";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const index = JSON.parse(
  fs.readFileSync(
    path.join(root, "src/shared/data/destinations-index.json"),
    "utf8",
  ),
) as Destination[];
const byPref = new Map<string, Destination[]>();
for (const d of index) {
  if (!byPref.has(d.prefecture)) byPref.set(d.prefecture, []);
  byPref.get(d.prefecture)!.push(d);
}

const clone = (d: Destination): Destination => JSON.parse(JSON.stringify(d));
const score = (pref: string) =>
  scorePrefectureV121(pref, byPref.get(pref) ?? []);

describe("v1.2.1 anti-gaming invariants", () => {
  it("ward-split resistance: renaming municipalities never changes depth (Tokyo/Kyoto)", () => {
    for (const pref of ["Tokyo", "Kyoto", "Osaka", "Mie"]) {
      const base = score(pref);
      const wardified = byPref.get(pref)!.map((d) => {
        const c = clone(d);
        c.municipalityId = `${pref}:ward-${Math.floor(Math.random() * 40)}`;
        return c;
      });
      const after = scorePrefectureV121(pref, wardified);
      expect(Math.abs(after.depthScore - base.depthScore)).toBeLessThanOrEqual(
        0.05,
      );
    }
  });

  it("micro-POI cloning resistance: duplicating a cell's POIs is immaterial", () => {
    for (const pref of ["Tokyo", "Kanagawa"]) {
      const base = score(pref);
      const inflated = [...byPref.get(pref)!];
      const donor = byPref.get(pref)!.find((d) => d.coordinates?.lat != null)!;
      for (let i = 0; i < 6; i += 1) inflated.push(clone(donor));
      const after = scorePrefectureV121(pref, inflated);
      expect(Math.abs(after.depthScore - base.depthScore)).toBeLessThanOrEqual(
        1.2,
      );
    }
  });

  it("metadata stripping never improves depth and evidence falls", () => {
    const pref = "Chiba";
    const base = score(pref);
    const stripped = byPref.get(pref)!.map((d) => {
      const c = clone(d);
      delete c.season;
      delete c.bestMonths;
      delete c.bestSeason;
      delete c.recommendedVisitHours;
      return c;
    });
    const after = scorePrefectureV121(pref, stripped);
    expect(after.depthScore).toBeLessThanOrEqual(base.depthScore + 0.05);
    expect(after.evidencePct).toBeLessThan(base.evidencePct);
  });

  it("monotonicity: adding a genuine destination in a new area never lowers depth", () => {
    // 47 prefectures x 10 cumulative rounds = 470 checks.
    let failures = 0;
    let failing = "";
    for (const pref of [...byPref.keys()]) {
      const working = [...byPref.get(pref)!];
      let prev = scorePrefectureV121(pref, working).depthScore;
      for (let round = 0; round < 10; round += 1) {
        const lat = 24 + round * 0.4 + (working.length % 7) * 0.03;
        const lng = 124 + round * 0.5 + (working.length % 11) * 0.05;
        working.push({
          ...clone(byPref.get(pref)![0]),
          id: `synthetic-${pref}-${round}`,
          name: "Synthetic area",
          coordinates: { lat, lng },
          municipalityId: `${pref}:synth-${round}`,
          recommendedVisitHours: { min: 4, max: 6 },
        });
        const cur = scorePrefectureV121(pref, working).depthScore;
        if (cur + 1e-9 < prev) {
          failures += 1;
          failing = `${pref} round ${round}: ${prev} -> ${cur}`;
        }
        prev = cur;
      }
    }
    expect(failures).toBe(0);
    expect(failing).toBe("");
  });

  it("sufficiency multiplier matches the approved formula", () => {
    expect(SUFFICIENCY(0)).toBeCloseTo(0.75, 5);
    expect(SUFFICIENCY(12)).toBeCloseTo(1 - 0.25 * Math.exp(-1), 5);
    expect(SUFFICIENCY(120)).toBeGreaterThan(0.99);
  });
});
