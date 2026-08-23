import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import destinations from "@/shared/data/destinations-index.json";
import { localizePlaceLabel } from "@/shared/utils/placeLabels";
import { describe, expect, it } from "vitest";

type FixtureDestination = {
  id: string;
  relationships?: {
    nearbyDestinationIds?: string[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

const KAI58_NEW_IDS = [
  "ainokura-gassho-village",
  "suganuma-gassho-village",
  "toyama-glass-art-museum",
  "fukui-prefectural-dinosaur-museum",
] as const;

const KAI58_CANONICAL_IDS = [...KAI58_NEW_IDS, "tojinbo-cliffs-fukui"] as const;

const expectedMunicipalities: Record<
  (typeof KAI58_CANONICAL_IDS)[number],
  string
> = {
  "ainokura-gassho-village": "Toyama:nanto",
  "suganuma-gassho-village": "Toyama:nanto",
  "toyama-glass-art-museum": "Toyama:toyama",
  "fukui-prefectural-dinosaur-museum": "Fukui:katsuyama",
  "tojinbo-cliffs-fukui": "Fukui:sakai",
};

describe("KAI-58 Chubu/Hokuriku regional-depth records", () => {
  it("adds distinct Gokayama components plus urban Toyama and Katsuyama anchors", () => {
    const records = KAI58_NEW_IDS.map((id) =>
      destinations.find((destination) => destination.id === id),
    );

    expect(records.every(Boolean)).toBe(true);
    expect(records.map((record) => record?.municipalityId)).toEqual([
      "Toyama:nanto",
      "Toyama:nanto",
      "Toyama:toyama",
      "Fukui:katsuyama",
    ]);
    expect(records.map((record) => record?.region)).toEqual([
      "Chubu",
      "Chubu",
      "Chubu",
      "Chubu",
    ]);
    expect(records.map((record) => record?.status)).toEqual([
      "verified",
      "verified",
      "verified",
      "verified",
    ]);
  });

  it("persists a repaired reciprocal Gokayama relation", () => {
    const fixtureDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "kai58-relation-"),
    );
    const fixturePath = path.join(fixtureDir, "destinations-index.json");
    try {
      const fixture = JSON.parse(
        fs.readFileSync(
          path.join(process.cwd(), "src/shared/data/destinations-index.json"),
          "utf8",
        ),
      ) as FixtureDestination[];
      const ainokura = fixture.find(
        (destination) => destination.id === "ainokura-gassho-village",
      );
      expect(ainokura).toBeDefined();
      ainokura!.relationships = {
        ...ainokura!.relationships,
        nearbyDestinationIds: [],
      };
      fs.writeFileSync(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`);

      execFileSync(
        "npx",
        ["tsx", "scripts/kai-58-chubu-hokuriku-expansion.ts"],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: { ...process.env, KAI58_INDEX_PATH: fixturePath },
        },
      );

      const repaired = JSON.parse(
        fs.readFileSync(fixturePath, "utf8"),
      ) as FixtureDestination[];
      const repairedAinokura = repaired.find(
        (destination) => destination.id === "ainokura-gassho-village",
      );
      expect(repairedAinokura?.relationships?.nearbyDestinationIds).toContain(
        "suganuma-gassho-village",
      );
    } finally {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it("keeps conservative manual duration evidence outside model-owned fields", () => {
    const records = [...KAI58_NEW_IDS, "tojinbo-cliffs-fukui"].map((id) => {
      const record = destinations.find((destination) => destination.id === id);
      expect(record, `missing ${id}`).toBeDefined();
      return record!;
    });

    for (const record of records) {
      expect(record.durationMetadata?.method).toBe("manual");
      expect(
        record.editorial?.sources.length,
        `${record.id} has first-party evidence`,
      ).toBeGreaterThan(0);
      expect(
        record.editorial?.fieldSources?.recommendedVisitHours,
      ).toBeUndefined();
    }
  });

  it("retains authoritative location coordinates for destination discovery", () => {
    const glassMuseum = destinations.find(
      (destination) => destination.id === "toyama-glass-art-museum",
    );

    expect(glassMuseum?.coordinates).toEqual({
      lat: 36.6886084,
      lng: 137.2151316,
    });
  });

  it("keeps all KAI-58 records honest about incomplete origin routes", () => {
    for (const id of KAI58_CANONICAL_IDS) {
      const record = destinations.find((destination) => destination.id === id);
      expect(record?.municipalityId).toBe(expectedMunicipalities[id]);
      expect(record?.transportOptions).toEqual({});
      expect(record?.localAccessUnestimated).toBe(true);
      expect(record?.transportMetadata?.method).toBe("unestimated");
    }
  });

  it("localizes Tojinbo's capitalized prefecture tag in Japanese", () => {
    expect(localizePlaceLabel("Fukui", "ja")).toBe("福井");
  });

  it("upgrades the existing Tojinbo identity instead of creating a cruise duplicate", () => {
    const tojinbo = destinations.find(
      (destination) => destination.id === "tojinbo-cliffs-fukui",
    );

    expect(tojinbo).toMatchObject({
      name: "Tojinbo Cliffs",
      nameJa: "東尋坊",
      prefecture: "Fukui",
      region: "Chubu",
      municipalityId: "Fukui:sakai",
      kind: "nature",
      status: "verified",
    });
    expect(
      destinations.some((destination) =>
        /tojinbo.*(?:boat|cruise)|(?:boat|cruise).*tojinbo/i.test(
          destination.id,
        ),
      ),
    ).toBe(false);
  });
});
