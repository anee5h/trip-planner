import { createValidationContext } from "../catalog/loader";
import { imagesValidator } from "../validators/images";
import {
  getChangedDestinationImageScope,
  type ChangedScope,
} from "./changed-scope";

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
    const scope = getChangedDestinationImageScope();
    usedScope = scope;
    const ids = scope.changedDestinationIds;
    if (ids.size === 0 && !scope.indexChanged) {
      console.log(
        JSON.stringify(
          {
            name: imagesValidator.name,
            mode: "changed",
            skipped: true,
            reason:
              "No public/data/destinations/<id>.json files differ from origin/main.",
            passed: true,
            issues: [],
            metrics: {
              totalChecked: 0,
              errorsCount: 0,
              warningsCount: 0,
              infoCount: 0,
              durationMs: 0,
            },
          },
          null,
          2,
        ),
      );
      return;
    }
    if (ids.size > 0) {
      console.log(
        `[info] validate-images: ${ids.size} destination(s) in scope.`,
      );
    } else {
      console.log(
        `[info] validate-images: --changed requested but no destination files changed; validating full catalogue.`,
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
      destinations: context.catalog.destinations.filter((d) => ids.has(d.id)),
    };
  }

  const res = await imagesValidator.validate(context);
  res.name = `${imagesValidator.name} (${mode})`;
  console.log(JSON.stringify(res, null, 2));
  if (!res.passed) process.exit(1);
}

main();
