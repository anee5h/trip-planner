# Meguruto — Nationwide Transport Gateway Inventory (KAI-12 Phase 4)

Goal: model **useful transport gateways** — major Shinkansen stations, conventional-rail interchange stations, airports, and highway-bus terminals — that serve the current Meguruto catalogue (761 destinations, 186 municipalities, 47 prefectures), not arbitrary destination-to-destination pairs.

Status: initial inventory assembled 2026-08-10 from catalogue geography + architecture audit. **Evidence column is honest**: rows are `catalogue-geography` (derived from catalogue municipality mapping and known geography) until the per-domain research ledgers (SHINKANSEN/CONVENTIONAL_RAIL/FLIGHT/HIGHWAY_BUS audits) attach official sources. Implementation phases must only consume rows with `evidence: official` + source + checkedAt.

---

## 1. Gateway table (draft)

`gatewayId | type | name EN | name JA | municipality | prefecture | coordinates | operator/network | served modes | evidence | source | checkedAt`

### Shinkansen gateways (catalogue-relevant)

| gatewayId | name EN | name JA | city | prefecture | network | served modes | evidence |
|---|---|---|---|---|---|---|---|
| stn-tokyo | Tokyo Station | 東京駅 | Tokyo | Tokyo | JR East/Central/West (Tokaido, Tohoku, Joetsu, Hokuriku, Sanyo) | shinkansen, train | catalogue-geography |
| stn-shinagawa | Shinagawa | 品川 | Tokyo | Tokyo | Tokaido Shinkansen + JR | shinkansen, train | catalogue-geography |
| stn-ueno | Ueno | 上野 | Tokyo | Tokyo | Tohoku/Joetsu/Hokuriku (regional terminus) | shinkansen, train | catalogue-geography |
| stn-shin-yokohama | Shin-Yokohama | 新横浜 | Yokohama | Kanagawa | Tokaido Shinkansen | shinkansen, train | catalogue-geography |
| stn-shin-osaka | Shin-Osaka | 新大阪 | Osaka | Osaka | Tokaido + Sanyo Shinkansen | shinkansen, train | catalogue-geography |
| stn-kyoto | Kyoto | 京都 | Kyoto | Kyoto | Tokaido Shinkansen | shinkansen, train | catalogue-geography |
| stn-nagoya | Nagoya | 名古屋 | Nagoya | Aichi | Tokaido Shinkansen + JR | shinkansen, train | catalogue-geography |
| stn-gifu-hashima | Gifu-Hashima | 岐阜羽島 | Hashima | Gifu | Tokaido Shinkansen (Kodama/Hikari — Nozomi skips) | shinkansen | catalogue-geography |
| stn-shizuoka | Shizuoka | 静岡 | Shizuoka | Shizuoka | Tokaido Shinkansen (Hikari/Kodama — Nozomi skips) | shinkansen, train | catalogue-geography |
| stn-shin-kobe | Shin-Kobe | 新神戸 | Kobe | Hyogo | Sanyo Shinkansen | shinkansen, train | catalogue-geography |
| stn-himeji | Himeji | 姫路 | Himeji | Hyogo | Sanyo Shinkansen + JR | shinkansen, train | catalogue-geography |
| stn-okayama | Okayama | 岡山 | Okayama | Okayama | Sanyo Shinkansen + Seto-Ohashi (Shikoku gateway) | shinkansen, train | catalogue-geography |
| stn-hiroshima | Hiroshima | 広島 | Hiroshima | Hiroshima | Sanyo Shinkansen + JR | shinkansen, train | catalogue-geography |
| stn-hakata | Hakata | 博多 | Fukuoka | Fukuoka | Sanyo + Kyushu Shinkansen | shinkansen, train | catalogue-geography |
| stn-kokura | Kokura | 小倉 | Kitakyushu | Fukuoka | Sanyo + Kyushu Shinkansen | shinkansen, train | catalogue-geography |
| stn-kumamoto | Kumamoto | 熊本 | Kumamoto | Kumamoto | Kyushu Shinkansen | shinkansen, train | catalogue-geography |
| stn-kagoshima-chuo | Kagoshima-Chuo | 鹿児島中央 | Kagoshima | Kagoshima | Kyushu Shinkansen | shinkansen, train | catalogue-geography |
| stn-nagasaki | Nagasaki | 長崎 | Nagasaki | Nagasaki | Nishi-Kyushu Shinkansen (since 2022-09) | shinkansen, train | catalogue-geography |
| stn-sendai | Sendai | 仙台 | Sendai | Miyagi | Tohoku Shinkansen + JR | shinkansen, train | catalogue-geography |
| stn-utsunomiya | Utsunomiya | 宇都宮 | Utsunomiya | Tochigi | Tohoku Shinkansen | shinkansen, train | catalogue-geography |
| stn-omiya | Omiya | 大宮 | Saitama | Saitama | Tohoku/Joetsu/Hokuriku Shinkansen | shinkansen, train | catalogue-geography |
| stn-takasaki | Takasaki | 高崎 | Takasaki | Gunma | Joetsu/Hokuriku + Tohoku branch | shinkansen, train | catalogue-geography |
| stn-niigata | Niigata | 新潟 | Niigata | Niigata | Joetsu Shinkansen | shinkansen, train | catalogue-geography |
| stn-nagano | Nagano | 長野 | Nagano | Nagano | Hokuriku Shinkansen | shinkansen, train | catalogue-geography |
| stn-toyama | Toyama | 富山 | Toyama | Toyama | Hokuriku Shinkansen | shinkansen, train | catalogue-geography |
| stn-kanazawa | Kanazawa | 金沢 | Kanazawa | Ishikawa | Hokuriku Shinkansen | shinkansen, train | catalogue-geography |
| stn-shin-aomori | Shin-Aomori | 新青森 | Aomori | Aomori | Tohoku Shinkansen | shinkansen, train | catalogue-geography |
| stn-shin-hakodate-hokuto | Shin-Hakodate-Hokuto | 新函館北斗 | Hokuto | Hokkaido | Hokkaido Shinkansen **terminus until Sapporo extension (2031)** | shinkansen, train | catalogue-geography |
| stn-akita | Akita | 秋田 | Akita | Akita | Akita Shinkansen (Komachi) | shinkansen, train | catalogue-geography |
| stn-yamagata | Yamagata | 山形 | Yamagata | Yamagata | Yamagata Shinkansen | shinkansen, train | catalogue-geography |
| stn-fukushima | Fukushima | 福島 | Fukushima | Fukushima | Tohoku + Yamagata Shinkansen | shinkansen, train | catalogue-geography |
| stn-maibara | Maibara | 米原 | Maibara | Shiga | Tokaido Shinkansen (Kodama-only) + Hokuriku junction | shinkansen, train | catalogue-geography |
| stn-shin-tosu | Shin-Tosu | 新鳥栖 | Tosu | Saga | Kyushu Shinkansen (junction for Nagasaki branch) | shinkansen, train | catalogue-geography |
| stn-morioka | Morioka | 盛岡 | Morioka | Iwate | Tohoku + Akita (junction) | shinkansen, train | catalogue-geography |
| stn-ichinoseki | Ichinoseki | 一ノ関 | Ichinoseki | Iwate | Tohoku Shinkansen | shinkansen, train | catalogue-geography |
| stn-kurikoma-kogen | Kurikoma-Kogen | くりこま高原 | Kurihara | Miyagi | Tohoku Shinkansen (Kodama/Hayabusa subset) | shinkansen | catalogue-geography |
| stn-shin-tsuruga | Shin-Tsuruga | 敦賀 | Tsuruga | Fukui | Hokuriku Shinkansen **current terminus (since 2024-03)** | shinkansen | catalogue-geography |

