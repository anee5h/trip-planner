import type {
  LocalizedPlaceContent,
  SourceReference,
} from "../types/destination";

export const EDITORIAL_PILOT_IDS = [
  "sapporo-city",
  "hakodate-city",
  "sendai-city",
  "chiyoda-city",
  "yokohama-city",
  "hakone-town",
  "nikko-city",
  "nagoya-city",
  "matsumoto-city",
  "kyoto-city",
  "osaka-city",
  "kobe-city",
  "nara-city",
  "hiroshima-city",
  "takamatsu-city",
  "fukuoka-city",
  "nagasaki-city",
  "kumamoto-city",
  "kagoshima-city",
  "naha-city",
] as const;

/**
 * The first production migration cohort. A place belongs here only when it is
 * a municipality-level hub; membership is deliberately separate from publication so
 * that the QA dashboard can show honest progress while research is underway.
 */
export const PHASE_ONE_COHORT_IDS = [
  ...EDITORIAL_PILOT_IDS,
  "aomori-city",
  "morioka-city",
  "akita-city",
  "yamagata-city",
  "fukushima-city",
  "koriyama-city",
  "asahikawa-city",
  "otaru-city",
  "hirosaki-city",
  "hachinohe-city",
  "chiba-city",
  "saitama-city",
  "kawasaki-city",
  "kamakura-city",
  "fujisawa-city",
  "matsudo-city",
  "kawagoe-city",
  "mito-city",
  "utsunomiya-city",
  "kofu-city",
  "shizuoka-city",
  "hamamatsu-city",
  "gifu-city",
  "okayama-city",
  "matsuyama-city",
  "kochi-city",
  "kitakyushu-city",
  "miyazaki-city",
  "beppu-city",
  "ishigaki-city",
] as const;

/** The first fully reviewed hub-to-destination vertical slice. */
export const YOKOHAMA_GOLD_STANDARD_DESTINATION_IDS = [
  "cup-noodles-museum-yokohama",
  "hakkeijima",
  "kannai-yokohama",
  "minato-mirai-yokohama",
  "shin-yokohama-ramen-museum",
  "soji-ji-yokohama",
  "yamashita-park-yokohama",
  "yokohama-chinatown",
  "yokohama-cosmo-world",
  "yokohama-landmark-tower-sky-garden",
  "yokohama-marine-tower",
  "yokohama-red-brick-warehouse",
  "yokohama-zoorasia",
  "kirin-beer-yokohama-factory",
] as const;

type PilotRecord = {
  en?: LocalizedPlaceContent;
  ja: LocalizedPlaceContent;
  source: SourceReference;
};

