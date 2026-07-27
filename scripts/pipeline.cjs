const fs = require("fs");
const path = require("path");

/**
 * TabiMap Data Pipeline
 *
 * Consolidates data ingestion, validation, geocoding, normalization, and output.
 *
 * Usage:
 *   node scripts/pipeline.cjs [options]
 *
 * Options:
 *   --input <path>      Path to input JSON (default: src/shared/data/destinations-index.json)
 *   --output <path>     Path to output JSON (default: same as input)
 *   --dry-run           Run validation and enrichment without writing to file
 *   --validate-only     Run schema validation only and exit
 */

// Parse CLI flags
const args = process.argv.slice(2);
function getArgValue(flag) {
  const index = args.indexOf(flag);
  return index !== -1 && args[index + 1] ? args[index + 1] : null;
}

const isDryRun = args.includes("--dry-run");
const isValidateOnly = args.includes("--validate-only");
const customInput = getArgValue("--input");
const customOutput = getArgValue("--output");

const DEFAULT_FILE = path.join(
  __dirname,
  "../src/shared/data/destinations-index.json",
);
const inputPath = customInput
  ? path.resolve(process.cwd(), customInput)
  : DEFAULT_FILE;
const outputPath = customOutput
  ? path.resolve(process.cwd(), customOutput)
  : inputPath;

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

const REQUIRED_FIELDS = [
  "id",
  "name",
  "prefecture",
  "region",
  "categories",
  "budgetMin",
  "budgetMax",
  "transportOptions",
  "ratings",
];

const RATING_KEYS = [
  "overall",
  "couple",
  "summer",
  "winter",
  "rain",
  "food",
  "photography",
  "relaxation",
  "value",
  "uniqueness",
];