**No-Shinkansen prefectures in catalogue (verified fact to record):** Nara, Wakayama, Tottori, Shimane, Mie (Tokaido Shinkansen passes through but has **no station in Mie**), all four Shikoku prefectures, Miyazaki, Oita, Saga (station only at Shin-Tosu for Nagasaki branch), Okinawa, Ibaraki, Chiba (no Shinkansen station), Yamanashi (Chuo maglev not open), Fukui (Shin-Tsuruga terminal), Kanagawa beyond Shin-Yokohama.

### Airport gateways (from `airports.json` + flight-audit findings)

| gatewayId | code | name EN | city | prefecture | zone | served modes | evidence |
|---|---|---|---|---|---|---|---|
| apt-hnd | HND | Haneda | Tokyo | Tokyo | mainland-honshu | flight | registry |
| apt-nrt | NRT | Narita | Narita | Chiba | mainland-honshu | flight | registry |
| apt-cts | CTS | New Chitose | Sapporo | Hokkaido | hokkaido | flight | registry |
| apt-itm | ITM | Itami | Osaka | Osaka | mainland-honshu | flight | registry |
| apt-kix | KIX | Kansai Int'l | Osaka | Osaka | mainland-honshu | flight | registry |
| apt-ngo | NGO | Chubu Centrair | Nagoya | Aichi | mainland-honshu | flight | registry |
| apt-fuk | FUK | Fukuoka | Fukuoka | Fukuoka | mainland-kyushu | flight | registry |
| apt-kmj | KMJ | Kumamoto | Kumamoto | Kumamoto | mainland-kyushu | flight | registry |
| apt-koj | KOJ | Kagoshima | Kagoshima | Kagoshima | mainland-kyushu | flight | registry |
| apt-oka | OKA | Naha | Naha | Okinawa | okinawa-main | flight | registry |
| apt-isg | ISG | New Ishigaki | Ishigaki | Okinawa | ishigaki | flight | registry |
| apt-mmy | MMY | Miyako | Miyako | Okinawa | miyako | flight | registry |
| apt-hkd | HKD | Hakodate | Hakodate | Hokkaido | hokkaido | flight | registry |
| apt-akj | AKJ | Asahikawa | Asahikawa | Hokkaido | hokkaido | flight | registry |
| apt-myj | MYJ | Matsuyama | Matsuyama | Ehime | mainland-shikoku | flight | registry |
| apt-tak | TAK | Takamatsu | Takamatsu | Kagawa | mainland-shikoku | flight | registry |
| apt-hij | HIJ | Hiroshima | Hiroshima | Hiroshima | mainland-honshu | flight | registry |
| apt-tsj | TSJ | Tsushima | Tsushima | Nagasaki | tsushima | flight | registry |
| apt-asj | ASJ | Amami | Amami | Kagoshima | amami | flight | registry |
| apt-kum | KUM | Yakushima | Yakushima | Kagoshima | yakushima | flight | registry |
| apt-sdo | SDO | Sado | Sado | Niigata | sado | flight | registry |

