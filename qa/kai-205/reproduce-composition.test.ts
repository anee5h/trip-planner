import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { output } from "./reproduce-composition";

describe("KAI-205 composition audit", () => {
  it("preserves the measured composition invariants and committed artifact", () => {
    expect(output.source.head).toBe("022373edce9dc24da6d03c70ce8471b8637e0590");
    expect(output.home.topMatches).toHaveLength(10);
    expect(output.home.topMatchUniqueIds).toBe(10);
    expect(output.home.after.topVsSeasonalIntersection).toEqual([]);
    expect(output.home.after.duplicateIds).toEqual([]);
    expect(output.detail.jindaiji.after.halfDaySiblings).toEqual([]);
    expect(output.detail.jindaiji.renderedRailDuplicateIdsAfter).toEqual([]);
    expect(output.audit.invalidBackfills).toBe(0);
    expect(output.audit.eligibilityRegressions).toBe(0);
    expect(output.audit.fullCatalogueRescansAdded).toBe(0);

    const artifactPath = path.resolve("qa/kai-205/composition-audit.json");
    const committedArtifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    expect(committedArtifact).toEqual(output);
  });
});