async function runPipeline() {
  console.log("\x1b[36m=============================================\x1b[0m");
  console.log("\x1b[36m        TabiMap Data Pipeline v2.1           \x1b[0m");
  console.log("\x1b[36m=============================================\x1b[0m");
  console.log(`Input:  ${inputPath}`);
  console.log(`Output: ${outputPath}`);
  if (isDryRun)
    console.log("\x1b[33mMode:   [DRY RUN - No files will be modified]\x1b[0m");
  if (isValidateOnly) console.log("\x1b[33mMode:   [VALIDATE ONLY]\x1b[0m");
  console.log("");

  // 1. Load Data
  let rawData;
  try {
    rawData = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  } catch (e) {
    console.error(
      `\x1b[31m[ERROR] Failed to read input file (${inputPath}):\x1b[0m`,
      e.message,
    );
    process.exit(1);
  }
  console.log(`\x1b[32m✔ Loaded ${rawData.length} destinations.\x1b[0m\n`);

  // 2. Stage 1: Schema & Content Validation
  console.log("Stage 1: Schema, Coordinates & Media Validation...");
  let schemaErrors = 0;
  let schemaWarnings = 0;
  let missingHeroCount = 0;
  let missingCoordsCount = 0;
  let duplicateIdsCount = 0;

  const seenIds = new Set();

  rawData.forEach((dest, index) => {
    const label = dest.name || dest.id || `Item #${index + 1}`;

    // Check duplicate IDs
    if (dest.id) {
      if (seenIds.has(dest.id)) {
        console.error(
          `  \x1b[31m❌ [${label}] Duplicate ID found: '${dest.id}'\x1b[0m`,
        );
        schemaErrors++;
        duplicateIdsCount++;
      }
      seenIds.add(dest.id);
    }

    // Check required top-level fields
    for (const field of REQUIRED_FIELDS) {
      if (dest[field] === undefined || dest[field] === null) {
        console.error(
          `  \x1b[31m❌ [${label}] Missing required field '${field}'\x1b[0m`,
        );
        schemaErrors++;
      }
    }

    // Check ratings bounds (1-10)
    if (dest.ratings) {
      for (const rKey of RATING_KEYS) {
        const val = dest.ratings[rKey];
        if (val === undefined || typeof val !== "number") {
          console.error(
            `  \x1b[31m❌ [${label}] Missing rating '${rKey}'\x1b[0m`,
          );
          schemaErrors++;
        } else if (val < 1 || val > 10) {
          console.warn(
            `  \x1b[33m⚠️  [${label}] Rating '${rKey}' out of bounds (1-10): ${val}\x1b[0m`,
          );
          schemaWarnings++;
        }
      }
    }

    // Check budget consistency
    if (
      typeof dest.budgetMin === "number" &&
      typeof dest.budgetMax === "number"
    ) {
      if (dest.budgetMin > dest.budgetMax) {
        console.error(
          `  \x1b[31m❌ [${label}] budgetMin (${dest.budgetMin}) > budgetMax (${dest.budgetMax})\x1b[0m`,
        );
        schemaErrors++;
      }
    }

    // Validate Coordinates Range
    if (dest.coordinates) {
      const { lat, lng } = dest.coordinates;
      if (typeof lat !== "number" || typeof lng !== "number") {
        console.error(
          `  \x1b[31m❌ [${label}] Coordinates must be numeric\x1b[0m`,
        );
        schemaErrors++;
      } else if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        console.error(
          `  \x1b[31m❌ [${label}] Coordinates out of bounds: lat=${lat}, lng=${lng}\x1b[0m`,
        );
        schemaErrors++;
      }
    } else {
      missingCoordsCount++;
    }

    // Validate Media Integrity
    if (!dest.heroImage || dest.heroImage.trim() === "") {
      missingHeroCount++;
    }
  });

  if (schemaErrors > 0) {
    console.error(
      `\n\x1b[31mStage 1 Failed with ${schemaErrors} schema error(s).\x1b[0m`,
    );
    process.exit(1);
  } else {
    console.log(
      `\x1b[32m✔ Stage 1 Passed (${schemaWarnings} warning(s)).\x1b[0m\n`,
    );
  }

  // 3. Stage 2: Collection & Referential Integrity Validation
  console.log("Stage 2: Collection & Referential Integrity Validation...");
  let collectionErrors = 0;
  let collectionWarnings = 0;

  const collectionsFilePath = path.join(
    __dirname,
    "../src/shared/data/collections-index.json",
  );
  let collectionsList = [];
  try {
    collectionsList = JSON.parse(fs.readFileSync(collectionsFilePath, "utf8"));
  } catch (e) {
    console.error(
      `  \x1b[31m❌ Failed to read collections-index.json (${collectionsFilePath}):\x1b[0m`,
      e.message,
    );
    process.exit(1);
  }

  // Validate Collection Definitions
  const seenColIds = new Set();
  const seenColSlugs = new Set();
  const seenColNames = new Set();
  const seenColSorts = new Set();

  collectionsList.forEach((col, idx) => {
    const label = col.name || col.id || `Collection #${idx + 1}`;
    if (!col.id) {
      console.error(
        `  \x1b[31m❌ [${label}] Missing required field 'id'\x1b[0m`,
      );
      collectionErrors++;
    } else {
      if (seenColIds.has(col.id)) {
        console.error(
          `  \x1b[31m❌ [${label}] Duplicate Collection ID: '${col.id}'\x1b[0m`,
        );
        collectionErrors++;
      }
      seenColIds.add(col.id);
    }

    if (!col.slug) {
      console.error(
        `  \x1b[31m❌ [${label}] Missing required field 'slug'\x1b[0m`,
      );
      collectionErrors++;
    } else {
      if (seenColSlugs.has(col.slug)) {
        console.error(
          `  \x1b[31m❌ [${label}] Duplicate Collection Slug: '${col.slug}'\x1b[0m`,
        );
        collectionErrors++;
      }
      seenColSlugs.add(col.slug);
    }

    if (col.name) {
      if (seenColNames.has(col.name)) {
        console.warn(
          `  \x1b[33m⚠️  [${label}] Duplicate Collection Name: '${col.name}'\x1b[0m`,
        );
        collectionWarnings++;
      }
      seenColNames.add(col.name);
    }

    if (col.sortOrder !== undefined) {
      if (seenColSorts.has(col.sortOrder)) {
        console.warn(
          `  \x1b[33m⚠️  [${label}] Duplicate Collection sortOrder: ${col.sortOrder}\x1b[0m`,
        );
        collectionWarnings++;
      }
      seenColSorts.add(col.sortOrder);
    }

    if (!col.metadata) {
      console.error(
        `  \x1b[31m❌ [${label}] Missing required object 'metadata'\x1b[0m`,
      );
      collectionErrors++;
    } else {
      if (!col.metadata.authority) {
        console.error(
          `  \x1b[31m❌ [${label}] Missing required metadata field 'authority'\x1b[0m`,
        );
        collectionErrors++;
      }
      if (!col.metadata.status) {
        console.error(
          `  \x1b[31m❌ [${label}] Missing required metadata field 'status'\x1b[0m`,
        );
        collectionErrors++;
      }
      if (!col.metadata.lastVerified) {
        console.error(
          `  \x1b[31m❌ [${label}] Missing required metadata field 'lastVerified'\x1b[0m`,
        );
        collectionErrors++;
      }
    }
  });

  // Validate Destination Collection Memberships & Relationships
  const destMap = new Map(rawData.map((d) => [d.id, d]));
  rawData.forEach((dest, index) => {
    const label = dest.name || dest.id || `Item #${index + 1}`;

    if (!dest.status) {
      console.error(
        `  \x1b[31m❌ [${label}] Missing mandatory field 'status'\x1b[0m`,
      );
      collectionErrors++;
    }

    if (!dest.travelEstimate || !dest.travelEstimate.confidence) {
      console.error(
        `  \x1b[31m❌ [${label}] Missing mandatory field 'travelEstimate.confidence'\x1b[0m`,
      );
      collectionErrors++;
    }

    if (!Array.isArray(dest.collections)) {
      console.error(
        `  \x1b[31m❌ [${label}] Missing mandatory array 'collections'\x1b[0m`,
      );
      collectionErrors++;
    } else {
      const destColIds = new Set();
      dest.collections.forEach((m, mIdx) => {
        if (!m.collectionId) {
          console.error(
            `  \x1b[31m❌ [${label}] Membership #${mIdx + 1} missing 'collectionId'\x1b[0m`,
          );
          collectionErrors++;
        } else {
          // Check referential integrity
          if (!seenColIds.has(m.collectionId)) {
            console.error(
              `  \x1b[31m❌ [${label}] Referenced collectionId '${m.collectionId}' does not exist in collections-index.json\x1b[0m`,
            );
            collectionErrors++;
          }
          // Check duplicate membership per destination
          if (destColIds.has(m.collectionId)) {
            console.error(
              `  \x1b[31m❌ [${label}] Duplicate collection membership found for '${m.collectionId}'\x1b[0m`,
            );
            collectionErrors++;
          }
          destColIds.add(m.collectionId);
        }

        if (m.confirmed === false) {
          console.warn(
            `  \x1b[33m⚠️  [${label}] Unconfirmed collection membership for '${m.collectionId}'\x1b[0m`,
          );
          collectionWarnings++;
        }
      });
    }

    // Validate Destination Parent-Child & Related Relationships
    const parentId = dest.relationships?.parentDestinationId;
    if (parentId) {
      const parent = destMap.get(parentId);
      if (!parent) {
        console.error(
          `  \x1b[31m❌ [${label}] parentDestinationId '${parentId}' does not exist\x1b[0m`,
        );
        collectionErrors++;
      } else {
        if (parent.role !== "hub") {
          console.warn(
            `  \x1b[33m⚠️  [${label}] Parent '${parentId}' role is '${parent.role}', expected 'hub'\x1b[0m`,
          );
          collectionWarnings++;
        }
        if (parent.prefecture !== dest.prefecture) {
          console.error(
            `  \x1b[31m❌ [${label}] Prefecture mismatch with parent: child '${dest.prefecture}' vs parent '${parent.prefecture}'\x1b[0m`,
          );
          collectionErrors++;
        }
      }
    }

    if (dest.relationships?.relatedDestinationIds) {
      dest.relationships.relatedDestinationIds.forEach((relId) => {
        if (!destMap.has(relId)) {
          console.error(
            `  \x1b[31m❌ [${label}] relatedDestinationId '${relId}' does not exist\x1b[0m`,
          );
          collectionErrors++;
        }
      });
    }

    if (dest.relationships?.nearbyDestinationIds) {
      dest.relationships.nearbyDestinationIds.forEach((nearId) => {
        if (!destMap.has(nearId)) {
          console.error(
            `  \x1b[31m❌ [${label}] nearbyDestinationId '${nearId}' does not exist\x1b[0m`,
          );
          collectionErrors++;
        }
      });
    }
  });

  if (collectionErrors > 0) {
    console.error(
      `\n\x1b[31mStage 2 Failed with ${collectionErrors} collection error(s).\x1b[0m`,
    );
    process.exit(1);
  } else {
    console.log(
      `\x1b[32m✔ Stage 2 Passed (${collectionsList.length} collections validated, ${collectionWarnings} warning(s)).\x1b[0m\n`,
    );
  }

  if (isValidateOnly) {
    // Generate Completeness Report for Validate Only mode
    console.log("\x1b[36m=============================================\x1b[0m");
    console.log(
      "\x1b[36m        Completeness Report (Validation)      \x1b[0m",
    );
    console.log("\x1b[36m=============================================\x1b[0m");
    console.log(`Total Destinations Checked:  ${rawData.length}`);
    console.log(`Total Collections Checked:   ${collectionsList.length}`);
    console.log(`Duplicate IDs:              ${duplicateIdsCount}`);
    console.log(`Missing Coordinates:        ${missingCoordsCount}`);
    console.log(`Missing Hero Images:        ${missingHeroCount}`);
    console.log(`Schema Warnings Issued:     ${schemaWarnings}`);
    console.log(`Collection Warnings Issued: ${collectionWarnings}`);
    console.log("\x1b[36m=============================================\x1b[0m");
    console.log(
      "\x1b[32mValidation complete. Exiting (--validate-only).\x1b[0m",
    );
    return;
  }

  // 4. Stage 3: Geocoding Validation & Auto-fill
  console.log("Stage 3: Coordinates & Geocoding...");
  let geocodedCount = 0;

  for (const dest of rawData) {
    if (
      dest.coordinates &&
      typeof dest.coordinates.lat === "number" &&
      typeof dest.coordinates.lng === "number"
    ) {
      continue;
    }

    console.log(`  Geocoding missing coordinates for '${dest.name}'...`);
    try {
      const q = encodeURIComponent(
        `${dest.name}, ${dest.prefecture || "Tokyo"}, Japan`,
      );
      const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`;
      const res = await fetch(url, {
        headers: { "User-Agent": "TabiMap-Pipeline/2.1" },
      });
      const results = await res.json();

      if (results && results.length > 0) {
        dest.coordinates = {
          lat: parseFloat(results[0].lat),
          lng: parseFloat(results[0].lon),
        };
        console.log(
          `  \x1b[32m✔ Geocoded '${dest.name}': ${dest.coordinates.lat}, ${dest.coordinates.lng}\x1b[0m`,
        );
        geocodedCount++;
        missingCoordsCount--; // Recovered
      } else {
        console.warn(
          `  \x1b[33m⚠️ Could not geocode '${dest.name}', defaulting to Tokyo coordinates.\x1b[0m`,
        );
        dest.coordinates = { lat: 35.6762, lng: 139.6503 };
      }
    } catch (e) {
      console.error(
        `  \x1b[31m❌ Geocoding error for '${dest.name}':\x1b[0m`,
        e.message,
      );
      dest.coordinates = { lat: 35.6762, lng: 139.6503 };
    }
    await delay(1500); // OpenStreetMap rate limit
  }
  console.log(
    `\x1b[32m✔ Stage 2 Passed (${geocodedCount} newly geocoded).\x1b[0m\n`,
  );

  // 4. Stage 3: Data Normalization
  console.log("Stage 3: Data Normalization...");
  let normalizedBudgets = 0;
  let filledFieldsCount = 0;

  rawData.forEach((d) => {
    if (typeof d.budgetMin === "number" && typeof d.budgetMax === "number") {
      const expectedRec = Math.round((d.budgetMin + d.budgetMax) / 2);
      if (d.budgetRecommended !== expectedRec) {
        d.budgetRecommended = expectedRec;
        normalizedBudgets++;
      }
    }

    if (!d.description && d.notes) {
      d.description = d.notes;
      filledFieldsCount++;
    }
    if (!d.crowd) {
      d.crowd = { weekday: 3, weekend: 4, holiday: 5 };
      filledFieldsCount++;
    }
    if (!d.season) {
      d.season = { spring: 4, summer: 4, autumn: 4, winter: 4 };
      filledFieldsCount++;
    }
    if (!d.tags) {
      d.tags = d.categories || ["Travel"];
      filledFieldsCount++;
    }
    if (d.walkingMin === undefined || d.walkingMin === null) {
      d.walkingMin = 8000;
      filledFieldsCount++;
    }
    if (d.walkingSunMin === undefined || d.walkingSunMin === null) {
      d.walkingSunMin = Math.round(d.walkingMin * 0.6);
      filledFieldsCount++;
    }
    if (d.walkingShadeMin === undefined || d.walkingShadeMin === null) {
      d.walkingShadeMin = Math.round(d.walkingMin * 0.4);
      filledFieldsCount++;
    }
    if (d.indoorPercent === undefined || d.indoorPercent === null) {
      d.indoorPercent = 20;
      filledFieldsCount++;
    }
    if (d.totalTripHours === undefined || d.totalTripHours === null) {
      d.totalTripHours = 4;
      filledFieldsCount++;
    }
    if (!d.bestMonths) {
      d.bestMonths = [3, 4, 5, 9, 10, 11];
      filledFieldsCount++;
    }
  });
  console.log(
    `\x1b[32m✔ Stage 3 Passed (${normalizedBudgets} budgets normalized, ${filledFieldsCount} default fields populated).\x1b[0m\n`,
  );

  // 5. Stage 4: Asset Validation
  console.log("Stage 4: Asset Validation...");
  let missingImages = 0;

  rawData.forEach((d) => {
    if (!d.heroImage || d.heroImage.trim() === "") {
      console.warn(
        `  \x1b[33m⚠️ Missing heroImage for '${d.name}' (${d.id})\x1b[0m`,
      );
      missingImages++;
    }
  });
  console.log(
    `\x1b[32m✔ Stage 4 Passed (${missingImages} missing image warnings).\x1b[0m\n`,
  );

  // 6. Stage 5: Sort & Format Output
  console.log("Stage 5: Output Generation...");
  rawData.sort((a, b) => a.id.localeCompare(b.id));

  if (isDryRun) {
    console.log(
      "\x1b[33m[DRY RUN] Output would be written to:\x1b[0m",
      outputPath,
    );
    console.log(`Total valid destinations ready: ${rawData.length}`);
    return;
  }

  fs.writeFileSync(outputPath, JSON.stringify(rawData, null, 2) + "\n");
  const metaPath = path.join(
    __dirname,
    "../src/shared/data/destinations-meta.json",
  );
  const metaData = rawData.map((d) => ({
    id: d.id,
    name: d.name,
    prefecture: d.prefecture,
    region: d.region || "Other",
    role: d.role || "poi",
    kind: d.kind || "attraction",
    status: d.status || "verified",
    relationships: d.relationships || {},
  }));
  fs.writeFileSync(metaPath, JSON.stringify(metaData, null, 2) + "\n");
  console.log(
    `\x1b[32m✔ Successfully wrote ${rawData.length} processed destinations to ${outputPath} and ${metaPath}\x1b[0m\n`,
  );

  // Print Completeness Report
  console.log("\x1b[36m=============================================\x1b[0m");
  console.log("\x1b[36m        TabiMap Data Completeness Report      \x1b[0m");
  console.log("\x1b[36m=============================================\x1b[0m");
  console.log(`Total Destinations Processed: ${rawData.length}`);
  console.log(`Duplicate IDs:                ${duplicateIdsCount}`);
  console.log(`Missing Coordinates:          ${missingCoordsCount}`);
  console.log(`Missing Hero Images:          ${missingImages}`);
  console.log(`Warnings Issued:              ${schemaWarnings}`);
  console.log("\x1b[36m=============================================\x1b[0m");
  console.log("\x1b[36m            Pipeline Complete!               \x1b[0m");
  console.log("\x1b[36m=============================================\x1b[0m");
}

runPipeline().catch((err) => {
  console.error("\x1b[31mPipeline unhandled error:\x1b[0m", err);
  process.exit(1);
});
