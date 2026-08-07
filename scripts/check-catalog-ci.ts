/**
 * check:catalog-ci — the single local/CI catalogue integrity gate.
 *
 * Runs exactly what CI runs (workflow: .github/workflows/catalogue-integrity.yml):
 *
 *   1. Changed-path detection (scripts/cli/changed-scope.ts): when the diff
 *      contains no catalogue-affecting files, prints a skip notice and exits
 *      0, so non-catalogue PRs pay no catalogue-validation runtime.
 *   2. check:catalog-warnings — audit errors + warning baseline.
 *   3. check:catalog-sync — generated-file currency + idempotency.
 *
 * Local developers reproduce any CI failure with the same command:
 *   npm run check:catalog-ci
 */

import { getChangedCatalogueScope } from "./cli/changed-scope.js";
import { runWarningsCheck } from "./check-catalog-warnings.js";
import { runSyncCheck } from "./check-catalog-sync.js";

async function main(): Promise<void> {
  const scope = getChangedCatalogueScope();
  if (!scope.relevant) {
    console.log(
      `⏭ Catalogue integrity check skipped: no catalogue-affecting changes in this diff.`,
    );
    console.log(
      `   Changed files: ${scope.changedFiles.length > 0 ? scope.changedFiles.join(", ") : "(none)"}`,
    );
    console.log(
      `   Trigger list: scripts/README.md → "Catalogue integrity CI checks".`,
    );
    return;
  }

  console.log(
    `🧭 Catalogue-affecting change detected (${scope.relevantFiles.length} file(s)); running full check.`,
  );
  const warningsCode = await runWarningsCheck();
  const syncCode = await runSyncCheck();
  process.exit(Math.max(warningsCode, syncCode));
}

main();
