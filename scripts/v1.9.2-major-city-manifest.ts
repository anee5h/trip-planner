export interface CityExpansionTarget {
  hubId: string;
  minimumChildren: number;
  candidates: readonly { name: string; areaId: string }[];
}

const places = (areaId: string, names: readonly string[]) =>
  names.map((name) => ({ name, areaId }));

export const V192_CITY_EXPANSION: readonly CityExpansionTarget[] = [
  {
    hubId: "saitama-city",
    minimumChildren: 10,
    candidates: [
      ...places("omiya", [
        "The Railway Museum",
        "Omiya Bonsai Art Museum",
        "Omiya Bonsai Village",
        "Musashi Ichinomiya Hikawa Shrine",
        "Omiya Park",
      ]),
      ...places("saitama-shintoshin", [
        "Saitama Super Arena",
        "Saitama Shintoshin",
      ]),
      ...places("urawa", ["The Museum of Modern Art, Saitama"]),
      ...places("iwatsuki", ["Iwatsuki Ningyo Museum", "Saitama Stadium 2002"]),
    ],
  },
  {
    hubId: "kawasaki-city",
    minimumChildren: 9,
    candidates: [
      ...places("central-kawasaki", [
        "Kawasaki Daishi",
        "Toshiba Science Museum",
        "Kawasaki Factory Night View",
        "Lazona Kawasaki Plaza",
      ]),
      ...places("ikuta", [
        "Nihon Minka-en",
        "Ikuta Ryokuchi",
        "Fujiko F. Fujio Museum",
        "Taro Okamoto Museum of Art",
      ]),
      ...places("todoroki", ["Todoroki Ryokuchi"]),
      ...places("central-kawasaki", ["Kanayama Shrine"]),
    ],
  },
  {
    hubId: "chiba-city",
    minimumChildren: 10,
    candidates: [
      ...places("chiba-port", ["Chiba Port Tower", "Chiba Port Park"]),
      ...places("central-chiba", [
        "Chiba City Museum of Art",
        "Chiba Shrine",
        "Chiba City Folk Museum",
        "Chiba Park",
        "Chiba Zoological Park",
        "Kasori Shell Mounds",
      ]),
      ...places("inage", ["Inage Seaside Park"]),
      ...places("kaihin-makuhari", ["Makuhari Seaside Park"]),
    ],
  },
  {
    hubId: "kamakura-city",
    minimumChildren: 12,
    candidates: [
      ...places("central-kamakura", [
        "Tsurugaoka Hachimangu",
        "Komachi Street",
        "Hokokuji",
        "Zeniarai Benten",
        "Sasuke Inari Shrine",
      ]),
      ...places("hase", ["Kotoku-in Great Buddha", "Hasedera"]),
      ...places("kita-kamakura", ["Kenchoji", "Engakuji", "Meigetsuin"]),
      ...places("shonan-coast", ["Yuigahama Beach", "Inamuragasaki"]),
      ...places("central-kamakura", ["Kamakurakokomae Station"]),
      ...places("kita-kamakura", ["Jochi-ji"]),
    ],
  },
  {
    hubId: "fujisawa-city",
    minimumChildren: 9,
    candidates: [
      ...places("enoshima", [
        "Enoshima Island",
        "Enoshima Shrine",
        "Enoshima Sea Candle",
        "Samuel Cocking Garden",
        "Enoshima Iwaya Caves",
        "Chigogafuchi",
      ]),
      ...places("katase", [
        "Enoshima Aquarium",
        "Katase Higashihama Beach",
        "Katase Nishihama Beach",
      ]),
      ...places("central-fujisawa", ["Yugyo-ji"]),
      ...places("tsujido", ["Tsujido Seaside Park"]),
      ...places("katase", ["Shonan Kaigan Park"]),
    ],
  },
  {
    hubId: "kawagoe-city",
    minimumChildren: 9,
    candidates: [
      ...places("kurazukuri", [
        "Kawagoe Kurazukuri District",
        "Toki no Kane",
        "Kashiya Yokocho",
        "Taisho Roman Street",
      ]),
      ...places("central-kawagoe", [
        "Kawagoe Hikawa Shrine",
        "Kita-in",
        "Kawagoe Castle Honmaru Goten",
        "Renkeiji",
        "Kawagoe Festival Museum",
      ]),
      ...places("central-kawagoe", ["Shingashi River"]),
    ],
  },
  {
    hubId: "narita-city",
    minimumChildren: 4,
    candidates: [
      ...places("naritasan", [
        "Naritasan Shinshoji",
        "Naritasan Omotesando",
        "Naritasan Park",
      ]),
      ...places("narita-airport", [
        "Museum of Aeronautical Sciences",
        "Sakura-no-Yama Park",
        "Narita Airport Observation Decks",
      ]),
      ...places("naritasan", ["Shinsho-ji"]),
    ],
  },
  {
    hubId: "kyoto-city",
    minimumChildren: 18,
    candidates: [
      ...places("higashiyama", [
        "Kiyomizu-dera",
        "Ginkaku-ji",
        "Sanjusangen-do",
        "Nanzen-ji",
        "Eikan-do",
        "Heian Jingu",
        "Yasaka Shrine",
        "Kennin-ji",
        "Tofuku-ji",
      ]),
      ...places("fushimi", ["Fushimi Inari Taisha"]),
      ...places("northern-kyoto", ["Kinkaku-ji", "Ryoan-ji", "Ninna-ji"]),
      ...places("central-kyoto", [
        "Nijo Castle",
        "Kyoto Imperial Palace",
        "Kyoto Railway Museum",
        "Kyoto International Manga Museum",
        "Kyoto National Museum",
      ]),
      ...places("central-kyoto", ["Nishiki Market"]),
      ...places("higashiyama", ["Philosopher's Walk"]),
    ],
  },
  {
    hubId: "osaka-city",
    minimumChildren: 16,
    candidates: [
      ...places("osaka-castle", ["Osaka Castle", "Osaka Castle Park"]),
      ...places("namba-minami", [
        "Dotonbori",
        "Shinsaibashi",
        "Kuromon Market",
        "Shinsekai",
        "Tsutenkaku",
      ]),
      ...places("umeda-kita", ["Umeda Sky Building", "Osaka Station City"]),
      ...places("tennoji-abeno", ["Abeno Harukas 300", "Tennoji Park"]),
      ...places("bay-area", [
        "Osaka Aquarium Kaiyukan",
        "Tempozan Ferris Wheel",
        "Universal Studios Japan",
      ]),
      ...places("umeda-kita", ["Osaka Museum of Housing and Living"]),
      ...places("nakanoshima", ["The National Museum of Art, Osaka"]),
    ],
  },
  {
    hubId: "kobe-city",
    minimumChildren: 10,
    candidates: [
      ...places("kobe-waterfront", [
        "Kobe Harborland",
        "Meriken Park",
        "Kobe Port Tower",
        "Kobe Maritime Museum",
      ]),
      ...places("kitano", ["Kitano Ijinkan"]),
      ...places("sannomiya", [
        "Nunobiki Herb Gardens",
        "Nunobiki Ropeway",
        "Nunobiki Falls",
        "Nankinmachi Chinatown",
      ]),
      ...places("port-island", ["Kobe Animal Kingdom"]),
    ],
  },
  {
    hubId: "fukuoka-city",
    minimumChildren: 12,
    candidates: [
      ...places("ohori-maizuru", [
        "Ohori Park",
        "Fukuoka Castle Ruins",
        "Maizuru Park",
        "Fukuoka Art Museum",
      ]),
      ...places("hakata", [
        "Canal City Hakata",
        "Kushida Shrine",
        "Hakata Machiya Folk Museum",
        "Tochoji",
      ]),
      ...places("tenjin", ["Tenjin", "Nakasu", "Fukuoka Yatai"]),
      ...places("momochi", ["Fukuoka Tower"]),
    ],
  },
  {
    hubId: "nagoya-city",
    minimumChildren: 12,
    candidates: [
      ...places("central-nagoya", [
        "Nagoya Castle",
        "Honmaru Palace",
        "Toyota Commemorative Museum of Industry and Technology",
        "SCMaglev and Railway Park",
        "Nagoya City Science Museum",
        "Nagoya City Art Museum",
        "Tokugawa Art Museum",
        "Tokugawa Garden",
      ]),
      ...places("atsuta", ["Atsuta Jingu"]),
      ...places("osu", ["Osu Kannon", "Osu Shopping District"]),
      ...places("sakae", ["MIRAI Tower"]),
    ],
  },
  {
    hubId: "sendai-city",
    minimumChildren: 10,
    candidates: [
      ...places("aoba", [
        "Zuihoden",
        "Sendai Castle Ruins",
        "Aoba Castle Museum",
        "Osaki Hachimangu",
        "Sendai City Museum",
        "Jozenji-dori",
        "Sendai Mediatheque",
      ]),
      ...places("central-sendai", ["Sendai Asaichi Morning Market"]),
      ...places("miyagino", [
        "Rakuten Mobile Park Miyagi",
        "Sendai Umino-Mori Aquarium",
      ]),
    ],
  },
  {
    hubId: "sapporo-city",
    minimumChildren: 12,
    candidates: [
      ...places("central-sapporo", [
        "Odori Park",
        "Sapporo TV Tower",
        "Former Hokkaido Government Office",
        "Sapporo Clock Tower",
        "Nijo Market",
        "Tanukikoji Shopping Street",
        "Sapporo Beer Museum",
        "Hokkaido Museum of Modern Art",
      ]),
      ...places("susukino", ["Susukino"]),
      ...places("maruyama", ["Maruyama Park", "Hokkaido Jingu"]),
      ...places("moiwa", ["Mount Moiwa"]),
    ],
  },
  {
    hubId: "taito-city",
    minimumChildren: 5,
    candidates: [
      ...places("ueno", [
        "Ueno Park",
        "Tokyo National Museum",
        "National Museum of Nature and Science",
        "Ameya-Yokocho",
      ]),
      ...places("yanaka", ["Yanaka"]),
    ],
  },
  {
    hubId: "shinjuku-city",
    minimumChildren: 5,
    candidates: [
      ...places("central-shinjuku", [
        "Shinjuku Gyo-en",
        "Kabukicho",
        "Golden Gai",
        "Omoide Yokocho",
      ]),
      ...places("kagurazaka", ["Kagurazaka"]),
    ],
  },
  {
    hubId: "toshima-city",
    minimumChildren: 2,
    candidates: [
      ...places("ikebukuro", ["Sunshine City", "Sunshine Aquarium"]),
    ],
  },
  {
    hubId: "koto-city",
    minimumChildren: 2,
    candidates: [
      ...places("toyosu", ["Toyosu Market"]),
      ...places("odaiba", ["Miraikan"]),
    ],
  },
  {
    hubId: "setagaya-city",
    minimumChildren: 1,
    candidates: [...places("gotokuji", ["Gotoku-ji"])],
  },
] as const;
