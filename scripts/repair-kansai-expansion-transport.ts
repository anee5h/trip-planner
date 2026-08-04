/**
 * data/kansai-expansion-transport-data repair script
 *
 * Backfills `transportOptions` for the 38 Kansai hub-expansion child destinations
 * that were added in v1.9.2 without transport data.
 *
 * Also corrects the `gatewayHubId` for cupnoodles-museum-osaka-ikeda
 * from "sakai-city" to "osaka-city" (the museum is in Ikeda, north Osaka).
 *
 * Transport times are door-to-door minutes from Tokyo (default home station),
 * consistent with the majority convention in destinations-index.json.
 * Values were derived by:
 *   1. Calibrating against existing children in the same prefecture/hub
 *   2. Adding known local transit legs (e.g. Nozomi shinkansen + limited express + local)
 *   3. Cross-checking against the hub parent times in the same data file
 *
 * SAFETY: read–transform–verify–write. Does not touch any other fields.
 * Run twice → same output (idempotent).
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const INDEX_FILE = resolve(ROOT, "src/shared/data/destinations-index.json");

// ---------------------------------------------------------------------------
// Transport times (minutes, door-to-door from Tokyo/default home station)
//
// Derivation notes per group:
//
// UJI (Kyoto): Nozomi to Kyoto ~130min + JR Nara line to Uji ~17min = shinkansen:147.
//   Uji area destinations cluster at shinkansen:145-150, train:245-250.
//   Cross-ref: fushimi-inari shinkansen:129 (Kyoto stn), ginkaku-ji shinkansen:130.
//
// MIYAZU (Kyoto): amanohashidate-kyoto {train:160,bus:190,car:210} is the calibrator.
//   Kasamatsu Park is the ropeway top at Amanohashidate — same access point.
//   Ine Funaya is 30-40min further by bus from Amanohashidate.
//
// HIMEJI (Hyogo): himeji-castle {shinkansen:180,train:210,car:270} is the calibrator.
//   Koko-en is immediately adjacent to Himeji Castle — same times.
//   Engyo-ji is +5min by ropeway from Himeji station.
//
// TOYOOKA (Hyogo): kinosaki-onsen {train:240,bus:280,car:320} is the calibrator.
//   Genbudo is 5min from Toyooka station. Izushi is 30min by bus from Toyooka.
//
// ASAGO (Hyogo): takeda-castle-ruins {train:180} is the calibrator.
//   Ritsuunkyo is further into the mountains (car-primary). Ikuno is on the JR Bantan line.
//
// IKARUGA (Nara): horyuji-temple-nara {train:45} uses local times; nara-park-todaiji {train:170}
//   uses Tokyo-origin times. We use Tokyo-origin for consistency with the majority.
//   Ikaruga is ~10min from Nara by local rail. Hokki-ji is 2km from Horyuji.
//
// NARA CITY: nara-park-todaiji {train:170,bus:200,car:240} is the calibrator.
//   All three destinations are within walking distance of Nara station.
//
// OTSU (Shiga): Otsu is immediately east of Kyoto. Nozomi to Kyoto(130)+local(10)=140min.
//   hikone-castle-shiga {train:110,car:120} appears to use local Kansai-origin times —
//   we use Tokyo-origin here for all Shiga/Otsu destinations.
//
// HIKONE (Shiga): Nozomi to Maibara (~145min)+local to Hikone(15min)=160min.
//   Genkyuen is in Hikone castle grounds. Miho Museum is in Koka (different city,
//   accessible only by shuttle bus — significantly harder to reach).
//
// ISE (Mie): ise-grand-shrine {train:180,bus:210,car:240} is the calibrator.
//   Okage Yokocho is at Naiku gate — same access. Meoto Iwa is 10min east by local train.
//
// WAKAYAMA CITY: Tokyo→Shin-Osaka(150)+Kuroshio to Wakayama(80)=230min base.
//   Each site adds local transit from Wakayama station.
//
// KOYA-SAN: Tokyo→Shin-Osaka(150)+Nankai Ltd Express(80)=230min base. Same for both sites.
//
// SHIRAHAMA: Tokyo→Shin-Osaka(150)+Kuroshio to Shirahama(110)=260min base.
//   nachi-falls {train:270} is the calibrator for remote Wakayama coast.
//
// OSAKA (cupnoodles): Ikeda city, north Osaka. Nozomi to Shin-Osaka(150)+Hankyu to Ikeda(25)=175min.
//   GATEWAY FIX: sakai-city → osaka-city (Ikeda is in northern Osaka, not Sakai).
//
// OSAKA (sakai-city-museum): Sakai, south Osaka. Nozomi to Shin-Osaka(150)+local(20)=170min.
// ---------------------------------------------------------------------------

const TRANSPORT_PATCH: Record<string, Record<string, number>> = {
  // Kyoto / Uji
  "byodoin-temple": { shinkansen: 147, train: 247, bus: 247 },
  "uji-tea-culture-center": { shinkansen: 147, train: 247, bus: 247 },
  "mimuroto-ji-temple": { shinkansen: 152, train: 252, bus: 252 },

  // Kyoto / Miyazu
  "ine-funaya-boathouses": { train: 195, bus: 225, car: 245 },
  "kasamatsu-park-view": { train: 162, bus: 192, car: 212 },

  // Hyogo / Himeji
  "koko-en-garden": { shinkansen: 180, train: 210, car: 270 },
  "engyo-ji-mount-shosha": { shinkansen: 185, train: 215, car: 275 },

  // Hyogo / Toyooka
  "izushi-castle-town": { train: 255, bus: 295, car: 325 },
  "genbudo-cave-park": { train: 242, bus: 282, car: 312 },

  // Hyogo / Asago
  "ritsuunkyo-viewpoint": { train: 200, car: 200 },
  "ikuno-silver-mine": { train: 196, bus: 228, car: 222 },

  // Nara / Ikaruga
  "hokki-ji-pagoda": { train: 175, bus: 205, car: 240 },
  "chogosonshi-ji-temple": { train: 170, bus: 200, car: 235 },

  // Nara / Nara city
  "toshodai-ji-temple": { train: 172, bus: 202, car: 242 },
  "yakushi-ji-temple": { train: 172, bus: 202, car: 242 },
  "naramachi-historic-district": { train: 170, bus: 200, car: 240 },

  // Shiga / Otsu
  "enryaku-ji-mount-hiei": { train: 150, bus: 162, car: 170 },
  "ukimido-mangetsu-ji": { train: 145, bus: 160, car: 175 },
  "lake-biwa-shiga": { train: 143, bus: 160, car: 175 },
  "shirahige-shrine-lake-biwa": { train: 160, bus: 175, car: 185 },
  "omi-hachiman-canal": { train: 175, bus: 195, car: 205 },
  "hiei-zan-driveway-observatory": { train: 152, car: 165 },

  // Shiga / Hikone
  "genkyuen-garden": { train: 160, car: 168 },
  "miho-museum-koka": { train: 210, bus: 245, car: 232 },

  // Mie / Ise
  "okage-yokocho-oharai-machi": { train: 180, bus: 210, car: 240 },
  "meoto-iwa-wedded-rocks": { train: 186, bus: 218, car: 248 },

  // Wakayama / Wakayama city
  "kishi-station-tama-cat": { train: 262, bus: 305, car: 292 },
  "wakayama-castle": { train: 232, bus: 268, car: 280 },
  "kataonami-beach-wakanoura": { train: 242, bus: 278, car: 285 },
  "kimii-dera-temple": { train: 233, bus: 270, car: 282 },
  "kuroshio-market-marina-city": { train: 235, bus: 272, car: 285 },
  "tomogashima-islands": { train: 260, bus: 302, car: 295 },

  // Wakayama / Koya-san
  "okunoin-cemetery-koyasan": { train: 230, bus: 272 },
  "danjo-garan-koyasan": { train: 228, bus: 270 },

  // Wakayama / Shirahama
  "senjojiki-sandanbeki-cliffs": { train: 265, bus: 308, car: 342 },
  "shirahama-beach-adventure-world": { train: 262, bus: 305, car: 338 },

  // Osaka / cupnoodles (gateway corrected separately)
  "cupnoodles-museum-osaka-ikeda": { shinkansen: 175, train: 200, bus: 220 },

  // Osaka / Sakai
  "sakai-city-museum": { shinkansen: 168, train: 192, bus: 212, car: 235 },
};

// Gateway correction
const GATEWAY_CORRECTIONS: Record<string, string> = {
  "cupnoodles-museum-osaka-ikeda": "osaka-city",
};

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

const raw = readFileSync(INDEX_FILE, "utf8");
const destinations = JSON.parse(raw) as Array<Record<string, unknown>>;

let transportPatched = 0;
let gatewayPatched = 0;
const skipped: string[] = [];

const updated = destinations.map((dest) => {
  const id = dest.id as string;

  let changed = false;
  const next = { ...dest };

  // Backfill transportOptions
  if (TRANSPORT_PATCH[id]) {
    if (dest.transportOptions !== undefined) {
      // Already has data — skip to preserve hand-edited values
      skipped.push(id);
    } else {
      next.transportOptions = TRANSPORT_PATCH[id];
      transportPatched++;
      changed = true;
    }
  }

  // Fix gateway hub
  if (GATEWAY_CORRECTIONS[id]) {
    const rels = (dest.relationships as Record<string, string>) || {};
    if (rels.gatewayHubId !== GATEWAY_CORRECTIONS[id]) {
      next.relationships = { ...rels, gatewayHubId: GATEWAY_CORRECTIONS[id] };
      gatewayPatched++;
      changed = true;
    }
  }

  return next;
});

// Verify
const missing = Object.keys(TRANSPORT_PATCH).filter((id) => {
  const d = updated.find((x) => x.id === id);
  return !d || !d.transportOptions;
});

if (missing.length > 0) {
  console.error("ERROR: still missing after patch:", missing);
  process.exit(1);
}

// Write
writeFileSync(INDEX_FILE, JSON.stringify(updated, null, 2) + "\n", "utf8");

console.log(`transport patched : ${transportPatched}`);
console.log(`gateway corrected : ${gatewayPatched}`);
console.log(
  `already had data  : ${skipped.length}${skipped.length > 0 ? " (" + skipped.join(", ") + ")" : ""}`,
);
console.log(`total in index    : ${updated.length}`);
