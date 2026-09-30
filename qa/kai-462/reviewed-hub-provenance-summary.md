# KAI-462 — Reviewed City Hub Image Provenance

**Audit-only evidence ledger** · base `84752e9bf479ead79e64c2ed2e68e3d245fd3b10` · 2026-09-30

Machine-readable record: [`reviewed-hub-provenance-ledger.json`](./reviewed-hub-provenance-ledger.json)

## Decision

Per-record evidence classification is complete for the six requested records. The cohort is **not wholly ready**: only classification A records may proceed. Counts: **A 4 · B 1 · C 1 · D 0 · E 0**.

**Proposed later implementation batch (A only):** `ashikaga-city`, `fukushima-city`, `semboku-city`, `yamagata-city`.

**Do not populate yet:** `morioka-city` (B) and `toyooka-city` (C). Their missing evidence is itemized below. No catalogue metadata, image URLs, generator, or excluded audit cohort was changed in this PR.

## Per-record evidence

### `ashikaga-city` — A · ready

- Current URL maps to [Commons file `Japanese wisteria, Ashikaga Flower Park 13.jpg`](https://commons.wikimedia.org/wiki/File:Japanese_wisteria,_Ashikaga_Flower_Park_13.jpg); the API's 1920px thumbnail path matches the catalogue rendition path (host alias differs).
- Commons lists own work by **SLIMHANNYA**, original **4912 × 3264**, and an explicit **CC BY-SA 4.0** self-license with attribution required.
- **Proposed metadata:** `Wikimedia Commons` · `CC BY-SA 4.0` · `SLIMHANNYA` · the linked file page.
- The Commons user page is a redlink, so a real-world identity is not established. The file-page account name itself is established; use that exact attribution. The permission field is blank, but the explicit self-license is present.

### `fukushima-city` — A · ready

- Current URL maps exactly to [Commons file `Fukushima Montage.jpg`](https://commons.wikimedia.org/wiki/File:Fukushima_Montage.jpg), page ID 99785198, **1024 × 1516**. The montage author is **水だらけのプール**; the file page explicitly self-licenses it **CC BY-SA 4.0**.
- The Commons source list names five components and their creators/licenses: [20100418花見山百花繚乱.jpg](https://commons.wikimedia.org/wiki/File:20100418%E8%8A%B1%E8%A6%8B%E5%B1%B1%E7%99%BE%E8%8A%B1%E7%B9%9A%E4%B9%B1.jpg) — BehBeh (CC BY-SA 3.0); [Bandai-Azuma Skyline in Fukushima, Japan.jpg](https://commons.wikimedia.org/wiki/File:Bandai-Azuma_Skyline_in_Fukushima,_Japan.jpg) — KBJUN (CC BY 3.0); [Iizaka Onsen 26-Aug-2018.jpg](https://commons.wikimedia.org/wiki/File:Iizaka_Onsen_26-Aug-2018.jpg) — 皓月旗 (CC BY-SA 4.0); [Fukushima Keibajo Front Close.jpg](https://commons.wikimedia.org/wiki/File:Fukushima_Keibajo_Front_Close.jpg) — Purplepumpkins (CC BY-SA 3.0); [Mt.Shinobu-yama.JPG](https://commons.wikimedia.org/wiki/File:Mt.Shinobu-yama.JPG) — Townphoto (CC BY 3.0).
- **Proposed metadata:** `Wikimedia Commons` · `CC BY-SA 4.0` · `水だらけのプール; BehBeh; KBJUN; 皓月旗; Purplepumpkins; Townphoto` · the linked montage page.
- The montage author's Commons user page is a redlink; the file-page account name is established. The page's permission field is blank, but its explicit self-license and the component source/license list are present.

### `morioka-city` — B · not ready

- Exact current file is [Commons `Morioka Montage.jpg`](https://commons.wikimedia.org/wiki/File:Morioka_Montage.jpg), page ID 99822035, **1024 × 1263**, by **水だらけのプール**, file-level **CC BY-SA 4.0**. The five component files are listed by the montage page.
- **Specific unresolved attribution evidence:**
  - The montage credits [Sansa Odori 2.JPG](https://commons.wikimedia.org/wiki/File:Sansa_Odori_2.JPG) to Yuko. That component page names **Ümit Yaldiz** as the 2005 photographer (with friendly permission) and **Immanuel Giel** as uploader; it does not tie Yuko to the photograph.
  - The montage credits [Morioka Park 1.JPG](https://commons.wikimedia.org/wiki/File:Morioka_Park_1.JPG) to Immanuel Giel. That component page names **Ümit Yaldiz** as photographer and Immanuel Giel as uploader.
  - The [Ishiwari Zakura.jpg](https://commons.wikimedia.org/wiki/File:Ishiwari_Zakura.jpg) page labels both source and author as _assumed_; Shacho0822 is not independently established as photographer.
- The Commons page identifies the montage and its license, but the full component attribution cannot be safely transcribed while the Ishiwari creator is only assumed and the other two component credits conflict with their file-page photographer/uploader fields. **Missing:** independent creator evidence for Ishiwari Zakura, and correction/verification of the two montage component credits. No partial attribution is proposed.

### `semboku-city` — A · ready

- The exact file is [Commons `Bukeyashiki Street in Kakunodate 20060506.jpg`](https://commons.wikimedia.org/wiki/File:Bukeyashiki_Street_in_Kakunodate_20060506.jpg), page ID 6464680, original **1600 × 1200**. Its source says photographed on May 3, 2006 on Bukeyashiki Street in Kakunodate, Semboku; its author is **(Hiroshi Sakamoto) 坂本　洋**; its license is **CC BY-SA 3.0**.
- **Proposed metadata:** `Wikimedia Commons` · `CC BY-SA 3.0` · `(Hiroshi Sakamoto) 坂本　洋` · the linked file page.
- The current URL contains the exact file hash/filename, establishing the underlying source file. The direct 1920px rendition request returned HTTP 429, and the Commons API returned the unscaled 1600px original for a 1920px request; **the exact derivative's HTTP response is not confirmed**. This is a CDN/rendition check limitation, not a competing source or creator. The broader post-merge validation reported zero image-fetch warnings, but did not provide a per-URL response in this evidence set.
- The filename says `20060506`; Commons `Date` and `Source` say May 3, 2006. That date discrepancy is recorded but is not part of the image-metadata proposal.

### `toyooka-city` — C · not ready

- Exact current file is [Commons `Kinosaki Onsen by day.jpg`](https://commons.wikimedia.org/wiki/File:Kinosaki_Onsen_by_day.jpg), page ID 40723500, original **4256 × 2832**. The current 3840px thumbnail path matches the Commons API rendition path (host alias differs).
- Commons claims `Source={{own}}`, names **Samchan91** as author, and labels the file **CC BY-SA 4.0**. The same page's description says **“Taken by Shogo Nishiyama”** and links only to [the photographer account's album-list URL](https://www.flickr.com/photos/sho-go/albums), not an exact photo page.
- I inspected the related [Kinosaki Onsen Flickr album](https://www.flickr.com/photos/sho-go/albums/72157629426096395/): it is a 1,812-photo album and does not establish an exact permalink matching this Commons file.
- **Missing:** evidence that Samchan91 is Shogo Nishiyama or had authority from him to license this exact photo, plus the exact original Flickr photo page/license or a photographer permission record. Therefore the Commons CC license label is visible, but the authority to grant reuse permission for this photograph is not established. No metadata proposal is made.
- The direct catalogue upload-host request returned HTTP 429; the Commons API supplied the matching thumbnail rendition on its alternate host. The 429 is not treated as an image/source mismatch.

### `yamagata-city` — A · ready

- Exact current file is [Commons `Yamagata Montage.jpg`](https://commons.wikimedia.org/wiki/File:Yamagata_Montage.jpg), page ID 99822112, **1024 × 1178**, by **水だらけのプール**, explicitly self-licensed **CC BY-SA 4.0**. The source list names five component files.
- Four components have identified creators and attribution-required licenses: [霞城公園（山形城址） - panoramio (3).jpg](<https://commons.wikimedia.org/wiki/File:%E9%9C%9E%E5%9F%8E%E5%85%AC%E5%9C%92%EF%BC%88%E5%B1%B1%E5%BD%A2%E5%9F%8E%E5%9D%80%EF%BC%89_-_panoramio_(3).jpg>) — くろふね (CC BY 3.0); [Risshaku-ji Main Hall 201706a.jpg](https://commons.wikimedia.org/wiki/File:Risshaku-ji_Main_Hall_201706a.jpg) — Tak1701d (CC BY-SA 3.0); [Zaō Onsen 20170331.jpg](https://commons.wikimedia.org/wiki/File:Za%C5%8D_Onsen_20170331.jpg) — Suicasmo (CC BY-SA 4.0); [Yamagata-Bunshokan.jpg](https://commons.wikimedia.org/wiki/File:Yamagata-Bunshokan.jpg) — かもめ2号 (CC BY-SA 3.0).
- The fifth, [Hanagasa Festa 2002.jpg](https://commons.wikimedia.org/wiki/File:Hanagasa_Festa_2002.jpg), does **not** have an established creator: Commons marks Crown of Lenten rose as assumed and says no machine-readable author. Its page labels it **Public domain** and `AttributionRequired=false`; the unresolved uploader identity is not a license/required-attribution gap for this component.
- **Proposed metadata:** `Wikimedia Commons` · `CC BY-SA 4.0` · `水だらけのプール; くろふね; Tak1701d; Suicasmo; かもめ2号` · the linked montage page. The assumed public-domain uploader is not presented as a verified creator.

## Shared authoring path and prevention

`scripts/add-reviewed-city-hubs.ts` is the confirmed cause. `HubSeed` has no `imageMetadata`; creation obtains or reuses a `heroImage`, spreads the seed into a new record, and does not set metadata. The existing-ID guard skips records already in the catalogue, so rerunning the script will not repair the six omissions. The path appears in history at `2a8890edbfbd79a9ed52978249754486e145d4f8` and `e3441d7f2fcf46fada8358772046a3afdddf8f75`.

All **22** script seeds currently exist. The other 16 are `hino-city`, `fujiyoshida-city`, `aomori-city`, `hirosaki-city`, `ise-city`, `iwakuni-city`, `aizuwakamatsu-city`, `mine-city`, `asago-city`, `takahashi-city`, `marugame-city`, `katori-city`, `choshi-city`, `koriyama-city`, `akita-city`, and `hachinohe-city`. Fifteen have an `imageMetadata` object (presence only; provenance was not re-audited). **`takahashi-city` is an additional image-bearing seed with no metadata**, but is `status: verified`; the current rule emits `MISSING_IMAGE_METADATA` only when `status === published`. Its file provenance was not investigated or classified here.

**A separate generator-prevention PR is needed.** Make image-bearing seeds require file-level metadata or an exactly reused source record with present metadata; fail before any catalogue write when evidence is absent; resolve Wikipedia PageImages selections to exact file pages; and add a no-write regression test. Do not use generic contributor/license fallbacks. This audit PR does not change the generator or catalogue.

## Schema and generated output check

`DestinationImageMetadata` has exactly four required string members: `source`, `license`, `attribution`, `sourceUrl`. No Wikimedia-specific extra field is needed. The proposed A records fit that shape. Existing correctly populated provider examples include `akita-city` (Wikimedia montage), `aizuwakamatsu-city` (CC BY-SA 4.0), and `bitchu-matsuyama-castle` (CC BY-SA 3.0).

The generator serializes canonical records into `public/data/destinations/<id>.json`, and the lite catalogue also includes `imageMetadata`. A later implementation must modify the canonical record only, run `npm run sync-destination-details`, and verify `check:catalog-sync` plus the image/provenance and warning-baseline validators. All six current canonical/detail values match (both lack metadata); no projection was edited here.

## Audit boundary and validation

- Audit-only files: this Markdown summary and the matching JSON ledger.
- No catalogue or generator files changed; no image URL changed.
- Excluded cohorts and UI/planner code were untouched.
- Classification totals reconcile to six; ready/not-ready totals reconcile to 4/2.
- The prior full local image validation remains **incomplete** (stalled/terminated). Separately, the post-merge full catalogue validation at the frozen base SHA succeeded: 16 validators, 1,130 destinations, 0 blocking errors, 718 warnings, 22 unresolved attribution, 0 image-fetch warnings. This audit did not rerun it.
