import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DestinationAtAGlance } from "../DestinationAtAGlance";
import type { TripCostResult } from "@/shared/services/budget/budgetV2";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const labels = {
  travelTime: "Travel time",
  visitDuration: "Visit duration",
  onSiteCost: "On-site cost",
  transportExcluded: "Origin transport excluded",
  free: "Free",
  locatedIn: "Located in",
  bestSeason: "Best season",
};

const completeWithAdmission: TripCostResult = {
  completeness: "complete",
  total: { kind: "bounded", min: 400, max: 600 },
  components: [
    {
      cost: { kind: "bounded", min: 400, max: 600 },
      evidence: { scope: "admission", derivation: "source_fact" },
    },
  ],
};

const partialResult: TripCostResult = {
  completeness: "partial",
  knownSubtotal: [400, 600],
  missingComponents: [{ scope: "local_transport", reason: "unavailable" }],
  components: [
    {
      cost: { kind: "bounded", min: 400, max: 600 },
      evidence: { scope: "admission", derivation: "source_fact" },
    },
    {
      cost: { kind: "unavailable" },
      evidence: { scope: "local_transport", derivation: "computed" },
    },
  ],
};

const notApplicableResult: TripCostResult = {
  completeness: "complete",
  total: { kind: "bounded", min: 0, max: 0 },
  components: [
    {
      cost: { kind: "not_applicable" },
      evidence: {
        scope: "admission",
        state: "not_applicable",
        derivation: "computed",
      },
    },
  ],
};

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("DestinationAtAGlance", () => {
  it("shows a compact complete numeric on-site fact from Budget v2", () => {
    act(() => {
      root.render(
        <DestinationAtAGlance
          locale="en"
          travelTime="45m"
          visitDuration="1–2 hours"
          onSiteCost={completeWithAdmission}
          labels={labels}
        />,
      );
    });

    const text = host.textContent ?? "";
    expect(
      host.querySelector('[data-testid="destination-at-a-glance"]'),
    ).not.toBeNull();
    expect(text).toContain("On-site cost");
    expect(text).toContain("¥400–600");
    expect(text).toContain("Origin transport excluded");
  });

  it("omits a parent location fact when the header already exposes it", () => {
    act(() => {
      root.render(
        <DestinationAtAGlance
          locale="en"
          parentLabel="Yokohama City"
          headerExposesLocation
          labels={labels}
        />,
      );
    });

    expect(host.textContent).not.toContain("Located in");
    expect(host.textContent).not.toContain("Yokohama City");
  });

  it("keeps the parent location fact when the header has no equivalent context", () => {
    act(() => {
      root.render(
        <DestinationAtAGlance
          locale="en"
          parentLabel="Yokohama City"
          headerExposesLocation={false}
          labels={labels}
        />,
      );
    });

    expect(host.textContent).toContain("Located in");
    expect(host.textContent).toContain("Yokohama City");
  });

  it("omits the cost fact for partial results instead of showing a large unavailable block", () => {
    act(() => {
      root.render(
        <DestinationAtAGlance
          locale="en"
          travelTime="45m"
          visitDuration="1–2 hours"
          onSiteCost={partialResult}
          labels={labels}
        />,
      );
    });

    const text = host.textContent ?? "";
    expect(text).not.toContain("On-site cost");
    expect(text).not.toContain("Cost unavailable");
  });

  it("does not turn a non-numeric or not-applicable result into ¥0", () => {
    act(() => {
      root.render(
        <DestinationAtAGlance
          locale="ja"
          onSiteCost={notApplicableResult}
          labels={{
            ...labels,
            onSiteCost: "現地費用",
            transportExcluded: "出発地からの交通費を除く",
            free: "無料",
            locatedIn: "所在地",
            bestSeason: "ベストシーズン",
          }}
        />,
      );
    });

    const text = host.textContent ?? "";
    expect(text).not.toContain("現地費用");
    expect(text).not.toContain("¥0");
  });
});
