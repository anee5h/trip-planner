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
  "koto-city": {
    nameJa: "江東区",
    enDescription:
      "A modern bayfront ward housing teamLab Planets, Toyosu Market, Kiyosumi Gardens, and Tokyo Big Sight.",
    jaDescription:
      "豊洲市場やteamLab Planets、清澄庭園、東京ビッグサイトなどを擁し、下町の歴史と臨海部の最新施設が同居する注目の街です。",
    enHighlights: [
      "Toyosu Seafood Market",
      "teamLab Planets Tokyo",
      "Kiyosumi Traditional Garden",
    ],
    jaHighlights: ["豊洲市場", "teamLab Planets", "清澄庭園"],
  },
  "lake-sagami": {
    nameJa: "相模湖",
    enDescription:
      "A picturesque artificial lake resort in Kanagawa offering boat rentals, Pleasure Forest amusement park, and mountain views.",
    jaDescription:
      "相模川を留めて作られた神奈川県の湖リゾート。ボート遊びやさがみ湖リゾート プレジャーフォレストの遊具が人気です。",
    enHighlights: [
      "Boating & Water Sports",
      "Pleasure Forest Amusement Park",
      "Illumillion Light Display",
    ],
    jaHighlights: [
      "ボート遊びと湖畔散策",
      "プレジャーフォレスト遊園地",
      "さがみ湖イルミリオン",
    ],
  },
  miraikan: {
    nameJa: "日本科学未来館",
    enDescription:
      "A cutting-edge science and technology museum in Odaiba featuring interactive robotics, space exploration, and Geo-Cosmos Earth display.",
    jaDescription:
      "お台場にある国立の科学館。最先端のロボット技術、宇宙探査、地球環境を映し出す巨大な「Geo-Cosmos」などを体験学習できます。",
    enHighlights: [
      "Geo-Cosmos Globe",
      "Robotics & AI Demonstrations",
      "Interactive Science Exhibits",
    ],
    jaHighlights: [
      "Geo-Cosmos（シンボル展示）",
      "ロボット・AIの実演展示",
      "体験型科学プログラム",
    ],
  },
  "mito-castle-ibaraki": {
    nameJa: "水戸城跡と弘道館",
    enDescription:
      "The historical center of Mito featuring the restored Otemon gate, Kodokan clan school (Japan's largest), and moat trails.",
    jaDescription:
      "水戸徳川家の居城跡。日本最大の藩校「弘道館」や復元された二の丸大手門があり、梅の季節や歴史散策に最適です。",
    enHighlights: [
      "Kodokan Historic Han School",
      "Restored Otemon Gate",
      "Mito Tokugawa Clan History",
    ],
    jaHighlights: [
      "日本最大の藩校「弘道館」",
      "復元された二の丸大手門",
      "水戸徳川家の城郭遺構",
    ],
  },
  "oarai-marine-tower": {
    nameJa: "大洗マリンタワー",
    enDescription:
      "A 60-meter glass triangular tower overlooking the Pacific Ocean and Oarai Port, featuring a 360-degree observation deck.",
    jaDescription:
      "大洗港にそびえる高さ60mの正三角形ガラス張りタワー。大洗の街並みと太平洋の大パノラマを360度見渡せます。",
    enHighlights: [
      "60m Glass Triangular Tower",
      "360-Degree Pacific Ocean Views",
      "Oarai Port Panorama",
    ],
    jaHighlights: [
      "高さ60mのガラス張りタワー",
      "太平洋360度大パノラマ",
      "大洗港と街並みの景観",
    ],
  },
  "omiya-railway": {
    nameJa: "鉄道博物館（大宮）",
    enDescription:
      "Japan's premier railway museum in Saitama, featuring real historic trains, Bullet train simulators, and interactive exhibits.",
    jaDescription:
      "JR東日本が運営する日本最大級の鉄道博物館。実物の蒸気機関車や新幹線、本格的な運転シミュレータが揃います。",
    enHighlights: [
      "36 Historic Railway Vehicles",
      "Shinkansen Driving Simulators",
      "Interactive Train Exhibits",
    ],
    jaHighlights: [
      "36両の実物車両展示",
      "新幹線運転シミュレータ",
      "体験型鉄道展示",
    ],
  },
  "oze-national-park": {
    nameJa: "尾瀬国立公園",
    enDescription:
      "A famous high-altitude wetland national park spanning Gunma, Fukushima, and Niigata, famous for wooden boardwalk hikes and Skunk Cabbage flowers.",
    jaDescription:
      "本州最大級の高層湿原。木道が続く広大な湿原で、春のミズバショウや秋の草紅葉などの素晴らしい自然景観を歩いて巡れます。",
    enHighlights: [
      "Wooden Boardwalk Wetland Hikes",
      "Mizubashou Water Plant Flowers",
      "Mount Shibutsu Views",
    ],
    jaHighlights: [
      "湿原を巡る木道ハイキング",
      "ミズバショウと草紅葉",
      "至仏山と燧ヶ岳の景観",
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
  "sakura-castle-chiba": {
    nameJa: "佐倉城址公園",
    enDescription:
      "A historic castle park in Chiba surrounded by dry moats and earthen ramparts, housing National Museum of Japanese History.",
    jaDescription:
      "千葉県唯一の日本100名城。土塁や空堀の遺構と、敷地内にある国立歴史民俗博物館が魅力の緑豊かな城郭公園です。",
    enHighlights: [
      "Historic Earthen Ramparts & Moats",
      "National Museum of Japanese History",
      "Cherry Blossom Park",
    ],
    jaHighlights: [
      "巨大な土塁と空堀の遺構",
      "国立歴史民俗博物館",
      "さくらの名所公園",
    ],
  },
  "shibuya-sky-shibuya": {
    nameJa: "SHIBUYA SKY",
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
  "sunshine-60-observatory-ikebukuro": {
    nameJa: "サンシャイン60展望台 てんぼうパーク",
    enDescription:
      "An indoor sky park 251 meters above Ikebukuro featuring artificial turf lawns, panoramic Tokyo views, and relaxing cafes.",
    jaDescription:
      "池袋サンシャイン60の最上階（海抜251m）にある展望公園。緑豊かな人工芝が広がり、都心の絶景をのんびり楽しめます。",
    enHighlights: [
      "251m Indoor Sky Park",
      "Green Lawn Relaxation Zone",
      "Panoramic Tokyo Views",
    ],
    jaHighlights: [
      "海抜251mの屋内天空公園",
      "芝生広場の癒し空間",
      "都心360度の眺望",
    ],
  },
  "tachikawa-tokyo": {
    nameJa: "立川市",
    enDescription:
      "A vibrant western Tokyo sub-center featuring Showa Kinen Park, GREEN SPRINGS, and IKEA Tachikawa.",
    jaDescription:
      "国営昭和記念公園の広大な緑、複合施設GREEN SPRINGS、PLAY! MUSEUMなどが集まる立川駅周辺の利便性の高い都市です。",
    enHighlights: [
      "Showa Kinen National Park",
      "GREEN SPRINGS Lifestyle Complex",
      "PLAY! MUSEUM",
    ],
    jaHighlights: ["国営昭和記念公園", "GREEN SPRINGS", "PLAY! MUSEUM"],
  },
  "takao-599-museum": {
    nameJa: "TAKAO 599 MUSEUM",
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
  "takanawa-gateway-minato": {
    nameJa: "高輪ゲートウェイ",
    enDescription:
      "A modern futuristic station complex designed by Kengo Kuma in Minato ward, featuring wooden architecture and AI robotics.",
    jaDescription:
      "隈研吾氏がデザインを手掛けたJR山手線の新駅。木材を多用した大屋根建築と最新のAIロボット、周辺の再開発街並みが特徴です。",
    enHighlights: [
      "Kengo Kuma Wooden Architecture",
      "AI Robots & Self-Checkout Store",
      "TAKANAWA GATEWAY CITY Area",
    ],
    jaHighlights: [
      "隈研吾デザインの大屋根建築",
      "最新AIロボットと無人店舗",
      "TAKANAWA GATEWAY CITY",
    ],
  },
  "tama-zoological-park": {
    nameJa: "多摩動物公園",
    enDescription:
      "A vast 50-hectare hillside zoo in Hino, Tokyo, featuring free-roaming African animals, Koala House, and Lion Bus tours.",
    jaDescription:
      "日野市の豊かな多摩丘陵に広がる50ヘクタールの広い動物園。ライオンバスやコアラ館、アジア・アフリカゾーンの自然展示が人気です。",
    enHighlights: [
      "50-Hectare Hillside Enclosures",
      "Famous Lion Bus Tour",
      "Koala House & Butterfly Pavilion",
    ],
    jaHighlights: [
      "50ヘクタールの丘陵動物園",
      "人気のライオンバス",
      "コアラ館と昆虫園",
    ],
  },
  "teamlab-borderless-azabudai": {
    nameJa: "チームラボボーダレス（麻布台ヒルズ）",
    enDescription:
      "An extraordinary digital art museum in Azabudai Hills where artworks move, interact, and blend without boundaries.",
    jaDescription:
      "麻布台ヒルズに移転オープンした世界的なデジタルアートミュージアム。境界のないアート群が空間を自在に巡り、人と融合します。",
    enHighlights: [
      "Boundaryless Digital Art Works",
      "Interactive Light Displays",
      "EN TEA HOUSE Experience",
    ],
    jaHighlights: [
      "境界のないデジタルアート群",
      "インタラクティブな光空間",
      "EN TEA HOUSE（お茶のアート）",
    ],
  },
  "teamlab-planets": {
    nameJa: "チームラボプラネッツ（豊洲）",
    enDescription:
      "An immersive water-filled digital art museum in Toyosu where visitors walk barefoot through water pools and flower gardens.",
    jaDescription:
      "豊洲にある「水に入るミュージアム」。裸足になって巨大なデジタルアート作品の水に入り、体全体で作品と一体化する没入体験ができます。",
    enHighlights: [
      "Walk Barefoot Through Water Art",
      "Floating Flower Garden",
      "Infinite Mirror Rooms",
    ],
    jaHighlights: [
      "裸足で水に入るデジタルアート",
      "浮遊する花々の庭園",
      "無限の鏡空間",
    ],
  },
  "tokyo-metropolitan-government-building-shinjuku": {
    nameJa: "東京都庁展望室",
    enDescription:
      "A famous free twin-tower observation deck on the 45th floor of Kenzo Tange's skyscraper, offering views of Mount Fuji.",
    jaDescription:
      "丹下健三氏設計の東京都庁舎45階（高さ202m）にある無料の展望室。都心の眺望や天候が良い日には富士山を望めます。",
    enHighlights: [
      "Free 45F Observation Deck",
      "Kenzo Tange Architecture",
      "Mount Fuji & Tokyo Skyline Views",
    ],
    jaHighlights: [
      "45階の無料展望室（高さ202m）",
      "丹下健三設計の庁舎建築",
      "富士山と都心パノラマ景観",
    ],
  },
  "tokyo-mt-mitake": {
    nameJa: "御岳山",
    enDescription:
      "A sacred mountain in Okutama, Tokyo, featuring Musashi Mitake Shrine, scenic hiking paths, cable car, and rock garden trail.",
    jaDescription:
      "青梅市奥多摩に位置する古くからの霊山。武蔵御嶽神社、ケーブルカー、ロックガーデン（苔むした渓流沿い）のハイキングが人気です。",
    enHighlights: [
      "Musashi Mitake Shrine",
      "Mitake Cable Car",
      "Scenic Rock Garden Stream Trail",
    ],
    jaHighlights: [
      "武蔵御嶽神社",
      "御岳登山鉄道ケーブルカー",
      "ロックガーデンの渓流散策",
    ],
  },
  "tokyo-station-chiyoda": {
    nameJa: "東京駅（丸の内赤れんが駅舎）",
    enDescription:
      "Japan's primary railway hub featuring Kingo Tatsuno's restored 1914 red-brick station building, Marunouchi plaza, and Ramen Street.",
    jaDescription:
      "1914年創建の歴史的赤れんが駅舎。ドーム状の美しい天井、丸の内駅前広場、東京駅一番街のラーメンストリートが集まる日本の玄関口です。",
    enHighlights: [
      "Restored 1914 Red-Brick Station Building",
      "Marunouchi Square & Skyscraper Views",
      "Tokyo Ramen Street",
    ],
    jaHighlights: [
      "創建当時の赤れんが駅舎とドーム天井",
      "丸の内駅前広場の景観",
      "東京ラーメンストリート",
    ],
  },
  "ueno-zoo": {
    nameJa: "東京都恩賜上野動物園",
    enDescription:
      "Japan's oldest zoo located in Ueno Park, home to giant pandas, historic 5-story pagoda backdrop, and 300+ animal species.",
    jaDescription:
      "1882年開園の日本最古の動物園。ジャイアントパンダ、旧寛永寺五重塔を背景とした展示、約300種の動物に出会える上野の象徴です。",
    enHighlights: [
      "Giant Panda Enclosures",
      "Historic 5-Story Pagoda Backdrop",
      "Shinobazu Pond Waterfront Aviary",
    ],
    jaHighlights: [
      "人気ジャイアントパンダ",
      "旧寛永寺五重塔の歴史景観",
      "不忍池の水鳥舎",
    ],
  },
  "utsunomiya-oya": {
    nameJa: "宇都宮・大谷エリア",
    enDescription:
      "A unique destination near Utsunomiya featuring Oya History Museum's vast underground stone quarry chamber and Oya Kannon Buddha.",
    jaDescription:
      "宇都宮市大谷町に広がる大谷石の産地。映画撮影地にもなる大谷資料館の巨大地下採掘場跡と大谷観音が神秘的な雰囲気を醸し出します。",
    enHighlights: [
      "Oya Underground Stone Quarry Chamber",
      "Oya Kannon Carved Cliff Buddha",
      "Utsunomiya Gyoza Dining",
    ],
    jaHighlights: [
      "大谷資料館の巨大地下空間",
      "大谷観音の崖彫り仏像",
      "宇都宮餃子食べ歩き",
    ],
  },
  "yokohama-marine-tower": {
    nameJa: "横浜マリンタワー",
    enDescription:
      "A historic 106-meter waterfront lattice tower in Yokohama near Yamashita Park, featuring observation decks and night illumination.",
    jaDescription:
      "横浜開港100周年記念事業で建てられた高さ106mのシンボルタワー。展望フロアからは横浜港やベイブリッジを一望できます。",
    enHighlights: [
      "106m Waterfront Lattice Tower",
      "Yokohama Port & Bay Bridge Panorama",
      "Media Art & Lounge Bar",
    ],
    jaHighlights: [
      "高さ106mの横浜港シンボルタワー",
      "横浜港とベイブリッジの眺望",
      "メディアアートと展望フロア",
    ],
  },
  "yokohama-zoorasia": {
    nameJa: "よこはま動物園ズーラシア",
    enDescription:
      "One of Japan's largest state-of-the-art zoos in Yokohama, reproducing natural habitats across 8 global ecological zones.",
    jaDescription:
      "「生命の共生・自然の調和」をテーマにした日本最大級の広大な動物園。世界8つの気候帯に分けられた自然に近い環境で動物を観察できます。",
    enHighlights: [
      "8 Global Climate Zone Habitats",
      "Rare Animals Like Okapi & Proboscis Monkey",
      "Vast Natural Park Setting",
    ],
    jaHighlights: [
      "世界8エリアの自然再現展示",
      "オカピなどの希少動物",
      "広大な自然公園環境",
    ],
  },
  zushi: {
    nameJa: "逗子・横須賀",
    enDescription:
      "A charming Miura Peninsula area featuring Zushi Beach resort, Hayama coastal views, and Yokosuka Verny Park.",
    jaDescription:
      "逗子海岸の海水浴リゾート、葉山の御用邸海岸景色、横須賀のヴェルニー公園や軍港めぐりを楽しめる湘南・三浦エリアです。",
    enHighlights: [
      "Zushi Beach Resort",
      "Hayama Imperial Coast Views",
      "Yokosuka Naval Port Cruise",
    ],
    jaHighlights: ["逗子海岸リゾート", "葉山海岸の景観", "横須賀軍港めぐり"],
  },
};
