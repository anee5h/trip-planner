import fs from "fs";
import path from "path";
import type { Destination } from "../src/shared/types/destination";

/**
 * Only destinations with an unambiguous municipality match are listed here.
 * Regional, multi-municipality, and uncertain places deliberately remain
 * unparented until they receive their own hub or an editorial boundary review.
 */
const PARENT_BY_DESTINATION_ID: Record<string, string> = {
  "akiu-onsen-miyagi": "sendai-city",
  "art-tower-mito": "mito-city",
  "beppu-hells-oita": "beppu-city",
  "chiba-port-tower": "chiba-city",
  "dogo-onsen-ehime": "matsuyama-city",
  "gero-onsen": "gero-city",
  "gifu-castle-gifu": "gifu-city",
  "gunkanjima-hashima-nagasaki": "nagasaki-city",
  "hikone-castle-shiga": "hikone-city",
  "hiroshima-peace-memorial": "hiroshima-city",
  "horyuji-temple-nara": "ikaruga-town",
  "inuyama-castle-aichi": "inuyama-city",
  "kairakuen-mito": "mito-city",
  "kochi-castle": "kochi-city",
  "korakuen-okayama": "okayama-city",
  "kumamoto-castle": "kumamoto-city",
  "matsue-castle": "matsue-city",
  "matsuyama-castle-ehime": "matsuyama-city",
  "mirai-tower-nagoya": "nagoya-city",
  "mito-castle-ibaraki": "mito-city",
  "mount-inasa-nagasaki": "nagasaki-city",
  "miyajima-itsukushima": "hatsukaichi-city",
  "nara-historic": "nara-city",
  "national-museum-western-art-tokyo": "taito-city",
  "sendai-castle-ruins-miyagi": "sendai-city",
  "shuri-castle-okinawa": "naha-city",
  "teamlab-borderless-azabudai": "minato-city",
  "toki-messe-tower-niigata": "niigata-city",
  "utsunomiya-oya": "utsunomiya-city",
};

const UNPARENTED_DESTINATION_IDS = [
  "ashigara",
  "kinosaki-onsen",
  "mount-fuji",
  "tama-zoological-park",
] as const;

const indexPath = path.join(
  process.cwd(),
  "src/shared/data/destinations-index.json",
);
const destinations = JSON.parse(
  fs.readFileSync(indexPath, "utf-8"),
) as Destination[];
const byId = new Map(
  destinations.map((destination) => [destination.id, destination]),
);

for (const [destinationId, parentId] of Object.entries(
  PARENT_BY_DESTINATION_ID,
)) {
  const destination = byId.get(destinationId);
  const parent = byId.get(parentId);
  if (!destination || !parent || parent.role !== "hub") {
    throw new Error(
      `Invalid city-hub relationship: ${destinationId} -> ${parentId}`,
    );
  }
  destination.relationships = {
    ...destination.relationships,
    parentDestinationId: parentId,
  };
}

for (const destinationId of UNPARENTED_DESTINATION_IDS) {
  const destination = byId.get(destinationId);
  if (!destination)
    throw new Error(`Unknown destination to unparent: ${destinationId}`);
  if (!destination.relationships?.parentDestinationId) continue;

  const { parentDestinationId: _removedParent, ...relationships } =
    destination.relationships;
  destination.relationships = relationships;
}

fs.writeFileSync(indexPath, `${JSON.stringify(destinations, null, 2)}\n`);
console.log(
  `Applied ${Object.keys(PARENT_BY_DESTINATION_ID).length} reviewed city-hub relationships and removed ${UNPARENTED_DESTINATION_IDS.length} invalid or non-municipal assignments.`,
);
