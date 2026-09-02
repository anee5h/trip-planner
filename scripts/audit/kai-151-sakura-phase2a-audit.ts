import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validatePhase2AReview } from "./kai-151-sakura-phase2a-validator";

type JsonRecord = Record<string, unknown>;

const root = process.cwd();
const readJson = (relativePath: string): JsonRecord =>
  JSON.parse(readFileSync(resolve(root, relativePath), "utf8")) as JsonRecord;

const baseline = readJson("scripts/audit/kai-151-sakura-phase2a-baseline.json");
const review = readJson("scripts/audit/kai-151-sakura-phase2a-review.json");
const catalogue = JSON.parse(
  readFileSync(
    resolve(root, "src/shared/data/destinations-index.json"),
    "utf8",
  ),
) as unknown[];
const state = validatePhase2AReview(baseline, review, catalogue);
console.log(`KAI-151 Phase 2A sakura review valid (${state} state)`);
