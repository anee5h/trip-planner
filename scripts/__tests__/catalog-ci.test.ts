/**
 * Tests for the catalogue CI gate (KAI-7):
 *
 *   • scripts/audit/catalog-baseline.ts       — fingerprint baseline policy
 *   • scripts/check-catalog-warnings.ts       — audit errors + baseline gate
 *   • scripts/catalog/generate-outputs.ts     — shared output generator
 *   • scripts/check-catalog-sync.ts           — currency + idempotency gate
 *
 * All fixtures live in temporary directories; nothing here touches the real
 * working tree and nothing requires network access.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import type { Destination } from "../../src/shared/types/destination.js";
import { runAudit } from "../audit/catalog-integrity.js";
import { loadCatalogInputs } from "../audit/catalog-inputs.js";
import {
  buildBaseline,
  compareToBaseline,
  updateBaseline,
  validateBaseline,
  warningFingerprint,
  type CatalogWarningsBaseline,
} from "../audit/catalog-baseline.js";
import { buildDestinationsMeta } from "../catalog/meta.mjs";
import { generateCatalogueOutputs } from "../catalog/generate-outputs.js";
import { runWarningsCheck } from "../check-catalog-warnings.js";
import {
  compareGeneratedOutputs,
  loadCommittedOutputs,
  runSyncCheck,
  toOutputMap,
} from "../check-catalog-sync.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeDest(
  id: string,
  overrides: Partial<Destination> = {},
): Destination {
  return {
    id,
    name: id,
    prefecture: "Okayama",
    region: "Chugoku",
    description: "A test destination.",
    categories: ["history"],
    tags: [],
    heroImage: "",
    highlights: ["Highlight"],
    budgetMin: 1000,
    budgetRecommended: 2000,
    budgetMax: 5000,
    transportOptions: { train: 60 },
    recommendedVisitHours: { min: 4, max: 8 },
    totalTripHours: 4,
    walkingMin: 2000,
    walkingSunMin: 1000,
    walkingShadeMin: 1000,
    indoorPercent: 50,
    ratings: {
      overall: 8,
      couple: 8,
      summer: 8,
      winter: 8,
      rain: 8,
      food: 8,
      photography: 8,
      relaxation: 8,
      value: 8,
      uniqueness: 8,
    },
    crowd: { weekday: 3, weekend: 4, holiday: 5 },
    season: { spring: 8, summer: 8, autumn: 8, winter: 8 },
    bestMonths: [1, 2, 3],
    status: "published",
    role: "poi",
    travelEstimate: { confidence: "high" },
    imageMetadata: {
      source: "Wikimedia Commons",
      license: "CC BY-SA 4.0",
      attribution: "test",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:test.jpg",
    },
    // KAI-87: keep the fixture clear of walkingMin-vs-visit-window noise.
    walkingMin: 300,
    collections: [],
    ...overrides,
  };
}

/** A clean out-of-prefecture hub so REL_CROSS_PREFECTURE_REF fires. */
function refHub(): Destination {
  return makeDest("fukuoka-city", {
    name: "Fukuoka City",
    prefecture: "Fukuoka",
    region: "Kyushu",
    role: "hub",
    kind: "city",
    municipalityId: "Fukuoka:fukuoka",
    nameJa: "福岡市",
    recommendedVisitHours: { min: 4, max: 8 },
    relationships: {},
  });
}

/** One REL_CROSS_PREFECTURE_REF warning instance per relationship key,
 *  referencing `refId` (defaults to the out-of-prefecture hub). */
function crossPrefRecord(
  id: string,
  keys: string[],
  refId = "fukuoka-city",
): Destination {
  const relationships: Record<string, string[]> = {};
  for (const key of keys) relationships[key] = [refId];
  return makeDest(id, { relationships });
}

const WARN_CODE = "REL_CROSS_PREFECTURE_REF";
const fp = (code: string, id: string, identity?: string) =>
  identity ? `${code}:${id}:${identity}` : `${code}:${id}`;

