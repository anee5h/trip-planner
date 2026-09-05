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
  it("keeps primary practical facts visible with the official site link", () => {
    act(() => {
      root.render(
        <DestinationAtAGlance
          locale="en"
          openingHours="09:00–17:00"
          officialWebsite="https://www.example.com/visit"
          labels={labels}
        />,
      );
    });

    expect(host.textContent).toContain("09:00–17:00");
    expect(host.textContent).toContain("example.com");
    expect(
      host.querySelector('a[href="https://www.example.com/visit"]'),
    ).not.toBeNull();
  });

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

  it("spans long opening-hours prose across the full fact row instead of a half-column box", () => {
    act(() => {
      root.render(
        <DestinationAtAGlance
          locale="en"
          travelTime="45m"
          visitDuration="1–2 hours"
          openingHours="Open access; individual facilities may have separate hours"
          labels={labels}
        />,
      );
    });

    const wide = host.querySelector('[data-at-a-glance-fact="wide"]');
    const compact = host.querySelectorAll('[data-at-a-glance-fact="compact"]');
    expect(wide).not.toBeNull();
    expect(wide?.textContent).toContain("Open access");
    expect(wide?.className).toContain("col-span-2");
    expect(compact.length).toBeGreaterThanOrEqual(2);
  });

  it("treats verbose Japanese values as wide without breaking short Japanese values", () => {
    act(() => {
      root.render(
        <DestinationAtAGlance
          locale="ja"
          openingHours="散策自由（個別施設により営業時間が異なります）"
          seasonLabel="秋と冬"
          labels={{
            ...labels,
            openingHours: "営業時間",
            bestSeason: "ベストシーズン",
          }}
        />,
      );
    });

    expect(
      host.querySelector('[data-at-a-glance-fact="wide"]')?.textContent,
    ).toContain("散策自由");
    expect(
      host.querySelector('[data-at-a-glance-fact="compact"]')?.textContent,
    ).toContain("秋と冬");
  });

  it("handles missing travel time and website gracefully without N/A markers", () => {
    act(() => {
      root.render(
        <DestinationAtAGlance
          locale="en"
          visitDuration="2 hours"
          seasonLabel="Summer"
          labels={labels}
        />,
      );
    });

    const text = host.textContent ?? "";
    expect(text).not.toContain("N/A");
    expect(text).not.toContain("unavailable");
    expect(text).toContain("2 hours");
    expect(
      host.querySelector('[data-at-a-glance-fact="compact"]'),
    ).not.toBeNull();
  });

  it("gives the official website a full-width row so URLs never wrap mid-domain", () => {
    act(() => {
      root.render(
        <DestinationAtAGlance
          locale="en"
          openingHours="09:00–17:00"
          officialWebsite="https://www.example.com/visit"
          labels={labels}
        />,
      );
    });

    const facts = [...host.querySelectorAll("[data-at-a-glance-fact]")];
    expect(facts.length).toBe(2);
    const link = host.querySelector('a[href="https://www.example.com/visit"]');
    expect(link).not.toBeNull();
    expect(facts[1]?.getAttribute("data-at-a-glance-fact")).toBe("wide");
    expect(facts[1]?.className).toContain("col-span-2");
  });

  it("spans long website hostnames across the full row so the link stays readable", () => {
    act(() => {
      root.render(
        <DestinationAtAGlance
          locale="en"
          officialWebsite="https://www.kanko.city.izu.shizuoka.jp/"
          labels={labels}
        />,
      );
    });

    const wide = host.querySelector('[data-at-a-glance-fact="wide"]');
    expect(wide?.textContent).toContain("kanko.city.izu.shizuoka.jp");
    expect(
      host.querySelector('a[href="https://www.kanko.city.izu.shizuoka.jp/"]'),
    ).not.toBeNull();
  });

  it("flags unverified opening hours with a caveat (KAI-335)", () => {
    act(() => {
      root.render(
        <DestinationAtAGlance
          locale="en"
          openingHours="09:00 - 17:00 (Daily)"
          openingHoursUnverified
          labels={{ ...labels, hoursNotVerified: "Not yet verified" }}
        />,
      );
    });

    const text = host.textContent ?? "";
    expect(text).toContain("09:00 - 17:00 (Daily)");
    expect(text).toContain("Not yet verified");
  });

  it("hides the caveat when opening hours are verified (KAI-335)", () => {
    act(() => {
      root.render(
        <DestinationAtAGlance
          locale="en"
          openingHours="09:00 - 17:00 (Daily)"
          labels={{ ...labels, hoursNotVerified: "Not yet verified" }}
        />,
      );
    });

    const text = host.textContent ?? "";
    expect(text).toContain("09:00 - 17:00 (Daily)");
    expect(text).not.toContain("Not yet verified");
  });

  it("renders the caveat in Japanese when unverified (KAI-335)", () => {
    act(() => {
      root.render(
        <DestinationAtAGlance
          locale="ja"
          openingHours="09:00 - 17:00 (Daily)"
          openingHoursUnverified
          labels={{ ...labels, hoursNotVerified: "未確認" }}
        />,
      );
    });

    expect(host.textContent).toContain("未確認");
  });

  it("renders the Get directions link under travel time (KAI hero rework)", () => {
    act(() => {
      root.render(
        <DestinationAtAGlance
          locale="en"
          travelTime="38–48 min"
          directionsHref="https://www.google.com/maps/dir/?api=1&origin=Tokyo%20Station&destination=Hakone%20Town,%20Kanagawa,%20Japan&travelmode=transit"
          directionsLabel="Get directions"
          labels={labels}
        />,
      );
    });

    const link = host.querySelector(
      'a[href*="google.com/maps/dir"]',
    ) as HTMLAnchorElement | null;
    expect(link).not.toBeNull();
    expect(link?.textContent).toContain("Get directions");
    expect(link?.target).toBe("_blank");
    expect(link?.rel).toContain("noopener");
  });

  it("omits the directions link when no directions props are provided", () => {
    act(() => {
      root.render(
        <DestinationAtAGlance
          locale="en"
          travelTime="38–48 min"
          labels={labels}
        />,
      );
    });

    expect(host.querySelector('a[href*="google.com/maps/dir"]')).toBeNull();
  });
});
