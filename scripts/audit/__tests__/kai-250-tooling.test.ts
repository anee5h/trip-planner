import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { Destination } from "@/shared/types/destination";
import { validateLocalTransportFact } from "@/shared/services/budget/factValidation";
import {
  applyManifest,
  determineState,
  type ManifestEntry,
  validateManifest,
} from "../../kai-250-local-transport-cohort";

const ROOT = path.resolve(process.cwd());
const INDEX_PATH = path.join(ROOT, "src/shared/data/destinations-index.json");
const MANIFEST_PATH = path.join(ROOT, "scripts/audit/kai-250-candidates.json");

type TestDestination = Destination & {
  localTransport?: NonNullable<Destination["localTransport"]>;
};

function loadFixture(): {
  destinations: TestDestination[];
  entries: ManifestEntry[];
} {
  return {
    destinations: JSON.parse(
      fs.readFileSync(INDEX_PATH, "utf8"),
    ) as TestDestination[],
    entries: JSON.parse(
      fs.readFileSync(MANIFEST_PATH, "utf8"),
    ) as ManifestEntry[],
  };
}

function serialized(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

describe("KAI-250 localTransport cohort tooling", () => {
  it("validates the complete researched inventory and canonical fact shapes", () => {
    const { destinations, entries } = loadFixture();
    const facts = validateManifest(entries, destinations);
    expect(entries).toHaveLength(32);
    expect(facts.size).toBe(16);
    expect(entries.filter((entry) => entry.fact === undefined)).toHaveLength(
      16,
    );

    const walking = entries.filter(
      (entry) => entry.fact?.kind === "verified_walking",
    );
    expect(walking).toHaveLength(14);
    for (const entry of walking) {
      expect(entry.sourceUrls?.length).toBeGreaterThan(0);
      expect(entry.exactAccessEvidence?.length).toBeGreaterThan(20);
      expect(entry.sourceUrls?.[0]).toMatch(/^https?:\/\//);
      expect(entry.fact?.walkingEvidence).not.toMatch(
        /walkingMin|coordinates|model-generated/i,
      );
      expect(validateLocalTransportFact(entry.fact!)).toEqual({ valid: true });
    }
    const deferred = entries.filter((entry) => entry.fact === undefined);
    expect(
      deferred.every((entry) => /^defer_f[23]$/.test(entry.decision)),
    ).toBe(true);
    expect(
      deferred.every(
        (entry) =>
          entry.deferredCohort === "F2" || entry.deferredCohort === "F3",
      ),
    ).toBe(true);
  });

  it("authors STATE A, then reruns as STATE B without changing bytes or admission", () => {
    const { destinations, entries } = loadFixture();
    const beforeAdmission = destinations.map(
      (destination) => destination.admission,
    );
    const fixture = JSON.parse(serialized(destinations)) as TestDestination[];
    for (const entry of entries.filter(
      (candidate) => candidate.fact !== undefined,
    )) {
      delete fixture.find((destination) => destination.id === entry.id)!
        .localTransport;
    }

    expect(determineState(entries, fixture).state).toBe("STATE A");
    const first = applyManifest(fixture, entries);
    expect(first).toEqual({ state: "STATE A", changed: 16 });
    expect(
      fixture.filter((destination) => destination.localTransport !== undefined),
    ).toHaveLength(16);
    expect(fixture.map((destination) => destination.admission)).toEqual(
      beforeAdmission,
    );

    const afterFirst = serialized(fixture);
    expect(determineState(entries, fixture).state).toBe("STATE B");
    const second = applyManifest(fixture, entries);
    expect(second).toEqual({ state: "STATE B", changed: 0 });
    expect(serialized(fixture)).toBe(afterFirst);
  });

  it("fails closed before mutation for mixed absent/present STATE C", () => {
    const { destinations, entries } = loadFixture();
    const fixture = JSON.parse(serialized(destinations)) as TestDestination[];
    applyManifest(fixture, entries);
    const authored = entries.filter((entry) => entry.fact !== undefined);
    delete fixture.find((destination) => destination.id === authored[0].id)!
      .localTransport;
    const before = serialized(fixture);

    expect(() => applyManifest(fixture, entries)).toThrow(/STATE C/);
    expect(serialized(fixture)).toBe(before);
  });

  it("fails closed before mutation for a conflicting existing fact", () => {
    const { destinations, entries } = loadFixture();
    const fixture = JSON.parse(serialized(destinations)) as TestDestination[];
    applyManifest(fixture, entries);
    const target = fixture.find(
      (destination) => destination.id === "ueno-park",
    )!;
    target.localTransport = {
      kind: "not_applicable",
      reason: "unexpected_conflict",
    };
    const before = serialized(fixture);

    expect(() => applyManifest(fixture, entries)).toThrow(/STATE C/);
    expect(serialized(fixture)).toBe(before);
    expect(target.localTransport?.reason).toBe("unexpected_conflict");
  });

  it("rejects malformed or duplicate inventory before any catalogue write", () => {
    const { destinations, entries } = loadFixture();
    const duplicate = [...entries, entries[0]];
    expect(() => validateManifest(duplicate, destinations)).toThrow(
      /exactly 32/,
    );

    const malformed = JSON.parse(serialized(entries)) as ManifestEntry[];
    malformed[0] = {
      ...malformed[0],
      fact: { ...malformed[0].fact, walkingEvidence: "" },
    } as ManifestEntry;
    expect(() => validateManifest(malformed, destinations)).toThrow(/walking/);

    const mismatched = JSON.parse(serialized(entries)) as ManifestEntry[];
    mismatched[0] = {
      ...mismatched[0],
      decision: "not_applicable",
    } as ManifestEntry;
    expect(() => validateManifest(mismatched, destinations)).toThrow(
      /does not match fact kind/,
    );
  });
});
