#!/usr/bin/env python3
"""
Fix v1.7.60 data issues:
1. Remove itinerary/itineraries fields from all destinations
2. Fix hub featured vs nearby relationships
"""

import json

INPUT_FILE = "src/shared/data/destinations-index.json"
OUTPUT_FILE = "src/shared/data/destinations-index.json"

with open(INPUT_FILE, "r") as f:
    destinations = json.load(f)

by_id = {d["id"]: d for d in destinations}

def get_rel(dest):
    return dest.setdefault("relationships", {})

def ensure_list(dest, key):
    rel = get_rel(dest)
    if key not in rel or rel[key] is None:
        rel[key] = []
    return rel[key]

def add_to_featured(hub_id, dest_id):
    hub = by_id.get(hub_id)
    if not hub: return
    featured = ensure_list(hub, "featuredDestinationIds")
    if dest_id not in featured:
        featured.append(dest_id)
        print(f"  + Added {dest_id} to {hub_id}.featured")

def remove_from_featured(hub_id, dest_id):
    hub = by_id.get(hub_id)
    if not hub: return
    featured = ensure_list(hub, "featuredDestinationIds")
    if dest_id in featured:
        featured.remove(dest_id)
        print(f"  - Removed {dest_id} from {hub_id}.featured")

def set_featured(hub_id, dest_ids):
    hub = by_id.get(hub_id)
    if not hub: return
    get_rel(hub)["featuredDestinationIds"] = list(dest_ids)
    print(f"  = Set {hub_id}.featured = {dest_ids}")

def set_nearby(hub_id, dest_ids):
    hub = by_id.get(hub_id)
    if not hub: return
    get_rel(hub)["nearbyDestinationIds"] = list(dest_ids)
    print(f"  = Set {hub_id}.nearby = {dest_ids}")

def set_parent(dest_id, parent_id):
    dest = by_id.get(dest_id)
    if not dest: return
    get_rel(dest)["parentDestinationId"] = parent_id
    print(f"  = Set {dest_id}.parent = {parent_id}")

def clear_parent(dest_id):
    dest = by_id.get(dest_id)
    if not dest: return
    rel = get_rel(dest)
    if "parentDestinationId" in rel:
        del rel["parentDestinationId"]
        print(f"  - Cleared {dest_id}.parent")

# STEP 1: Remove itinerary data
print("\n=== Step 1: Remove itinerary data ===")
removed_count = 0
for dest in destinations:
    changed = False
    if "itinerary" in dest:
        del dest["itinerary"]
        changed = True
    if "itineraries" in dest:
        del dest["itineraries"]
        changed = True
    if changed:
        removed_count += 1
print(f"  Removed itinerary data from {removed_count} destinations")

# STEP 2: Fix Yokohama City
print("\n=== Step 2: Fix Yokohama City ===")
# Zoorasia: has parentId=yokohama-city but not in featured
add_to_featured("yokohama-city", "yokohama-zoorasia")
# Hakkeijima is in Kanazawa Ward (Yokohama city) - add to featured
add_to_featured("yokohama-city", "hakkeijima")
set_parent("hakkeijima", "yokohama-city")
set_nearby("yokohama-city", ["hakone-town", "fujisawa-city", "kamakura-city", "yokosuka-city"])

# STEP 3: Fix Fujisawa City
print("\n=== Step 3: Fix Fujisawa City ===")
# Enoshima IS in Fujisawa. Hakone/Ashigara/Hakkeijima are NOT.
set_featured("fujisawa-city", ["enoshima-island"])
set_nearby("fujisawa-city", ["kamakura-city", "hakone-town", "yokohama-city"])

# STEP 4: Fix Odawara, Sagamihara, Yokosuka
print("\n=== Step 4: Fix Kanagawa hubs ===")
set_featured("odawara-city", [])
set_nearby("odawara-city", ["hakone-town", "fujisawa-city", "yokohama-city"])
set_featured("sagamihara-city", [])
set_nearby("sagamihara-city", ["hakone-town", "yokohama-city", "fujisawa-city"])
set_featured("yokosuka-city", [])
set_nearby("yokosuka-city", ["yokohama-city", "fujisawa-city", "kamakura-city"])

# STEP 5: Fix 16 Tokyo ward hubs with generic featured
print("\n=== Step 5: Fix Tokyo ward hubs ===")
generic_nearby = ["shibuya-city", "shinjuku-city", "minato-city", "taito-city"]
bad_ward_hubs = [
    "adachi-city", "arakawa-city", "bunkyo-city", "edogawa-city",
    "itabashi-city", "katsushika-city", "kita-city", "koto-city",
    "meguro-city", "nakano-city", "nerima-city", "ota-city",
    "setagaya-city", "shinagawa-city", "suginami-city", "toshima-city"
]
for hub_id in bad_ward_hubs:
    set_featured(hub_id, [])
    set_nearby(hub_id, generic_nearby)

# STEP 6: Fix Matsumoto City
print("\n=== Step 6: Fix Matsumoto City ===")
set_featured("matsumoto-city", [])
set_nearby("matsumoto-city", ["karuizawa-town", "nagano-city", "kiso"])