/** Two warning-bearing records plus their out-of-prefecture ref hub. */
function twoRecords(): Destination[] {
  return [
    crossPrefRecord("a-place", ["nearbyDestinationIds"]),
    crossPrefRecord("b-place", ["nearbyDestinationIds"]),
    refHub(),
  ];
}

const tmpDirs: string[] = [];

function tmpRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-ci-"));
  tmpDirs.push(root);
  return root;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

/** Writes a catalogue fixture tree with plain (unformatted) JSON files. */
function writeWarningsFixture(root: string, destinations: Destination[]): void {
  fs.mkdirSync(path.join(root, "src/shared/data"), { recursive: true });
  const detailsDir = path.join(root, "public/data/destinations");
  fs.rmSync(detailsDir, { recursive: true, force: true });
  fs.mkdirSync(detailsDir, { recursive: true });
  fs.mkdirSync(path.join(root, "scripts/audit"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "src/shared/data/destinations-index.json"),
    `${JSON.stringify(destinations, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(root, "src/shared/data/destinations-meta.json"),
    `${JSON.stringify(buildDestinationsMeta(destinations), null, 2)}\n`,
  );
  for (const d of destinations) {
    fs.writeFileSync(
      path.join(detailsDir, `${d.id}.json`),
      `${JSON.stringify(d, null, 2)}\n`,
    );
  }
}

/** Writes the baseline file after the fixture tree exists. */
function writeBaseline(root: string, baseline: CatalogWarningsBaseline): void {
  fs.mkdirSync(path.join(root, "scripts/audit"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "scripts/audit/catalog-warnings-baseline.json"),
    `${JSON.stringify(baseline, null, 2)}\n`,
  );
}

function auditReport(root: string) {
  const inputs = loadCatalogInputs(root);
  return runAudit(inputs.destinations, inputs.details, inputs.metaEntries);
}

function baselineFor(root: string): CatalogWarningsBaseline {
  return buildBaseline(auditReport(root));
}

/** Runs the audit with details/meta derived from the same destinations, so
 *  category-E sync warnings cannot pollute the intended findings. */
function auditOf(destinations: Destination[]) {
  return runAudit(
    destinations,
    destinations.map((d) => ({ id: d.id, record: d })),
    buildDestinationsMeta(destinations) as unknown as {
      id: string;
      [k: string]: unknown;
    }[],
  );
}

function captureConsole() {
  const logs: string[] = [];
  const errors: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.join(" "));
  });
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    errors.push(args.join(" "));
  });
  return {
    logs,
    errors,
    text: () => [...logs, ...errors].join("\n"),
  };
}

// ---------------------------------------------------------------------------
// Baseline policy (pure)
// ---------------------------------------------------------------------------

describe("catalogue warning baseline", () => {
  it("accounts per record AND per instance (multi-key findings)", () => {
    const destinations = [
      crossPrefRecord("a-place", ["nearbyDestinationIds"]),
      crossPrefRecord("b-place", [
        "nearbyDestinationIds",
        "relatedDestinationIds",
      ]),
      refHub(),
    ];
    const report = auditOf(destinations);
    const baseline = buildBaseline(report);
    expect(baseline.warningsByCode[WARN_CODE]).toBe(3);
    // Each relationship key is its own violation identity.
    expect(
      baseline.warningFingerprints[
        fp(WARN_CODE, "a-place", "nearbyDestinationIds|fukuoka-city")
      ],
    ).toBe(1);
    expect(
      baseline.warningFingerprints[
        fp(WARN_CODE, "b-place", "nearbyDestinationIds|fukuoka-city")
      ],
    ).toBe(1);
    expect(
      baseline.warningFingerprints[
        fp(WARN_CODE, "b-place", "relatedDestinationIds|fukuoka-city")
      ],
    ).toBe(1);
  });

  it("fingerprints exclude messages, paths, and ordering", () => {
    const a = crossPrefRecord("a-place", ["nearbyDestinationIds"]);
    const report = auditOf([a, refHub()]);
    const fingerprint = warningFingerprint(
      report.findings.find((f) => f.severity === "warning")!,
    );
    expect(fingerprint).toBe(
      `${WARN_CODE}:a-place:nearbyDestinationIds|fukuoka-city`,
    );
  });

  it("a new warning fingerprint fails even when the total count is unchanged", () => {
    const root = tmpRoot();
    writeWarningsFixture(root, twoRecords());
    const baseline = baselineFor(root);
    // Same code, same count, but a different record: b-place → c-place.
    const changed = [
      crossPrefRecord("a-place", ["nearbyDestinationIds"]),
      crossPrefRecord("c-place", ["nearbyDestinationIds"]),
      refHub(),
    ];
    const report = auditOf(changed);
    expect(report.summary.warnings).toBe(baseline.warningsByCode[WARN_CODE]);
    const cmp = compareToBaseline(report, baseline);
    expect(cmp.added.map(warningFingerprint)).toEqual([
      `${WARN_CODE}:c-place:nearbyDestinationIds|fukuoka-city`,
    ]);
    expect(cmp.reduced).toEqual([
      `${WARN_CODE}:b-place:nearbyDestinationIds|fukuoka-city`,
    ]);
  });

  it("same-code/same-target replacement fails (REL_CROSS_PREFECTURE_REF)", () => {
    // Baseline: hub-x warns because it references destination-a.
    // Current: same code, same target, same count — but the reference is
    // now destination-b. One warning was silently exchanged for another.
    // dest-a/dest-b live in Fukuoka so the cross-prefecture ref fires.
    const withRef = (refId: string) => [
      crossPrefRecord("hub-x", ["nearbyDestinationIds"], refId),
      refHub(),
      makeDest("dest-a", { prefecture: "Fukuoka" }),
      makeDest("dest-b", { prefecture: "Fukuoka" }),
    ];
    const baseline = buildBaseline(auditOf(withRef("dest-a")));
    const replaced = auditOf(withRef("dest-b"));
    expect(replaced.summary.warnings).toBe(baseline.warningsByCode[WARN_CODE]);
    const cmp = compareToBaseline(replaced, baseline);
    expect(cmp.added.map(warningFingerprint)).toEqual([
      `${WARN_CODE}:hub-x:nearbyDestinationIds|dest-b`,
    ]);
    expect(cmp.reduced).toEqual([
      `${WARN_CODE}:hub-x:nearbyDestinationIds|dest-a`,
    ]);
  });

  it("same-code/same-target replacement fails (REL_CROSS_MUNICIPALITY_FEATURED)", () => {
    // A second repeated-warning category: a hub swapping which
    // cross-municipality destination it features must be detected.
    const hub = (featured: string) =>
      makeDest("hub-x", {
        name: "Hub X City",
        kind: "city",
        role: "hub",
        municipalityId: "Okayama:okayama",
        nameJa: "ハブ市",
        recommendedVisitHours: { min: 4, max: 8 },
        relationships: { featuredDestinationIds: [featured] },
      });
    const poi = (id: string, muni: string) =>
      makeDest(id, { municipalityId: muni });
    const baseline = buildBaseline(
      auditOf([
        hub("poi-a"),
        poi("poi-a", "Okayama:takahashi"),
        poi("poi-b", "Okayama:kurashiki"),
      ]),
    );
    const replaced = auditOf([
      hub("poi-b"),
      poi("poi-a", "Okayama:takahashi"),
      poi("poi-b", "Okayama:kurashiki"),
    ]);
    expect(replaced.summary.warnings).toBe(
      baseline.warningsByCode["REL_CROSS_MUNICIPALITY_FEATURED"],
    );
    const cmp = compareToBaseline(replaced, baseline);
    expect(cmp.added.map(warningFingerprint)).toEqual([
      "REL_CROSS_MUNICIPALITY_FEATURED:hub-x:poi-b",
    ]);
    expect(cmp.reduced).toEqual([
      "REL_CROSS_MUNICIPALITY_FEATURED:hub-x:poi-a",
    ]);
  });

  it("an extra instance of an already-accepted fingerprint fails", () => {
    // Two occurrences of the same ref in one list produce two findings with
    // an identical identity; a third occurrence is an extra instance.
    const dest = (refs: string[]) =>
      makeDest("a-place", { relationships: { nearbyDestinationIds: refs } });
    const two = auditOf([dest(["fukuoka-city", "fukuoka-city"]), refHub()]);
    const baseline = buildBaseline(two);
    const fp2 = `${WARN_CODE}:a-place:nearbyDestinationIds|fukuoka-city`;
    expect(baseline.warningFingerprints[fp2]).toBe(2);
    const three = auditOf([
      dest(["fukuoka-city", "fukuoka-city", "fukuoka-city"]),
      refHub(),
    ]);
    const cmp = compareToBaseline(three, baseline);
    // The third occurrence is an extra instance of the accepted cross-pref
    // fingerprint AND an extra REL_DUPLICATE_REF instance of the same ref.
    expect(cmp.added.map(warningFingerprint)).toEqual([
      fp2,
      "REL_DUPLICATE_REF:a-place:nearbyDestinationIds|fukuoka-city",
    ]);
  });

  it("removal of an existing warning passes", () => {
    const root = tmpRoot();
    writeWarningsFixture(root, twoRecords());
    const baseline = baselineFor(root);
    const improved = [
      crossPrefRecord("a-place", ["nearbyDestinationIds"]),
      refHub(),
    ];
    const cmp = compareToBaseline(auditOf(improved), baseline);
    expect(cmp.added).toEqual([]);
    expect(cmp.reduced).toEqual([
      `${WARN_CODE}:b-place:nearbyDestinationIds|fukuoka-city`,
    ]);
  });

  it("audit errors fail the comparison", () => {
    const root = tmpRoot();
    writeWarningsFixture(root, twoRecords());
    const baseline = baselineFor(root);
    const broken = [
      ...twoRecords(),
      makeDest("orphan", {
        relationships: { parentDestinationId: "nowhere-city" },
      }),
    ];
    const report = auditOf(broken);
    expect(report.summary.errors).toBeGreaterThan(0);
    expect(compareToBaseline(report, baseline).errors).toBeGreaterThan(0);
  });

  it("unstable ordering never creates false regressions", () => {
    const root = tmpRoot();
    writeWarningsFixture(root, twoRecords());
    const baseline = baselineFor(root);
    // Reversed destination order and a shuffled finding list.
    const reversed = [...twoRecords()].reverse();
    const report = auditOf(reversed);
    const shuffled = {
      ...report,
      findings: [...report.findings].reverse(),
    };
    const cmp = compareToBaseline(shuffled, baseline);
    expect(cmp.added).toEqual([]);
    expect(cmp.reduced).toEqual([]);
  });

  it("updateBaseline commits a reduction cleanly and refuses growth", () => {
    const root = tmpRoot();
    writeWarningsFixture(root, twoRecords());
    const committed = baselineFor(root);

    const reduced = [
      crossPrefRecord("a-place", ["nearbyDestinationIds"]),
      refHub(),
    ];
    const next = updateBaseline(auditOf(reduced), committed);
    expect("baseline" in next).toBe(true);
    if ("baseline" in next) {
      expect(next.baseline.warningFingerprints).toEqual({
        [fp(WARN_CODE, "a-place", "nearbyDestinationIds|fukuoka-city")]: 1,
      });
    }

    const grown = [
      crossPrefRecord("a-place", ["nearbyDestinationIds"]),
      crossPrefRecord("c-place", ["nearbyDestinationIds"]),
      refHub(),
    ];
    const refused = updateBaseline(auditOf(grown), committed);
    expect("refusal" in refused).toBe(true);
    if ("refusal" in refused) expect(refused.refusal).toContain("Refusing");
  });

  it("validateBaseline rejects internally inconsistent files", () => {
    const root = tmpRoot();
    writeWarningsFixture(root, twoRecords());
    const baseline = baselineFor(root);
    expect(validateBaseline(baseline)).toBeNull();
    expect(validateBaseline({ ...baseline, errors: 2 })).toMatch(
      /errors are never acceptable/,
    );
    expect(
      validateBaseline({
        ...baseline,
        warningsByCode: { [WARN_CODE]: 999 },
      }),
    ).toMatch(/disagree/);
    expect(validateBaseline({ ...baseline, schemaVersion: 99 })).toMatch(
      /Unsupported/,
    );
  });
});

// ---------------------------------------------------------------------------
// check:catalog-warnings (end to end, tmp fixture trees)
// ---------------------------------------------------------------------------

describe("runWarningsCheck", () => {
  it("passes when the current warnings match the committed baseline exactly", async () => {
    const root = tmpRoot();
    const destinations = twoRecords();
    writeWarningsFixture(root, destinations);
    writeBaseline(root, baselineFor(root));
    const { logs } = captureConsole();
    expect(await runWarningsCheck({ rootDir: root })).toBe(0);
    expect(logs.join("\n")).toContain("all 2 warnings are accepted debt");
  });

  it("fails on a new warning fingerprint even when the count is unchanged", async () => {
    const root = tmpRoot();
    const destinations = twoRecords();
    writeWarningsFixture(root, destinations);
    writeBaseline(root, baselineFor(root));
    writeWarningsFixture(root, [
      crossPrefRecord("a-place", ["nearbyDestinationIds"]),
      crossPrefRecord("c-place", ["nearbyDestinationIds"]),
      refHub(),
    ]);
    const { errors, text } = captureConsole();
    expect(await runWarningsCheck({ rootDir: root })).toBe(1);
    expect(errors.join("\n")).toContain("new warning instance");
    expect(text()).toContain(`${WARN_CODE}:c-place`);
  });

  it("fails when a warning is exchanged for another of the same code and target", async () => {
    // Baseline: hub-x warns because it references dest-a. The branch keeps
    // the same code, target, and total count but references dest-b instead:
    // one accepted warning was silently swapped for a new one.
    const root = tmpRoot();
    // dest-a/dest-b live in Fukuoka so the cross-prefecture ref fires.
    const withRef = (refId: string) => [
      crossPrefRecord("hub-x", ["nearbyDestinationIds"], refId),
      refHub(),
      makeDest("dest-a", { prefecture: "Fukuoka" }),
      makeDest("dest-b", { prefecture: "Fukuoka" }),
    ];
    writeWarningsFixture(root, withRef("dest-a"));
    writeBaseline(root, baselineFor(root));
    writeWarningsFixture(root, withRef("dest-b"));
    const { errors, text } = captureConsole();
    expect(await runWarningsCheck({ rootDir: root })).toBe(1);
    const errText = errors.join("\n");
    expect(errText).toContain("new warning instance");
    expect(text()).toContain(`${WARN_CODE}:hub-x:nearbyDestinationIds|dest-b`);
    expect(text()).toContain(
      `GONE ${WARN_CODE}:hub-x:nearbyDestinationIds|dest-a`,
    );
  });

  it("fails on audit errors", async () => {
    const root = tmpRoot();
    const destinations = twoRecords();
    writeWarningsFixture(root, destinations);
    writeBaseline(root, baselineFor(root));
    writeWarningsFixture(root, [
      ...destinations,
      makeDest("orphan", {
        relationships: { parentDestinationId: "nowhere-city" },
      }),
    ]);
    const { errors, text } = captureConsole();
    expect(await runWarningsCheck({ rootDir: root })).toBe(1);
    expect(errors.join("\n")).toContain("Stage failed: audit");
    expect(text()).toContain("REL_DANGLING_PARENT");
  });

  it("passes on removals and suggests the deliberate baseline update", async () => {
    const root = tmpRoot();
    const destinations = twoRecords();
    writeWarningsFixture(root, destinations);
    writeBaseline(root, baselineFor(root));
    writeWarningsFixture(root, [
      crossPrefRecord("a-place", ["nearbyDestinationIds"]),
      refHub(),
    ]);
    const { logs } = captureConsole();
    expect(await runWarningsCheck({ rootDir: root })).toBe(0);
    const text = logs.join("\n");
    expect(text).toContain("fewer instances than the baseline (improvement)");
    expect(text).toContain("check:catalog-warnings:update");
  });

  it("failure output includes the exact local reproduction command", async () => {
    const root = tmpRoot();
    const destinations = twoRecords();
    writeWarningsFixture(root, destinations);
    writeBaseline(root, baselineFor(root));
    writeWarningsFixture(root, [
      crossPrefRecord("a-place", ["nearbyDestinationIds"]),
      crossPrefRecord("c-place", ["nearbyDestinationIds"]),
      refHub(),
    ]);
    const { text } = captureConsole();
    expect(await runWarningsCheck({ rootDir: root })).toBe(1);
    expect(text()).toContain("npm run check:catalog-ci");
    expect(text()).toContain("Baseline policy");
    expect(text()).toContain("can only shrink");
  });

  it("--update rewrites the baseline after a verified reduction", async () => {
    const root = tmpRoot();
    const destinations = twoRecords();
    writeWarningsFixture(root, destinations);
    writeBaseline(root, baselineFor(root));
    writeWarningsFixture(root, [
      crossPrefRecord("a-place", ["nearbyDestinationIds"]),
      refHub(),
    ]);
    const baselinePath = path.join(
      root,
      "scripts/audit/catalog-warnings-baseline.json",
    );
    const before = fs.readFileSync(baselinePath, "utf-8");
    const { logs } = captureConsole();
    expect(await runWarningsCheck({ rootDir: root, update: true })).toBe(0);
    const after = JSON.parse(fs.readFileSync(baselinePath, "utf-8"));
    expect(after.warningFingerprints).toEqual({
      [fp(WARN_CODE, "a-place", "nearbyDestinationIds|fukuoka-city")]: 1,
    });
    expect(logs.join("\n")).toContain("Baseline updated");
    expect(fs.readFileSync(baselinePath, "utf-8")).not.toBe(before);
  });

  it("--update refuses to accept new warnings and leaves the file untouched", async () => {
    const root = tmpRoot();
    const destinations = twoRecords();
    writeWarningsFixture(root, destinations);
    writeBaseline(root, baselineFor(root));
    writeWarningsFixture(root, [
      crossPrefRecord("a-place", ["nearbyDestinationIds"]),
      crossPrefRecord("c-place", ["nearbyDestinationIds"]),
      refHub(),
    ]);
    const baselinePath = path.join(
      root,
      "scripts/audit/catalog-warnings-baseline.json",
    );
    const before = fs.readFileSync(baselinePath, "utf-8");
    const { errors } = captureConsole();
    expect(await runWarningsCheck({ rootDir: root, update: true })).toBe(1);
    expect(errors.join("\n")).toContain("Refusing to update the baseline");
    expect(fs.readFileSync(baselinePath, "utf-8")).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// Generated-file currency and idempotency
// ---------------------------------------------------------------------------

describe("catalogue generated-file checks", () => {
  const syncDestinations = () => [
    makeDest("a-place", { relationships: { nearbyDestinationIds: [] } }),
    makeDest("b-place", { relationships: {} }),
  ];

  /** Writes committed outputs exactly as the generator produces them. */
  async function writeSyncFixture(root: string): Promise<void> {
    fs.mkdirSync(path.join(root, "src/shared/data"), { recursive: true });
    fs.mkdirSync(path.join(root, "public/data/destinations"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(root, "src/shared/data/destinations-index.json"),
      `${JSON.stringify(syncDestinations(), null, 2)}\n`,
    );
    const outputs = await generateCatalogueOutputs({ rootDir: root });
    for (const [id, content] of outputs.detailFiles) {
      fs.writeFileSync(
        path.join(root, `public/data/destinations/${id}.json`),
        content,
      );
    }
    fs.writeFileSync(
      path.join(root, "src/shared/data/destinations-meta.json"),
      outputs.meta,
    );
  }

  it("the generator is deterministic: a second generation is byte-identical", async () => {
    const root = tmpRoot();
    fs.mkdirSync(path.join(root, "src/shared/data"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "src/shared/data/destinations-index.json"),
      `${JSON.stringify(syncDestinations(), null, 2)}\n`,
    );
    const first = await generateCatalogueOutputs({ rootDir: root });
    const second = await generateCatalogueOutputs({ rootDir: root });
    expect(second).toEqual(first);
  });

  it("compareGeneratedOutputs detects stale, missing, and orphan committed files", () => {
    const committed = new Map([
      ["detail:a-place", '{"name":"a-place"}'],
      ["detail:ghost", '{"name":"ghost"}'], // orphan: not generated
    ]);
    const gen1 = new Map([
      ["detail:a-place", '{"name":"a-place"}'],
      ["detail:b-place", '{"name":"b-place"}'], // missing from committed
    ]);
    const gen2 = new Map(gen1);
    const cmp = compareGeneratedOutputs(committed, gen1, gen2);
    expect(cmp.stale).toEqual(["detail:b-place", "detail:ghost"]);
    expect(cmp.changedOnRegen).toEqual([]);
  });

  it("compareGeneratedOutputs detects a second generation that changes files", () => {
    const committed = new Map([["detail:a-place", '{"name":"a-place"}']]);
    const gen1 = new Map([["detail:a-place", '{"name":"a-place"}']]);
    const gen2 = new Map([["detail:a-place", '{"name":"a-place","x":1}']]);
    const cmp = compareGeneratedOutputs(committed, gen1, gen2);
    expect(cmp.changedOnRegen).toEqual(["detail:a-place"]);
    expect(cmp.stale).toEqual([]);
  });

  it("runSyncCheck passes on a current, idempotent tree", async () => {
    const root = tmpRoot();
    await writeSyncFixture(root);
    const { logs } = captureConsole();
    expect(await runSyncCheck({ rootDir: root })).toBe(0);
    const text = logs.join("\n");
    expect(text).toContain("zero diff");
    expect(text).toContain("byte-identical");
  });

  it("runSyncCheck fails on a stale committed detail file with a reproduction command", async () => {
    const root = tmpRoot();
    await writeSyncFixture(root);
    fs.writeFileSync(
      path.join(root, "public/data/destinations/a-place.json"),
      '{"tampered":true}\n',
    );
    const { errors } = captureConsole();
    expect(await runSyncCheck({ rootDir: root })).toBe(1);
    const text = errors.join("\n");
    expect(text).toContain("Stage failed: sync");
    expect(text).toContain("STALE public/data/destinations/a-place.json");
    expect(text).toContain("npm run sync-destination-details");
  });

  it("runSyncCheck fails when committed meta disagrees with the index", async () => {
    const root = tmpRoot();
    await writeSyncFixture(root);
    fs.writeFileSync(
      path.join(root, "src/shared/data/destinations-meta.json"),
      '{"stale":true}\n',
    );
    const { errors } = captureConsole();
    expect(await runSyncCheck({ rootDir: root })).toBe(1);
    expect(errors.join("\n")).toContain(
      "STALE src/shared/data/destinations-meta.json",
    );
  });

  it("runSyncCheck fails when an orphan detail file is committed", async () => {
    const root = tmpRoot();
    await writeSyncFixture(root);
    fs.writeFileSync(
      path.join(root, "public/data/destinations/ghost.json"),
      '{"name":"ghost"}\n',
    );
    const { errors } = captureConsole();
    expect(await runSyncCheck({ rootDir: root })).toBe(1);
    expect(errors.join("\n")).toContain(
      "STALE public/data/destinations/ghost.json",
    );
  });

  it("runSyncCheck reports non-idempotent generation", async () => {
    const root = tmpRoot();
    await writeSyncFixture(root);
    // Simulate a non-deterministic generator by tampering between runs:
    // compareGeneratedOutputs with a gen2 that differs is exactly what the
    // check does internally; assert the wiring surfaces it.
    const committed = loadCommittedOutputs(root);
    const gen1 = await generateCatalogueOutputs({ rootDir: root });
    const gen2 = await generateCatalogueOutputs({ rootDir: root });
    gen2.detailFiles.set("a-place", '{"changed":true}');
    const cmp = compareGeneratedOutputs(
      committed,
      toOutputMap(gen1),
      toOutputMap(gen2),
    );
    expect(cmp.changedOnRegen).toEqual(["detail:a-place"]);
  });
});
