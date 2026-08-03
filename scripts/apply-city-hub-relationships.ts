import fs from "fs";
import path from "path";
import type { Destination } from "../src/shared/types/destination";

/**
 * Only destinations with an unambiguous municipality match are listed here.
 * Regional, multi-municipality, and uncertain places deliberately remain
 * unparented until they receive their own hub or an editorial boundary review.
 */
const PARENT_BY_DESTINATION_ID: Record<string, string> = {
  "abukuma-cave-fukushima": "aizuwakamatsu-city",
  "akiyoshido-cave-yamaguchi": "mine-city",
  "akiu-onsen-miyagi": "sendai-city",
  "amami-iriomote-natural-site": "kagoshima-city",
  "arakurayama-sengen-park-yamanashi": "fujiyoshida-city",
  "art-tower-mito": "mito-city",
  "ashikaga-flower-park-tochigi": "ashikaga-city",
  "atsuta-shrine-nagoya": "nagoya-city",
  "beppu-hells-oita": "beppu-city",
  "bitchu-matsuyama-castle": "takahashi-city",
  "chiba-port-tower": "chiba-city",
  "chiba-sawara": "katori-city",
  "choshi-chiba": "choshi-city",
  "dakigaeri-valley-akita": "akita-city",
  "dewa-sanzan-yamagata": "yamagata-city",
  "dogo-onsen-ehime": "matsuyama-city",
  "geibikei-gorge-iwate": "morioka-city",
  "gero-onsen": "gero-city",
  "gifu-castle-gifu": "gifu-city",
  "ginzan-onsen-yamagata": "yamagata-city",
  "goshikinuma-ponds-fukushima": "aizuwakamatsu-city",
  "gunkanjima-hashima-nagasaki": "nagasaki-city",
  "hiraizumi-chusonji-iwate": "morioka-city",
  "hirosaki-castle": "hirosaki-city",
  "hikone-castle-shiga": "hikone-city",
  "hiroshima-peace-memorial": "hiroshima-city",
  "horyuji-temple-nara": "ikaruga-town",
  "inuyama-castle-aichi": "inuyama-city",
  "izumo-taisha": "izumo-city",
  "jodogahama-beach-iwate": "morioka-city",
  "kintai-bridge-yamaguchi": "iwakuni-city",
  "kairakuen-mito": "mito-city",
  "kakunodate-samurai-district-akita": "semboku-city",
  "kinosaki-onsen": "toyooka-city",
  "kochi-castle": "kochi-city",
  "korakuen-okayama": "okayama-city",
  "kouri-island-okinawa": "naha-city",
  "kumamoto-castle": "kumamoto-city",
  "lake-tazawa-akita": "semboku-city",
  "lake-towada-aomori": "aomori-city",
  "marugame-castle": "marugame-city",
  "matsue-castle": "matsue-city",
  "matsuyama-castle-ehime": "matsuyama-city",
  "matsumoto-castle-nagano": "matsumoto-city",
  "mirai-tower-nagoya": "nagoya-city",
  "mito-castle-ibaraki": "mito-city",
  "mount-aso-kumamoto": "kumamoto-city",
  "mount-bandai-fukushima": "aizuwakamatsu-city",
  "mount-inasa-nagasaki": "nagasaki-city",
  "mount-zao-yamagata": "yamagata-city",
  "miyajima-itsukushima": "hatsukaichi-city",
  "nagoya-castle-aichi": "nagoya-city",
  "naoshima-art-island-kagawa": "takamatsu-city",
  "nara-historic": "nara-city",
  "national-museum-western-art-tokyo": "taito-city",
  "nebuta-museum-wa-rasse-aomori": "aomori-city",
  "nyuto-onsen-akita": "semboku-city",
  "oirase-gorge-aomori": "aomori-city",
  "okama-crater-yamagata": "yamagata-city",
  "okinoshima-munakata-fukuoka": "fukuoka-city",
  "oura-church-nagasaki": "nagasaki-city",
  "ryugado-cave-kochi": "kochi-city",
  "ryusendo-cave-iwate": "morioka-city",
  "sakurajima-volcano-kagoshima": "kagoshima-city",
  "sendai-castle-ruins-miyagi": "sendai-city",
  "sannai-maruyama-jomon-aomori": "aomori-city",
  "shirakami-sanchi-aomori": "hirosaki-city",
  "shiretoko-national-park-hokkaido": "abashiri-city",
  "shuri-castle-okinawa": "naha-city",
  "teamlab-borderless-azabudai": "minato-city",
  "takeda-castle-ruins-hyogo": "asago-city",
  "tama-zoological-park": "hino-city",
  "teshima-island-kagawa": "takamatsu-city",
  "toki-messe-tower-niigata": "niigata-city",
  "tottori-sand-dunes": "tottori-city",
  "tsuruga-castle-fukushima": "aizuwakamatsu-city",
  "utsunomiya-oya": "utsunomiya-city",
  "yamanashi-fujiyoshida": "fujiyoshida-city",
  "yamanashi-nishizawa-valley": "fujiyoshida-city",
  "yamanashi-shosenkyo-gorge": "fujiyoshida-city",
  "yamadera-yamagata": "yamagata-city",
  "iya-valley-tokushima": "tokushima-city",
};

const UNPARENTED_DESTINATION_IDS = ["ashigara", "mount-fuji"] as const;

const REGION_OVERRIDES: Record<string, string> = {
  "shuri-castle-okinawa": "Okinawa",
};

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

for (const [destinationId, region] of Object.entries(REGION_OVERRIDES)) {
  const destination = byId.get(destinationId);
  if (!destination)
    throw new Error(
      `Unknown destination for region override: ${destinationId}`,
    );
  destination.region = region;
}

fs.writeFileSync(indexPath, `${JSON.stringify(destinations, null, 2)}\n`);
console.log(
  `Applied ${Object.keys(PARENT_BY_DESTINATION_ID).length} reviewed city-hub relationships, removed ${UNPARENTED_DESTINATION_IDS.length} invalid or non-municipal assignments, and applied ${Object.keys(REGION_OVERRIDES).length} region overrides.`,
);
