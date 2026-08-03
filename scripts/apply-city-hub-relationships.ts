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
  "boso-peninsula": "kisarazu-city",
  "chiba-nokogiriyama": "kisarazu-city",
  "chiba-port-tower": "chiba-city",
  "chiba-sawara": "katori-city",
  "chiba-yoro-valley": "chiba-city",
  "choshi-chiba": "choshi-city",
  "dakigaeri-valley-akita": "akita-city",
  "dewa-sanzan-yamagata": "yamagata-city",
  "dogo-onsen-ehime": "matsuyama-city",
  "fuji-5-lake": "fujikawaguchiko-town",
  "geibikei-gorge-iwate": "morioka-city",
  "gero-onsen": "gero-city",
  "ghibli-museum": "chofu-tokyo",
  "gifu-castle-gifu": "gifu-city",
  "gifu-gujo-hachiman": "gifu-city",
  "gifu-magome-juku": "gifu-city",
  "ginzan-onsen-yamagata": "yamagata-city",
  "goshikinuma-ponds-fukushima": "aizuwakamatsu-city",
  "gunkanjima-hashima-nagasaki": "nagasaki-city",
  "gunma-ikaho-onsen": "kusatsu-town",
  "gunma-kusatsu-onsen": "kusatsu-town",
  "gunma-shima-onsen": "kusatsu-town",
  "hiraizumi-chusonji-iwate": "morioka-city",
  "hirosaki-castle": "hirosaki-city",
  "hikone-castle-shiga": "hikone-city",
  "hiroshima-peace-memorial": "hiroshima-city",
  "horyuji-temple-nara": "ikaruga-town",
  "ibaraki-fukuroda-falls": "mito-city",
  "ibaraki-hitachi-seaside-park": "mito-city",
  "ibaraki-mount-tsukuba": "tsukuba-city",
  "inuyama-castle-aichi": "inuyama-city",
  "iwami-ginzan-shimane": "izumo-city",
  "iya-valley-tokushima": "tokushima-city",
  izu: "ito-city",
  "izumo-taisha": "izumo-city",
  "jodogahama-beach-iwate": "morioka-city",
  jogashima: "yokosuka-city",
  "kakegawa-castle-shizuoka": "hamamatsu-city",
  "kintai-bridge-yamaguchi": "iwakuni-city",
  "kairakuen-mito": "mito-city",
  "kakunodate-samurai-district-akita": "semboku-city",
  "katori-jingu": "katori-city",
  "kinosaki-onsen": "toyooka-city",
  "kinugawa-onsen": "nikko-city",
  kiso: "matsumoto-city",
  "kochi-castle": "kochi-city",
  "korakuen-okayama": "okayama-city",
  "kouri-island-okinawa": "naha-city",
  "kumamoto-castle": "kumamoto-city",
  "lake-hamanako": "hamamatsu-city",
  "lake-sagami": "sagamihara-city",
  "lake-tazawa-akita": "semboku-city",
  "lake-towada-aomori": "aomori-city",
  "marugame-castle": "marugame-city",
  "matsue-castle": "matsue-city",
  "matsuyama-castle-ehime": "matsuyama-city",
  "matsumoto-castle-nagano": "matsumoto-city",
  "mirai-tower-nagoya": "nagoya-city",
  "mito-castle-ibaraki": "mito-city",
  "mother-farm-chiba": "kisarazu-city",
  "motonosumi-shrine-yamaguchi": "shimonoseki-city",
  "mount-aso-kumamoto": "kumamoto-city",
  "mount-bandai-fukushima": "aizuwakamatsu-city",
  "mount-inasa-nagasaki": "nagasaki-city",
  "mount-zao-yamagata": "yamagata-city",
  "miyajima-itsukushima": "hatsukaichi-city",
  "nagano-bessho-onsen": "nagano-city",
  "nagano-kamikochi": "matsumoto-city",
  "nagano-narai-juku": "matsumoto-city",
  "nagano-suwa": "matsumoto-city",
  "nagano-tsumago-juku": "matsumoto-city",
  "nagoya-castle-aichi": "nagoya-city",
  "naoshima-art-island-kagawa": "takamatsu-city",
  "nara-historic": "nara-city",
  "national-museum-western-art-tokyo": "taito-city",
  "nebuta-museum-wa-rasse-aomori": "aomori-city",
  "nyuto-onsen-akita": "semboku-city",
  "oarai-marine-tower": "mito-city",
  "oirase-gorge-aomori": "aomori-city",
  "okama-crater-yamagata": "yamagata-city",
  "okinoshima-munakata-fukuoka": "fukuoka-city",
  okuhida: "takayama-city",
  "ouchi-juku-fukushima": "aizuwakamatsu-city",
  "oura-church-nagasaki": "nagasaki-city",
  "oze-national-park": "minakami-town",
  "ryugado-cave-kochi": "kochi-city",
  "ryusendo-cave-iwate": "morioka-city",
  "sado-island": "niigata-city",
  "saitama-nagatoro": "chichibu-city",
  "sakura-castle-chiba": "narita-city",
  "sakurajima-volcano-kagoshima": "kagoshima-city",
  "sendai-castle-ruins-miyagi": "sendai-city",
  "sannai-maruyama-jomon-aomori": "aomori-city",
  "shirakami-sanchi-aomori": "hirosaki-city",
  "shiretoko-national-park-hokkaido": "abashiri-city",
  "shuri-castle-okinawa": "naha-city",
  "takato-castle-nagano": "matsumoto-city",
  "takeda-castle-yamanashi": "kofu-city",
  "takeda-castle-ruins-hyogo": "asago-city",
  "tama-zoological-park": "hino-city",
  "teamlab-borderless-azabudai": "minato-city",
  "teshima-island-kagawa": "takamatsu-city",
  "toki-messe-tower-niigata": "niigata-city",
  "tokyo-hinohara": "hachioji-tokyo",
  "tokyo-okutama": "ome-tokyo",
  "tomioka-silk-mill-gunma": "kusatsu-town",
  "tottori-sand-dunes": "tottori-city",
  "tsunoshima-bridge-yamaguchi": "shimonoseki-city",
  "tsuruga-castle-fukushima": "aizuwakamatsu-city",
  tsutenkaku: "osaka-city",
  "ueda-castle-nagano": "nagano-city",
  "ushiku-daibutsu": "tsukuba-city",
  "utsunomiya-oya": "utsunomiya-city",
  "yamadera-yamagata": "yamagata-city",
  "yamanashi-fujiyoshida": "fujiyoshida-city",
  "yamanashi-nishizawa-valley": "fujiyoshida-city",
  "yamanashi-shosenkyo-gorge": "fujiyoshida-city",
  yomiuriland: "chofu-tokyo",
  "zao-fox-village-miyagi": "sendai-city",
  zushi: "yokosuka-city",
};

const UNPARENTED_DESTINATION_IDS = [
  "ashigara",
  "boso-no-mura",
  "fukui",
  "gala-yuzawa",
  "kanazawa",
  "kanazawa-castle-ishikawa",
  "kiyotsu-gorge-niigata",
  "kurobe-gorge",
  "maruoka-castle-fukui",
  "mount-fuji",
  "noto",
  "ogasawara-islands-tokyo",
  "takaoka",
  "tojinbo-cliffs-fukui",
  "toyama-alpine",
] as const;

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
