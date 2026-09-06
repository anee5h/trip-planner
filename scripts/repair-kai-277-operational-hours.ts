import { readFileSync, writeFileSync } from "node:fs";

const CATALOGUE_PATH = "src/shared/data/destinations-index.json";

const repairs = [
  {
    id: "fukuurajima",
    expectedBusinessHours: "08:30 - 17:00 (Apr–Oct) / 08:30 - 16:30 (Nov–Mar)",
    expectedOpeningHours: undefined,
    replacementBusinessHours:
      "Open access (island); bridge and facility schedules vary",
  },
  {
    id: "nakadake-crater-aso",
    expectedBusinessHours: undefined,
    expectedOpeningHours:
      "09:00–17:00 (Crater access varies by volcanic activity)",
    replacementBusinessHours: undefined,
  },
  {
    id: "shiratani-unsuikyo-ravine",
    expectedBusinessHours: undefined,
    expectedOpeningHours: "08:30–16:30 (Administration building)",
    replacementBusinessHours: undefined,
  },
  {
    id: "sunamushi-onsen-saraku",
    expectedBusinessHours: undefined,
    expectedOpeningHours: "06:00–21:00 (last admission 20:30)",
    replacementBusinessHours: undefined,
  },
  {
    id: "takachiho-gorge",
    expectedBusinessHours: undefined,
    expectedOpeningHours: "08:30–17:00 (Boat rentals)",
    replacementBusinessHours: undefined,
  },
  {
    id: "takegawara-onsen-beppu",
    expectedBusinessHours: undefined,
    expectedOpeningHours: "06:30–22:30",
    replacementBusinessHours: undefined,
  },
  {
    id: "lake-sagami",
    expectedBusinessHours: "Open access",
    expectedOpeningHours: "24 Hours (Open access)",
    replacementBusinessHours: undefined,
  },
  {
    id: "seiko-museum-ginza",
    expectedBusinessHours: "Open access",
    expectedOpeningHours: "09:30 - 17:00 (Last admission 16:30)",
    replacementBusinessHours: undefined,
  },
  {
    id: "museum-contemporary-art-tokyo",
    expectedBusinessHours: "Open access",
    expectedOpeningHours: "09:30 - 17:00 (Last admission 16:30)",
    replacementBusinessHours: undefined,
  },
  {
    id: "fukagawa-edo-museum",
    expectedBusinessHours: "Open access",
    expectedOpeningHours: "09:30 - 17:00 (Last admission 16:30)",
    replacementBusinessHours: undefined,
  },
  {
    id: "sumida-hokusai-museum",
    expectedBusinessHours: "Open access",
    expectedOpeningHours: "09:30 - 17:00 (Last admission 16:30)",
    replacementBusinessHours: undefined,
  },
  {
    id: "ryogoku-kokugikan-sumo-museum",
    expectedBusinessHours: "Open access",
    expectedOpeningHours: "09:30 - 17:00 (Last admission 16:30)",
    replacementBusinessHours: undefined,
  },
  {
    id: "tokiwaso-manga-museum",
    expectedBusinessHours: "Open access",
    expectedOpeningHours: "09:30 - 17:00 (Last admission 16:30)",
    replacementBusinessHours: undefined,
  },
  {
    id: "machida-graphic-arts-museum",
    expectedBusinessHours: "Open access",
    expectedOpeningHours: "09:30 - 17:00 (Last admission 16:30)",
    replacementBusinessHours: undefined,
  },
  {
    id: "buaiso",
    expectedBusinessHours: "Open access",
    expectedOpeningHours: "09:30 - 17:00 (Last admission 16:30)",
    replacementBusinessHours: undefined,
  },
  {
    id: "polar-science-museum",
    expectedBusinessHours: "Open access",
    expectedOpeningHours: "09:30 - 17:00 (Last admission 16:30)",
    replacementBusinessHours: undefined,
  },
  {
    id: "nakanoshima-museum-art-osaka",
    expectedBusinessHours: "Open access",
    expectedOpeningHours: undefined,
    replacementBusinessHours: undefined,
  },
  {
    id: "higashiyama-sky-tower-nagoya",
    expectedBusinessHours: "Open access",
    expectedOpeningHours: undefined,
    replacementBusinessHours: undefined,
  },
  {
    id: "tachikawa-manga-park",
    expectedBusinessHours: "Open access",
    expectedOpeningHours: "09:30 - 17:00 (Last admission 16:30)",
    replacementBusinessHours: undefined,
  },
] as const;

const catalogue = JSON.parse(readFileSync(CATALOGUE_PATH, "utf8")) as Array<
  Record<string, unknown>
>;
const byId = new Map(
  catalogue.map((destination) => [destination.id, destination]),
);

let changed = 0;

for (const repair of repairs) {
  const destination = byId.get(repair.id);
  if (!destination) throw new Error(`Missing repair target: ${repair.id}`);
  if (
    destination.businessHours === repair.replacementBusinessHours &&
    destination.openingHours === undefined &&
    destination.openingHoursMetadata === undefined
  ) {
    continue;
  }
  if (destination.businessHours !== repair.expectedBusinessHours) {
    throw new Error(`Unexpected businessHours for ${repair.id}`);
  }
  if (destination.openingHours !== repair.expectedOpeningHours) {
    throw new Error(`Unexpected openingHours for ${repair.id}`);
  }
  destination.businessHours = repair.replacementBusinessHours;
  changed += 1;
  if (repair.replacementBusinessHours === undefined) {
    delete destination.businessHours;
  }
  delete destination.openingHours;
  delete destination.openingHoursMetadata;
}

writeFileSync(CATALOGUE_PATH, `${JSON.stringify(catalogue, null, 2)}\n`);
console.log(`Applied ${changed} semantic opening-hours repairs.`);
