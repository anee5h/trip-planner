# Hub Relationship Audit

Reviewed: 2026-07-28

## Policy

A destination may receive `parentDestinationId` only when its location is inside
the hub municipality. Being in the same prefecture, being geographically close,
or sharing a tourism area is not enough. Regional and multi-municipality places
remain unparented until a precise municipal hub is available and reviewed.

## Corrections in 1.8.1

Removed incorrect or non-municipal parents:

- `kinosaki-onsen` → `kobe-city` (Kinosaki is in Toyooka)
- `tama-zoological-park` → `tachikawa-tokyo` (the zoo is in Hino)
- `mount-fuji` → `fujinomiya-city` (the mountain spans municipalities and prefectures)
- `ashigara` → `hakone-town` (the record is a broad geographic area)

Reassigned `teamlab-borderless-azabudai` from `tokyo-station-chiyoda` to
`minato-city`. Added only reviewed municipal links for Akiu Onsen, Dogo Onsen,
Gunkanjima, Horyu-ji, the National Museum of Western Art, and Shuri Castle.

## Hubs to add next

These are the highest-value municipality hubs because the catalog already has a
clear in-boundary destination. Add the hub first, then assign its children.

| Priority | Proposed hub | Existing destination(s) |
| --- | --- | --- |
| High | `toyooka-city` | Kinosaki Onsen |
| High | `hino-city` | Tama Zoological Park |
| High | `fujiyoshida-city` | Arakurayama Sengen Park / Chureito |
| High | `aomori-city` | Nebuta Museum WA RASSE, Sannai-Maruyama |
| High | `hirosaki-city` | Hirosaki Castle |
| High | `ise-city` | Ise Grand Shrine |
| High | `aizuwakamatsu-city` | Tsuruga Castle |
| High | `ashikaga-city` | Ashikaga Flower Park |
| Medium | `semboku-city` | Kakunodate Samurai District, Lake Tazawa |
| Medium | `mine-city` | Akiyoshido Cave |
| Medium | `asago-city` | Takeda Castle Ruins |
| Medium | `takahashi-city` | Bitchu Matsuyama Castle |
| Medium | `marugame-city` | Marugame Castle |
| Medium | `katori-city` | Sawara |
| Medium | `choshi-city` | Choshi |

## Deliberately not assigned

Do not attach broad or multi-municipality records to an arbitrary city hub.
Examples include Mount Fuji, Fuji Five Lakes, Izu Peninsula, Kiso Valley,
Kumano Kodo, Oze National Park, Shiretoko, Noto, and island or heritage-site
records whose component locations span multiple municipalities.

## Automated guardrails

`npm run validate-relationships` now rejects a parent that is not a hub or is in
a different prefecture. Municipal-boundary verification remains an editorial
review, because the catalog does not include municipal polygon data.
