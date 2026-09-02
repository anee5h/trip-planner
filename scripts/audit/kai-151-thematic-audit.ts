import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  validateThematicReview,
  type ThematicPhase,
} from "./kai-151-thematic-validator";

type JsonObject = Record<string, any>;
const root = process.cwd();
const phase = String(process.argv[2] ?? "") as ThematicPhase;
const config: Record<string, string> = {
  "2B": "scripts/audit/kai-151-foliage-phase2b-review.json",
  "2C": "scripts/audit/kai-151-winter-phase2c-review.json",
  "2D": "scripts/audit/kai-151-alpine-phase2d-review.json",
  "2E": "scripts/audit/kai-151-summer-phase2e-review.json",
};
if (!config[phase]) throw new Error(`unknown KAI-151 thematic phase: ${phase}`);
const readJson = (path: string) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const review = readJson(config[phase]) as JsonObject;
const catalogue = readJson("src/shared/data/destinations-index.json") as unknown[];
const state = validateThematicReview(review, catalogue, phase);
console.log(`KAI-151 Phase ${phase} thematic review valid (${state} state)`);
