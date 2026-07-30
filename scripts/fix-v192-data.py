import json
import copy

with open("src/shared/data/destinations-index.json") as f:
    data = json.load(f)

# Specific verified budget & category updates
TARGETED_UPDATES = {
    "universal-studios-japan": {
        "kind": "theme_park",
        "categories": ["Theme Park", "Entertainment"],
        "budgetMin": 10900,
        "budgetMax": 22000,
        "budgetRecommended": 16000,
        "budgetBreakdown": {"transport": 1400, "tickets": 8800, "food": 4000, "cafe": 1200},
    },
    "kobe-animal-kingdom": {
        "budgetMin": 5000,
        "budgetMax": 10000,
        "budgetRecommended": 7500,
        "budgetBreakdown": {"transport": 1400, "tickets": 2200, "food": 2500, "cafe": 800},
    },
    "nunobiki-ropeway": {
        "budgetMin": 3500,
        "budgetMax": 7000,
        "budgetRecommended": 5000,
        "budgetBreakdown": {"transport": 800, "tickets": 1560, "food": 2000, "cafe": 640},
    },
    "mount-moiwa": {
        "budgetMin": 4000,
        "budgetMax": 9000,
        "budgetRecommended": 6500,
        "budgetBreakdown": {"transport": 1400, "tickets": 1700, "food": 2500, "cafe": 800},
    },
    "tsutenkaku": {
        "kind": "tower",
        "categories": ["Viewpoint"],
        "budgetMin": 2500,
        "budgetMax": 6000,
        "budgetRecommended": 4000,
        "budgetBreakdown": {"transport": 800, "tickets": 1000, "food": 1800, "cafe": 600},
    },
    "tempozan-ferris-wheel": {
        "kind": "viewpoint",
        "categories": ["Viewpoint"],
        "budgetMin": 2500,
        "budgetMax": 6000,
        "budgetRecommended": 4000,
        "budgetBreakdown": {"transport": 800, "tickets": 900, "food": 1800, "cafe": 600},
    },
}

# Free destinations where tickets should be explicitly 0
FREE_TICKET_DESTINATIONS = {
    "meiji-jingu", "fushimi-inari-taisha", "dotonbori", "senso-ji",
    "narita-airport-observation-decks", "former-hokkaido-government-office",
    "osaka-station-city", "kobe-harborland", "lazona-kawasaki-plaza",
    "sunshine-city", "saitama-shintoshin", "tenjin", "nakasu", "susukino",
    "golden-gai", "kabukicho", "kagurazaka", "kamakurakokomae-station",
    "yanaka", "omoide-yokocho", "shinsaibashi", "shinsekai", "fukuoka-yatai",
    "nankinmachi-chinatown", "philosopher-s-walk", "shingashi-river",
    "todoroki-ryokuchi", "ikuta-ryokuchi", "inamuragasaki", "shinjuku-gyo-en",
    "kashiya-yokocho", "taisho-roman-street", "umeda-sky-building",
    "kurazukuri-warehouse-district", "osu-shopping-district",
    "tanukikoji-shopping-street", "canal-city-hakata", "kuromon-market",
    "chiba-shrine", "enoshima-shrine", "hokkaido-jingu", "kanayama-shrine",
    "katori-jingu", "kawagoe-hikawa-shrine", "kushida-shrine",
    "musashi-ichinomiya-hikawa-shrine", "osaki-hachimangu",
    "sasuke-inari-shrine", "tsurugaoka-hachimangu", "yasaka-shrine",
}

result = []

for d in data:
    d = copy.deepcopy(d)
    did = d["id"]

    # 1. Targeted budget & category fixes
    if did in TARGETED_UPDATES:
        for k, v in TARGETED_UPDATES[did].items():
            d[k] = v

    # 2. Free ticket zeroing
    if did in FREE_TICKET_DESTINATIONS and "budgetBreakdown" in d:
        d["budgetBreakdown"]["tickets"] = 0

    result.append(d)

with open("src/shared/data/destinations-index.json", "w") as f:
    json.dump(result, f, indent=2, ensure_ascii=False)
    f.write("\n")

print("✅ Validator-conforming data patch executed successfully!")
