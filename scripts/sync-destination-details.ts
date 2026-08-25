import fs from "fs";
import path from "path";
import { generateCatalogueOutputs } from "./catalog/generate-outputs";

const detailsDirectory = path.join(process.cwd(), "public/data/destinations");
const metaPath = path.join(
  process.cwd(),
  "src/shared/data/destinations-meta.json",
);
const clientIndexPath = path.join(
  process.cwd(),
  "src/shared/data/destinations-index.lite.json",
);
const relationshipIndexPath = path.join(
  process.cwd(),
  "src/shared/data/destination-relationships.json",
);

async function main() {
  fs.mkdirSync(detailsDirectory, { recursive: true });

  // Generation logic lives in scripts/catalog/generate-outputs.ts (also used
  // by scripts/check-catalog-sync.ts) so the writer and the CI check can
  // never drift apart.
  const { detailFiles, meta, clientIndex, relationshipIndex } =
    await generateCatalogueOutputs();

  for (const [id, content] of detailFiles) {
    fs.writeFileSync(path.join(detailsDirectory, `${id}.json`), content);
  }

  // destinations-meta.json is a derived store file. The mapping lives in the
  // shared scripts/catalog/meta.mjs builder (also used by pipeline Stage 5)
  // so the two generators can never drift; the legacy pipeline itself is not
  // runnable end-to-end (its Stage 1 fails on legacy records lacking budget
  // fields), which is why the sync step also emits the file.
  fs.writeFileSync(metaPath, meta);

  // KAI-82 phase 2: the client index (summary fields only) keeps ~2.3 MB of
  // detail/audit data out of the initial-load bundle. Detail surfaces
  // hydrate from the per-destination files above.
  fs.writeFileSync(clientIndexPath, clientIndex);
  fs.writeFileSync(relationshipIndexPath, relationshipIndex);

  console.log(
    `Synced ${detailFiles.size} destination detail files, destinations-meta.json, destinations-index.lite.json and destination-relationships.json.`,
  );
}

main();
