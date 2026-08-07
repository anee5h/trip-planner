/**
 * repair-okinawa-travel-semantics.ts
 *
 * Corrects walking and transport unit semantics for the 14 Okinawa records
 * repaired in PR #99. Also adds explicit walkability ratings to all published
 * Okinawa non-hub destinations.
 *
 * Run: npx tsx scripts/repair-okinawa-travel-semantics.ts
 * After: npm run sync-destination-details
 *
 * Idempotent — running twice produces identical output.
 */

import fs from "fs";
import path from "path";

const INDEX_PATH = path.resolve("src/shared/data/destinations-index.json");

interface DestinationRecord {
  id: string;
  [key: string]: any;
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (
    typeof a !== "object" ||
    a === null ||
    typeof b !== "object" ||
    b === null
  )
    return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!keysB.includes(key)) return false;
    if (!deepEqual(a[key], b[key])) return false;
  }
  return true;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// ==========================================================================
// Walking-minute corrections (metre-like → destination-specific minutes)
//
// Anchor: a relaxed visitor walking pace with stops, photos, and crowd
// friction. Roughly 60–80 effective metres per minute for most attractions.
// Terrain, stairs, heat, and layout affect the conversion.
// ==========================================================================

interface WalkingCorrection {
  walkingMin: number;
  walkingSunMin: number;
  walkingShadeMin: number;
}

const walkingCorrections: Record<string, WalkingCorrection> = {
  // Naha city centre — flat, compact, covered arcade
  "kokusai-dori-naha": {
    walkingMin: 60,
    walkingSunMin: 10,
    walkingShadeMin: 45,
  },
  // Small clifftop shrine — short walk from monorail
  "naminoue-shrine-naha": {
    walkingMin: 25,
    walkingSunMin: 10,
    walkingShadeMin: 10,
  },
  // Compact Chinese garden — short stroll
  "fukushuen-garden-naha": {
    walkingMin: 20,
    walkingSunMin: 5,
    walkingShadeMin: 10,
  },
  // Theme park with indoor exhibits, pineapple field ride
  "nago-pineapple-park": {
    walkingMin: 45,
    walkingSunMin: 20,
    walkingShadeMin: 15,
  },
  // Underwater tower + glass boat — moderate walking between exhibits
  "busena-marine-park-nago": {
    walkingMin: 30,
    walkingSunMin: 15,
    walkingShadeMin: 10,
  },
  // Large aquarium — mostly indoor, long corridors
  "churaumi-aquarium-motobu": {
    walkingMin: 60,
    walkingSunMin: 5,
    walkingShadeMin: 50,
  },
  // Tree-lined lane — flat, short, shaded
  "bise-fukugi-tree-road-motobu": {
    walkingMin: 25,
    walkingSunMin: 10,
    walkingShadeMin: 15,
  },
  // Castle ruins — hilly terrain, exposed, extensive grounds
  "nakijin-castle-ruins-motobu": {
    walkingMin: 45,
    walkingSunMin: 30,
    walkingShadeMin: 5,
  },
  // Bay viewing area — short walk from parking, limited shade
  "kabira-bay-ishigaki": {
    walkingMin: 15,
    walkingSunMin: 10,
    walkingShadeMin: 2,
  },
  // Observation deck — short walk from parking
  "tamatorizaki-viewpoint-ishigaki": {
    walkingMin: 10,
    walkingSunMin: 8,
    walkingShadeMin: 1,
  },
  // Beach access — from parking to shore, walking on sand
  "yonehara-beach-coral-ishigaki": {
    walkingMin: 20,
    walkingSunMin: 15,
    walkingShadeMin: 5,
  },
  // Long beach — walking on soft sand
  "yonaha-maehama-beach-miyako": {
    walkingMin: 30,
    walkingSunMin: 25,
    walkingShadeMin: 3,
  },
  // Bridge roadside station — short walk, mostly exposed
  "irabu-bridge-irabujima-miyako": {
    walkingMin: 10,
    walkingSunMin: 8,
    walkingShadeMin: 1,
  },
  // Cape viewpoint — short coastal path
  "higashi-hennazaki-cape-miyako": {
    walkingMin: 20,
    walkingSunMin: 15,
    walkingShadeMin: 2,
  },
  // Existing records with metre-like values
  "kouri-island-okinawa": {
    walkingMin: 35,
    walkingSunMin: 25,
    walkingShadeMin: 5,
  },
};

// ==========================================================================
// Walkability ratings (1–10) for all published Okinawa non-hub records
//
// Rubric:
//   9–10: Flat, compact, continuous paths, very easy on foot
//   7–8:  Mostly easy with minor distance, slopes, or crowd friction
//   5–6:  Moderate distance, uneven surfaces, stairs, or gaps
//   3–4:  Difficult terrain, steep access, long exposed walking
//   1–2:  Primarily vehicle-based or impractical on foot
// ==========================================================================

