import fs from "fs";
import path from "path";
import { format, resolveConfig } from "prettier";
import { buildDestinationsMeta } from "./catalog/meta.mjs";
import type { Destination } from "../src/shared/types/destination";

const indexPath = path.join(
  process.cwd(),
  "src/shared/data/destinations-index.json",
);
const detailsDirectory = path.join(process.cwd(), "public/data/destinations");
const metaPath = path.join(
  process.cwd(),
  "src/shared/data/destinations-meta.json",
);

/** Format a generated JSON document with the repo's prettier config so that
 *  regeneration is idempotent (output matches what lint-staged would commit). */
async function formatJson(content: string): Promise<string> {
  const config = (await resolveConfig(process.cwd())) ?? {};
  return format(content, { ...config, parser: "json" });
}

async function main() {
  fs.mkdirSync(detailsDirectory, { recursive: true });

  const destinationsIndex = JSON.parse(
    fs.readFileSync(indexPath, "utf-8"),
  ) as Destination[];

  for (const destination of destinationsIndex) {
    const detailPath = path.join(detailsDirectory, `${destination.id}.json`);
    fs.writeFileSync(
      detailPath,
      await formatJson(`${JSON.stringify(destination, null, 2)}\n`),
    );
  }

  // destinations-meta.json is a derived store file. The mapping lives in the
  // shared scripts/catalog/meta.mjs builder (also used by pipeline Stage 5)
  // so the two generators can never drift; the legacy pipeline itself is not
  // runnable end-to-end (its Stage 1 fails on legacy records lacking budget
  // fields), which is why the sync step also emits the file.
  const metaData = buildDestinationsMeta(destinationsIndex);
  fs.writeFileSync(
    metaPath,
    await formatJson(`${JSON.stringify(metaData, null, 2)}\n`),
  );

  console.log(
    `Synced ${destinationsIndex.length} destination detail files and destinations-meta.json.`,
  );
}

main();
