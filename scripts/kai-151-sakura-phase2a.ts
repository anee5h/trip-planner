import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  expectedSeasonMetadata,
  validatePhase2AReview,
} from "./audit/kai-151-sakura-phase2a-validator";

type JsonRecord = Record<string, any>;

const root = process.cwd();
const readJson = (relativePath: string): any =>
  JSON.parse(readFileSync(resolve(root, relativePath), "utf8"));

const baseline = readJson(
  "scripts/audit/kai-151-sakura-phase2a-baseline.json",
) as JsonRecord;
const review = readJson(
  "scripts/audit/kai-151-sakura-phase2a-review.json",
) as JsonRecord;
const cataloguePath = resolve(root, "src/shared/data/destinations-index.json");
const catalogue = readJson(
  "src/shared/data/destinations-index.json",
) as JsonRecord[];
const state = validatePhase2AReview(baseline, review, catalogue);
if (state === "post") {
  console.log("KAI-151 Phase 2A already applied; no changes needed");
  process.exit(0);
}
if (state !== "pre") {
  throw new Error(`KAI-151 authoring requires clean pre-state; found ${state}`);
}

const reviewById = new Map(
  (review.records as JsonRecord[]).map((record) => [String(record.id), record]),
);
let mutationCount = 0;
for (const destination of catalogue) {
  const record = reviewById.get(String(destination.id));
  if (!record?.mutationAllowed) continue;
  const proposed = record.proposed as JsonRecord;
  const months = proposed.bestMonths as number[];
  destination.bestSeason = proposed.bestSeason;
  destination.bestMonths = months;
  destination.season = proposed.seasonVector;
  destination.seasonMetadata = expectedSeasonMetadata(months);
  mutationCount += 1;
}
if (mutationCount !== review.summary.proposedMutationCount) {
  throw new Error(
    `KAI-151 mutation count ${mutationCount} does not match manifest ${review.summary.proposedMutationCount}`,
  );
}
writeFileSync(cataloguePath, `${JSON.stringify(catalogue, null, 2)}\n`, "utf8");
console.log(
  `KAI-151 Phase 2A applied ${mutationCount} source-backed sakura mutations`,
);
