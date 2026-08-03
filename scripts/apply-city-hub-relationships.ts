import fs from "fs";
import path from "path";
import type { Destination } from "../src/shared/types/destination";

/**
 * Declarative source of truth for destination-to-hub relationships.
 *
 * - PARENT_BY_DESTINATION_ID: genuine municipal containment (destination is
 *   physically inside the parent hub's catchment, e.g. within ~60 km).
 * - GATEWAY_BY_DESTINATION_ID: regional access hubs for places that are only
 *   reachable via a gateway (islands, remote mountain areas) and are not
 *   contained within the hub's municipality.
 *
 * The script is idempotent. It validates every map entry up front (failures
 * abort with a non-zero exit), then reconciles the catalogue to the maps:
 * records whose current parent/gateway already matches are left untouched so
 * their serialization is byte-identical (minimal diff), while stale mappings
 * that were removed from the tables are propagated back to unparented.
 */
const PARENT_BY_DESTINATION_ID: Record<string, string> = {
  "abeno-harukas-300-osaka": "osaka-city",
  "akasaka-minato": "minato-city",
  "akihabara-chiyoda": "chiyoda-city",
  "akiu-onsen-miyagi": "sendai-city",
  "akiyoshido-cave-yamaguchi": "mine-city",
  "amanohashidate-kyoto": "miyazu-city",
  "ameya-yokocho": "taito-city",
  "aoba-castle-museum": "sendai-city",
  "arakurayama-sengen-park-yamanashi": "fujiyoshida-city",
  "arima-onsen": "kobe-city",
  "art-tower-mito": "mito-city",
  "asakusa-taito": "taito-city",
  "ashikaga-flower-park-tochigi": "ashikaga-city",
  "asuka-fujiwara-nara": "nara-city",
  "atsuta-shrine-nagoya": "nagoya-city",
  "beppu-hells-oita": "beppu-city",
  "bise-fukugi-tree-road-motobu": "motobu-town",
  "bitchu-matsuyama-castle": "takahashi-city",
  "boso-peninsula": "kisarazu-city",
  buaiso: "machida-tokyo",
  "busena-marine-park-nago": "nago-city",
  "byodoin-temple": "uji-city",
  "canal-city-hakata": "fukuoka-city",
  "chiba-city-folk-museum": "chiba-city",
  "chiba-city-museum-of-art": "chiba-city",
  "chiba-park": "chiba-city",
  "chiba-port-park": "chiba-city",
  "chiba-port-tower": "chiba-city",
  "chiba-sawara": "katori-city",
  "chiba-shrine": "chiba-city",
  "chiba-zoological-park": "chiba-city",
  "chofu-historic-jindaiji-district": "chofu-tokyo",
  "chogosonshi-ji-temple": "ikaruga-town",
  "choshi-chiba": "choshi-city",
  "churaumi-aquarium-motobu": "motobu-town",
  "cup-noodles-museum-yokohama": "yokohama-city",
  "dakigaeri-valley-akita": "akita-city",
  "danjo-garan-koyasan": "koya-town",
  "dewa-sanzan-yamagata": "yamagata-city",
  disneyland: "urayasu-city",
  disneysea: "urayasu-city",
  "dogo-onsen-ehime": "matsuyama-city",
  dotonbori: "osaka-city",
  "edo-castle-tokyo": "chiyoda-city",
  engakuji: "kamakura-city",
  "engyo-ji-mount-shosha": "himeji-city",
  "enoshima-aquarium": "fujisawa-city",
  "enoshima-island": "fujisawa-city",
  "enoshima-iwaya-caves": "fujisawa-city",
  "enoshima-sea-candle": "fujisawa-city",
  "enoshima-shrine": "fujisawa-city",
  "enryaku-ji-mount-hiei": "otsu-city",
  "former-hokkaido-government-office": "sapporo-city",
  "fudaten-shrine": "chofu-tokyo",
  "fujiko-f-fujio-museum": "kawasaki-city",
  "fukagawa-edo-museum": "koto-city",
  "fukuoka-art-museum": "fukuoka-city",
  "fukuoka-castle-ruins": "fukuoka-city",
  "fukuoka-tower": "fukuoka-city",
  "fukuoka-yatai": "fukuoka-city",
  "fukushuen-garden-naha": "naha-city",
  "fushimi-inari-taisha": "kyoto-city",
  "genbudo-cave-park": "toyooka-city",
  "genkyuen-garden": "hikone-city",
  "gero-onsen": "gero-city",
  "gifu-castle-gifu": "gifu-city",
  "ginkaku-ji": "kyoto-city",
  "ginza-itoya": "chuo-city",
  "ginza-urban": "chuo-city",
  "golden-gai": "shinjuku-city",
  "goshikinuma-ponds-fukushima": "aizuwakamatsu-city",
  "gotoku-ji": "setagaya-city",
  "gunkanjima-hashima-nagasaki": "nagasaki-city",
  "gunma-ikaho-onsen": "kusatsu-town",
  "gunma-shima-onsen": "kusatsu-town",
  "gyokudo-art-museum": "ome-tokyo",
  "hachioji-castle-tokyo": "hachioji-tokyo",
  "hakata-machiya-folk-museum": "fukuoka-city",
  hakkeijima: "yokohama-city",
  "hakodate-night-view": "hakodate-city",
  "hamarikyu-gardens": "chuo-city",
  "harajuku-takeshita-street": "shibuya-city",
  "harry-potter-studio": "nerima-city",
  hasedera: "kamakura-city",
  "heian-jingu": "kyoto-city",
  "hiei-zan-driveway-observatory": "otsu-city",
  "higashi-hennazaki-cape-miyako": "miyakojima-city",
  "higashiyama-sky-tower-nagoya": "nagoya-city",
  "hijikata-toshizo-museum": "hino-city",
  "hikone-castle-shiga": "hikone-city",
  "himeji-castle": "himeji-city",
  "hirosaki-castle": "hirosaki-city",
  "hiroshima-castle": "hiroshima-city",
  "hiroshima-museum-art": "hiroshima-city",
  "hiroshima-peace-memorial": "hiroshima-city",
  "hokkaido-jingu": "sapporo-city",
  "hokkaido-museum-of-modern-art": "sapporo-city",
  "hokki-ji-pagoda": "ikaruga-town",
  hokokuji: "kamakura-city",
  "honmaru-palace": "nagoya-city",
  "horyuji-temple-nara": "ikaruga-town",
  "ikebukuro-toshima": "toshima-city",
  "ikuno-silver-mine": "asago-city",
  "ikuta-ryokuchi": "kawasaki-city",
  "imperial-palace-chiyoda": "chiyoda-city",
  "inage-seaside-park": "chiba-city",
  inamuragasaki: "kamakura-city",
  "ine-funaya-boathouses": "miyazu-city",
  "inuyama-castle-aichi": "inuyama-city",
  "irabu-bridge-irabujima-miyako": "miyakojima-city",
  "ise-grand-shrine": "ise-city",
  "iwatsuki-ningyo-museum": "saitama-city",
  "izumo-taisha": "izumo-city",
  "izushi-castle-town": "toyooka-city",
  "jindai-botanical-gardens": "chofu-tokyo",
  jindaiji: "chofu-tokyo",
  "jochi-ji": "kamakura-city",
  joypolis: "koto-city",
  "jozenji-dori": "sendai-city",
  "kabira-bay-ishigaki": "ishigaki-city",
  kabukicho: "shinjuku-city",
  kabukiza: "chuo-city",
  kagurazaka: "shinjuku-city",
  "kairakuen-mito": "mito-city",
  "kakunodate-samurai-district-akita": "semboku-city",
  "kamakurakokomae-station": "kamakura-city",
  "kanayama-shrine": "kawasaki-city",
  "kannai-yokohama": "yokohama-city",
  "kasamatsu-park-view": "miyazu-city",
  "kashiya-yokocho": "kawagoe-city",
  "kasori-shell-mounds": "chiba-city",
  "kataonami-beach-wakanoura": "wakayama-city",
  "katase-higashihama-beach": "fujisawa-city",
  "kawagoe-castle-saitama": "kawagoe-city",
  "kawagoe-festival-museum": "kawagoe-city",
  "kawagoe-hikawa-shrine": "kawagoe-city",
  "kawasaki-daishi": "kawasaki-city",
  "kegon-falls-nikko": "nikko-city",
  "keio-mogusaen": "hino-city",
  "keio-rail-land": "hino-city",
  "kennin-ji": "kyoto-city",
  "kimii-dera-temple": "wakayama-city",
  "kinkaku-ji": "kyoto-city",
  "kinosaki-onsen": "toyooka-city",
  "kintai-bridge-yamaguchi": "iwakuni-city",
  "kinugawa-onsen": "nikko-city",
  "kirin-beer-yokohama-factory": "yokohama-city",
  "kishi-station-tama-cat": "wakayama-city",
  "kita-in": "kawagoe-city",
  "kitano-ijinkan": "kobe-city",
  "kitaro-chaya": "chofu-tokyo",
  "kiyosumi-gardens": "koto-city",
  "kobe-animal-kingdom": "kobe-city",
  "kobe-harborland": "kobe-city",
  "kobe-maritime-museum": "kobe-city",
  "kobe-maya-night-view": "kobe-city",
  "kobe-port-tower": "kobe-city",
  "kochi-castle": "kochi-city",
  "koko-en-garden": "himeji-city",
  "kokusai-dori-naha": "naha-city",
  "komachi-street": "kamakura-city",
  "korakuen-okayama": "okayama-city",
  "kotoku-in-great-buddha": "kamakura-city",
  "kouri-island-okinawa": "nago-city",
  "kumamoto-castle": "kumamoto-city",
  "kumano-kodo-koya-wakayama": "koya-town",
  "kurazukuri-warehouse-district": "kawagoe-city",
  "kuromon-market": "osaka-city",
  "kuroshio-market-marina-city": "wakayama-city",
  "kushida-shrine": "fukuoka-city",
  "kyoto-historic": "kyoto-city",
  "kyoto-imperial-palace": "kyoto-city",
  "kyoto-international-manga-museum": "kyoto-city",
  "kyoto-national-museum": "kyoto-city",
  "kyoto-railway-museum": "kyoto-city",
  "lake-biwa-shiga": "otsu-city",
  "lake-towada-aomori": "aomori-city",
  "lazona-kawasaki-plaza": "kawasaki-city",
  "machida-graphic-arts-museum": "machida-tokyo",
  "maizuru-park": "fukuoka-city",
  "makuhari-seaside-park": "chiba-city",
  "marugame-castle": "marugame-city",
  "maruyama-park": "sapporo-city",
  "matsue-castle": "matsue-city",
  "matsumoto-castle-nagano": "matsumoto-city",
  "matsushima-bay": "sendai-city",
  "matsuyama-castle-ehime": "matsuyama-city",
  "meiji-jingu": "shibuya-city",
  "meoto-iwa-wedded-rocks": "ise-city",
  "meriken-park": "kobe-city",
  "mimuroto-ji-temple": "uji-city",
  "minato-mirai-yokohama": "yokohama-city",
  "mirai-tower-nagoya": "nagoya-city",
  miraikan: "koto-city",
  "mitaki-dera": "hiroshima-city",
  "mito-castle-ibaraki": "mito-city",
  "miyajima-itsukushima": "hatsukaichi-city",
  "mount-aso-kumamoto": "kumamoto-city",
  "mount-bandai-fukushima": "aizuwakamatsu-city",
  "mount-inasa-nagasaki": "nagasaki-city",
  "mount-moiwa": "sapporo-city",
  "mount-takao": "hachioji-tokyo",
  "mount-yoshino-nara": "nara-city",
  "mount-zao-yamagata": "yamagata-city",
  "mozufuruichi-kofun-osaka": "sakai-city",
  "mukojima-hyakkaen": "sumida-city",
  "musashi-ichinomiya-hikawa-shrine": "saitama-city",
  "musashi-mitake-shrine": "ome-tokyo",
  "museum-contemporary-art-tokyo": "koto-city",
  "museum-of-aeronautical-sciences": "narita-city",
  "nachi-falls-wakayama": "shirahama-town",
  "nagano-kamikochi": "matsumoto-city",
  "nagano-narai-juku": "matsumoto-city",
  "nagano-suwa": "matsumoto-city",
  "nago-pineapple-park": "nago-city",
  "nagoya-castle-aichi": "nagoya-city",
  "nagoya-city-art-museum": "nagoya-city",
  "nagoya-city-science-museum": "nagoya-city",
  "nagoya-port-tower": "nagoya-city",
  "nakanoshima-museum-art-osaka": "osaka-city",
  nakasu: "fukuoka-city",
  "nakijin-castle-ruins-motobu": "motobu-town",
  "naminoue-shrine-naha": "naha-city",
  "nankinmachi-chinatown": "kobe-city",
  "nanzen-ji": "kyoto-city",
  "nara-historic": "nara-city",
  "nara-park-todaiji": "nara-city",
  "naramachi-historic-district": "nara-city",
  "narita-airport-observation-decks": "narita-city",
  "naritasan-park": "narita-city",
  "national-museum-of-nature-and-science": "taito-city",
  "national-museum-western-art-tokyo": "taito-city",
  "nebuta-museum-wa-rasse-aomori": "aomori-city",
  "nihon-minka-en": "kawasaki-city",
  nihonbashi: "chuo-city",
  "nijo-castle-kyoto": "kyoto-city",
  "nijo-market": "sapporo-city",
  "nikko-toshogu-shrine-tochigi": "nikko-city",
  "ninna-ji": "kyoto-city",
  "nishiki-market": "kyoto-city",
  "nozuta-park": "machida-tokyo",
  "nunobiki-falls": "kobe-city",
  "nunobiki-herb-gardens": "kobe-city",
  "nunobiki-ropeway": "kobe-city",
  "nyuto-onsen-akita": "semboku-city",
  "odaiba-minato": "koto-city",
  "odori-park": "sapporo-city",
  "ohori-park": "fukuoka-city",
  "okage-yokocho-oharai-machi": "ise-city",
  "okama-crater-yamagata": "yamagata-city",
  "okinoshima-munakata-fukuoka": "fukuoka-city",
  okonomimura: "hiroshima-city",
  "okunoin-cemetery-koyasan": "koya-town",
  "ome-railway-park": "ome-tokyo",
  "ome-retro-town": "ome-tokyo",
  "omi-hachiman-canal": "otsu-city",
  "omiya-bonsai-art-museum": "saitama-city",
  "omiya-bonsai-village": "saitama-city",
  "omiya-park": "saitama-city",
  "omiya-railway": "saitama-city",
  "omoide-yokocho": "shinjuku-city",
  "orizuru-tower": "hiroshima-city",
  "osaka-aquarium-kaiyukan": "osaka-city",
  "osaka-castle": "osaka-city",
  "osaka-castle-park": "osaka-city",
  "osaka-central-public-hall": "osaka-city",
  "osaka-museum-of-housing-and-living": "osaka-city",
  "osaka-station-city": "osaka-city",
  "osaki-hachimangu": "sendai-city",
  "osu-kannon": "nagoya-city",
  "osu-shopping-district": "nagoya-city",
  "oura-church-nagasaki": "nagasaki-city",
  "philosopher-s-walk": "kyoto-city",
  "play-museum-tachikawa": "tachikawa-tokyo",
  "polar-science-museum": "tachikawa-tokyo",
  "rakuten-mobile-park-miyagi": "sendai-city",
  renkeiji: "kawagoe-city",
  "ritsuunkyo-viewpoint": "asago-city",
  "roppongi-hills-tokyo-city-view": "minato-city",
  "ryoan-ji": "kyoto-city",
  "ryogoku-kokugikan-sumo-museum": "sumida-city",
  "ryugado-cave-kochi": "kochi-city",
  "ryusendo-cave-iwate": "morioka-city",
  "saitama-shintoshin": "saitama-city",
  "saitama-stadium-2002": "saitama-city",
  "saitama-super-arena": "saitama-city",
  "sakai-city-museum": "sakai-city",
  "sakurajima-volcano-kagoshima": "kagoshima-city",
  "samuel-cocking-garden": "fujisawa-city",
  "sanjusangen-do": "kyoto-city",
  "sannai-maruyama-jomon-aomori": "aomori-city",
  "sapporo-beer-museum": "sapporo-city",
  "sapporo-clock-tower": "sapporo-city",
  "sapporo-tv-tower": "sapporo-city",
  "sasuke-inari-shrine": "kamakura-city",
  "scmaglev-and-railway-park": "nagoya-city",
  "seiko-museum-ginza": "chuo-city",
  "sendai-asaichi-morning-market": "sendai-city",
  "sendai-castle-ruins-miyagi": "sendai-city",
  "sendai-city-museum": "sendai-city",
  "sendai-mediatheque": "sendai-city",
  "sendai-umino-mori-aquarium": "sendai-city",
  "senjojiki-sandanbeki-cliffs": "shirahama-town",
  "serigaya-park": "machida-tokyo",
  "shibuya-crossing-hachiko": "shibuya-city",
  "shibuya-sky-shibuya": "shibuya-city",
  "shin-yokohama-ramen-museum": "yokohama-city",
  "shingashi-river": "kawagoe-city",
  "shinjuku-gyo-en": "shinjuku-city",
  shinsaibashi: "osaka-city",
  shinsekai: "osaka-city",
  "shinsho-ji": "narita-city",
  "shirahama-beach-adventure-world": "shirahama-town",
  "shirahige-shrine-lake-biwa": "otsu-city",
  "shirakami-sanchi-aomori": "hirosaki-city",
  shitennoji: "osaka-city",
  "shonan-kaigan-park": "fujisawa-city",
  "showa-kinen-park": "tachikawa-tokyo",
  shukkeien: "hiroshima-city",
  "shuri-castle-okinawa": "naha-city",
  "soji-ji-yokohama": "yokohama-city",
  "sugamo-jizo-dori": "toshima-city",
  "sumida-hokusai-museum": "sumida-city",
  "sumida-river-walk": "sumida-city",
  "sunshine-60-observatory-ikebukuro": "toshima-city",
  "sunshine-aquarium": "toshima-city",
  "sunshine-city": "toshima-city",
  susukino: "sapporo-city",
  "suwa-shrine-tachikawa": "tachikawa-tokyo",
  "tachikawa-manga-park": "tachikawa-tokyo",
  "taisho-roman-street": "kawagoe-city",
  "takahata-fudoson": "hachioji-tokyo",
  "takanawa-gateway-minato": "minato-city",
  "takao-599-museum": "hachioji-tokyo",
  "takaosan-yakuoin": "hachioji-tokyo",
  "takato-castle-nagano": "matsumoto-city",
  "takeda-castle-ruins-hyogo": "asago-city",
  "takeda-castle-yamanashi": "kofu-city",
  "tama-forest-science-garden": "hachioji-tokyo",
  "tama-zoological-park": "hino-city",
  "tamatorizaki-viewpoint-ishigaki": "ishigaki-city",
  "tanukikoji-shopping-street": "sapporo-city",
  "taro-okamoto-museum-of-art": "kawasaki-city",
  "teamlab-borderless-azabudai": "minato-city",
  "teamlab-planets": "koto-city",
  "tempozan-ferris-wheel": "osaka-city",
  tenjin: "fukuoka-city",
  "tennoji-park": "osaka-city",
  "teshima-island-kagawa": "takamatsu-city",
  "the-museum-of-modern-art-saitama": "saitama-city",
  "the-national-museum-of-art-osaka": "osaka-city",
  tochoji: "fukuoka-city",
  "todoroki-ryokuchi": "kawasaki-city",
  "toki-messe-tower-niigata": "niigata-city",
  "toki-no-kane": "kawagoe-city",
  "tokiwaso-manga-museum": "toshima-city",
  "tokugawa-art-museum": "nagoya-city",
  "tokugawa-garden": "nagoya-city",
  "tokyo-hinohara": "hachioji-tokyo",
  "tokyo-metropolitan-government-building-shinjuku": "shinjuku-city",
  "tokyo-mt-mitake": "ome-tokyo",
  "tokyo-national-museum": "taito-city",
  "tokyo-okutama": "ome-tokyo",
  "tokyo-skytree-sumida": "sumida-city",
  "tokyo-station-chiyoda": "chiyoda-city",
  "tokyo-tower-minato": "minato-city",
  "tomogashima-islands": "wakayama-city",
  "toshiba-science-museum": "kawasaki-city",
  "toshodai-ji-temple": "nara-city",
  "tottori-sand-dunes": "tottori-city",
  "toyosu-market": "koto-city",
  "toyota-commemorative-museum-of-industry-and-technology": "nagoya-city",
  "tsujido-seaside-park": "fujisawa-city",
  "tsukiji-outer-market": "chuo-city",
  "tsunoshima-bridge-yamaguchi": "shimonoseki-city",
  "tsuruga-castle-fukushima": "aizuwakamatsu-city",
  "tsurugaoka-hachimangu": "kamakura-city",
  tsutenkaku: "osaka-city",
  "ueda-castle-nagano": "nagano-city",
  "ueno-park": "taito-city",
  "ueno-taito": "taito-city",
  "ueno-zoo": "ueno-taito",
  "uji-tea-culture-center": "uji-city",
  "ukimido-mangetsu-ji": "otsu-city",
  "umeda-sky-building": "osaka-city",
  "universal-studios-japan": "osaka-city",
  "ushiku-daibutsu": "tsukuba-city",
  "utsunomiya-oya": "utsunomiya-city",
  "wakayama-castle": "wakayama-city",
  "yakushi-ike-park": "machida-tokyo",
  "yakushi-ji-temple": "nara-city",
  "yamadera-yamagata": "yamagata-city",
  "yamanashi-fujiyoshida": "fujiyoshida-city",
  "yamanashi-nishizawa-valley": "kofu-city",
  "yamanashi-shosenkyo-gorge": "kofu-city",
  "yamashita-park-yokohama": "yokohama-city",
  yanaka: "taito-city",
  "yasaka-shrine": "kyoto-city",
  "yokohama-chinatown": "yokohama-city",
  "yokohama-cosmo-world": "yokohama-city",
  "yokohama-landmark-tower-sky-garden": "yokohama-city",
  "yokohama-marine-tower": "yokohama-city",
  "yokohama-red-brick-warehouse": "yokohama-city",
  "yokohama-zoorasia": "yokohama-city",
  "yonaha-maehama-beach-miyako": "miyakojima-city",
  "yonehara-beach-coral-ishigaki": "ishigaki-city",
  "yoyogi-park": "shibuya-city",
  "yugyo-ji": "fujisawa-city",
  "yuigahama-beach": "kamakura-city",
  "zao-fox-village-miyagi": "sendai-city",
  "zeniarai-benten": "kamakura-city",
  "zoshigaya-kishimojindo": "toshima-city",
  zuihoden: "sendai-city",
};

