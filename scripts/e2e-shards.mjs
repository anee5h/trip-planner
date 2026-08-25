#!/usr/bin/env node
/**
 * KAI-99: canonical E2E shard manifest + coverage guard.
 *
 * The e2e matrix in .github/workflows/pr-checks.yml runs ONE Playwright
 * project over ONE of four weighted bins. This script is the single source
 * of truth for the bin contents:
 *
 *   node scripts/e2e-shards.mjs --check   # coverage invariant (CI fails on break)
 *   node scripts/e2e-shards.mjs --bin 2   # file list for bin 2 (used by the workflow)
 *
 * Why bins instead of --shard: with fullyParallel:false, Playwright shards
 * at FILE granularity (not per-test round-robin). Meguruto's spec files
 * have highly unequal execution weights across two projects, which made
 * --shard walls lumpy (bins 1/4 and 3/4 ~14 min, bins 2/4 and 4/4 ~3.5 min)
 * and let the heavy shard exceed the 20-minute job ceiling on contended
 * runners. Weights below are measured CI per-project seconds (2026-08-17);
 * rebalance here when specs change, and the guard keeps coverage total.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const E2E_DIR = path.join(ROOT, "e2e");

/** Measured per-project seconds in CI (2026-08-17). A bin's total is what
 *  matters: never put the two heaviest specs in one bin. */
const WEIGHTS = {
  "kai-89-data-safety": 389,
  "kai-89-score-surfaces": 196,
  "kai-68-seo": 155,
  "kai-63-bus-eligibility": 142,
  "kai-74-homepage-rails": 106,
  "kai-94-beta-version-email": 81,
  "kai-85-date-selection": 80,
  "kai-51-home-smoke": 71,
  "kai-51-destination-details": 54,
  "kai-49-destinations-ja": 45,
  "kai-51-legal-pages": 37,
  "kai-51-destinations-explore": 33,
  "kai-93-japanese-availability": 20,
  "kai-98-ja-labels": 13,
  "kai-141-localization": 20,
  "kai-121-lazy-catalogue": 30, // runtime-lazy network checks (4 quick tests)
  "kai-144-early-home": 25, // eager surface + pre-readiness CTA interactions
  "kai-165-transport-preferences": 20,
  "kai-166-itinerary-action-row": 20,
  "kai-64-pwa": 0, // skips without PWA_E2E=1 (owned by the PWA job)
  "kai-64-upgrade": 0, // same
  "kai-80-a11y": 0, // skips without A11Y_E2E=1 (owned by the a11y run)
};

const BINS = {
  1: ["kai-89-data-safety"],
  2: ["kai-89-score-surfaces", "kai-68-seo"],
  3: [
    "kai-63-bus-eligibility",
    "kai-74-homepage-rails",
    "kai-94-beta-version-email",
  ],
  4: [
    "kai-85-date-selection",
    "kai-51-home-smoke",
    "kai-51-destination-details",
    "kai-49-destinations-ja",
    "kai-51-legal-pages",
    "kai-51-destinations-explore",
    "kai-93-japanese-availability",
    "kai-98-ja-labels",
    "kai-141-localization",
    "kai-121-lazy-catalogue",
    "kai-144-early-home",
    "kai-165-transport-preferences",
    "kai-166-itinerary-action-row",
    "kai-64-pwa",
    "kai-64-upgrade",
    "kai-80-a11y",
  ],
};

/** PWA-only specs are owned by the dedicated production-build PWA E2E job;
 *  they sit in bin 4 as no-ops so the coverage invariant stays total.
 *  The a11y spec is gated the same way (A11Y_E2E=1). */
const PWA_ONLY = new Set(["kai-64-pwa", "kai-64-upgrade", "kai-80-a11y"]);

function specPath(name) {
  return path.join(E2E_DIR, `${name}.spec.ts`);
}

function discoveredSpecs() {
  return fs
    .readdirSync(E2E_DIR)
    .filter((f) => f.endsWith(".spec.ts"))
    .map((f) => f.replace(/\.spec\.ts$/, ""))
    .sort();
}

function check() {
  const discovered = discoveredSpecs();
  const union = new Set(Object.values(BINS).flat());
  const errors = [];

  // Every manifest entry must exist on disk.
  for (const [bin, names] of Object.entries(BINS)) {
    for (const name of names) {
      if (!fs.existsSync(specPath(name))) {
        errors.push(
          `bin ${bin}: manifest lists ${name} but no such spec exists`,
        );
      }
      if (PWA_ONLY.has(name) && bin !== "4") {
        errors.push(`bin ${bin}: PWA-only spec ${name} must live in bin 4`);
      }
    }
  }

  // No spec assigned to more than one bin.
  const seen = new Map();
  for (const [bin, names] of Object.entries(BINS)) {
    for (const name of names) {
      if (seen.has(name)) {
        errors.push(
          `${name} appears in both bin ${seen.get(name)} and bin ${bin}`,
        );
      }
      seen.set(name, bin);
    }
  }

  // Weight membership: every NORMAL binned spec must carry a finite
  // positive weight (a missing weight silently degenerates to 0 and
  // recreates the imbalance this manifest exists to prevent). PWA-only
  // specs may be exactly 0. Stale WEIGHTS entries (weights for specs that
  // are no longer binned anywhere) must also fail.
  for (const [bin, names] of Object.entries(BINS)) {
    for (const name of names) {
      const weight = WEIGHTS[name];
      if (PWA_ONLY.has(name)) {
        if (weight !== 0) {
          errors.push(
            `bin ${bin}: PWA-only spec ${name} must have weight exactly 0 (got ${String(weight)})`,
          );
        }
      } else if (
        typeof weight !== "number" ||
        !Number.isFinite(weight) ||
        weight <= 0
      ) {
        errors.push(
          `bin ${bin}: spec ${name} is missing a positive weight (WEIGHTS[${JSON.stringify(name)}] = ${String(weight)})`,
        );
      }
    }
  }
  for (const name of Object.keys(WEIGHTS)) {
    if (!seen.has(name)) {
      errors.push(`stale WEIGHTS entry: ${name} is not assigned to any bin`);
    }
  }

  // Coverage: every discovered normal E2E spec is assigned exactly once.
  for (const name of discovered) {
    if (!union.has(name)) {
      errors.push(
        `${name} is NOT assigned to any bin — it would never run in CI`,
      );
    }
  }

  if (errors.length > 0) {
    console.error("E2E shard manifest invariant broken:");
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  const totalWeight = Object.values(BINS)
    .flat()
    .reduce((sum, n) => sum + (WEIGHTS[n] ?? 0), 0);
  const perBin = Object.entries(BINS).map(
    ([bin, names]) =>
      `bin ${bin}: ${names.length} specs, ~${names.reduce(
        (s, n) => s + (WEIGHTS[n] ?? 0),
        0,
      )}s/project`,
  );
  console.log(
    `E2E shard manifest OK: ${discovered.length} specs across ${
      Object.keys(BINS).length
    } bins (${perBin.join("; ")}; total ~${totalWeight}s/project).`,
  );
}

function binList(bin) {
  const names = BINS[bin];
  if (!names) {
    console.error(`unknown bin ${bin}; valid: ${Object.keys(BINS).join(",")}`);
    process.exit(1);
  }
  console.log(names.map((n) => specPath(n)).join(" "));
}

const arg = process.argv[2];
if (arg === "--check") {
  check();
} else if (arg === "--bin") {
  binList(process.argv[3]);
} else {
  console.error("usage: node scripts/e2e-shards.mjs --check | --bin <1-4>");
  process.exit(1);
}
