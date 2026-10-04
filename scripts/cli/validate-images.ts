import fs from "node:fs";
import path from "node:path";
import { createValidationContext } from "../catalog/loader";
import { imagesValidator } from "../validators/images";
import {
  renderImageValidationSummary,
  shouldFailValidation,
} from "../validators/image-validation-policy";
import type { ValidationResult } from "../validators/types";
import {
  getChangedDestinationImageScope,
  type ChangedScope,
} from "./changed-scope";

function parseArgs(argv: string[]): {
  mode: "all" | "changed";
  diffBase?: string;
} {
  const flag = argv.find((arg) => arg === "--changed" || arg === "--all");
  const baseRefIndex = argv.indexOf("--base-ref");
  const diffBase = baseRefIndex >= 0 ? argv[baseRefIndex + 1] : undefined;
  if (baseRefIndex >= 0 && (!diffBase || diffBase.startsWith("--"))) {
    throw new Error("--base-ref requires a Git ref or commit SHA");
  }
  return {
    mode: flag === "--changed" ? "changed" : "all",
    diffBase,
  };
}

function writeReports(result: ValidationResult, mode: string): string {
  const reportsDir = path.join(process.cwd(), "reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const jsonPath = path.join(reportsDir, `image-validation-${mode}.json`);
  const markdownPath = path.join(reportsDir, `image-validation-${mode}.md`);
  const summary = renderImageValidationSummary(result, mode);

  fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2), "utf-8");
  fs.writeFileSync(markdownPath, summary, "utf-8");
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`, "utf-8");
  }
  return jsonPath;
}

async function main() {
  const { mode, diffBase } = parseArgs(process.argv.slice(2));
  const context = await createValidationContext();
  let usedScope: ChangedScope | null = null;

  if (mode === "changed") {
    const scope = getChangedDestinationImageScope(diffBase);
    usedScope = scope;
    const ids = scope.changedDestinationIds;
    if (ids.size === 0 && !scope.indexChanged) {
      const skipped: ValidationResult = {
        name: `${imagesValidator.name} (${mode})`,
        passed: true,
        status: "not-run",
        issues: [],
        diagnostics: { uniqueUrlsChecked: 0, changedScopeSkipped: 1 },
        metrics: {
          totalChecked: 0,
          errorsCount: 0,
          warningsCount: 0,
          infoCount: 0,
          durationMs: 0,
        },
      };
      const summary = renderImageValidationSummary(skipped, mode);
      const jsonPath = writeReports(skipped, mode);
      console.log(summary);
      console.log(`Full image report: ${jsonPath}`);
      return;
    }
    if (ids.size > 0) {
      console.log(
        `[info] validate-images: ${ids.size} changed destination(s) in scope.`,
      );
    } else {
      console.log(
        "[info] validate-images: no destination files changed; validating full catalogue.",
      );
    }
  }

  if (
    mode === "changed" &&
    usedScope &&
    usedScope.changedDestinationIds.size > 0
  ) {
    const ids = usedScope.changedDestinationIds;
    context.catalog = {
      ...context.catalog,
      destinations: context.catalog.destinations.filter((destination) =>
        ids.has(destination.id),
      ),
    };
  }

  const result = await imagesValidator.validate(context);
  result.name = `${imagesValidator.name} (${mode})`;
  const summary = renderImageValidationSummary(result, mode);
  const jsonPath = writeReports(result, mode);
  console.log(summary);
  console.log(`Full image report: ${jsonPath}`);
  if (shouldFailValidation(result)) process.exitCode = 1;
}

main();