const GATEWAY_BY_DESTINATION_ID: Record<string, string> = {
  "abukuma-cave-fukushima": "aizuwakamatsu-city",
  "amami-iriomote-natural-site": "kagoshima-city",
  "geibikei-gorge-iwate": "morioka-city",
  "ginzan-onsen-yamagata": "yamagata-city",
  "hiraizumi-chusonji-iwate": "morioka-city",
  "iya-valley-tokushima": "tokushima-city",
  "jodogahama-beach-iwate": "morioka-city",
  "nagano-tsumago-juku": "matsumoto-city",
  "naoshima-art-island-kagawa": "takamatsu-city",
  "shiretoko-national-park-hokkaido": "abashiri-city",
  "uwajima-castle": "matsuyama-city",
  "yakushima-town": "kagoshima-city",
  "cupnoodles-museum-osaka-ikeda": "sakai-city",
  "lake-tazawa-akita": "akita-city",
  "miho-museum-koka": "hikone-city",
  "oirase-gorge-aomori": "aomori-city",
};

export const UNPARENTED_DESTINATION_IDS = [
  "ashigara",
  "boso-no-mura",
  "fukui",
  "gala-yuzawa",
  "kanazawa",
  "kanazawa-castle-ishikawa",
  "katori-jingu",
  "kiyotsu-gorge-niigata",
  "kurobe-gorge",
  "maruoka-castle-fukui",
  "mount-fuji",
  "noto",
  "ogasawara-islands-tokyo",
  "takaoka",
  "tojinbo-cliffs-fukui",
  "tomioka-silk-mill-gunma",
  "toyama-alpine",
] as const;