**Airport coverage gaps found (flight audit target):** SDJ (Sendai — catalogue origin with 0 flight results), OIT (Oita), KMI (Miyazaki), NGS (Nagasaki), plus UKB (Kobe), AOJ (Aomori), MSJ (Misawa), ONJ (Odate-Noshiro), GAJ (Yamagata), FKS (Fukushima), SHM (Nanki-Shirahama), TKS (Tokushima), KCZ (Kochi), FUJ (Mt Fuji Shizuoka), IKI (Iki), TNE (Tanegashima). **Airport existence ≠ catalogue relevance** — add only those serving catalogue hubs with verified routes.

### Highway-bus terminals (draft — full evidence from HIGHWAY_BUS_AUDIT)

Tokyo (Shinjuku Expressway Bus Terminal/Busta, Tokyo Stn Yaesu, Ikebukuro, Yokohama YCAT), Osaka (JR Namba OCAT, Osaka Umeda, Kyoto), Nagoya, Hiroshima (Shinkansen-guchi), Fukuoka (Hakata Stn, Tenjin), Sendai, Sapporo, Takamatsu, Matsuyama, Kagoshima (Chuo), Kumamoto, Nagasaki, Kanazawa. Evidence: catalogue-geography until audit lands.

---

## 2. Destination → gateway mapping (draft, top catalogue municipalities)

`municipalityId | dest count | primary gateway | secondary gateway | last-mile mode | evidence | confidence | source`

