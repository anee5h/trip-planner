import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  expectedSeasonMetadata,
  validateCatalogueMutationScope,
  validateThematicReview,
  type ThematicPhase,
} from "./audit/kai-151-thematic-validator";

type JsonObject = Record<string, any>;

const root = process.cwd();
const phase = String(process.argv[2] ?? "") as ThematicPhase;
const config: Record<string, { review: string }> = {
  "2B": { review: "scripts/audit/kai-151-foliage-phase2b-review.json" },
  "2C": { review: "scripts/audit/kai-151-winter-phase2c-review.json" },
  "2D": { review: "scripts/audit/kai-151-alpine-phase2d-review.json" },
  "2E": { review: "scripts/audit/kai-151-summer-phase2e-review.json" },
};
if (!config[phase]) throw new Error(`unknown KAI-151 thematic phase: ${phase}`);
const readJson = (path: string) =>
  JSON.parse(readFileSync(resolve(root, path), "utf8"));
const review = readJson(config[phase].review) as JsonObject;
const cataloguePath = resolve(root, "src/shared/data/destinations-index.json");
const catalogue = readJson(
  "src/shared/data/destinations-index.json",
) as JsonObject[];
const before = JSON.parse(JSON.stringify(catalogue)) as JsonObject[];
const state = validateThematicReview(review, catalogue, phase);
if (state === "post") {
  console.log(`KAI-151 Phase ${phase} already applied; no changes needed`);
  process.exit(0);
}
let mutations = 0;
const byId = new Map(
  (review.records as JsonObject[]).map((row) => [String(row.id), row]),
);
for (const destination of catalogue) {
  const row = byId.get(String(destination.id));
  if (!row?.mutationAllowed) continue;
  const proposed = row.proposed as JsonObject;
  destination.bestSeason = proposed.bestSeason;
  destination.bestMonths = [...(proposed.bestMonths as number[])];
  destination.season = { ...(proposed.seasonVector as JsonObject) };
  destination.seasonMetadata = expectedSeasonMetadata(
    phase,
    proposed.bestSeason,
    proposed.bestMonths,
  );
  mutations += 1;
}
if (mutations !== review.summary.mutatedCount) {
  throw new Error(
    `Phase ${phase} mutated ${mutations}, expected ${review.summary.mutatedCount}`,
  );
}
validateCatalogueMutationScope(before as any, catalogue as any, review);
writeFileSync(cataloguePath, `${JSON.stringify(catalogue, null, 2)}\n`, "utf8");
console.log(
  `KAI-151 Phase ${phase} applied ${mutations} source-backed thematic mutations`,
);