const walkabilityRatings: Record<string, number> = {
  // Naha
  "kokusai-dori-naha": 10, // Flat covered arcade, pedestrian-friendly
  "naminoue-shrine-naha": 7, // Some steps to clifftop, compact
  "fukushuen-garden-naha": 9, // Flat garden paths, small area
  // Nago
  "nago-pineapple-park": 8, // Mostly flat park paths, cart ride available
  "busena-marine-park-nago": 7, // Tower + pier, moderate walking
  // Motobu
  "churaumi-aquarium-motobu": 9, // Indoor, flat, well-designed
  "bise-fukugi-tree-road-motobu": 9, // Flat tree-lined lane, easy
  "nakijin-castle-ruins-motobu": 5, // Hilly, uneven ruins, stairs, exposed
  // Ishigaki
  "kabira-bay-ishigaki": 6, // Viewing area, limited path
  "tamatorizaki-viewpoint-ishigaki": 5, // Short but steep access
  "yonehara-beach-coral-ishigaki": 6, // Sand walking, some coral
  // Miyako
  "yonaha-maehama-beach-miyako": 7, // Flat beach, soft sand
  "irabu-bridge-irabujima-miyako": 4, // Roadside stop, not walkable
  "higashi-hennazaki-cape-miyako": 5, // Coastal path, uneven
  // Existing Okinawa POIs
  "shuri-castle-okinawa": 6, // Steep castle grounds, stairs
  "kouri-island-okinawa": 6, // Bridge + island paths, some slopes
};

// ==========================================================================
// Apply corrections
// ==========================================================================

function applyRepair(data: DestinationRecord[]): DestinationRecord[] {
  const result = deepClone(data);
  const okinawaIds = new Set(
    result
      .filter((r) => r.prefecture === "Okinawa" && r.status === "published")
      .map((r) => r.id),
  );

  // Apply walking corrections
  for (const [id, w] of Object.entries(walkingCorrections)) {
    const r = result.find((x) => x.id === id);
    if (!r) throw new Error(`Walking target not found: ${id}`);
    r.walkingMin = w.walkingMin;
    r.walkingSunMin = w.walkingSunMin;
    r.walkingShadeMin = w.walkingShadeMin;
  }

  // Apply walkability ratings to all published Okinawa non-hub records
  for (const [id, score] of Object.entries(walkabilityRatings)) {
    const r = result.find((x) => x.id === id);
    if (!r) throw new Error(`Walkability target not found: ${id}`);
    if (!r.ratings) r.ratings = {};
    r.ratings.walkability = score;
  }

  return result;
}

// ==========================================================================
// Validate invariants
// ==========================================================================

function validateInvariants(data: DestinationRecord[]) {
  const okinawaNonHubs = data.filter(
    (r) =>
      r.prefecture === "Okinawa" &&
      r.role !== "hub" &&
      r.status === "published",
  );

  for (const r of okinawaNonHubs) {
    const id = r.id;

    // Walkability
    const w = r.ratings?.walkability;
    assert(
      typeof w === "number" && Number.isFinite(w) && w >= 1 && w <= 10,
      `${id}: invalid walkability ${w}`,
    );

    // Walking minutes
    const wm = r.walkingMin;
    const ws = r.walkingSunMin;
    const wh = r.walkingShadeMin;
    assert(
      typeof wm === "number" && Number.isFinite(wm) && wm >= 0,
      `${id}: invalid walkingMin ${wm}`,
    );
    assert(
      typeof ws === "number" && Number.isFinite(ws) && ws >= 0,
      `${id}: invalid walkingSunMin ${ws}`,
    );
    assert(
      typeof wh === "number" && Number.isFinite(wh) && wh >= 0,
      `${id}: invalid walkingShadeMin ${wh}`,
    );
    assert(
      ws + wh <= wm,
      `${id}: sun+shade (${ws}+${wh}) > walkingMin (${wm})`,
    );

    // KAI-50: canonical visit duration only; `totalTripHours` is deprecated
    // and may include origin transport.
    const maxMinutes = r.recommendedVisitHours?.max
      ? r.recommendedVisitHours.max * 60
      : null;
    if (maxMinutes !== null) {
      assert(
        wm <= maxMinutes,
        `${id}: walkingMin (${wm}) > visit max (${maxMinutes})`,
      );
    }

    // Transport
    const to = r.transportOptions || {};
    for (const [mode, val] of Object.entries(to)) {
      assert(
        typeof val === "number" && Number.isFinite(val) && val > 0,
        `${id}: invalid transport ${mode}=${val}`,
      );
      assert(
        ["train", "bus", "car", "shinkansen", "my_car"].includes(mode),
        `${id}: unsupported transport key ${mode}`,
      );
    }
    assert(Object.keys(to).length > 0, `${id}: empty transportOptions`);
  }

  console.log(`✓ Validated ${okinawaNonHubs.length} Okinawa non-hub records`);
}

// ==========================================================================
// MAIN
// ==========================================================================

function main() {
  const original = JSON.parse(
    fs.readFileSync(INDEX_PATH, "utf-8"),
  ) as DestinationRecord[];

  const pass1 = applyRepair(original);
  validateInvariants(pass1);

  // Idempotency
  const pass2 = applyRepair(pass1);
  assert(deepEqual(pass1, pass2), "Second run produced different output");
  console.log("✓ Idempotency confirmed");

  // No non-Okinawa records changed
  const okinawaIds = new Set(
    pass1.filter((r) => r.prefecture === "Okinawa").map((r) => r.id),
  );
  for (const orig of original) {
    if (okinawaIds.has(orig.id)) continue;
    const current = pass1.find((r) => r.id === orig.id);
    assert(deepEqual(orig, current), `Non-Okinawa record changed: ${orig.id}`);
  }
  console.log("✓ No non-Okinawa records changed");

  fs.writeFileSync(INDEX_PATH, JSON.stringify(pass1, null, 2) + "\n");
  console.log(`\n✓ Wrote ${pass1.length} records`);
}

main();