const REGION_OVERRIDES: Record<string, string> = {
  "shuri-castle-okinawa": "Okinawa",
};

// Hubs whose id does not end in a clean -city/-town/-village/-ward suffix.
const HUB_MUNICIPALITY_OVERRIDES: Record<string, string> = {
  "chofu-tokyo": "chofu",
  "hachioji-tokyo": "hachioji",
  "machida-tokyo": "machida",
  "odaiba-minato": "koto",
  "ome-tokyo": "ome",
  "tachikawa-tokyo": "tachikawa",
  "tokyo-station-chiyoda": "chiyoda",
  "ueno-taito": "taito",
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

const failures: string[] = [];
const parentFor = new Map(Object.entries(PARENT_BY_DESTINATION_ID));
const gatewayFor = new Map(Object.entries(GATEWAY_BY_DESTINATION_ID));

// 1. Validate every map entry before mutating anything.
for (const [destinationId, parentId] of parentFor) {
  const destination = byId.get(destinationId);
  const parent = byId.get(parentId);
  if (!destination) {
    failures.push(
      `destination '${destinationId}' does not exist in the catalogue`,
    );
  } else if (!parent) {
    failures.push(
      `parent hub '${parentId}' (of '${destinationId}') does not exist`,
    );
  } else if (parent.role !== "hub") {
    failures.push(`parent '${parentId}' (of '${destinationId}') is not a hub`);
  } else if (parent.prefecture !== destination.prefecture) {
    failures.push(
      `parent '${parentId}' is in ${parent.prefecture} but '${destinationId}' is in ${destination.prefecture}`,
    );
  }
}

for (const [destinationId, hubId] of gatewayFor) {
  const destination = byId.get(destinationId);
  const hub = byId.get(hubId);
  if (!destination) {
    failures.push(`gateway destination '${destinationId}' does not exist`);
  } else if (!hub) {
    failures.push(
      `gateway hub '${hubId}' (of '${destinationId}') does not exist`,
    );
  } else if (hub.role !== "hub") {
    failures.push(
      `gateway hub '${hubId}' (of '${destinationId}') is not a hub`,
    );
  } else if (hub.prefecture !== destination.prefecture) {
    failures.push(
      `gateway hub '${hubId}' is in ${hub.prefecture} but '${destinationId}' is in ${destination.prefecture}`,
    );
  }
}

// 1b. Exhaustive, disjoint classification: every non-hub destination must be
//     classified exactly once as contained, gateway, or standalone/unparented.
const parentIds = new Set(parentFor.keys());
const gatewayIds = new Set(gatewayFor.keys());
const unparentedIds = new Set(UNPARENTED_DESTINATION_IDS);

for (const destination of destinations) {
  if (destination.role === "hub" || destination.role === "poi") continue;
  const inParent = parentIds.has(destination.id);
  const inGateway = gatewayIds.has(destination.id);
  const inUnparented = unparentedIds.has(destination.id);
  const classificationCount =
    Number(inParent) + Number(inGateway) + Number(inUnparented);

  if (classificationCount > 1) {
    failures.push(
      `destination '${destination.id}' is assigned to more than one classification set (parent=${inParent}, gateway=${inGateway}, unparented=${inUnparented})`,
    );
  } else if (
    classificationCount === 0 &&
    destination.relationships?.parentDestinationId
  ) {
    failures.push(
      `destination '${destination.id}' has parentDestinationId but is not in the containment map (stale mapping)`,
    );
  } else if (
    classificationCount === 0 &&
    destination.relationships?.gatewayHubId
  ) {
    failures.push(
      `destination '${destination.id}' has gatewayHubId but is not in the gateway map (stale mapping)`,
    );
  }
}

// 1c. Every map entry must be non-empty in the opposite set (parent and
//     gateway are mutually exclusive).
for (const destinationId of parentIds) {
  if (gatewayIds.has(destinationId)) {
    failures.push(
      `destination '${destinationId}' appears in both the containment and gateway maps`,
    );
  }
  if (unparentedIds.has(destinationId)) {
    failures.push(
      `destination '${destinationId}' appears in both the containment map and the unparented list`,
    );
  }
}
for (const destinationId of gatewayIds) {
  if (unparentedIds.has(destinationId)) {
    failures.push(
      `destination '${destinationId}' appears in both the gateway map and the unparented list`,
    );
  }
}

if (failures.length > 0) {
  console.error(`FAILED relationship validation (${failures.length}):`);
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

// 1d. Strip the legacy top-level hubId field. It duplicates
//     relationships.parentDestinationId, is not part of the Destination type,
//     and is not read by application code.
let strippedHubIds = 0;
for (const destination of destinations) {
  if ("hubId" in destination) {
    delete (destination as Record<string, unknown>).hubId;
    strippedHubIds++;
  }
}

// 2. Reconcile: apply only records that differ so untouched records keep their
//    exact serialization (minimal diff) while removed mappings propagate.
const managedIds = new Set([
  ...parentFor.keys(),
  ...gatewayFor.keys(),
  ...UNPARENTED_DESTINATION_IDS,
]);

let applied = 0;
for (const destination of destinations) {
  if (!managedIds.has(destination.id)) continue;
  const desiredParent = parentFor.get(destination.id);
  const desiredGateway = gatewayFor.get(destination.id);
  const current = destination.relationships ?? {};
  const currentParent = current.parentDestinationId;
  const currentGateway = current.gatewayHubId;

  if (currentParent === desiredParent && currentGateway === desiredGateway) {
    continue;
  }

  if (!destination.relationships) {
    destination.relationships = {};
  }
  if (desiredParent) {
    destination.relationships.parentDestinationId = desiredParent;
  } else {
    delete destination.relationships.parentDestinationId;
  }
  if (desiredGateway) {
    destination.relationships.gatewayHubId = desiredGateway;
  } else {
    delete destination.relationships.gatewayHubId;
  }
  if (Object.keys(destination.relationships).length === 0) {
    delete destination.relationships;
  }
  applied++;
}

// 3. Region overrides.
for (const [destinationId, region] of Object.entries(REGION_OVERRIDES)) {
  const destination = byId.get(destinationId);
  if (destination) {
    destination.region = region;
  }
}

// 4. Assign municipalityId: hubs derive it from their id; contained
//    destinations inherit the parent hub's municipality. Two passes so a
//    destination that appears before its parent hub in the array still inherits.
let municipalityAssigned = 0;
for (const destination of destinations) {
  if (destination.role !== "hub") continue;
  const derived =
    HUB_MUNICIPALITY_OVERRIDES[destination.id] ||
    destination.id.replace(/-(city|town|village|ward)$/, "");
  if (destination.municipalityId !== derived) {
    destination.municipalityId = derived;
    municipalityAssigned++;
  }
}
for (const destination of destinations) {
  if (destination.role === "hub") continue;
  const parentId = destination.relationships?.parentDestinationId;
  if (!parentId) continue;
  const parent = byId.get(parentId);
  if (
    parent?.municipalityId &&
    destination.municipalityId !== parent.municipalityId
  ) {
    destination.municipalityId = parent.municipalityId;
    municipalityAssigned++;
  }
}

fs.writeFileSync(indexPath, `${JSON.stringify(destinations, null, 2)}\n`);
console.log(
  `Relationships reconciled: ${applied} of ${managedIds.size} managed destinations updated (${parentFor.size} containment, ${gatewayFor.size} gateway), ${strippedHubIds} legacy hubId fields stripped, ${municipalityAssigned} municipalityId assignments.`,
);
