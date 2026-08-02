import fs from "node:fs";
import path from "node:path";
import type { Destination } from "../src/shared/types/destination";

const indexPath = path.join(
  process.cwd(),
  "src/shared/data/destinations-index.json",
);
const detailDir = path.join(process.cwd(), "public/data/destinations");
const catalog = JSON.parse(fs.readFileSync(indexPath, "utf8")) as Destination[];

async function findImage(destination: Destination) {
  const search = new URL("https://commons.wikimedia.org/w/api.php");
  search.search = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    generator: "search",
    gsrsearch: `${destination.name} Japan`,
    gsrnamespace: "6",
    gsrlimit: "5",
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: "1600",
  }).toString();
  const response = await fetch(search, {
    headers: { "User-Agent": "MegurutoCatalog/2.0 contact@meguruto.app" },
  });
  if (!response.ok) throw new Error(`${response.status}`);
  const result = await response.json();
  const pages = Object.values(result.query?.pages || {}) as Array<{
    title: string;
    imageinfo?: Array<{
      thumburl?: string;
      url?: string;
      descriptionurl?: string;
      extmetadata?: Record<string, { value?: string }>;
    }>;
  }>;
  const page = pages.find((candidate) => candidate.imageinfo?.[0]?.thumburl);
  const info = page?.imageinfo?.[0];
  if (!page || !info?.thumburl) return null;
  const metadata = info.extmetadata || {};
  return {
    url: info.thumburl,
    imageMetadata: {
      source: "Wikimedia Commons",
      license: metadata.LicenseShortName?.value || "See source page",
      attribution:
        metadata.Artist?.value?.replace(/<[^>]+>/g, "") ||
        "Wikimedia Commons contributor",
      sourceUrl:
        info.descriptionurl ||
        `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title.replaceAll(" ", "_"))}`,
    },
  };
}

const expansion = catalog.filter(
  (destination) =>
    destination.tags?.includes("destination-hub-expansion") &&
    destination.imageMetadata?.source !== "Wikimedia Commons",
);
const missing: string[] = [];
for (const destination of expansion) {
  let image: Awaited<ReturnType<typeof findImage>>;
  try {
    image = await findImage(destination);
  } catch (error) {
    console.warn(`${destination.id}: image lookup failed (${String(error)})`);
    missing.push(destination.id);
    continue;
  }
  if (!image) {
    missing.push(destination.id);
    continue;
  }
  destination.heroImage = image.url;
  (destination as Destination & { image?: string }).image = image.url;
  destination.imageMetadata = image.imageMetadata;
  fs.writeFileSync(
    path.join(detailDir, `${destination.id}.json`),
    `${JSON.stringify(destination, null, 2)}\n`,
  );
  fs.writeFileSync(indexPath, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(`${destination.id}: ${image.imageMetadata.sourceUrl}`);
}
if (missing.length)
  console.warn(`No Wikimedia image found: ${missing.join(", ")}`);
fs.writeFileSync(indexPath, `${JSON.stringify(catalog, null, 2)}\n`);
