import json
import copy

with open("src/shared/data/destinations-index.json") as f:
    data = json.load(f)

CORRECTIONS = {
    # 1. Mozu-Furuichi Kofun Group -> Sakai City
    "mozufuruichi-kofun-osaka": {
        "relationships": {"parentDestinationId": "sakai-city"},
        "description": "Mozu-Furuichi Kofun Group: Mounded Tombs of Ancient Japan is a UNESCO World Heritage Site in Sakai City, designated for its outstanding universal cultural value.",
        "content": {
            "en": {
                "name": "Mozu-Furuichi Kofun Group: Mounded Tombs of Ancient Japan",
                "description": "Mozu-Furuichi Kofun Group: Mounded Tombs of Ancient Japan is a UNESCO World Heritage Site in Sakai City, designated for its outstanding universal cultural value.",
                "highlights": ["UNESCO World Heritage", "Ancient Kofun Tombs", "Emperor Nintoku Tomb"],
            },
            "ja": {
                "name": "百舌鳥・古市古墳群-古代日本の墳墓群-",
                "description": "百舌鳥・古市古墳群はSakai Cityにあるユネスコ世界文化遺産の古代墳墓群です。仁徳天皇陵古墳など古代日本の壮大な巨石・前方後円墳群を身近に体感できます。",
                "highlights": ["ユネスコ世界遺産", "仁徳天皇陵古墳", "古代史跡"],
            },
        },
    },
    # 2. Horyu-ji Area (Ikaruga Town, Nara)
    "horyuji-temple-nara": {
        "relationships": {"parentDestinationId": "ikaruga-town"},
        "description": "Buddhist Monuments in the Horyu-ji Area is a UNESCO World Heritage Site in Ikaruga Town, Nara, home to the world's oldest surviving wooden structures.",
        "content": {
            "en": {
                "name": "Buddhist Monuments in the Horyu-ji Area",
                "description": "Buddhist Monuments in the Horyu-ji Area is a UNESCO World Heritage Site in Ikaruga Town, Nara, home to the world's oldest surviving wooden structures.",
                "highlights": ["UNESCO World Heritage", "Horyu-ji Temple", "World's Oldest Wooden Structure"],
            },
            "ja": {
                "name": "法隆寺地域の仏教建造物",
                "description": "法隆寺地域の仏教建造物はIkaruga Townにあるユネスコ世界文化遺産です。世界最古の木造建築群である法隆寺や法起寺の五重塔など古代仏教美術の最高峰を鑑賞できます。",
                "highlights": ["ユネスコ世界遺産", "法隆寺", "世界最古の木造建築"],
            },
        },
    },
    # 3. Asuka-Fujiwara & Mount Yoshino -> Nara regional relationships
    "asuka-fujiwara-nara": {
        "relationships": {"parentDestinationId": "nara-city"},
    },
    "mount-yoshino-nara": {
        "relationships": {"parentDestinationId": "nara-city"},
    },
    # 4. Maruyama Park (Sapporo) -> Correct Sapporo coordinates
    "maruyama-park": {
        "coordinates": {"lat": 43.0542, "lng": 141.3175},
    },
    # 5. Sanjusangen-do (Kyoto) -> Correct Kyoto coordinates
    "sanjusangen-do": {
        "coordinates": {"lat": 34.9878, "lng": 135.7717},
    },
    # 6. Narita Airport Observation Decks -> Correct Narita coordinates
    "narita-airport-observation-decks": {
        "coordinates": {"lat": 35.7647, "lng": 140.3863},
    },
    # 7. Kanayama Shrine (Kawasaki) -> Correct Kawasaki coordinates
    "kanayama-shrine": {
        "coordinates": {"lat": 35.5342, "lng": 139.7161},
    },
}

result = []
for d in data:
    d = copy.deepcopy(d)
    did = d["id"]

    if did in CORRECTIONS:
        for k, v in CORRECTIONS[did].items():
            if isinstance(v, dict) and k in d and isinstance(d[k], dict):
                d[k].update(v)
            else:
                d[k] = v

    result.append(d)

with open("src/shared/data/destinations-index.json", "w") as f:
    json.dump(result, f, indent=2, ensure_ascii=False)
    f.write("\n")

print("✅ Destination & Nara/Ikaruga discrepancies patch applied successfully!")