const reviewedAt = "2026-07-28";
const wikipedia = (title: string): SourceReference => ({
  type: "wikipedia",
  title: `${title} — ウィキペディア`,
  url: `https://ja.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
  accessedAt: reviewedAt,
});
const official = (title: string, url: string): SourceReference => ({
  type: "official",
  title,
  url,
  accessedAt: reviewedAt,
});

export const EDITORIAL_PILOT: Record<string, PilotRecord> = {
  "sapporo-city": {
    ja: {
      name: "札幌",
      description:
        "北海道の政治・経済・観光の中心都市です。大通公園を軸に、近代建築、雪のイベント、海産物やラーメンなどの食文化を楽しめます。",
      highlights: [
        "大通公園と札幌市時計台",
        "さっぽろ雪まつり（冬）",
        "味噌ラーメンと海鮮",
      ],
    },
    source: wikipedia("札幌市"),
  },
  "hakodate-city": {
    ja: {
      name: "函館",
      description:
        "開港の歴史を伝える港町です。異国情緒のある元町、函館山からの夜景、朝市の海産物まで、徒歩と市電で巡りやすい街です。",
      highlights: ["函館山からの夜景", "元町・ベイエリア", "函館朝市"],
    },
    source: wikipedia("函館市"),
  },
  "sendai-city": {
    ja: {
      name: "仙台",
      description:
        "並木と広瀬川に囲まれた東北最大級の都市で、「杜の都」として親しまれています。伊達政宗ゆかりの史跡と、牛たんをはじめとする食文化が魅力です。",
      highlights: ["仙台城跡", "定禅寺通", "牛たん"],
    },
    source: wikipedia("仙台市"),
  },
  "chiyoda-city": {
    ja: {
      name: "千代田",
      description:
        "皇居、東京駅、秋葉原などを含む東京の中枢エリアです。歴史的な官庁街と鉄道の玄関口、ポップカルチャーの街を一日で横断できます。",
      highlights: ["皇居東御苑", "東京駅・丸の内", "秋葉原"],
    },
    source: wikipedia("千代田区"),
  },
  "yokohama-city": {
    ja: {
      name: "横浜",
      description:
        "港を起点に発展した国際色豊かな都市です。みなとみらいの海辺の景観、山下公園、中華街など、開港の歴史と現代の街並みが共存します。",
      highlights: ["みなとみらい", "横浜中華街", "山下公園"],
    },
    source: wikipedia("横浜市"),
  },
  "hakone-town": {
    ja: {
      name: "箱根",
      description:
        "温泉、芦ノ湖、火山地形が織りなす山の保養地です。美術館や旧街道もあり、天候がよければ湖畔や高台から富士山を望めます。",
      highlights: ["芦ノ湖", "温泉", "大涌谷"],
    },
    source: wikipedia("箱根町"),
  },
  "nikko-city": {
    ja: {
      name: "日光",
      description:
        "徳川家康をまつる日光東照宮をはじめとする世界遺産の社寺と、奥日光の自然を併せて訪ねられる都市です。季節ごとに滝、湖、紅葉の景観が変わります。",
      highlights: ["日光東照宮", "華厳滝", "中禅寺湖"],
    },
    source: wikipedia("日光市"),
  },
  "nagoya-city": {
    ja: {
      name: "名古屋",
      description:
        "中部地方の交通・産業の中心都市です。名古屋城をはじめとする歴史資産と、ものづくりの文化、味噌かつやひつまぶしなどの食が旅の軸になります。",
      highlights: ["名古屋城", "熱田神宮", "なごやめし"],
    },
    source: wikipedia("名古屋市"),
  },
  "matsumoto-city": {
    ja: {
      name: "松本",
      description:
        "国宝松本城を中心に城下町の面影を残す高原都市です。美術館や湧水のある街歩きと、北アルプス方面への旅を組み合わせやすい拠点です。",
      highlights: ["国宝松本城", "中町通り", "北アルプスへの玄関口"],
    },
    source: wikipedia("松本市"),
  },
  "kyoto-city": {
    ja: {
      name: "京都",
      description:
        "千年以上にわたり都として栄えた歴史都市です。寺社、庭園、町家、食文化が市内各地に残り、季節ごとに異なる表情を見せます。",
      highlights: ["清水寺・金閣寺", "祇園と町家", "嵐山"],
    },
    source: wikipedia("京都市"),
  },
  "osaka-city": {
    ja: {
      name: "大阪",
      description:
        "商人の街として育った関西最大の都市です。大阪城、道頓堀、梅田などに歴史・娯楽・商業が集まり、粉ものから市場の食まで気軽に楽しめます。",
      highlights: ["大阪城", "道頓堀", "大阪の食文化"],
    },
    source: wikipedia("大阪市"),
  },
  "kobe-city": {
    ja: {
      name: "神戸",
      description:
        "山と海に挟まれた港町で、開港以来の国際的な文化を受け継いでいます。異人館、港の夜景、洋食や神戸牛などを組み合わせて楽しめます。",
      highlights: ["北野異人館街", "神戸港", "神戸牛"],
    },
    source: wikipedia("神戸市"),
  },
  "nara-city": {
    ja: {
      name: "奈良",
      description:
        "古代日本の都として栄えた歴史都市です。奈良公園を中心に、東大寺や春日大社などの世界遺産と、鹿がいる広い緑地を歩いて巡れます。",
      highlights: ["東大寺", "奈良公園", "春日大社"],
    },
    source: wikipedia("奈良市"),
  },
  "hiroshima-city": {
    ja: {
      name: "広島",
      description:
        "平和記念公園と原爆ドームを通じて平和の歴史を学べる中国地方の中心都市です。川辺の街並み、現代美術、牡蠣やお好み焼きも旅の魅力です。",
      highlights: ["平和記念公園", "原爆ドーム", "広島お好み焼き"],
    },
    source: wikipedia("広島市"),
  },
  "takamatsu-city": {
    ja: {
      name: "高松",
      description:
        "瀬戸内海に面する香川の県都で、島々への船旅と市内観光の拠点です。大名庭園の栗林公園と、讃岐うどんの店巡りを楽しめます。",
      highlights: ["栗林公園", "高松港", "讃岐うどん"],
    },
    source: wikipedia("高松市"),
  },
  "fukuoka-city": {
    ja: {
      name: "福岡",
      description:
        "九州の交通・商業の中心都市です。博多の歴史、屋台文化、海辺の再開発エリアが近く、九州各地へ向かう起点としても便利です。",
      highlights: ["博多旧市街", "屋台", "シーサイドももち"],
    },
    source: wikipedia("福岡市"),
  },
  "nagasaki-city": {
    ja: {
      name: "長崎",
      description:
        "海外との交流で育まれた独自の文化が残る港町です。坂道の景観、出島や教会群、平和を伝える場所を通して、多層的な歴史に触れられます。",
      highlights: ["出島", "平和公園", "グラバー園"],
    },
    source: wikipedia("長崎市"),
  },
  "kumamoto-city": {
    ja: {
      name: "熊本",
      description:
        "熊本城を中心に発展した九州の城下町です。湧水に支えられた暮らしと商店街、阿蘇方面へ向かう交通の利便性が旅の特徴です。",
      highlights: ["熊本城", "水前寺成趣園", "地下水文化"],
    },
    source: wikipedia("熊本市"),
  },
  "kagoshima-city": {
    ja: {
      name: "鹿児島",
      description:
        "錦江湾越しに桜島を望む南九州の都市です。市電で巡る市街地、温泉、火山と海の景観、黒豚や焼酎などの食文化を楽しめます。",
      highlights: ["桜島の眺望", "城山公園", "黒豚と焼酎"],
    },
    source: wikipedia("鹿児島市"),
  },
  "naha-city": {
    ja: {
      name: "那覇",
      description:
        "沖縄県の県都で、琉球王国の歴史と現代の商業が交わる都市です。首里エリア、国際通り、市場を巡りながら、島の食と文化に触れられます。",
      highlights: ["首里城公園", "国際通り", "第一牧志公設市場"],
    },
    source: wikipedia("那覇市"),
  },
  "aomori-city": {
    en: {
      name: "Aomori City",
      description:
        "A northern port city known for the Aomori Nebuta Festival and for its role as a gateway to Aomori Prefecture's Jomon heritage.",
      highlights: [
        "Aomori Nebuta Festival",
        "Nebuta Museum WA RASSE",
        "Sannai-Maruyama site",
      ],
    },
    ja: {
      name: "青森",
      description:
        "青森ねぶた祭で知られる北国の港町です。三内丸山遺跡など、青森県の縄文文化を訪ねる拠点にもなります。",
      highlights: ["青森ねぶた祭", "ねぶたの家 ワ・ラッセ", "三内丸山遺跡"],
    },
    source: wikipedia("青森市"),
  },
  "morioka-city": {
    en: {
      name: "Morioka City",
      description:
        "Iwate's castle-town capital lies where the Kitakami and Nakatsu rivers meet, with historic parks and a distinctive local noodle culture.",
      highlights: [
        "Morioka Castle Site Park",
        "Kitakami riverfront",
        "Morioka noodles",
      ],
    },
    ja: {
      name: "盛岡",
      description:
        "北上川と中津川が合流する岩手県の県都です。城跡公園や川辺の風景と、わんこそば・じゃじゃ麺・盛岡冷麺の食文化を楽しめます。",
      highlights: ["盛岡城跡公園", "北上川の河畔", "盛岡三大麺"],
    },
    source: wikipedia("盛岡市"),
  },
  "akita-city": {
    en: {
      name: "Akita City",
      description:
        "Akita Prefecture's capital is known for the summer Kanto Matsuri, Senshu Park, and food culture shaped by the Sea of Japan region.",
      highlights: ["Kanto Matsuri", "Senshu Park", "Akita food culture"],
    },
    ja: {
      name: "秋田",
      description:
        "竿燈まつりで知られる秋田県の県都です。千秋公園を中心とした城下町の面影と、日本海側ならではの食文化に触れられます。",
      highlights: ["秋田竿燈まつり", "千秋公園", "秋田の食文化"],
    },
    source: wikipedia("秋田市"),
  },
  "yamagata-city": {
    en: {
      name: "Yamagata City",
      description:
        "Yamagata Prefecture's capital is a convenient base for the castle-town park, Yamadera, and the Zao mountain area.",
      highlights: ["Kajo Park", "Yamadera access", "Zao gateway"],
    },
    ja: {
      name: "山形",
      description:
        "霞城公園を中心に城下町の歴史を伝える山形県の県都です。山寺や蔵王方面への旅の拠点としても便利です。",
      highlights: ["霞城公園", "山寺へのアクセス", "蔵王への玄関口"],
    },
    source: wikipedia("山形市"),
  },
  "fukushima-city": {
    en: {
      name: "Fukushima City",
      description:
        "Set in a basin between mountain ranges, Fukushima's prefectural capital is known for fruit growing, Iizaka Onsen, and views toward the Azuma Mountains.",
      highlights: ["Fruit orchards", "Iizaka Onsen", "Azuma Mountains"],
    },
    ja: {
      name: "福島",
      description:
        "山々に囲まれた盆地に広がる福島県の県都です。果樹園、飯坂温泉、吾妻連峰の景観を組み合わせて楽しめます。",
      highlights: ["くだもの狩り", "飯坂温泉", "吾妻連峰"],
    },
    source: wikipedia("福島市"),
  },
  "koriyama-city": {
    en: {
      name: "Koriyama City",
      description:
        "A central Fukushima commercial and transport hub, Koriyama is a practical base for Lake Inawashiro and the Bandai area.",
      highlights: ["Asaka Canal", "Lake Inawashiro access", "Bandai gateway"],
    },
    ja: {
      name: "郡山",
      description:
        "福島県の中央に位置する商業・交通の拠点です。安積疏水の歴史に触れながら、猪苗代湖や磐梯エリアへ向かう基点として使えます。",
      highlights: ["安積疏水", "猪苗代湖へのアクセス", "磐梯エリアの玄関口"],
    },
    source: wikipedia("郡山市"),
  },
  "asahikawa-city": {
    en: {
      name: "Asahikawa City",
      description:
        "Hokkaido's second-largest city is known for Asahiyama Zoo, soy-sauce ramen, and access to the Daisetsuzan mountain area.",
      highlights: ["Asahiyama Zoo", "Asahikawa ramen", "Daisetsuzan gateway"],
    },
    ja: {
      name: "旭川",
      description:
        "旭山動物園、旭川ラーメン、大雪山方面へのアクセスで知られる北海道第二の都市です。",
      highlights: ["旭山動物園", "旭川ラーメン", "大雪山への玄関口"],
    },
    source: wikipedia("旭川市"),
  },
  "otaru-city": {
    en: {
      name: "Otaru City",
      description:
        "A historic canal port near Sapporo, Otaru is known for stone warehouses, glasscraft, and seafood restaurants.",
      highlights: ["Otaru Canal", "Historic warehouses", "Glass and seafood"],
    },
    ja: {
      name: "小樽",
      description:
        "札幌から訪れやすい歴史ある港町です。運河沿いの石造倉庫、ガラス工芸、海産物を楽しめます。",
      highlights: ["小樽運河", "石造倉庫", "ガラスと海鮮"],
    },
    source: wikipedia("小樽市"),
  },
  "hirosaki-city": {
    en: {
      name: "Hirosaki City",
      description:
        "A former castle town famed for Hirosaki Castle and one of Japan's best-known cherry-blossom festivals, with apples central to local culture.",
      highlights: ["Hirosaki Castle", "Hirosaki Park", "Apple culture"],
    },
    ja: {
      name: "弘前",
      description:
        "弘前城と桜の名所として知られる城下町です。りんご文化も街の大きな特色です。",
      highlights: ["弘前城", "弘前公園", "りんご文化"],
    },
    source: wikipedia("弘前市"),
  },
  "hachinohe-city": {
    en: {
      name: "Hachinohe City",
      description:
        "A Pacific port city in southeastern Aomori known for seafood, morning markets, and access to the Tanesashi Coast.",
      highlights: ["Morning markets", "Tanesashi Coast", "Seafood"],
    },
    ja: {
      name: "八戸",
      description:
        "青森県南東部の太平洋側にある港町です。朝市や海産物、種差海岸へのアクセスが魅力です。",
      highlights: ["朝市", "種差海岸", "海産物"],
    },
    source: wikipedia("八戸市"),
  },
  "chiba-city": {
    en: {
      name: "Chiba City",
      description:
        "Chiba Prefecture's capital faces Tokyo Bay and combines a waterfront city center with parks, museums, and access to the Boso Peninsula.",
      highlights: ["Chiba Port Tower", "Chiba Park", "Boso gateway"],
    },
    ja: {
      name: "千葉",
      description:
        "東京湾に面する千葉県の県都です。港の景観、公園や文化施設を巡りながら房総方面への旅の拠点にもなります。",
      highlights: ["千葉ポートタワー", "千葉公園", "房総への玄関口"],
    },
    source: wikipedia("千葉市"),
  },
  "saitama-city": {
    en: {
      name: "Saitama City",
      description:
        "Saitama Prefecture's capital is a major rail hub formed around Omiya and Urawa, with railway heritage, parks, and a professional sports culture.",
      highlights: [
        "Omiya Railway Museum",
        "Omiya Bonsai Village",
        "Saitama Shintoshin",
      ],
    },
    ja: {
      name: "さいたま",
      description:
        "大宮・浦和を中心に発展した埼玉県の県都です。鉄道文化、盆栽、美術館や大規模イベント施設を訪ねられます。",
      highlights: ["鉄道博物館", "大宮盆栽村", "さいたま新都心"],
    },
    source: wikipedia("さいたま市"),
  },
  "kawasaki-city": {
    en: {
      name: "Kawasaki City",
      description:
        "Between Tokyo and Yokohama, Kawasaki combines industrial heritage, Kawasaki Daishi, and museums with a diverse urban food scene.",
      highlights: ["Kawasaki Daishi", "Fujiko F. Fujio Museum", "Tama River"],
    },
    ja: {
      name: "川崎",
      description:
        "東京と横浜の間に広がる都市です。川崎大師、ミュージアム、工業地帯の夜景や多彩な食文化を楽しめます。",
      highlights: ["川崎大師", "藤子・F・不二雄ミュージアム", "多摩川"],
    },
    source: wikipedia("川崎市"),
  },
  "kamakura-city": {
    en: {
      name: "Kamakura City",
      description:
        "A former samurai capital between hills and the sea, Kamakura is known for temples, the Great Buddha, and seasonal walks.",
      highlights: ["Great Buddha", "Hasedera", "Temple walks"],
    },
    ja: {
      name: "鎌倉",
      description:
        "山と海に囲まれた武家の古都です。大仏や寺社を巡り、季節の花と古道の散策を楽しめます。",
      highlights: ["鎌倉大仏", "長谷寺", "寺社めぐり"],
    },
    source: wikipedia("鎌倉市"),
  },
  "fujisawa-city": {
    en: {
      name: "Fujisawa City",
      description:
        "A Shonan coastal city and gateway to Enoshima, with beaches and the Enoden railway linking the area to Kamakura.",
      highlights: ["Enoshima", "Shonan coast", "Enoden"],
    },
    ja: {
      name: "藤沢",
      description:
        "江の島の玄関口となる湘南の海辺の都市です。海岸散策や江ノ電を使った鎌倉方面の旅を楽しめます。",
      highlights: ["江の島", "湘南海岸", "江ノ電"],
    },
    source: wikipedia("藤沢市"),
  },
  "matsudo-city": {
    en: {
      name: "Matsudo City",
      description:
        "A city on the Edo River in northwestern Chiba, Matsudo offers the historic Tojo-tei residence and the Yagiri ferry crossing.",
      highlights: ["Tojo-tei", "Yagiri ferry", "Edo River"],
    },
    ja: {
      name: "松戸",
      description:
        "千葉県北西部、江戸川沿いにある都市です。戸定邸や矢切の渡しを通じて、江戸川の歴史に触れられます。",
      highlights: ["戸定邸", "矢切の渡し", "江戸川"],
    },
    source: wikipedia("松戸市"),
  },
  "kawagoe-city": {
    en: {
      name: "Kawagoe City",
      description:
        "Known as Little Edo, Kawagoe preserves warehouse-lined streets, the Bell of Time, and a lively confectionery district.",
      highlights: ["Kurazukuri Street", "Bell of Time", "Kashiya Yokocho"],
    },
    ja: {
      name: "川越",
      description:
        "「小江戸」として親しまれる城下町です。蔵造りの町並み、時の鐘、菓子屋横丁を歩いて巡れます。",
      highlights: ["蔵造りの町並み", "時の鐘", "菓子屋横丁"],
    },
    source: wikipedia("川越市"),
  },
  "mito-city": {
    en: {
      name: "Mito City",
      description:
        "Ibaraki's prefectural capital is known for Kairakuen, one of Japan's Three Great Gardens, particularly during the plum-blossom season.",
      highlights: ["Kairakuen", "Plum blossoms", "Mito Castle area"],
    },
    ja: {
      name: "水戸",
      description:
        "偕楽園で知られる茨城県の県都です。梅の季節をはじめ、水戸城跡周辺の歴史と庭園文化を楽しめます。",
      highlights: ["偕楽園", "梅まつり", "水戸城跡周辺"],
    },
    source: wikipedia("水戸市"),
  },
  "utsunomiya-city": {
    en: {
      name: "Utsunomiya City",
      description:
        "Tochigi's capital is widely associated with gyoza and is a useful base for the Oya stone area and northern Tochigi.",
      highlights: ["Utsunomiya gyoza", "Oya stone area", "Futaarayama Shrine"],
    },
    ja: {
      name: "宇都宮",
      description:
        "餃子の街として知られる栃木県の県都です。大谷石の産地や市街地の社寺を訪ねる拠点になります。",
      highlights: ["宇都宮餃子", "大谷石エリア", "宇都宮二荒山神社"],
    },
    source: wikipedia("宇都宮市"),
  },
  "kofu-city": {
    en: {
      name: "Kofu City",
      description:
        "Yamanashi's capital is associated with Takeda Shingen and is a base for Kofu Basin vineyards, Shosenkyo Gorge, and mountain views.",
      highlights: ["Maizuru Castle Park", "Shosenkyo access", "Wine country"],
    },
    ja: {
      name: "甲府",
      description:
        "武田信玄ゆかりの山梨県の県都です。舞鶴城公園、昇仙峡、甲府盆地のワイン産地を巡る拠点になります。",
      highlights: ["舞鶴城公園", "昇仙峡へのアクセス", "ワイン文化"],
    },
    source: wikipedia("甲府市"),
  },
  "shizuoka-city": {
    en: {
      name: "Shizuoka City",
      description:
        "Shizuoka Prefecture's capital combines Sunpu Castle history, tea culture, and views toward Mount Fuji from the Nihondaira area.",
      highlights: ["Sunpu Castle Park", "Nihondaira", "Tea culture"],
    },
    ja: {
      name: "静岡",
      description:
        "駿府城の歴史、茶の文化、日本平からの富士山の眺望を楽しめる静岡県の県都です。",
      highlights: ["駿府城公園", "日本平", "お茶の文化"],
    },
    source: wikipedia("静岡市"),
  },
  "hamamatsu-city": {
    en: {
      name: "Hamamatsu City",
      description:
        "A large city on the Pacific side of Shizuoka, Hamamatsu is known for Lake Hamana, musical-instrument manufacturing, and gyoza.",
      highlights: ["Lake Hamana", "Hamamatsu Castle", "Hamamatsu gyoza"],
    },
    ja: {
      name: "浜松",
      description:
        "浜名湖に近い静岡県西部の都市です。楽器産業、浜松城、浜松餃子などが旅の見どころになります。",
      highlights: ["浜名湖", "浜松城", "浜松餃子"],
    },
    source: wikipedia("浜松市"),
  },
  "gifu-city": {
    en: {
      name: "Gifu City",
      description:
        "A historic city on the Nagara River, Gifu is known for Gifu Castle on Mount Kinka and traditional cormorant fishing.",
      highlights: [
        "Gifu Castle",
        "Mount Kinka",
        "Nagara River cormorant fishing",
      ],
    },
    ja: {
      name: "岐阜",
      description:
        "長良川沿いに広がる歴史都市です。金華山の岐阜城と、夏の長良川鵜飼で知られます。",
      highlights: ["岐阜城", "金華山", "長良川鵜飼"],
    },
    source: wikipedia("岐阜市"),
  },
  "okayama-city": {
    en: {
      name: "Okayama City",
      description:
        "A sunny Setouchi city known for Korakuen Garden, Okayama Castle, and its role as a rail gateway to western Japan.",
      highlights: ["Korakuen Garden", "Okayama Castle", "Momotaro culture"],
    },
    ja: {
      name: "岡山",
      description:
        "後楽園と岡山城で知られる瀬戸内の都市です。桃太郎にまつわる文化にも触れながら、西日本の旅の拠点として使えます。",
      highlights: ["岡山後楽園", "岡山城", "桃太郎文化"],
    },
    source: wikipedia("岡山市"),
  },
  "matsuyama-city": {
    en: {
      name: "Matsuyama City",
      description:
        "Shikoku's largest city is known for Matsuyama Castle, Dogo Onsen, and a compact streetcar-connected center.",
      highlights: ["Matsuyama Castle", "Dogo Onsen", "Streetcar cityscape"],
    },
    ja: {
      name: "松山",
      description:
        "松山城と道後温泉で知られる四国最大の都市です。路面電車を使って城下町と温泉街を巡れます。",
      highlights: ["松山城", "道後温泉", "路面電車"],
    },
    source: wikipedia("松山市"),
  },
  "kochi-city": {
    en: {
      name: "Kochi City",
      description:
        "Kochi's prefectural capital is known for its original wooden castle, Hirome Market, and food culture shaped by the Pacific coast.",
      highlights: ["Kochi Castle", "Hirome Market", "Katsuo tataki"],
    },
    ja: {
      name: "高知",
      description:
        "現存天守の高知城とひろめ市場で知られる高知県の県都です。太平洋に育まれたかつお料理も街の魅力です。",
      highlights: ["高知城", "ひろめ市場", "かつおのたたき"],
    },
    source: wikipedia("高知市"),
  },
  "kitakyushu-city": {
    en: {
      name: "Kitakyushu City",
      description:
        "A major port city in northern Kyushu with Kokura Castle, the Mojiko Retro waterfront, and industrial heritage.",
      highlights: ["Kokura Castle", "Mojiko Retro", "Kanmon Strait"],
    },
    ja: {
      name: "北九州",
      description:
        "九州北部の港湾都市です。小倉城、門司港レトロ、関門海峡の景観と近代産業の歴史を訪ねられます。",
      highlights: ["小倉城", "門司港レトロ", "関門海峡"],
    },
    source: wikipedia("北九州市"),
  },
  "miyazaki-city": {
    en: {
      name: "Miyazaki City",
      description:
        "A warm Pacific-coast city known for Aoshima, seaside scenery, and food culture including Miyazaki beef and chicken dishes.",
      highlights: ["Aoshima", "Nichinan coast", "Miyazaki cuisine"],
    },
    ja: {
      name: "宮崎",
      description:
        "太平洋に面する温暖な都市です。青島や日南海岸の景観、宮崎牛や鶏料理などの食文化を楽しめます。",
      highlights: ["青島", "日南海岸", "宮崎の食文化"],
    },
    source: wikipedia("宮崎市"),
  },
  "beppu-city": {
    en: {
      name: "Beppu City",
      description:
        "One of Japan's best-known hot-spring cities, Beppu is famous for its abundant geothermal activity and the Beppu Hells sightseeing route.",
      highlights: ["Beppu Hells", "Hot-spring bathing", "Steam-filled streets"],
    },
    ja: {
      name: "別府",
      description:
        "豊かな湧出量で知られる日本有数の温泉都市です。地熱の景観を巡る地獄めぐりと、多彩な温泉を楽しめます。",
      highlights: ["別府地獄めぐり", "温泉", "湯けむりの街並み"],
    },
    source: wikipedia("別府市"),
  },
  "ishigaki-city": {
    en: {
      name: "Ishigaki City",
      description:
        "The main urban base of the Yaeyama Islands, Ishigaki offers access to island ferries, beaches, coral reefs, and dark-sky views.",
      highlights: ["Kabira Bay", "Yaeyama island ferries", "Coral reefs"],
    },
    ja: {
      name: "石垣",
      description:
        "八重山諸島の玄関口となる島の都市です。川平湾、離島航路、海やサンゴ礁の景観を楽しめます。",
      highlights: ["川平湾", "八重山の離島航路", "サンゴ礁"],
    },
    source: wikipedia("石垣市"),
  },
  "cup-noodles-museum-yokohama": {
    en: {
      name: "Cup Noodles Museum Yokohama",
      description:
        "An interactive museum about instant noodles, with exhibits on their history and hands-on experiences including making an original cup noodle.",
      highlights: [
        "Instant noodle history",
        "My CUPNOODLES Factory",
        "Creative workshops",
      ],
    },
    ja: {
      name: "カップヌードルミュージアム 横浜",
      description:
        "インスタントラーメンの歴史と創造性を体験できるミュージアムです。オリジナルのカップヌードル作りなどの体験もあります。",
      highlights: [
        "インスタントラーメンの歴史",
        "マイカップヌードルファクトリー",
        "体験型展示",
      ],
    },
    source: wikipedia("カップヌードルミュージアム 横浜"),
  },
  hakkeijima: {
    en: {
      name: "Yokohama Hakkeijima Sea Paradise",
      description:
        "A waterfront leisure complex on Hakkeijima with aquariums, rides, restaurants, and views of Tokyo Bay.",
      highlights: ["Aquariums", "Amusement rides", "Tokyo Bay views"],
    },
    ja: {
      name: "横浜・八景島シーパラダイス",
      description:
        "八景島にある水族館とアトラクションの複合レジャー施設です。東京湾の景色とともに海の生きものや乗り物を楽しめます。",
      highlights: ["水族館", "アトラクション", "東京湾の景色"],
    },
    source: wikipedia("横浜・八景島シーパラダイス"),
  },
  "kannai-yokohama": {
    en: {
      name: "Kannai",
      description:
        "A central Yokohama district between the port and Isezakicho, with government buildings, stadium events, restaurants, and access to nearby historic neighborhoods.",
      highlights: ["Yokohama Stadium", "Isezakicho", "Port-area access"],
    },
    ja: {
      name: "関内",
      description:
        "港と伊勢佐木町の間に広がる横浜中心部のエリアです。横浜スタジアム、官庁街、飲食店街から周辺の歴史地区へ歩けます。",
      highlights: ["横浜スタジアム", "伊勢佐木町", "港エリアへのアクセス"],
    },
    source: wikipedia("関内"),
  },
  "minato-mirai-yokohama": {
    en: {
      name: "Minato Mirai",
      description:
        "Yokohama's waterfront district combines landmark towers, museums, shopping, hotels, and promenades around the historic port area.",
      highlights: [
        "Waterfront skyline",
        "Museums and shopping",
        "Harbor promenades",
      ],
    },
    ja: {
      name: "みなとみらい",
      description:
        "横浜港沿いに広がるウォーターフロント地区です。高層ビル、ミュージアム、商業施設、海辺の遊歩道を組み合わせて楽しめます。",
      highlights: [
        "ウォーターフロントの景観",
        "ミュージアムと買い物",
        "海辺の散策",
      ],
    },
    source: wikipedia("みなとみらい"),
  },
  "shin-yokohama-ramen-museum": {
    en: {
      name: "Shin-Yokohama Ramen Museum",
      description:
        "A ramen-themed food and cultural attraction with a retro streetscape and shops representing regional ramen styles.",
      highlights: ["Regional ramen", "Retro streetscape", "Ramen history"],
    },
    ja: {
      name: "新横浜ラーメン博物館",
      description:
        "レトロな街並みの中で各地のラーメンを味わえる、ラーメンをテーマにしたフード・文化施設です。",
      highlights: ["各地のラーメン", "昭和レトロの街並み", "ラーメン文化"],
    },
    source: wikipedia("新横浜ラーメン博物館"),
  },
  "soji-ji-yokohama": {
    en: {
      name: "Soji-ji Temple",
      description:
        "The head temple of the Soto school of Zen Buddhism, with a large temple precinct in Tsurumi and an important role in modern Zen training.",
      highlights: ["Soto Zen head temple", "Temple precinct", "Tsurumi"],
    },
    ja: {
      name: "總持寺",
      description:
        "鶴見にある曹洞宗の大本山です。広い境内と伽藍を巡り、禅の修行道場としての歴史に触れられます。",
      highlights: ["曹洞宗大本山", "広い境内", "鶴見"],
    },
    source: wikipedia("總持寺"),
  },
  "yamashita-park-yokohama": {
    en: {
      name: "Yamashita Park",
      description:
        "A waterfront park facing Yokohama Port, with views of ships and the Bay Bridge, close to Chinatown and the Marine Tower.",
      highlights: ["Port views", "Hikawa Maru", "Chinatown walk"],
    },
    ja: {
      name: "山下公園",
      description:
        "横浜港に面する海辺の公園です。船やベイブリッジを眺めながら散策でき、中華街やマリンタワーにも近接しています。",
      highlights: ["港の景観", "氷川丸", "中華街の散策"],
    },
    source: wikipedia("山下公園"),
  },
  "yokohama-chinatown": {
    en: {
      name: "Yokohama Chinatown",
      description:
        "One of Japan's best-known Chinatowns, with Chinese restaurants, food stalls, temples, and colorful gates near Yokohama's port.",
      highlights: ["Chinese cuisine", "Kanteibyo Temple", "Colorful gates"],
    },
    ja: {
      name: "横浜中華街",
      description:
        "横浜港に近い日本有数の中華街です。中華料理店、食べ歩き、関帝廟、華やかな牌楼を巡れます。",
      highlights: ["中華料理", "関帝廟", "牌楼"],
    },
    source: wikipedia("横浜中華街"),
  },
  "yokohama-cosmo-world": {
    en: {
      name: "Yokohama Cosmo World",
      description:
        "A waterfront amusement park in Minato Mirai, known for its large Ferris wheel and rides beside the harbor skyline.",
      highlights: ["Cosmo Clock 21", "Waterfront rides", "Night skyline"],
    },
    ja: {
      name: "よこはまコスモワールド",
      description:
        "みなとみらいの海辺にある遊園地です。大観覧車「コスモクロック21」と港の夜景を楽しめます。",
      highlights: ["コスモクロック21", "海辺のアトラクション", "夜景"],
    },
    source: wikipedia("よこはまコスモワールド"),
  },
  "yokohama-landmark-tower-sky-garden": {
    en: {
      name: "Yokohama Landmark Tower Sky Garden",
      description:
        "An observation deck high in Yokohama Landmark Tower, with broad views over Minato Mirai, Yokohama Port, and surrounding areas on clear days.",
      highlights: ["Observation deck", "Minato Mirai panorama", "Harbor views"],
    },
    ja: {
      name: "横浜ランドマークタワー スカイガーデン",
      description:
        "横浜ランドマークタワー高層階の展望フロアです。晴れた日にはみなとみらい、横浜港、周辺の広い景色を望めます。",
      highlights: ["展望フロア", "みなとみらいのパノラマ", "港の眺望"],
    },
    source: wikipedia("横浜ランドマークタワー"),
  },
  "yokohama-marine-tower": {
    en: {
      name: "Yokohama Marine Tower",
      description:
        "A port-side observation tower near Yamashita Park, offering views over Yokohama's waterfront and the surrounding city.",
      highlights: ["Observation deck", "Yamashita Park", "Port panorama"],
    },
    ja: {
      name: "横浜マリンタワー",
      description:
        "山下公園の近くに立つ港の展望塔です。横浜港と市街地を見渡す眺望を楽しめます。",
      highlights: ["展望フロア", "山下公園", "港のパノラマ"],
    },
    source: wikipedia("横浜マリンタワー"),
  },
  "yokohama-red-brick-warehouse": {
    en: {
      name: "Yokohama Red Brick Warehouse",
      description:
        "Historic port warehouses repurposed as shops, restaurants, and event spaces on the Minato Mirai waterfront.",
      highlights: [
        "Historic brick buildings",
        "Shops and dining",
        "Seasonal events",
      ],
    },
    ja: {
      name: "横浜赤レンガ倉庫",
      description:
        "港の歴史を伝える赤レンガ倉庫を活用した商業・イベント施設です。買い物や食事、季節の催しを楽しめます。",
      highlights: ["歴史的な赤レンガ建築", "買い物と食事", "季節のイベント"],
    },
    source: wikipedia("横浜赤レンガ倉庫"),
  },
  "yokohama-zoorasia": {
    en: {
      name: "Yokohama Zoorasia",
      description:
        "A large zoo in Yokohama designed around regional habitat zones, with broad walking routes and animal exhibits.",
      highlights: ["Habitat zones", "Animal exhibits", "Family day out"],
    },
    ja: {
      name: "よこはま動物園ズーラシア",
      description:
        "地域ごとの生息環境を意識した展示を行う横浜の大規模動物園です。広い園内を歩きながら多様な動物を観察できます。",
      highlights: ["生息環境を意識した展示", "多様な動物", "家族での一日"],
    },
    source: wikipedia("よこはま動物園ズーラシア"),
  },
  "kirin-beer-yokohama-factory": {
    en: {
      name: "Kirin Beer Yokohama Factory",
      description:
        "A Kirin Beer production site in Tsurumi, Yokohama. Its booked factory tour introduces the making of Ichiban Shibori beer and includes tasting for eligible visitors.",
      highlights: [
        "Booked factory tours",
        "Ichiban Shibori brewing",
        "Tsurumi location",
      ],
    },
    ja: {
      name: "キリンビール横浜工場",
      description:
        "横浜市鶴見区にあるキリンビールの生産拠点です。予約制の工場見学では、一番搾りの製法を学び、対象者は試飲を体験できます。",
      highlights: ["予約制の工場見学", "一番搾りの製法", "鶴見の立地"],
    },
    source: official(
      "キリンビール 横浜工場",
      "https://www.kirin.co.jp/experience/factory/yokohama/",
    ),
  },
};