# STEP 7: Fix Miyazu City
print("\n=== Step 7: Fix Miyazu City ===")
set_featured("miyazu-city", ["amanohashidate-kyoto"])
set_nearby("miyazu-city", ["kyoto-city", "osaka-city"])

# STEP 8: Fix Hokkaido hubs featuring Hakodate
print("\n=== Step 8: Fix Hokkaido hubs ===")
for hub_id in ["sapporo-city", "niseko-town", "otaru-city"]:
    remove_from_featured(hub_id, "hakodate-night-view")

# STEP 9: Fix Uji City
print("\n=== Step 9: Fix Uji City ===")
set_featured("uji-city", [])
set_nearby("uji-city", ["kyoto-city", "nara-city", "osaka-city"])

# STEP 10: Fix Narita/Urayasu
print("\n=== Step 10: Fix Narita/Urayasu ===")
set_featured("narita-city", [])
set_nearby("narita-city", ["chiba-city", "urayasu-city"])
set_featured("urayasu-city", [])
set_nearby("urayasu-city", ["chiba-city", "narita-city"])

# STEP 11: Fix Mito/Tsukuba
print("\n=== Step 11: Fix Mito/Tsukuba ===")
set_featured("mito-city", ["art-tower-mito"])
set_nearby("mito-city", ["ibaraki-hitachi-seaside-park", "ibaraki-fukuroda-falls", "ibaraki-mount-tsukuba"])
set_featured("tsukuba-city", ["ibaraki-mount-tsukuba"])
set_nearby("tsukuba-city", ["mito-city", "ibaraki-hitachi-seaside-park"])

# STEP 12: Fix Shizuoka/Numazu
print("\n=== Step 12: Fix Shizuoka/Numazu ===")
set_featured("shizuoka-city", [])
set_nearby("shizuoka-city", ["fujinomiya-city", "atami-city", "ito-city", "izu"])
set_featured("numazu-city", [])
set_nearby("numazu-city", ["fujinomiya-city", "atami-city", "ito-city", "izu"])

# STEP 13: Fix Saitama/Tokorozawa
print("\n=== Step 13: Fix Saitama/Tokorozawa ===")
set_featured("saitama-city", [])
set_nearby("saitama-city", ["kawagoe-city", "chichibu-city"])
set_featured("tokorozawa-city", [])
set_nearby("tokorozawa-city", ["kawagoe-city", "saitama-city", "chichibu-city"])

# STEP 14: Fix Okazaki/Toyota/Sakai
print("\n=== Step 14: Fix Okazaki/Toyota/Sakai ===")
set_featured("okazaki-city", [])
set_nearby("okazaki-city", ["nagoya-city", "inuyama-city"])
set_featured("toyota-city", [])
set_nearby("toyota-city", ["nagoya-city", "inuyama-city"])
set_featured("sakai-city", [])
set_nearby("sakai-city", ["osaka-city", "nara-city"])

# STEP 15: Fix Utsunomiya
print("\n=== Step 15: Fix Utsunomiya ===")
set_featured("utsunomiya-city", ["utsunomiya-oya"])
set_nearby("utsunomiya-city", ["nikko-city", "kinugawa-onsen"])

# STEP 16: Fix Matsue
print("\n=== Step 16: Fix Matsue ===")
set_featured("matsue-city", ["matsue-castle"])
set_nearby("matsue-city", ["izumo-taisha"])

# STEP 17: Fix Onomichi
print("\n=== Step 17: Fix Onomichi ===")
set_featured("onomichi-city", [])
set_nearby("onomichi-city", ["miyajima-itsukushima", "hiroshima-city"])

# STEP 18: Fix Takamatsu
print("\n=== Step 18: Fix Takamatsu ===")
set_featured("takamatsu-city", [])
set_nearby("takamatsu-city", ["marugame-castle"])

# STEP 19: Fix Otsu
print("\n=== Step 19: Fix Otsu ===")
set_featured("otsu-city", [])
set_nearby("otsu-city", ["hikone-castle-shiga", "kyoto-city"])

# STEP 20: Fix Wakayama/Shirahama
print("\n=== Step 20: Fix Wakayama/Shirahama ===")
set_featured("wakayama-city", [])
set_nearby("wakayama-city", ["nachi-falls-wakayama", "osaka-city"])
set_featured("shirahama-town", [])
set_nearby("shirahama-town", ["nachi-falls-wakayama", "wakayama-city"])

# STEP 21: Fix Nagano City
print("\n=== Step 21: Fix Nagano City ===")
clear_parent("nagano-narai-juku")
set_featured("nagano-city", [])
set_nearby("nagano-city", ["nagano-narai-juku", "matsumoto-city", "karuizawa-town"])

# Write output
print(f"\n=== Writing output to {OUTPUT_FILE} ===")
with open(OUTPUT_FILE, "w") as f:
    json.dump(destinations, f, ensure_ascii=False, separators=(",", ":"))
print("Done!")
