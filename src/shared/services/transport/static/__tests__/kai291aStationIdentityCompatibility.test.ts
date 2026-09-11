/**
 * KAI-291B1 ↔ KAI-291A contract test (narrow).
 *
 * A KAI-291A ODPT station identity must be USABLE AS-IS as the normalized
 * graph's provider stop id. No fuzzy conversion layer may stand between the
 * anchor registry and the transit graph.
 *
 * This creates no destination mappings and consumes no anchor policy.
 */
import { describe, expect, it } from "vitest";

import { stopInternalId } from "../odptRailTopologyImporter";

describe("KAI-291A station identity compatibility", () => {
  it("uses the exact KAI-291A identity string as providerStopId", () => {
    // Real anchor identities from the KAI-291A registry.
    const anchorIdentities = [
      "odpt.Station:TokyoMetro.Ginza.Ueno",
      "odpt.Station:Toei.Mita.Sugamo",
      "odpt.Station:Toei.Oedo.Ryogoku",
    ];
    for (const identity of anchorIdentities) {
      // The normalized stop id is a pure namespaced derivation: the provider
      // identity inside it is verbatim, so an anchor string resolves to its
      // stop by suffix match with zero transformation.
      const internalId = stopInternalId(identity);
      expect(internalId.replace("odpt:station:", "")).toBe(identity);
    }
  });

  it("derives internal ids without names, coordinates or operator context", () => {
    // Identity-only derivation: renaming a station or moving its recorded
    // coordinates can never change (or break) the mapping.
    expect(stopInternalId("odpt.Station:TokyoMetro.Ginza.Ueno")).toBe(
      "odpt:station:odpt.Station:TokyoMetro.Ginza.Ueno",
    );
  });
});
