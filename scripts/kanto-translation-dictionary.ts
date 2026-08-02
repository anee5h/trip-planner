export interface KantoTranslationEntry {
  nameJa: string;
  enDescription: string;
  jaDescription: string;
  enHighlights: string[];
  jaHighlights: string[];
}

export const KANTO_TRANSLATION_MAP: Record<string, KantoTranslationEntry> = {
  // --- Tokyo Wards & Major Districts ---
  "adachi-city": {
    nameJa: "足立区",
    enDescription:
      "A vibrant northern Tokyo ward known for the picturesque Arakawa riverfront, historic Senju station area, and traditional downtown shopping streets.",
    jaDescription:
      "荒川の河川敷や歴史ある宿場町の面影を残す北千住周辺を中心に、下町情緒溢れる商店街と親水公園が広がる東京北部のエリアです。",
    enHighlights: [
      "Arakawa Riverfront Park",
      "Kita-Senju Shopping Streets",
      "Toneri Park",
    ],
    jaHighlights: ["荒川河川敷公園", "北千住宿場町商店街", "舎人公園"],
  },
  "akasaka-minato": {
    nameJa: "赤坂",
    enDescription:
      "A sophisticated Minato district featuring Hie Shrine, luxury dining, Tokyo Midtown, and broadcasting headquarters.",
    jaDescription:
      "日吉大社ゆかりの日枝神社、東京ミッドタウン、テレビ局、洗練された料亭やレストランが集まる港区の歴史と現代が交差する街です。",
    enHighlights: ["Hie Shrine", "Tokyo Midtown", "Akasaka Sacas"],
    jaHighlights: ["日枝神社", "東京ミッドタウン", "赤坂サカス"],
  },
  "akihabara-chiyoda": {
    nameJa: "秋葉原",
    enDescription:
      "Japan's global capital for electronics, anime, gaming culture, maid cafes, and iconic multi-story hobby complexes.",
    jaDescription:
      "世界的な電気街であり、アニメ・ゲーム・フィギュアなどのポップカルチャー文化の聖地。ラジオ会館や大型家電店が立ち並びます。",
    enHighlights: [
      "Radio Kaikan",
      "Electric Town Shops",
      "Anime & Gaming Culture",
    ],
    jaHighlights: ["ラジオ会館", "電気街ショッピング", "アニメ・ゲーム文化"],
  },
  "ameya-yokocho": {
    nameJa: "アメ横",
    enDescription:
      "A bustling open-air market street under the train tracks between Ueno and Okachimachi, famous for fresh seafood, clothing, and street food.",
    jaDescription:
      "上野駅から御徒町駅の高架下に広がる活気あふれる商店街。新鮮な海産物、衣料品、多国籍なストリートフードが所狭しと並びます。",
    enHighlights: [
      "Bustling Market Street",
      "Fresh Seafood & Snacks",
      "Under-Track Shopping",
    ],
    jaHighlights: [
      "活気ある市場通り",
      "新鮮な海鮮と屋台グルメ",
      "高架下の商店街",
    ],
  },
  "arakawa-city": {
    nameJa: "荒川区",
    enDescription:
      "A charming historic ward home to the retro Toden Arakawa tram line, Nippori textile district, and scenic Parks along the Sumida River.",
    jaDescription:
      "都電荒川線（東京さくらトラム）が走り、日暮里繊維街や隅田川沿いの公園など、懐かしいレトロな風情が残る東京下町の街です。",
    enHighlights: [
      "Toden Arakawa Tram Line",
      "Nippori Fabric Street",
      "Sumida Riverfront",
    ],
    jaHighlights: ["都電荒川線", "日暮里繊維街", "隅田川テラス"],
  },
  "asakusa-taito": {
    nameJa: "浅草",
    enDescription:
      "Tokyo's historic cultural heart, centered on Senso-ji Temple, Nakamise shopping street, and traditional rickshaw tours.",
    jaDescription:
      "都内最古の寺院・浅草寺と雷門、伝統工芸品や和菓子が並ぶ仲見世商店街を中心に、江戸の歴史文化を体感できる観光地です。",
    enHighlights: [
      "Senso-ji Temple & Kaminarimon",
      "Nakamise Shopping Street",
      "Sumida River Cruises",
    ],
    jaHighlights: ["浅草寺と雷門", "仲見世商店街", "隅田川水上バス"],
  },
  "bunkyo-city": {
    nameJa: "文京区",
    enDescription:
      "Tokyo's historic academic and cultural ward, home to Tokyo University, Koishikawa Korakuen garden, and Tokyo Dome City.",
    jaDescription:
      "東京大学や文豪ゆかりの史跡が点在する文教地区。小石川後楽園や六義園などの名庭園と東京ドームシティが共存します。",
    enHighlights: [
      "Koishikawa Korakuen Garden",
      "Rikugien Garden",
      "Tokyo Dome City",
    ],
    jaHighlights: ["小石川後楽園", "六義園", "東京ドームシティ"],
  },
  "chiyoda-city": {
    nameJa: "千代田区",
    enDescription:
      "The political and historic center of Tokyo, containing the Imperial Palace East Gardens, Hibiya Park, and Tokyo Station.",
    jaDescription:
      "皇居東御苑や丸の内赤れんが駅舎、日比谷公園、官公庁街を抱え、日本の歴史・政治・交通の中枢を成すエリアです。",
    enHighlights: [
      "Imperial Palace East Gardens",
      "Tokyo Station Marunouchi Building",
      "Hibiya Park",
    ],
    jaHighlights: ["皇居東御苑", "東京駅丸の内駅舎", "日比谷公園"],
  },
  "chuo-city": {
    nameJa: "中央区",
    enDescription:
      "Tokyo's premier commercial hub, encompassing upscale Ginza shopping avenues, historic Nihonbashi, and Tsukiji outer market.",
    jaDescription:
      "高級ブランドが立ち並ぶ銀座、日本の道路の起点である日本橋、食文化の発信地である築地場外市場を擁する伝統と革新の街です。",
    enHighlights: [
      "Ginza Shopping District",
      "Nihonbashi Historic Bridge",
      "Tsukiji Outer Market",
    ],
    jaHighlights: ["銀座ショッピング街", "日本橋と歴史的建築", "築地場外市場"],
  },
  "chichibu-city": {
    nameJa: "秩父市",
    enDescription:
      "A scenic mountain city in Saitama famed for Chichibu Shrine, Hitsujiyama Park pink moss, and Nagatoro river rafting.",
    jaDescription:
      "秩父神社、羊山公園の芝桜の丘、長瀞ラインくだりなど豊かな自然と歴史に育まれた埼玉県の代表的な山岳観光都市です。",
    enHighlights: [
      "Chichibu Shrine & Festival",
      "Hitsujiyama Pink Moss Hill",
      "Nagatoro River Rafting",
    ],
    jaHighlights: [
      "秩父神社と秩父夜祭",
      "羊山公園の芝桜の丘",
      "長瀞ラインくだり",
    ],
  },
  "chigasaki-city": {
    nameJa: "茅ヶ崎市",
    enDescription:
      "A relaxed Shonan coastal resort city known for Southern Beach Chigasaki, Eboshi Rock views, and surf culture.",
    jaDescription:
      "サザンビーチちがさきや烏帽子岩の景観、サーフィン文化が根付く湘南海岸の明るく開放的なビーチリゾート都市です。",
    enHighlights: [
      "Southern Beach Chigasaki",
      "Eboshi Rock Coastal Views",
      "Shonan Surf Culture",
    ],
    jaHighlights: [
      "サザンビーチちがさき",
      "烏帽子岩のモニュメントと海景観",
      "湘南サーフィン文化",
    ],
  },
  "edo-castle-tokyo": {
    nameJa: "江戸城跡（皇居東御苑）",
    enDescription:
      "The massive historic castle grounds of Tokugawa Shogunate, featuring stone ramparts, Fujimi-yagura watchtower, and East Gardens.",
    jaDescription:
      "徳川将軍家の居城跡。本丸天守台の巨大な石垣や富士見櫓、四季の花々が咲き誇る皇居東御苑を自由に見学できます。",
    enHighlights: [
      "Massive Tenshudai Castle Base",
      "Fujimi-yagura Watchtower",
      "Imperial Palace East Gardens",
    ],
    jaHighlights: [
      "巨大な本丸天守台石垣",
      "現存する富士見櫓",
      "四季の皇居東御苑散策",
    ],
  },
  "edogawa-city": {
    nameJa: "江戸川区",
    enDescription:
      "A green waterfront ward offering Kasai Rinkai Park, Kasai Sea Life Park, and expansive views across Tokyo Bay.",
    jaDescription:
      "東京湾に面し、葛西臨海公園や葛西臨海水族園、江戸川の豊かな水辺空間が広がる自然豊かなファミリー向けエリアです。",
    enHighlights: [
      "Kasai Rinkai Park",
      "Kasai Sea Life Park",
      "Tokyo Bay Waterfront",
    ],
    jaHighlights: [
      "葛西臨海公園",
      "葛西臨海水族園",
      "東京湾ウォーターフロント",
    ],
  },
  "funabashi-city": {
    nameJa: "船橋市",
    enDescription:
      "A major commercial Chiba city home to Hanzankansen Park, Funabashi Andersen Park, and lively shopping districts.",
    jaDescription:
      "ふなばしアンデルセン公園や大型ショッピングモール、港の海鮮市場が集まる千葉県中西部の活気ある都市です。",
    enHighlights: [
      "Funabashi Andersen Park",
      "LaLaport TOKYO-BAY",
      "Funabashi Port Market",
    ],
    jaHighlights: [
      "ふなばしアンデルセン公園",
      "ららぽーとTOKYO-BAY",
      "船橋港の海鮮市場",
    ],
  },
  "ginza-itoya": {
    nameJa: "銀座 伊東屋",
    enDescription:
      "A flagship 12-story stationery department store in Ginza offering premium pens, paper, design goods, and creative workshops.",
    jaDescription:
      "創業100年を超える銀座の老舗文房具専門店。全12階のフロアに高品質なステーショナリーやオリジナルの紙製品が揃います。",
    enHighlights: [
      "12 Floors of Fine Stationery",
      "Custom Notebook & Pen Bar",
      "Design & Lifestyle Goods",
    ],
    jaHighlights: [
      "全12階の文房具専門店",
      "カスタムノート＆万年筆コーナー",
      "デザイン＆ライフスタイル雑貨",
    ],
  },
  "golden-gai": {
    nameJa: "ゴールデン街",
    enDescription:
      "A famous maze of tiny, character-rich nightlife bars in Shinjuku, preserving Showa-era architectural nostalgia.",
    jaDescription:
      "新宿歌舞伎町に隣接するレトロな飲み屋街。木造長屋に200軒以上の個性豊かな小規模バーが密集する昭和ノスタルジーの聖地です。",
    enHighlights: [
      "Showa-Era Architecture",
      "200+ Micro Bars",
      "Unique Shinjuku Atmosphere",
    ],
    jaHighlights: [
      "昭和の木造長屋建築",
      "200軒以上のマイクロバー",
      "個性溢れるディープな夜の街",
    ],
  },
  "gotoku-ji": {
    nameJa: "豪徳寺",
    enDescription:
      "A serene temple in Setagaya famous as the origin site of Maneki-neko (beckoning cats), featuring thousands of ceramic cat statues.",
    jaDescription:
      "招き猫の発祥地として知られる世田谷区の曹洞宗寺院。境内の奉納所には数千体の真っ白な招き猫が並び、紅葉の名所でもあります。",
    enHighlights: [
      "Thousands of Maneki-Neko Statues",
      "Peaceful Temple Grounds",
      "Autumn Foliage Views",
    ],
    jaHighlights: [
      "奉納された数千体の招き猫",
      "静寂に包まれた寺院境内",
      "美しい紅葉の名所",
    ],
  },
  "hachioji-tokyo": {
    nameJa: "八王子市",
    enDescription:
      "A spacious western Tokyo city known for Mount Takao, Hachioji Castle ruins, and TAKAO 599 MUSEUM.",
    jaDescription:
      "高尾山の豊かな自然、日本100名城の八王子城跡、TAKAO 599 MUSEUMを備えた自然と歴史あふれる東京都多摩地域の拠点都市です。",
    enHighlights: [
      "Mount Takao Hiking Trails",
      "Hachioji Castle Ruins",
      "TAKAO 599 MUSEUM",
    ],
    jaHighlights: [
      "高尾山のハイキングコース",
      "八王子城跡の石垣と本丸",
      "TAKAO 599 MUSEUM",
    ],
  },
  "hachioji-castle-tokyo": {
    nameJa: "八王子城跡",
    enDescription:
      "A historic mountain castle ruin in Hachioji built by Hojo Ujiteru, featuring restored stone walls and scenic forest trails.",
    jaDescription:
      "北条氏照が築城した日本100名城の一つ。山城の遺構である石垣や御主殿跡が復元され、歴史散策と豊かな自然を楽しめます。",
    enHighlights: [
      "Restored Stone Walls & Residence Site",
      "History of Hojo Clan",
      "Forest Trail Hikes",
    ],
    jaHighlights: [
      "復元された石垣と御主殿跡",
      "北条氏の山城歴史",
      "森林の歴史散策路",
    ],
  },
  "harry-potter-studio": {
    nameJa: "ワーナー ブラザース スタジオツアー東京 - ハリー・ポッター",
    enDescription:
      "An immersive entertainment attraction in Nerima showcasing authentic film sets, props, and costumes from the Harry Potter films.",
    jaDescription:
      "練馬区のとしまえん跡地に誕生した体験型エンターテインメント施設。『ハリー・ポッター』映画の本格的なセットや小道具を体感できます。",
    enHighlights: [
      "Great Hall Set",
      "Diagon Alley & Hogwarts Express",
      "Interactive Magic Experiences",
    ],
    jaHighlights: [
      "大広間セット",
      "ダイアゴン横丁とホグワーツ特急",
      "体験型アクティビティ",
    ],
  },
  "hokkaido-jingu": {
    nameJa: "北海道神宮",
    enDescription:
      "Hokkaido's chief Shinto shrine located in Maruyama Park, Sapporo, surrounded by lush forest and cherry blossoms.",
    jaDescription:
      "札幌市円山公園に隣接する北海道の総鎮守。原生林に囲まれた清らかな境内で、四季折々の参歩と桜を楽しめます。",
    enHighlights: [
      "Chief Shinto Shrine of Hokkaido",
      "Lush Forested Grounds",
      "Spring Cherry Blossoms",
    ],
    jaHighlights: ["北海道の総鎮守", "豊かな原生林の境内", "春の桜と秋の紅葉"],
  },
  "imperial-palace-chiyoda": {
    nameJa: "皇居",
    enDescription:
      "The residence of Japan's Imperial Family, built on the site of Edo Castle, featuring Nijubashi bridge and East Gardens.",
    jaDescription:
      "旧江戸城跡に位置する天皇陛下の御所。二重橋、伏見櫓、広大な皇居東御苑など、日本の歴史と豊かな緑が象徴的な都心のオアシスです。",
    enHighlights: [
      "Nijubashi Bridge",
      "Imperial Palace East Gardens",
      "Edo Castle Moat Walk",
    ],
    jaHighlights: ["二重橋と伏見櫓", "皇居東御苑散策", "旧江戸城のお濠歩き"],
  },
  jogashima: {
    nameJa: "城ヶ島と三浦半島",
    enDescription:
      "A scenic island at the southern tip of the Miura Peninsula, famous for dramatic sea-eroded rock formations and fresh tuna dining.",
    jaDescription:
      "三浦半島の南端に位置する豊かな自然島。馬の背洞門などの奇岩断崖景観、城ヶ島灯台、三崎港の新鮮なマグロ料理を楽しめます。",
    enHighlights: [
      "Uma-no-Se Arch Rock Formation",
      "Jogashima Lighthouse Views",
      "Misaki Fresh Tuna Cuisine",
    ],
    jaHighlights: [
      "馬の背洞門の奇岩景観",
      "城ヶ島灯台と海景色",
      "三崎港の直営マグロ料理",
    ],
  },
  joypolis: {
    nameJa: "東京ジョイポリス（お台場）",
    enDescription:
      "Japan's largest indoor theme park located in Odaiba, featuring high-tech VR rides, roller coasters, and arcade attractions.",
    jaDescription:
      "お台場デックス東京ビーチ内にある国内最大級の屋内型テーマパーク。最新のVRアトラクションや屋内コースターを楽しめます。",
    enHighlights: [
      "Indoor Roller Coasters",
      "Cutting-Edge VR Experiences",
      "Interactive Arcade Attractions",
    ],
    jaHighlights: [
      "屋内型絶叫コースター",
      "最新鋭VRアトラクション",
      "体験型デジタルアトラクション",
    ],
  },
  "kawagoe-castle-saitama": {
    nameJa: "川越城本丸御殿",
    enDescription:
      "The only surviving Honmaru Goten (main palace building) in eastern Japan, showcasing Edo period samurai architecture.",
    jaDescription:
      "東日本で唯一現存する川越城の本丸御殿。1848年建築の家老詰所や大広間が遺され、江戸時代の城郭建築を間近で見学できます。",
    enHighlights: [
      "Only Surviving Main Palace in East Japan",
      "Edo Samurai Architecture",
      "Karo-no-Ma Council Chambers",
    ],
    jaHighlights: [
      "東日本唯一の現存本丸御殿",
      "江戸時代の武家建築遺構",
      "家老詰所と大広間",
    ],
  },
  "kawaguchi-city": {
    nameJa: "川口市",
    enDescription:
      "A major Saitama industrial and residential city near Tokyo, famous for cast-metal heritage, Aokicho Park, and greenery.",
    jaDescription:
      "荒川を隔てて東京都と接する埼玉県の主要都市。伝統的な鋳物産業の歴史、青木町公園、川口市立グリーンセンターが親しまれています。",
    enHighlights: [
      "Cast-Metal Industrial History",
      "Aokicho Park",
      "Kawaguchi Green Center",
    ],
    jaHighlights: [
      "伝統の鋳物産業歴史",
      "青木町公園",
      "川口市立グリーンセンター",
    ],
  },
  "kisarazu-city": {
    nameJa: "木更津市",
    enDescription:
      "A Tokyo Bay coastal Chiba city known for Tokyo Bay Aqua-Line's Umihotaru, Mitsui Outlet Park, and fresh clam harvesting.",
    jaDescription:
      "東京湾アクアラインの拠点「海ほたる」や三井アウトレットパーク、潮干狩りで知られる房総半島西部の港町です。",
    enHighlights: [
      "Tokyo Bay Aqua-Line Umihotaru",
      "Mitsui Outlet Park Kisarazu",
      "Coastal Clam Harvesting",
    ],
    jaHighlights: [
      "東京湾アクアライン海ほたる",
      "三井アウトレットパーク木更津",
      "海岸の潮干狩り体験",
    ],
  },
  "kusatsu-town": {
    nameJa: "草津町",
    enDescription:
      "Japan's famous hot spring town in Gunma, centered on Yubatake (hot water field) and Mount Shirane natural scenery.",
    jaDescription:
      "日本屈指の源泉湧出量を誇る草津温泉の町。中央の湯畑、伝統の湯もみ、白根山を臨む豊かな自然が人々を引き寄せます。",
    enHighlights: [
      "Yubatake Hot Water Field",
      "Yumomi Cooling Performances",
      "Sainokawara Park Baths",
    ],
    jaHighlights: [
      "湯畑の熱気景観",
      "伝統の湯もみショー",
      "西の河原公園大露天風呂",
    ],
  },
  "minakami-town": {
    nameJa: "みなかみ町",
    enDescription:
      "An outdoor adventure resort in northern Gunma offering Tone River rafting, Tanigawadake ropeway, and hot spring lodges.",
    jaDescription:
      "谷川岳の麓に広がるアウトドアと温泉の町。利根川のラフティング、谷川岳ロープウェイのパノラマ、水上温泉郷を楽しめます。",
    enHighlights: [
      "Tanigawadake Ropeway",
      "Tone River Rafting",
      "Minakami Onsen Town",
    ],
    jaHighlights: [
      "谷川岳ロープウェイ絶景",
      "利根川ラフティング体験",
      "水上温泉郷の湯巡り",
    ],
  },
  "minato-city": {
    nameJa: "港区",
    enDescription:
      "Tokyo's international waterfront ward housing Tokyo Tower, Roppongi Hills, Odaiba, and luxury embassy districts.",
    jaDescription:
      "東京タワー、六本木ヒルズ、お台場、国際色豊かな大使館街を擁する、日本のトレンド・文化・国際ビジネスの中心エリアです。",
    enHighlights: [
      "Tokyo Tower Landmark",
      "Roppongi Cultural District",
      "Odaiba Seaside Park",
    ],
    jaHighlights: ["東京タワー", "六本木文化エリア", "お台場海浜公園"],
  },
  "narita-city": {
    nameJa: "成田市",
    enDescription:
      "The historic home of Naritasan Shinshoji Temple, lively Omotesando market street, and Narita International Airport.",
    jaDescription:
      "成田国際空港を擁する日本の玄関口。千成堂やうなぎ料理店が並ぶ成田山表参道と、1000年以上の歴史を持つ成田山新勝寺が有名です。",
    enHighlights: [
      "Naritasan Shinshoji Temple",
      "Historic Omotesando Eel Street",
      "Narita International Airport",
    ],
    jaHighlights: ["成田山新勝寺", "歴史ある参道とうなぎ料理", "成田国際空港"],
  },
  "odawara-city": {
    nameJa: "小田原市",
    enDescription:
      "Kanagawa's historic gateway to Hakone, featuring the formidable Odawara Castle, kamaboko seafood, and ocean views.",
    jaDescription:
      "小田原城を中心に発展した北条氏の城下町。箱根への玄関口であり、かまぼこ・小田原提灯・相模湾の新鮮な海鮮が名物です。",
    enHighlights: [
      "Odawara Castle Keep & Park",
      "Kamaboko Seafood Village",
      "Sagami Bay Coastline",
    ],
    jaHighlights: [
      "小田原城天守閣",
      "小田原かまぼこ通り",
      "相模湾の海鮮グルメ",
    ],
  },
  "roppongi-hills-tokyo-city-view": {
    nameJa: "六本木ヒルズ展望台（東京シティビュー）",
    enDescription:
      "An indoor/outdoor rooftop observation deck on the 52nd floor of Roppongi Hills offer breathtaking 360-degree Tokyo views.",
    jaDescription:
      "六本木ヒルズ森タワー52階（高さ250m）にある展望台。ガラス張りの屋内回廊や屋上スカイデッキから東京タワーと都心のパノラマを一望できます。",
    enHighlights: [
      "250m Panoramic Indoor Gallery",
      "Open-Air Rooftop Sky Deck",
      "Tokyo Tower & Mt. Fuji Views",
    ],
    jaHighlights: [
      "高さ250mの屋内展望ギャラリー",
      "オープンエアの屋上スカイデッキ",
      "東京タワーと富士山のパノラマ",
    ],
  },
  "sagamihara-city": {
    nameJa: "相模原市",
    enDescription:
      "A spacious green Kanagawa city home to Lake Sagami, JAXA Sagamihara Campus, and Sagamihara Park.",
    jaDescription:
      "相模湖や相模原公園、JAXA相模原キャンパスを擁する、豊かな自然と宇宙科学技術が共存する神奈川県北部の令指定都市です。",
    enHighlights: [
      "Lake Sagami Resort",
      "JAXA Space Campus",
      "Sagamihara Park Greenery",
    ],
    jaHighlights: ["相模湖リゾート", "JAXA相模原キャンパス", "県立相模原公園"],
  },
  "shibuya-sky-shibuya": {
    nameJa: "渋谷スカイ",
    enDescription:
      "A breathtaking 229-meter rooftop observation deck at Shibuya Scramble Square offering 360-degree views of Tokyo and Mount Fuji.",
    jaDescription:
      "渋谷スクランブルスクエアの屋上にある高さ229mの展望施設。スクランブル交差点や東京タワー、富士山を360度見渡せます。",
    enHighlights: [
      "229m Open-Air Sky Stage",
      "360 Panoramic Tokyo Views",
      "Shibuya Scramble Crossing Overlook",
    ],
    jaHighlights: [
      "高さ229mの屋上展望空間",
      "360度東京パノラマ絶景",
      "真下のスクランブル交差点",
    ],
  },
  "tokorozawa-city": {
    nameJa: "所沢市",
    enDescription:
      "A popular Saitama culture city featuring Tokorozawa Sakura Town, Kadokawa Musashino Museum, and Sayama Tea fields.",
    jaDescription:
      "角川武蔵野ミュージアムがある「ところざわサクラタウン」、狭山茶の茶畑、西武園ゆうえんちが親しまれるカルチャーシティです。",
    enHighlights: [
      "Kadokawa Musashino Museum",
      "Tokorozawa Sakura Town",
      "Sayama Tea Fields",
    ],
    jaHighlights: [
      "角川武蔵野ミュージアム",
      "ところざわサクラタウン",
      "狭山茶の茶畑散策",
    ],
  },
  "tsukuba-city": {
    nameJa: "つくば市",
    enDescription:
      "Japan's premier Science City home to Mount Tsukuba, JAXA Tsukuba Space Center, and Tsukuba Botanical Garden.",
    jaDescription:
      "筑波山とJAXA筑波宇宙センター、筑波実験植物園を擁する、日本の先端科学技術と豊かな自然が融合した学術研究都市です。",
    enHighlights: [
      "Mount Tsukuba Cable Car",
      "JAXA Tsukuba Space Center",
      "Tsukuba Botanical Garden",
    ],
    jaHighlights: [
      "筑波山ロープウェイ絶景",
      "JAXA筑波宇宙センター",
      "筑波実験植物園",
    ],
  },
  "urayasu-city": {
    nameJa: "浦安市",
    enDescription:
      "A famous Tokyo Bay city in Chiba home to Tokyo Disney Resort (Disneyland & DisneySea) and Ikspiari shopping mall.",
    jaDescription:
      "東京ディズニーリゾート（ディズニーランド＆ディズニーシー）や商業施設イクスピアリを擁する、日本有数のテーマパーク都市です。",
    enHighlights: [
      "Tokyo Disney Resort Theme Parks",
      "Ikspiari Shopping Complex",
      "Tokyo Bay Waterfront Walks",
    ],
    jaHighlights: [
      "東京ディズニーリゾート",
      "イクスピアリ",
      "東京湾ウォーターフロント散策",
    ],
  },
  "utsunomiya-city": {
    nameJa: "宇都宮市",
    enDescription:
      "Tochigi's prefectural capital famed for Utsunomiya gyoza dumpling culture, Oya Stone quarries, and Futaarayama Shrine.",
    jaDescription:
      "「餃子の街」として全国に知られる栃木県の県都。大谷石の巨大地下空間（大谷資料館）や宇都宮二荒山神社が見どころです。",
    enHighlights: [
      "Famous Utsunomiya Gyoza Dining",
      "Oya Stone Quarry Museum",
      "Utsunomiya Futaarayama Shrine",
    ],
    jaHighlights: [
      "宇都宮餃子の食べ歩き",
      "大谷資料館の巨大地下空間",
      "宇都宮二荒山神社",
    ],
  },
  "yokosuka-city": {
    nameJa: "横須賀市",
    enDescription:
      "A naval port city on Tokyo Bay known for Mikasa Park, Yokosuka Naval Port cruises, and Dobuita Street navy burger culture.",
    jaDescription:
      "東京湾口にある歴史ある軍港都市。記念艦三笠がある三笠公園、横須賀軍港めぐり、ドブ板通りのネイビーバーガーが有名です。",
    enHighlights: [
      "Historic Battleship Mikasa Park",
      "Yokosuka Naval Port Cruise",
      "Dobuita Street Navy Burgers",
    ],
    jaHighlights: [
      "記念艦三笠と三笠公園",
      "横須賀軍港めぐりクルーズ",
      "ドブ板通りのネイビーバーガー",
    ],
  },
  "takao-599-museum": {
    nameJa: "高尾599ミュージアム",
    enDescription:
      "A stylish modern nature museum at the foot of Mount Takao showcasing preserved flora, fauna, and mountain history.",
    jaDescription:
      "高尾山の麓に位置するスタイリッシュな自然ミュージアム。アクリル樹脂に封入された植物標本やカフェ、芝生広場が魅力です。",
    enHighlights: [
      "Acrylic Resin Flora & Fauna Display",
      "Modern Architecture & Cafe",
      "Mount Takao Nature Gateway",
    ],
    jaHighlights: [
      "アクリル樹脂の美表標本展示",
      "洗練された建築とカフェ",
      "高尾山麓の自然発信拠点",
    ],
  },
  "play-museum-tachikawa": {
    nameJa: "PLAY! MUSEUM（立川）",
    enDescription:
      "A creative art museum for adults and children in Tachikawa GREEN SPRINGS, featuring interactive picture book and pop culture exhibits.",
    jaDescription:
      "立川GREEN SPRINGS内にある絵本やマンガ、アートをテーマにした体験型美術館。大人も子供もワクワクできる展示が魅力です。",
    enHighlights: [
      "Picture Book Art Exhibits",
      "Interactive Play Space",
      "GREEN SPRINGS Complex Setting",
    ],
    jaHighlights: [
      "絵本・アートの体験型展示",
      "体を使って遊ぶアート空間",
      "GREEN SPRINGS施設内",
    ],
  },
};
