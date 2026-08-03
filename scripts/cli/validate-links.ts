import { createValidationContext } from "../catalog/loader";
import { linksValidator } from "../validators/links";
import { getChangedDestinationScope, type ChangedScope } from "./changed-scope";

function parseArgs(argv: string[]): { mode: "all" | "changed" } {
  const flag = argv.find((a) => a === "--changed" || a === "--all");
  if (flag === "--changed") return { mode: "changed" };
  return { mode: "all" };
}

async function main() {
  const { mode } = parseArgs(process.argv.slice(2));
  const context = await createValidationContext();

  let usedScope: ChangedScope | null = null;

  if (mode === "changed") {
    const scope = getChangedDestinationScope();
    usedScope = scope;
    const ids = scope.changedDestinationIds;
    if (ids.size === 0 && !scope.indexChanged) {
      console.log(
        `[info] validate-links: no destination data changed since origin/main; skipping route validation.`,
      );
      return;
    }
    if (scope.indexChanged) {
      console.log(
        `[info] validate-links: --changed requested but src/shared/data/destinations-index.json also changed; validating full catalogue.`,
      );
    } else {
      console.log(
        `[info] validate-links: ${ids.size} destination(s) in scope.`,
      );
    }
  }

  if (mode === "changed" && usedScope && !usedScope.indexChanged) {
    const ids = usedScope.changedDestinationIds;
    context.catalog = {
      ...context.catalog,
      destinations: context.catalog.destinations.filter((d) => ids.has(d.id)),
    };
  }

  const res = await linksValidator.validate(context);
  res.name = `${linksValidator.name} (${mode})`;
  console.log(JSON.stringify(res, null, 2));
  if (!res.passed) process.exit(1);
}

main();