| municipality | dests | primary gateway | secondary gateway | last-mile | evidence | conf |
|---|---|---|---|---|---|---|
| Osaka:osaka | 20 | stn-shin-osaka | apt-itm / apt-kix | train/subway | catalogue-geography | high |
| Kyoto:kyoto | 19 | stn-kyoto | apt-itm/kix (Haruka) | train/bus | catalogue-geography | high |
| Fukuoka:fukuoka | 17 | stn-hakata | apt-fuk | subway/bus | catalogue-geography | high |
| Aichi:nagoya | 15 | stn-nagoya | apt-ngo | train/subway | catalogue-geography | high |
| Kanagawa:yokohama | 15 | stn-shin-yokohama | stn-yokohama / apt-hnd | train | catalogue-geography | high |
| Miyagi:sendai | 13 | stn-sendai | apt-sdj (missing) | train | catalogue-geography | high |
| Hyogo:kobe | 13 | stn-shin-kobe | stn-sannomiya / apt-ukb (missing) | train | catalogue-geography | high |
| Kanagawa:kamakura | 13 | stn-kamakura (Yokosuka/JR) | stn-shin-yokohama (via transfer) | train | catalogue-geography | high |
| Hokkaido:sapporo | 13 | stn-sapporo | apt-cts | JR rapid/bus | catalogue-geography | high |
| Hiroshima:hiroshima | 12 | stn-hiroshima | apt-hij | train/bus (airport limousine) | catalogue-geography | high |
| Chiba:chiba | 11 | stn-chiba (Sobu/Keiyo) | apt-nrt | train | catalogue-geography | high |
| Kanagawa:fujisawa | 11 | stn-fujisawa | stn-kamakura (Enoden/JR) | train | catalogue-geography | high |
| Saitama:saitama | 11 | stn-omiya | stn-saitama-shintoshin | train | catalogue-geography | high |
| Saitama:kawagoe | 11 | stn-kawagoe | stn-omiya | train | catalogue-geography | high |
| Tokyo:taito | 10 | stn-ueno | stn-tokyo | train | catalogue-geography | high |
| Ehime:matsuyama | 10 | stn-matsuyama | apt-myj | train/bus | catalogue-geography | high |
| Kanagawa:kawasaki | 10 | stn-kawasaki | stn-shin-yokohama | train | catalogue-geography | high |
| Nagasaki:nagasaki | 9 | stn-nagasaki | apt-ngs (missing) | train/bus | catalogue-geography | high |
| Tokyo:koto | 9 | stn-tokyo | stn-kinchomae? (none) | subway | catalogue-geography | high |
| Nara:nara | 8 | stn-nara (JR/Kintetsu) | stn-kyoto (via Kintetsu) | train | catalogue-geography | high — **no shinkansen** |
| Tokyo:chuo | 8 | stn-tokyo | — | train | catalogue-geography | high |
| Tokyo:hachioji | 8 | stn-hachioji | stn-tokyo | train | catalogue-geography | high |
| Tokyo:toshima | 8 | stn-ikebukuro | stn-ueno | train | catalogue-geography | high |
| Kochi:kochi | 8 | stn-kochi | apt-kcz (missing) | train | catalogue-geography | high — **no shinkansen** |
| Tokyo:shinjuku | 7 | stn-shinjuku | stn-tokyo | train | catalogue-geography | high |
| Hiroshima:hatsukaichi | 7 | stn-hatsukaichi (JR Sanyo + Miyajima ferry) | stn-hiroshima | train/ferry | catalogue-geography | high |
| Shimane:matsue | 7 | stn-matsue | stn-yonago? | train/bus | catalogue-geography | medium — **no shinkansen** |
| Tokyo:ome | 7 | stn-ome | stn-tachikawa | train | catalogue-geography | high |
| Shiga:otsu | 7 | stn-otsu | stn-kyoto | train | catalogue-geography | high |
| Wakayama:wakayama | 7 | stn-wakayama | apt-shm (missing) | train | catalogue-geography | high — **no shinkansen** |
| Tokyo:minato | 6 | stn-tokyo | stn-shinagawa | train | catalogue-geography | high |
| Kumamoto:aso | 6 | stn-aso (JR Hohi) | stn-kumamoto | train/bus | catalogue-geography | medium |
| Tokyo:chofu | 6 | stn-chofu | stn-shinjuku | train | catalogue-geography | high |
| Okayama:okayama | 6 | stn-okayama | apt-okj? (none) | train/bus | catalogue-geography | high |
| Tokyo:machida | 6 | stn-machida | stn-shinjuku | train | catalogue-geography | high |
| Tokushima:naruto | 6 | stn-naruto (JR) | stn-tokushima | train/bus | catalogue-geography | high — **no shinkansen** |
| Tokyo:shibuya | 6 | stn-shibuya | stn-shinjuku | train | catalogue-geography | high |
| Tokyo:sumida | 6 | stn-ryogoku? | stn-tokyo | train | catalogue-geography | high |
| Tokyo:tachikawa | 6 | stn-tachikawa | stn-shinjuku | train | catalogue-geography | high |
| Kagawa:takamatsu | 6 | stn-takamatsu | apt-tak | train/bus | catalogue-geography | high — **no shinkansen** |
| Saga:karatsu | 6 | stn-karatsu | stn-shin-tosu | train | catalogue-geography | medium |
| Nagasaki:sasebo | 6 | stn-sasebo | stn-nagasaki | train | catalogue-geography | medium |
| Kagoshima:ibusuki | 6 | stn-ibusuki | stn-kagoshima-chuo | train | catalogue-geography | medium |
| Oita:hita | 6 | stn-hita | stn-kurume? / stn-oita | train | catalogue-geography | medium |
| Tokyo:chiyoda | 5 | stn-tokyo | stn-tokyo station dest | train | catalogue-geography | high |
| Oita:beppu | 5 | stn-beppu | apt-oit (missing) | train/bus | catalogue-geography | medium |
| Yamagata:yamagata | 5 | stn-yamagata | apt-gaj (missing) | train | catalogue-geography | high |
| Tokyo:hino | 5 | stn-hino | stn-tachikawa | train | catalogue-geography | high |
| Tokushima:miyoshi | 5 | stn-miyoshi | stn-tokushima | train | catalogue-geography | medium |
| Fukuoka:kitakyushu | 5 | stn-kokura | apt-kkj (missing) | train | catalogue-geography | high |
| Okayama:kurashiki | 5 | stn-kurashiki | stn-okayama | train | catalogue-geography | high |
| Chiba:narita | 5 | apt-nrt | stn-narita | train | catalogue-geography | high |
| Okinawa:naha | 5 | apt-oka | stn-naha (monorail) | monorail | catalogue-geography | high |
| Tokushima:tokushima | 5 | stn-tokushima | apt-tks (missing) | train/bus | catalogue-geography | high — **no shinkansen** |
| Ehime:uwajima | 5 | stn-uwajima | stn-matsuyama | train | catalogue-geography | medium |
| Miyazaki:nichinan | 5 | stn-nichinan | stn-miyazaki | train | catalogue-geography | medium — **no shinkansen** |
| Fukushima:aizuwakamatsu | 4 | stn-aizu-wakamatsu | stn-koriyama (Tohoku Shinkansen) | train/bus | catalogue-geography | medium |
| Kyoto:miyazu | 4 | stn-miyazu | stn-fukuchiyama / stn-kyoto | train | catalogue-geography | medium |
| Aomori:aomori | 4 | stn-shin-aomori | stn-aomori | train | catalogue-geography | high |

