import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildFact,
  determineState,
  type ManifestEntry,
} from "../../kai-219e2-admission-cohort";
import { validateAdmissionFact } from "../../../src/shared/services/budget/factValidation";
import type {
  AdmissionCostFact,
  Destination,
} from "../../../src/shared/types/destination";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const INDEX_PATH = path.join(
  REPO_ROOT,
  "src/shared/data/destinations-index.json",
);
const MANIFEST_PATH = path.join(
  REPO_ROOT,
  "scripts/audit/kai-219e2-candidates.json",
);
const SCRIPT_PATH = path.join(
  REPO_ROOT,
  "scripts/kai-219e2-admission-cohort.ts",
);
const TMPDIR = path.join(process.env.HOME ?? os.homedir(), ".tmp-vitest");

function loadIndex(): Destination[] {
  return JSON.parse(fs.readFileSync(INDEX_PATH, "utf8")) as Destination[];
}

function loadManifest(): ManifestEntry[] {
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")) as ManifestEntry[];
}

function runTool(indexPath: string, write = false): void {
  execFileSync(
    "npx",
    [
      "tsx",
      "--tsconfig",
      "tsconfig.app.json",
      SCRIPT_PATH,
      ...(write ? ["--write"] : []),
    ],
    {
      cwd: REPO_ROOT,
      stdio: "pipe",
      env: {
        ...process.env,
        KAI219E2_INDEX_PATH: indexPath,
        TMPDIR,
      },
    },
  );
}

function withTempIndex(mutator?: (index: Destination[]) => void): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kai219e2-"));
  const indexPath = path.join(directory, "destinations-index.json");
  const index = loadIndex();
  const manifest = loadManifest();
  const targetIds = new Set(manifest.map((entry) => entry.id));
  for (const destination of index) {
    if (targetIds.has(destination.id)) {
      delete destination.admission;
    }
  }
  mutator?.(index);
  fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
  return indexPath;
}

function expectedFact(
  entry: ManifestEntry,
  destination: Destination,
): AdmissionCostFact {
  return buildFact(entry, destination);
}

describe("KAI-219E2 residual admission manifest", () => {
  it("covers the complete frozen 728-entry residual set with valid evidence metadata", () => {
    const index = loadIndex();
    const manifest = loadManifest();
    expect(manifest).toHaveLength(728);
    expect(new Set(manifest.map((entry) => entry.id)).size).toBe(
      manifest.length,
    );
    expect(new Set(manifest.map((entry) => entry.id))).toEqual(
      new Set(
        index
          .map((destination) => destination.id)
          .filter((id) => manifest.some((entry) => entry.id === id)),
      ),
    );

    const byId = new Map(
      index.map((destination) => [destination.id, destination]),
    );
    for (const entry of manifest) {
      const destination = byId.get(entry.id)!;
      const fact = expectedFact(entry, destination);
      expect(validateAdmissionFact(fact)).toEqual({ valid: true });
      expect(entry.evidenceAttempted.length).toBeGreaterThan(0);
      expect(entry.basis).not.toMatch(/budgetBreakdown/i);
      expect(JSON.stringify(fact)).not.toMatch(/budgetBreakdown/i);
      if (entry.state === "unavailable") {
        expect(entry.reasonCode).toBeTruthy();
        expect(entry.reasonCode).not.toBe("legacy_provenance_unrecovered");
        expect(entry.basis).not.toMatch(
          /Full authoritative-path re-audit.*No current ordinary individual adult\/general admission fact was established/i,
        );
        expect(entry.evidenceAttempted.length).toBeGreaterThanOrEqual(2);
        expect(
          new Set(entry.evidenceAttempted.map(({ url }) => url)).size,
        ).toBe(entry.evidenceAttempted.length);
        expect(
          entry.evidenceAttempted.every(
            ({ url, note }) => Boolean(url) && note.trim().length > 0,
          ),
        ).toBe(true);
      }
    }
  });

  it("preserves variable ranges and never emits scalar cost fields", () => {
    const manifest = loadManifest();
    const variable = manifest.filter(
      (entry) => entry.state === "variable_price",
    );
    expect(variable.length).toBeGreaterThan(0);
    for (const entry of variable) {
      const cost = entry.cost;
      expect((cost as { jpy?: number }).jpy).toBeUndefined();
      if (cost.kind === "bounded") {
        expect(cost.min).toBeLessThanOrEqual(cost.max);
        expect(cost.min === cost.max).toBe(false);
      }
      if (cost.kind === "open_ended") {
        expect(cost.from).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("STATE A authors every residual fact in a temporary index", () => {
    const indexPath = withTempIndex();
    const before = fs.readFileSync(indexPath, "utf8");
    runTool(indexPath, true);
    const after = fs.readFileSync(indexPath, "utf8");
    expect(after).not.toBe(before);
    const authored = JSON.parse(after) as Destination[];
    expect(authored).toHaveLength(1057);
    expect(
      authored.every((destination) => destination.admission !== undefined),
    ).toBe(true);
    fs.rmSync(path.dirname(indexPath), { recursive: true, force: true });
  });

  it("STATE B is byte-identical and performs zero writes", () => {
    const indexPath = withTempIndex();
    runTool(indexPath, true);
    const before = fs.readFileSync(indexPath, "utf8");
    runTool(indexPath);
    expect(fs.readFileSync(indexPath, "utf8")).toBe(before);
    fs.rmSync(path.dirname(indexPath), { recursive: true, force: true });
  });

  it("rejects any absent catalogue record outside the manifest", () => {
    const manifest = loadManifest();
    const manifestIds = new Set(manifest.map((entry) => entry.id));
    const indexPath = withTempIndex((index) => {
      const uncovered = index.find(
        (destination) => !manifestIds.has(destination.id),
      )!;
      delete uncovered.admission;
    });
    expect(() => runTool(indexPath)).toThrow(
      /does not cover absent catalogue records/,
    );
    fs.rmSync(path.dirname(indexPath), { recursive: true, force: true });
  });

  it("STATE C mixed present plus absent fails before mutation", () => {
    const manifest = loadManifest();
    const indexPath = withTempIndex((index) => {
      const destination = index.find((item) => item.id === manifest[0].id)!;
      destination.admission = expectedFact(manifest[0], destination);
    });
    const before = fs.readFileSync(indexPath, "utf8");
    expect(() => runTool(indexPath, true)).toThrow();
    expect(fs.readFileSync(indexPath, "utf8")).toBe(before);
    fs.rmSync(path.dirname(indexPath), { recursive: true, force: true });
  });

  it("STATE C differing fact fails before mutation", () => {
    const manifest = loadManifest();
    const indexPath = withTempIndex((index) => {
      const destination = index.find((item) => item.id === manifest[0].id)!;
      destination.admission = {
        ...expectedFact(manifest[0], destination),
        basis: "different fact injected for fail-closed regression",
      };
    });
    const before = fs.readFileSync(indexPath, "utf8");
    expect(() => runTool(indexPath, true)).toThrow();
    expect(fs.readFileSync(indexPath, "utf8")).toBe(before);
    fs.rmSync(path.dirname(indexPath), { recursive: true, force: true });
  });

  it("determineState rejects malformed manifest facts before inspecting writes", () => {
    const index = loadIndex();
    const manifest = loadManifest();
    const malformed = {
      ...manifest[0],
      cost: { kind: "bounded", min: 900 },
    } as ManifestEntry;
    const malformedManifest = [malformed, ...manifest.slice(1)];
    expect(() => determineState(malformedManifest, index)).toThrow(
      /invalid admission fact/,
    );
  });
});