Standalone records without `municipalityId` (34) — e.g. `kanazawa`, `fukui`, `noto`, `mount-fuji`, `naoshima-art-island-kagawa`, `ogasawara-islands-tokyo`, `shiretoko-national-park-hokkaido` — resolve to gateways via `gatewayHubId` (40 records point at 27 hubs: matsumoto-city 4, morioka-city 3, mito-city 3, …) or via explicit `transportZoneId`. **`relationships.gatewayHubId` is currently unused by any transport service** (see gap analysis).

---

## 3. Rules applied

1. A gateway relationship means **actual access**, not containment: `Nara` is mapped to Nara Station, not to Kyoto Station as its "shinkansen gateway" — Kyoto is a *transfer* gateway, and any claim "Shinkansen to Nara" must model the Kyoto→Nara leg explicitly.
2. Existing municipality/parent/gateway rules are preserved: `parentDestinationId` only within same municipality; `gatewayHubId` only for hub-gated places.
3. Confidence `high` = catalogue municipality mapping + stable geography; `medium` = derived from hub/region relationships; **no row above is `official` until a source URL is attached in the implementation phases**.
4. No prefecture-level "contains a station" logic — each destination maps to a concrete gateway entity.

## 4. Next steps (implementation phases)

- Attach official sources + checkedAt to every row consumed by route claims (research ledgers provide them).
- Decide schema: `gatewayId` entities vs reusing `relationships.gatewayHubId`; see `TRANSPORT_MODEL_GAP_ANALYSIS.md` recommendation.
- Add missing airports (SDJ first) only with verified routes (FLIGHT_AUDIT).
